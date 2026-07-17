/**
 * WSAA — Web Service de Autenticación y Autorización de AFIP/ARCA.
 *
 * Flujo: se arma un TRA (LoginTicketRequest), se firma como CMS/PKCS#7, se
 * envía a LoginCms y se obtiene el TA (token + sign) que vale 12 h. AFIP
 * RECHAZA pedir un TA nuevo mientras el anterior siga vigente, así que el TA se
 * cachea (ver afip.service) y sólo se renueva al vencer.
 */
import { XMLParser } from 'fast-xml-parser';
import { AfipUnavailableError } from './domain';

export interface AfipTA {
  token: string;
  sign: string;
  /** ISO. Momento de expiración del TA (12 h desde su generación). */
  expiration: string;
}

export const WSAA_URLS = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion: 'https://wsaa.afip.gob.ar/ws/services/LoginCms',
} as const;

/**
 * Arma el LoginTicketRequest (TRA). `generationTime` va 10 min atrás y
 * `expirationTime` 10 min adelante para tolerar desfasajes de reloj; AFIP exige
 * que la ventana sea de ≤ 24 h y que `uniqueId` no se repita.
 */
export function buildLoginTicketRequest(service = 'wsfe', now: Date = new Date()): string {
  const uniqueId = Math.floor(now.getTime() / 1000);
  const generationTime = new Date(now.getTime() - 10 * 60_000).toISOString();
  const expirationTime = new Date(now.getTime() + 10 * 60_000).toISOString();
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0">' +
    `<header><uniqueId>${uniqueId}</uniqueId>` +
    `<generationTime>${generationTime}</generationTime>` +
    `<expirationTime>${expirationTime}</expirationTime></header>` +
    `<service>${service}</service>` +
    '</loginTicketRequest>'
  );
}

/** Envuelve el CMS firmado (base64) en el SOAP que espera LoginCms. */
export function buildLoginCmsEnvelope(signedCmsBase64: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">' +
    '<soapenv:Header/>' +
    '<soapenv:Body><wsaa:loginCms><wsaa:in0>' +
    signedCmsBase64 +
    '</wsaa:in0></wsaa:loginCms></soapenv:Body>' +
    '</soapenv:Envelope>'
  );
}

const xmlParser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false });

/** Extrae el `<loginCmsReturn>` (otro XML escapado) de la respuesta SOAP de LoginCms. */
export function extractLoginCmsReturn(soapXml: string): string {
  const parsed = xmlParser.parse(soapXml);
  const ret = findDeep(parsed, 'loginCmsReturn');
  if (typeof ret === 'string' && ret.trim()) return ret;
  const fault = findDeep(parsed, 'faultstring');
  throw new Error(`WSAA no devolvió un TA: ${typeof fault === 'string' ? fault : 'respuesta inesperada'}`);
}

/**
 * Parsea el LoginTicketResponse (el XML que viene dentro de loginCmsReturn) y
 * devuelve el TA. Lanza con el mensaje de AFIP si vino un error.
 */
export function parseLoginTicketResponse(ticketXml: string): AfipTA {
  const parsed = xmlParser.parse(ticketXml);
  const token = findDeep(parsed, 'token');
  const sign = findDeep(parsed, 'sign');
  const expiration = findDeep(parsed, 'expirationTime');
  if (typeof token !== 'string' || typeof sign !== 'string' || !token || !sign) {
    throw new Error('WSAA: LoginTicketResponse sin token/sign válidos.');
  }
  return {
    token,
    sign,
    expiration: typeof expiration === 'string' && expiration
      ? new Date(expiration).toISOString()
      : new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  };
}

/** ¿El TA cacheado sigue vigente? Se renueva con `skewMs` de margen (default 5 min). */
export function isTaValid(ta: Pick<AfipTA, 'expiration'> | null | undefined, now: Date = new Date(), skewMs = 5 * 60_000): boolean {
  if (!ta?.expiration) return false;
  const exp = new Date(ta.expiration).getTime();
  return Number.isFinite(exp) && exp - skewMs > now.getTime();
}

/**
 * POST del envelope a LoginCms y parseo del TA. Inyectable `fetchImpl` para tests.
 */
export async function callLoginCms(
  url: string,
  signedCmsBase64: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AfipTA> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
      body: buildLoginCmsEnvelope(signedCmsBase64),
    });
  } catch (err) {
    // fetch sólo lanza por problemas de red/DNS/timeout, nunca por HTTP != 2xx.
    throw new AfipUnavailableError(
      `No se pudo conectar con AFIP (WSAA): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const text = await res.text();
  if (!res.ok) {
    // Ante error, AFIP suele mandar un SOAP Fault con detalle útil.
    let detail = `HTTP ${res.status}`;
    try { detail = findDeep(xmlParser.parse(text), 'faultstring') as string || detail; } catch { /* usa el HTTP */ }
    throw new Error(`WSAA LoginCms falló: ${decodeXmlEntities(detail)}`);
  }
  return parseLoginTicketResponse(extractLoginCmsReturn(text));
}

/** ARCA a veces devuelve el faultstring escapado una segunda vez. */
function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Busca recursivamente la primera aparición de una key en un objeto parseado. */
function findDeep(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in (obj as Record<string, unknown>)) return (obj as Record<string, unknown>)[key];
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const found = findDeep(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}
