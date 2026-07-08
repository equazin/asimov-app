/**
 * Consulta de padrón — ws_sr_constancia_inscripcion (personaServiceA5).
 *
 * Dado un CUIT devuelve razón social, domicilio fiscal y condición de IVA
 * (derivada de la constancia: monotributo / IVA en régimen general / exento).
 * Requiere su propio TA de WSAA (service "ws_sr_constancia_inscripcion").
 */
import { XMLParser } from 'fast-xml-parser';
import type { AfipTA } from './wsaa';
import { AfipUnavailableError } from './domain';

export const PADRON_SERVICE = 'ws_sr_constancia_inscripcion';

export const PADRON_URLS = {
  homologacion: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
  produccion: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5',
} as const;

export interface PadronPersona {
  cuit: string;
  razonSocial: string;
  /** Texto compatible con el select de clientes del desktop. */
  condicionIva: 'Responsable Inscripto' | 'Monotributista' | 'Exento' | 'Consumidor Final';
  domicilio: string;
  localidad: string;
  provincia: string;
  codPostal: string;
}

/** SOAP de getPersona (constancia de inscripción A5). */
export function buildGetPersonaEnvelope(ta: AfipTA, cuitEmisor: string, cuitConsultado: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:a5="http://a5.soap.ws.server.puc.sr/">' +
    '<soapenv:Header/><soapenv:Body>' +
    '<a5:getPersona>' +
    `<token>${escapeXml(ta.token)}</token>` +
    `<sign>${escapeXml(ta.sign)}</sign>` +
    `<cuitRepresentada>${cuitEmisor}</cuitRepresentada>` +
    `<idPersona>${cuitConsultado}</idPersona>` +
    '</a5:getPersona>' +
    '</soapenv:Body></soapenv:Envelope>'
  );
}

const xmlParser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false });

/**
 * Parsea la respuesta de getPersona. La condición de IVA se deriva de la
 * constancia: `datosMonotributo` → Monotributista; régimen general con el
 * impuesto 30 (IVA) → Responsable Inscripto; impuesto 32 (IVA exento) →
 * Exento; sin nada de eso → Consumidor Final.
 */
export function parsePersonaResponse(soapXml: string, cuitConsultado: string): PadronPersona {
  const parsed = xmlParser.parse(soapXml);
  const fault = findDeep(parsed, 'faultstring');
  if (typeof fault === 'string' && fault) {
    throw new Error(`Padrón AFIP: ${fault}`);
  }
  const persona = findDeep(parsed, 'personaReturn');
  const datos = findDeep(persona, 'datosGenerales');
  if (!datos || typeof datos !== 'object') {
    const err = findDeep(persona, 'errorConstancia');
    const msg = findDeep(err, 'error');
    throw new Error(`Padrón AFIP: ${typeof msg === 'string' && msg ? msg : 'el CUIT no figura en el padrón'}`);
  }
  const d = datos as Record<string, unknown>;
  const razonSocial = str(d.razonSocial) ||
    [str(d.apellido), str(d.nombre)].filter(Boolean).join(', ');

  const dom = (d.domicilioFiscal ?? {}) as Record<string, unknown>;

  let condicionIva: PadronPersona['condicionIva'] = 'Consumidor Final';
  if (findDeep(persona, 'datosMonotributo') !== undefined) {
    condicionIva = 'Monotributista';
  } else {
    const impuestos = collectImpuestos(findDeep(persona, 'datosRegimenGeneral'));
    if (impuestos.includes(30)) condicionIva = 'Responsable Inscripto';
    else if (impuestos.includes(32)) condicionIva = 'Exento';
  }

  return {
    cuit: cuitConsultado,
    razonSocial,
    condicionIva,
    domicilio: str(dom.direccion),
    localidad: str(dom.localidad),
    provincia: str(dom.descripcionProvincia),
    codPostal: str(dom.codPostal),
  };
}

/** IDs de impuesto activos en el régimen general (30 = IVA, 32 = IVA exento). */
function collectImpuestos(regimenGeneral: unknown): number[] {
  const imp = findDeep(regimenGeneral, 'impuesto');
  const list = imp === undefined ? [] : Array.isArray(imp) ? imp : [imp];
  return list
    .map((i) => Number(findDeep(i, 'idImpuesto') ?? (typeof i === 'object' ? undefined : i)))
    .filter((n) => Number.isFinite(n));
}

/** POST del envelope y parseo. Inyectable `fetchImpl` para tests. */
export async function callPadron(
  url: string,
  envelope: string,
  cuitConsultado: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PadronPersona> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
      body: envelope,
    });
  } catch (err) {
    throw new AfipUnavailableError(
      `No se pudo conectar con el padrón de AFIP: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const text = await res.text();
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (findDeep(xmlParser.parse(text), 'faultstring') as string) || detail; } catch { /* usa HTTP */ }
    throw new Error(`Padrón AFIP falló: ${detail}`);
  }
  return parsePersonaResponse(text, cuitConsultado);
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim();
}

function escapeXml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function findDeep(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in (obj as Record<string, unknown>)) return (obj as Record<string, unknown>)[key];
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const found = findDeep(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}
