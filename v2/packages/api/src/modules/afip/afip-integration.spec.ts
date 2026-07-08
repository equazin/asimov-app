import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import * as forge from 'node-forge';
import {
  loadEncKey,
  encryptSecret,
  decryptSecret,
  isEncrypted,
  signTRA,
  certNotAfter,
} from './afip-crypto';
import {
  buildLoginTicketRequest,
  buildLoginCmsEnvelope,
  extractLoginCmsReturn,
  parseLoginTicketResponse,
  isTaValid,
} from './afip-wsaa';
import {
  afipDate,
  formatAfipDate,
  buildUltimoAutorizadoEnvelope,
  parseUltimoAutorizado,
  buildFECAESolicitarEnvelope,
  parseFECAEResponse,
} from './afip-wsfe';
import { receptorDocType } from './afip-domain';

// Certificado + clave autofirmados para probar firma/parseo sin depender de AFIP.
function makeSelfSigned(): { certPem: string; keyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: 'commonName', value: 'test' }, { name: 'countryName', value: 'AR' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

const KEY32 = crypto.randomBytes(32).toString('hex');

describe('afip-crypto — cifrado en reposo (AES-256-GCM)', () => {
  it('loadEncKey acepta hex de 64 y base64 de 32 bytes', () => {
    expect(loadEncKey(KEY32)).toHaveLength(32);
    expect(loadEncKey(crypto.randomBytes(32).toString('base64'))).toHaveLength(32);
  });

  it('loadEncKey rechaza clave ausente o de largo incorrecto', () => {
    expect(() => loadEncKey(undefined)).toThrow(/no configurada/);
    expect(() => loadEncKey('abcd')).toThrow(/32 bytes/);
  });

  it('encrypt→decrypt es reversible y el ciphertext está marcado', () => {
    const key = loadEncKey(KEY32);
    const secret = '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----';
    const enc = encryptSecret(secret, key);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain('BEGIN CERTIFICATE');
    expect(decryptSecret(enc, key)).toBe(secret);
  });

  it('cadena vacía → vacía; formato inválido lanza', () => {
    const key = loadEncKey(KEY32);
    expect(encryptSecret('', key)).toBe('');
    expect(decryptSecret('', key)).toBe('');
    expect(() => decryptSecret('texto-plano', key)).toThrow(/formato inválido/);
  });

  it('descifrar con otra clave falla (GCM detecta manipulación)', () => {
    const enc = encryptSecret('secreto', loadEncKey(KEY32));
    const otherKey = loadEncKey(crypto.randomBytes(32).toString('hex'));
    expect(() => decryptSecret(enc, otherKey)).toThrow();
  });
});

describe('afip-crypto — firma CMS del TRA', () => {
  it('firma el TRA y produce un CMS/PKCS#7 en base64 parseable', () => {
    const { certPem, keyPem } = makeSelfSigned();
    const tra = buildLoginTicketRequest('wsfe');
    const cms = signTRA(tra, certPem, keyPem);
    expect(cms.length).toBeGreaterThan(100);
    // El base64 debe decodificar a un DER que node-forge reconozca como PKCS#7.
    const der = forge.util.decode64(cms);
    const asn1 = forge.asn1.fromDer(der);
    const p7 = forge.pkcs7.messageFromAsn1(asn1);
    expect(p7).toBeTruthy();
  });

  it('rechaza certificado o clave inválidos y TRA vacío', () => {
    const { certPem, keyPem } = makeSelfSigned();
    expect(() => signTRA('', certPem, keyPem)).toThrow(/vacío/);
    expect(() => signTRA('<tra/>', 'no-pem', keyPem)).toThrow(/Certificado/);
    expect(() => signTRA('<tra/>', certPem, 'no-pem')).toThrow(/Clave/);
  });

  it('certNotAfter lee la fecha de expiración del certificado', () => {
    const { certPem } = makeSelfSigned();
    expect(certNotAfter(certPem).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('afip-wsaa — envelope y parseo del TA', () => {
  it('el envelope de LoginCms contiene el CMS firmado', () => {
    const env = buildLoginCmsEnvelope('CMS_BASE64');
    expect(env).toContain('<wsaa:in0>CMS_BASE64</wsaa:in0>');
    expect(env).toContain('loginCms');
  });

  it('extrae el loginCmsReturn y parsea token/sign/expiration', () => {
    const ticket =
      '<loginTicketResponse><header><expirationTime>2026-07-08T12:00:00.000-03:00</expirationTime></header>' +
      '<credentials><token>TOKEN123</token><sign>SIGN456</sign></credentials></loginTicketResponse>';
    const soap =
      '<soapenv:Envelope xmlns:soapenv="x"><soapenv:Body><loginCmsResponse>' +
      '<loginCmsReturn>' + escapeForXml(ticket) + '</loginCmsReturn>' +
      '</loginCmsResponse></soapenv:Body></soapenv:Envelope>';
    const ret = extractLoginCmsReturn(soap);
    const ta = parseLoginTicketResponse(ret);
    expect(ta.token).toBe('TOKEN123');
    expect(ta.sign).toBe('SIGN456');
    expect(new Date(ta.expiration).getUTCFullYear()).toBe(2026);
  });

  it('un SOAP Fault se reporta como error legible', () => {
    const fault =
      '<soapenv:Envelope xmlns:soapenv="x"><soapenv:Body><soapenv:Fault>' +
      '<faultstring>El CEE ya posee un TA valido</faultstring>' +
      '</soapenv:Fault></soapenv:Body></soapenv:Envelope>';
    expect(() => extractLoginCmsReturn(fault)).toThrow(/ya posee un TA valido/);
  });

  it('isTaValid respeta el margen de expiración', () => {
    const soon = new Date(Date.now() + 2 * 60_000).toISOString();      // 2 min → dentro del skew
    const later = new Date(Date.now() + 30 * 60_000).toISOString();    // 30 min → válido
    expect(isTaValid({ expiration: soon })).toBe(false);
    expect(isTaValid({ expiration: later })).toBe(true);
    expect(isTaValid(null)).toBe(false);
  });
});

describe('afip-wsfe — fechas y receptor', () => {
  it('afipDate formatea yyyymmdd y formatAfipDate lo revierte', () => {
    expect(afipDate(new Date('2026-07-08T10:00:00'))).toBe('20260708');
    expect(formatAfipDate('20260718')).toBe('2026-07-18');
    expect(formatAfipDate('rara')).toBe('rara');
  });

  it('receptorDocType elige CUIT/DNI/consumidor final', () => {
    expect(receptorDocType('20304050607')).toEqual({ docType: 80, docNumber: '20304050607' });
    expect(receptorDocType('30123456')).toEqual({ docType: 96, docNumber: '30123456' });
    expect(receptorDocType('')).toEqual({ docType: 99, docNumber: '0' });
  });
});

describe('afip-wsfe — FECompUltimoAutorizado', () => {
  const ta = { token: 'T', sign: 'S', expiration: new Date().toISOString() };

  it('arma el envelope con auth y punto de venta', () => {
    const env = buildUltimoAutorizadoEnvelope(ta, { cuit: '20304050607', pointOfSale: 3, invoiceType: 6 });
    expect(env).toContain('<ar:PtoVta>3</ar:PtoVta>');
    expect(env).toContain('<ar:CbteTipo>6</ar:CbteTipo>');
    expect(env).toContain('<ar:Token>T</ar:Token>');
  });

  it('parsea el último número autorizado', () => {
    const xml =
      '<Envelope><Body><FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult>' +
      '<PtoVta>3</PtoVta><CbteTipo>6</CbteTipo><CbteNro>42</CbteNro>' +
      '</FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse></Body></Envelope>';
    expect(parseUltimoAutorizado(xml)).toBe(42);
  });

  it('sin comprobantes previos devuelve 0', () => {
    const xml =
      '<Envelope><Body><FECompUltimoAutorizadoResult><CbteNro>0</CbteNro>' +
      '</FECompUltimoAutorizadoResult></Body></Envelope>';
    expect(parseUltimoAutorizado(xml)).toBe(0);
  });

  it('propaga errores de AFIP', () => {
    const xml =
      '<Envelope><Body><FECompUltimoAutorizadoResult><Errors><Err>' +
      '<Code>600</Code><Msg>Token invalido</Msg></Err></Errors>' +
      '</FECompUltimoAutorizadoResult></Body></Envelope>';
    expect(() => parseUltimoAutorizado(xml)).toThrow(/600.*Token invalido/);
  });
});

describe('afip-wsfe — FECAESolicitar', () => {
  const ta = { token: 'T', sign: 'S', expiration: new Date().toISOString() };
  const cab = { cuit: '20304050607', pointOfSale: 3, invoiceType: 6 };

  const cbte = {
    docType: 80, docNumber: '27111111112', invoiceNumber: 43,
    date: new Date('2026-07-08T10:00:00'),
    impNeto: 100, impIva: 21, impTotal: 121,
    items: [{ ivaRate: 21, subtotal: 100 }],
  };

  it('arma el envelope con totales, IVA por alícuota y fecha AFIP', () => {
    const env = buildFECAESolicitarEnvelope(ta, cab, cbte);
    expect(env).toContain('<ar:CbteDesde>43</ar:CbteDesde>');
    expect(env).toContain('<ar:CbteFch>20260708</ar:CbteFch>');
    expect(env).toContain('<ar:ImpNeto>100</ar:ImpNeto>');
    expect(env).toContain('<ar:ImpIVA>21</ar:ImpIVA>');
    expect(env).toContain('<ar:Id>5</ar:Id>'); // alícuota 21%
    expect(env).toContain('<ar:BaseImp>100</ar:BaseImp>');
  });

  it('para factura C (monotributo) no envía alícuotas ni IVA', () => {
    const env = buildFECAESolicitarEnvelope(ta, { ...cab, invoiceType: 11 }, cbte);
    expect(env).not.toContain('<ar:Iva>');
    expect(env).toContain('<ar:ImpIVA>0</ar:ImpIVA>');
  });

  it('parsea una respuesta APROBADA (CAE + venc.)', () => {
    const xml =
      '<Envelope><Body><FECAESolicitarResponse><FECAESolicitarResult>' +
      '<FeCabResp><Resultado>A</Resultado></FeCabResp>' +
      '<FeDetResp><FECAEDetResponse><CbteDesde>43</CbteDesde><Resultado>A</Resultado>' +
      '<CAE>75123456789012</CAE><CAEFchVto>20260718</CAEFchVto>' +
      '</FECAEDetResponse></FeDetResp>' +
      '</FECAESolicitarResult></FECAESolicitarResponse></Body></Envelope>';
    const res = parseFECAEResponse(xml);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.cae).toBe('75123456789012');
      expect(res.caeExpiration).toBe('2026-07-18');
      expect(res.invoiceNumber).toBe(43);
    }
  });

  it('parsea una respuesta RECHAZADA con observaciones', () => {
    const xml =
      '<Envelope><Body><FECAESolicitarResult>' +
      '<FeCabResp><Resultado>R</Resultado></FeCabResp>' +
      '<FeDetResp><FECAEDetResponse><Resultado>R</Resultado>' +
      '<Observaciones><Obs><Code>10015</Code><Msg>Fecha fuera de rango</Msg></Obs></Observaciones>' +
      '</FECAEDetResponse></FeDetResp>' +
      '</FECAESolicitarResult></Body></Envelope>';
    const res = parseFECAEResponse(xml);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.result).toBe('R');
      expect(res.observations[0]).toEqual({ code: '10015', msg: 'Fecha fuera de rango' });
    }
  });

  it('errores de esquema/auth se lanzan como excepción', () => {
    const xml =
      '<Envelope><Body><FECAESolicitarResult><Errors><Err>' +
      '<Code>600</Code><Msg> validacion de token</Msg></Err></Errors>' +
      '</FECAESolicitarResult></Body></Envelope>';
    expect(() => parseFECAEResponse(xml)).toThrow(/600.*validacion de token/);
  });
});

// Escapa un XML para incrustarlo como texto dentro de otro (simula lo que hace AFIP).
function escapeForXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
