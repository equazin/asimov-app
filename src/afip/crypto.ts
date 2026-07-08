/**
 * Firma CMS/PKCS#7 del TRA para WSAA (versión desktop).
 *
 * A diferencia de la API v2 (que cifra el cert con AES-GCM y una clave de env),
 * el desktop guarda el certificado y la clave con `src/secrets.ts` (safeStorage
 * del SO). Este módulo sólo se ocupa de la firma CMS y de leer la expiración del
 * certificado; el cifrado en reposo vive en el servicio que llama a secrets.
 */
import * as forge from "node-forge";

/**
 * Firma el TRA (LoginTicketRequest XML) como CMS/PKCS#7 SignedData en DER y lo
 * devuelve en base64, tal como LoginCms lo espera en `<in0>`.
 */
export function signTRA(traXml: string, certPem: string, keyPem: string): string {
  if (!traXml) throw new Error("TRA vacío: no hay nada para firmar.");
  let cert: forge.pki.Certificate;
  let key: forge.pki.PrivateKey;
  try {
    cert = forge.pki.certificateFromPem(certPem);
  } catch {
    throw new Error("Certificado AFIP inválido: no es un PEM de certificado válido.");
  }
  try {
    key = forge.pki.privateKeyFromPem(keyPem);
  } catch {
    throw new Error("Clave privada AFIP inválida: no es un PEM de clave válido.");
  }

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(traXml, "utf8");
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

/** Lee la fecha de expiración (`notAfter`) de un certificado PEM. */
export function certNotAfter(certPem: string): Date {
  const cert = forge.pki.certificateFromPem(certPem);
  return cert.validity.notAfter;
}

/** Valida que un PEM sea parseable como certificado (para dar feedback al subirlo). */
export function isValidCertPem(certPem: string): boolean {
  try {
    forge.pki.certificateFromPem(certPem);
    return true;
  } catch {
    return false;
  }
}

/** Valida que un PEM sea parseable como clave privada. */
export function isValidKeyPem(keyPem: string): boolean {
  try {
    forge.pki.privateKeyFromPem(keyPem);
    return true;
  } catch {
    return false;
  }
}
