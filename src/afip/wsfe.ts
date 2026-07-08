/**
 * WSFE (wsfev1) — Facturación Electrónica de AFIP/ARCA.
 *
 * Dos operaciones que usamos:
 *  - FECompUltimoAutorizado: último número autorizado por punto de venta + tipo.
 *  - FECAESolicitar: solicita el CAE para un comprobante.
 *
 * Todo el armado de XML y el parseo de respuestas son funciones puras y
 * testeables; el único efecto de red está en `callWsfe`.
 */
import { XMLParser } from 'fast-xml-parser';
import type { AfipTA } from './wsaa';
import { buildIvaAlicuotas, type AfipAlicIva } from './domain';

export const WSFE_URLS = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
} as const;

const WSFE_NS = 'http://ar.gov.afip.dif.FEV1/';

export interface FeCabecera {
  cuit: string;
  pointOfSale: number;
  invoiceType: number;
}

export interface FeComprobante {
  /** Concepto: 1 productos, 2 servicios, 3 productos y servicios. */
  concepto?: number;
  /** Tipo de doc del receptor: 80 CUIT, 96 DNI, 99 consumidor final. */
  docType: number;
  docNumber: string;
  /** Número de comprobante a autorizar (último autorizado + 1). */
  invoiceNumber: number;
  date: Date;
  impNeto: number;
  impIva: number;
  impTotal: number;
  /** Exento y no gravado, normalmente 0 para el caso PC/retail. */
  impTotConc?: number;
  impOpEx?: number;
  items: Array<{ ivaRate: number; subtotal: number }>;
}

export interface CaeSuccess {
  ok: true;
  cae: string;
  caeExpiration: string; // yyyy-mm-dd
  invoiceNumber: number;
  observations: AfipMessage[];
}

export interface CaeRejected {
  ok: false;
  result: string; // 'R'
  errors: AfipMessage[];
  observations: AfipMessage[];
}

export type CaeResult = CaeSuccess | CaeRejected;

export interface AfipMessage {
  code: string;
  msg: string;
}

/** Formatea una fecha a `yyyymmdd`, como pide WSFE en `CbteFch` / `FchServ*`. */
export function afipDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

const round2 = (n: number): number => Math.round(Number((n * 100).toFixed(6))) / 100;

// ---------------------------------------------------------------------------
// FECompUltimoAutorizado
// ---------------------------------------------------------------------------

export function buildUltimoAutorizadoEnvelope(ta: AfipTA, cab: FeCabecera): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    `xmlns:ar="${WSFE_NS}">` +
    '<soapenv:Header/><soapenv:Body>' +
    '<ar:FECompUltimoAutorizado>' +
    `<ar:Auth><ar:Token>${escapeXml(ta.token)}</ar:Token>` +
    `<ar:Sign>${escapeXml(ta.sign)}</ar:Sign>` +
    `<ar:Cuit>${cab.cuit}</ar:Cuit></ar:Auth>` +
    `<ar:PtoVta>${cab.pointOfSale}</ar:PtoVta>` +
    `<ar:CbteTipo>${cab.invoiceType}</ar:CbteTipo>` +
    '</ar:FECompUltimoAutorizado>' +
    '</soapenv:Body></soapenv:Envelope>'
  );
}

const xmlParser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false });

export function parseUltimoAutorizado(soapXml: string): number {
  const parsed = xmlParser.parse(soapXml);
  const result = findDeep(parsed, 'FECompUltimoAutorizadoResult');
  const errors = collectErrors(result);
  if (errors.length > 0) {
    throw new Error(`WSFE FECompUltimoAutorizado: ${formatMessages(errors)}`);
  }
  const nro = findDeep(result, 'CbteNro');
  const n = Number(nro);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// FECAESolicitar
// ---------------------------------------------------------------------------

/**
 * Arma el SOAP de FECAESolicitar para UN comprobante. `AlicIva` se agrupa por
 * alícuota con la lógica ya testeada de afip-domain. Para comprobantes tipo C
 * (Monotributo) no se envían alícuotas de IVA.
 */
export function buildFECAESolicitarEnvelope(ta: AfipTA, cab: FeCabecera, cbte: FeComprobante): string {
  const isTypeC = cab.invoiceType === 11 || cab.invoiceType === 12 || cab.invoiceType === 13;
  const alicuotas: AfipAlicIva[] = isTypeC ? [] : buildIvaAlicuotas(cbte.items);
  const impIva = isTypeC ? 0 : round2(cbte.impIva);
  const concepto = cbte.concepto ?? 1;

  const ivaXml = alicuotas.length
    ? '<ar:Iva>' + alicuotas.map((a) =>
        `<ar:AlicIva><ar:Id>${a.Id}</ar:Id>` +
        `<ar:BaseImp>${a.BaseImp}</ar:BaseImp>` +
        `<ar:Importe>${a.Importe}</ar:Importe></ar:AlicIva>`).join('') +
      '</ar:Iva>'
    : '';

  const detalle =
    `<ar:Concepto>${concepto}</ar:Concepto>` +
    `<ar:DocTipo>${cbte.docType}</ar:DocTipo>` +
    `<ar:DocNro>${cbte.docNumber}</ar:DocNro>` +
    `<ar:CbteDesde>${cbte.invoiceNumber}</ar:CbteDesde>` +
    `<ar:CbteHasta>${cbte.invoiceNumber}</ar:CbteHasta>` +
    `<ar:CbteFch>${afipDate(cbte.date)}</ar:CbteFch>` +
    `<ar:ImpTotal>${round2(cbte.impTotal)}</ar:ImpTotal>` +
    `<ar:ImpTotConc>${round2(cbte.impTotConc ?? 0)}</ar:ImpTotConc>` +
    `<ar:ImpNeto>${round2(cbte.impNeto)}</ar:ImpNeto>` +
    `<ar:ImpOpEx>${round2(cbte.impOpEx ?? 0)}</ar:ImpOpEx>` +
    `<ar:ImpIVA>${impIva}</ar:ImpIVA>` +
    '<ar:MonId>PES</ar:MonId>' +
    '<ar:MonCotiz>1</ar:MonCotiz>' +
    ivaXml;

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    `xmlns:ar="${WSFE_NS}">` +
    '<soapenv:Header/><soapenv:Body>' +
    '<ar:FECAESolicitar>' +
    `<ar:Auth><ar:Token>${escapeXml(ta.token)}</ar:Token>` +
    `<ar:Sign>${escapeXml(ta.sign)}</ar:Sign>` +
    `<ar:Cuit>${cab.cuit}</ar:Cuit></ar:Auth>` +
    '<ar:FeCAEReq><ar:FeCabReq>' +
    '<ar:CantReg>1</ar:CantReg>' +
    `<ar:PtoVta>${cab.pointOfSale}</ar:PtoVta>` +
    `<ar:CbteTipo>${cab.invoiceType}</ar:CbteTipo>` +
    '</ar:FeCabReq>' +
    `<ar:FeDetReq><ar:FECAEDetRequest>${detalle}</ar:FECAEDetRequest></ar:FeDetReq>` +
    '</ar:FeCAEReq>' +
    '</ar:FECAESolicitar>' +
    '</soapenv:Body></soapenv:Envelope>'
  );
}

/**
 * Parsea la respuesta de FECAESolicitar. Distingue tres situaciones:
 *  - Aprobado (Resultado 'A'): devuelve CAE + venc.
 *  - Rechazado (Resultado 'R'): devuelve errores y observaciones.
 *  - Errores de esquema/auth: se lanzan como excepción.
 */
export function parseFECAEResponse(soapXml: string): CaeResult {
  const parsed = xmlParser.parse(soapXml);
  const result = findDeep(parsed, 'FECAESolicitarResult');
  if (result === undefined) {
    const fault = findDeep(parsed, 'faultstring');
    throw new Error(`WSFE FECAESolicitar: ${typeof fault === 'string' ? fault : 'respuesta inesperada'}`);
  }

  const topErrors = collectErrors(result);
  if (topErrors.length > 0) {
    throw new Error(`WSFE FECAESolicitar: ${formatMessages(topErrors)}`);
  }

  const detResp = findDeep(result, 'FECAEDetResponse');
  const resultado = String(findDeep(result, 'Resultado') ?? findDeep(detResp, 'Resultado') ?? '');
  const observations = collectObservations(detResp);

  if (resultado === 'A') {
    const cae = String(findDeep(detResp, 'CAE') ?? '');
    const caeVto = String(findDeep(detResp, 'CAEFchVto') ?? '');
    const cbteDesde = Number(findDeep(detResp, 'CbteDesde') ?? 0);
    return {
      ok: true,
      cae,
      caeExpiration: formatAfipDate(caeVto),
      invoiceNumber: cbteDesde,
      observations,
    };
  }

  return { ok: false, result: resultado || 'R', errors: topErrors, observations };
}

// ---------------------------------------------------------------------------
// Red
// ---------------------------------------------------------------------------

export async function callWsfe(
  url: string,
  soapAction: string,
  envelope: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `${WSFE_NS}${soapAction}`,
    },
    body: envelope,
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (findDeep(xmlParser.parse(text), 'faultstring') as string) || detail; } catch { /* usa HTTP */ }
    throw new Error(`WSFE ${soapAction} falló: ${detail}`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** `yyyymmdd` (AFIP) → `yyyy-mm-dd`. Si no matchea, devuelve tal cual. */
export function formatAfipDate(yyyymmdd: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(yyyymmdd));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(yyyymmdd);
}

function escapeXml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function collectErrors(node: unknown): AfipMessage[] {
  const errs = findDeep(node, 'Errors');
  return toArray(findDeep(errs, 'Err') as unknown).map(mapMessage).filter((m): m is AfipMessage => !!m);
}

function collectObservations(node: unknown): AfipMessage[] {
  const obs = findDeep(node, 'Observaciones');
  return toArray(findDeep(obs, 'Obs') as unknown).map(mapMessage).filter((m): m is AfipMessage => !!m);
}

function mapMessage(o: unknown): AfipMessage | null {
  if (!o || typeof o !== 'object') return null;
  const rec = o as Record<string, unknown>;
  return { code: String(rec.Code ?? ''), msg: String(rec.Msg ?? '') };
}

function formatMessages(msgs: AfipMessage[]): string {
  return msgs.map((m) => `[${m.code}] ${m.msg}`).join('; ');
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
