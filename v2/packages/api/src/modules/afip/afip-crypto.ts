/**
 * Criptografía del módulo AFIP/ARCA.
 *
 * Dos responsabilidades separadas:
 *  1. Cifrado en reposo (AES-256-GCM) del certificado y la clave privada del
 *     contribuyente, que se guardan en `integration_configs`. La clave de
 *     cifrado viene de `AFIP_ENC_KEY` (32 bytes, hex o base64). Sin esa env el
 *     guardado de credenciales se rechaza (nunca en texto plano).
 *  2. Firma del TRA como CMS/PKCS#7 (lo que exige WSAA para el LoginCms).
 */
import * as crypto from 'node:crypto';
import * as forge from 'node-forge';

// ---------------------------------------------------------------------------
// Cifrado en reposo (AES-256-GCM)
// ---------------------------------------------------------------------------

const ENC_PREFIX = 'afipenc:v1:';

/**
 * Deriva la clave AES de 32 bytes desde `AFIP_ENC_KEY`. Acepta hex (64 chars) o
 * base64. Lanza si no está configurada o no mide 32 bytes: preferimos fallar
 * antes que guardar un certificado con una clave inválida.
 */
export function loadEncKey(raw: string | undefined): Buffer {
  if (!raw) {
    throw new Error('AFIP_ENC_KEY no configurada: no se pueden cifrar las credenciales AFIP.');
  }
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== 32) {
    throw new Error('AFIP_ENC_KEY debe ser de 32 bytes (64 hex o base64 de 32 bytes).');
  }
  return key;
}

/** Cifra un secreto (cert/key PEM) para guardarlo. Formato: afipenc:v1:iv:tag:ct (base64). */
export function encryptSecret(plain: string, encKey: Buffer): string {
  const value = String(plain ?? '');
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/** Descifra un secreto guardado. Devuelve '' si el valor está vacío. Lanza si está corrupto. */
export function decryptSecret(stored: string, encKey: Buffer): string {
  const value = String(stored ?? '');
  if (!value) return '';
  if (!value.startsWith(ENC_PREFIX)) {
    throw new Error('Secreto AFIP con formato inválido (falta prefijo de cifrado).');
  }
  const [ivB64, tagB64, ctB64] = value.slice(ENC_PREFIX.length).split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

// ---------------------------------------------------------------------------
// Firma CMS / PKCS#7 del TRA (para WSAA LoginCms)
// ---------------------------------------------------------------------------

/**
 * Firma el TRA (LoginTicketRequest XML) como CMS/PKCS#7 SignedData en formato
 * DER, y lo devuelve en base64, tal como LoginCms lo espera en `<in0>`.
 *
 * @param traXml   El XML del LoginTicketRequest.
 * @param certPem  Certificado del contribuyente (PEM) emitido por AFIP.
 * @param keyPem   Clave privada del contribuyente (PEM), la que generó el CSR.
 */
export function signTRA(traXml: string, certPem: string, keyPem: string): string {
  if (!traXml) throw new Error('TRA vacío: no hay nada para firmar.');
  let cert: forge.pki.Certificate;
  let key: forge.pki.PrivateKey;
  try {
    cert = forge.pki.certificateFromPem(certPem);
  } catch {
    throw new Error('Certificado AFIP inválido: no es un PEM de certificado válido.');
  }
  try {
    key = forge.pki.privateKeyFromPem(keyPem);
  } catch {
    throw new Error('Clave privada AFIP inválida: no es un PEM de clave válido.');
  }

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(traXml, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key: key as forge.pki.rsa.PrivateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toString() },
    ],
  });
  p7.sign({ detached: false });

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

/**
 * Lee la fecha de expiración (`notAfter`) de un certificado PEM, para avisar al
 * usuario antes de que el certificado AFIP caduque.
 */
export function certNotAfter(certPem: string): Date {
  const cert = forge.pki.certificateFromPem(certPem);
  return cert.validity.notAfter;
}
