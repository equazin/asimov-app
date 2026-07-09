/**
 * Lógica de dominio pura de AFIP/ARCA (sin red ni Nest): códigos de alícuota,
 * desglose de IVA y mapeo de tipos de comprobante. Testeable en aislamiento.
 */

/**
 * Error de conectividad con AFIP (DNS caído, sin internet, timeout). Distinto
 * de un rechazo: la factura puede quedar "pendiente de CAE" y reintentarse.
 */
export class AfipUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AfipUnavailableError';
  }
}

export function isAfipUnavailable(err: unknown): err is AfipUnavailableError {
  return err instanceof AfipUnavailableError ||
    (err instanceof Error && err.name === 'AfipUnavailableError');
}

/** Códigos de alícuota de IVA de AFIP (FEParamGetTiposIva). */
export const AFIP_IVA_CODES: Record<string, number> = {
  '0': 3,
  '2.5': 9,
  '5': 8,
  '10.5': 4,
  '21': 5,
  '27': 6,
};

/** Devuelve el código de alícuota de AFIP para un porcentaje de IVA (default 21%). */
export function afipIvaCode(rate: number): number {
  return AFIP_IVA_CODES[String(rate)] ?? 5;
}

// Redondeo a 2 decimales medio-arriba, robusto ante el ruido de punto flotante
// (p.ej. 4.725 → 4.73, y no 4.72 por 4.725*100 = 472.4999…).
const round2 = (n: number): number => Math.round(Number((n * 100).toFixed(6))) / 100;

export interface AfipAlicIva {
  Id: number;
  BaseImp: number;
  Importe: number;
}

/**
 * Agrupa los ítems por alícuota de IVA en el array `AlicIva` que exige WSFE
 * (FECAESolicitar → FeDetReq.Iva). BaseImp = neto gravado por alícuota;
 * Importe = IVA por alícuota. Los importes se redondean a 2 decimales.
 */
export function buildIvaAlicuotas(
  items: Array<{ ivaRate: number; subtotal: number }>,
): AfipAlicIva[] {
  const byCode = new Map<number, { base: number; iva: number }>();
  for (const it of items) {
    const code = afipIvaCode(it.ivaRate);
    const base = Number(it.subtotal) || 0;
    const iva = (base * (Number(it.ivaRate) || 0)) / 100;
    const acc = byCode.get(code) ?? { base: 0, iva: 0 };
    acc.base += base;
    acc.iva += iva;
    byCode.set(code, acc);
  }
  return [...byCode.entries()]
    .map(([Id, v]) => ({ Id, BaseImp: round2(v.base), Importe: round2(v.iva) }))
    .sort((a, b) => a.Id - b.Id);
}

/**
 * Mapea (tipo de comprobante interno, condición fiscal del emisor) al código
 * numérico de comprobante de AFIP. Default 11 (Factura C).
 */
export function getInvoiceTypeCode(invoiceType: string, fiscalType: string): number {
  const typeMap: Record<string, Record<string, number>> = {
    responsable_inscripto: {
      A: 1, B: 6, C: 11,
      credit_note_A: 3, credit_note_B: 8,
      debit_note_A: 2, debit_note_B: 7,
    },
    monotributista: {
      C: 11, credit_note_C: 13, debit_note_C: 12,
    },
  };
  return typeMap[fiscalType]?.[invoiceType] ?? 11;
}

// ---------------------------------------------------------------------------
// Fase 4 — cobertura de comprobantes: NC/ND, letra según cliente y validación
// ---------------------------------------------------------------------------

/** Tipos de comprobante que maneja el formulario de factura del desktop. */
export type VoucherKind = 'A' | 'B' | 'C' | 'M' | 'NC' | 'ND';

/** Normaliza la condición de IVA del cliente a una clave estable. */
export function normalizeIvaCondition(cond: string | null | undefined):
  'responsable_inscripto' | 'monotributista' | 'exento' | 'consumidor_final' | 'no_responsable' {
  const c = String(cond ?? '').toLowerCase();
  if (c.includes('inscripto') || c.includes('inscripta')) return 'responsable_inscripto';
  if (c.includes('monotribut')) return 'monotributista';
  if (c.includes('exento') || c.includes('exenta')) return 'exento';
  if (c.includes('no responsable')) return 'no_responsable';
  return 'consumidor_final';
}

/** Letra que corresponde emitir (emisor RI) según la condición de IVA del cliente. */
export function voucherLetterForClient(clientIvaCondition: string | null | undefined): 'A' | 'B' {
  return normalizeIvaCondition(clientIvaCondition) === 'responsable_inscripto' ? 'A' : 'B';
}

/**
 * Condición de IVA del receptor (RG 5616 — `CondicionIVAReceptorId`, obligatorio
 * desde 2025 en `FECAESolicitar`). Valores de `FEParamGetCondicionIvaReceptor`:
 *   1 Responsable Inscripto · 4 Exento · 5 Consumidor Final ·
 *   6 Responsable Monotributo · 7 Sujeto No Categorizado.
 */
export const CONDICION_IVA_RECEPTOR: Record<string, number> = {
  responsable_inscripto: 1,
  exento: 4,
  consumidor_final: 5,
  monotributista: 6,
  no_responsable: 7,
};

export function condicionIvaReceptorId(clientIvaCondition: string | null | undefined): number {
  return CONDICION_IVA_RECEPTOR[normalizeIvaCondition(clientIvaCondition)] ?? 5;
}

/**
 * Código AFIP del comprobante a partir del tipo del formulario (A/B/C/M/NC/ND)
 * y la condición de IVA del cliente. Para NC/ND la letra se deriva del cliente
 * (RI → A, resto → B). Emisor monotributista: siempre serie C (11/12/13).
 */
export function resolveVoucherTypeCode(
  tipo: string,
  clientIvaCondition: string | null | undefined,
  issuerFiscalType: 'responsable_inscripto' | 'monotributista' = 'responsable_inscripto',
): number {
  const t = String(tipo || 'B').toUpperCase();
  if (issuerFiscalType === 'monotributista') {
    if (t === 'NC') return 13;
    if (t === 'ND') return 12;
    return 11;
  }
  const letter = voucherLetterForClient(clientIvaCondition);
  if (t === 'NC') return letter === 'A' ? 3 : 8;
  if (t === 'ND') return letter === 'A' ? 2 : 7;
  if (t === 'M') return 51;
  if (t === 'A') return 1;
  if (t === 'C') return 11;
  return 6; // B
}

/** ¿El comprobante exige informar el comprobante asociado (CbtesAsoc, RG 4540)? */
export function requiresAssociatedInvoice(tipo: string): boolean {
  const t = String(tipo || '').toUpperCase();
  return t === 'NC' || t === 'ND';
}

/**
 * Valida la coherencia tipo de comprobante ↔ cliente ANTES de ir a AFIP, con
 * mensajes accionables. Devuelve `null` si es válido.
 */
export function validateVoucherForClient(
  tipo: string,
  clientIvaCondition: string | null | undefined,
  clientCuit: string | null | undefined,
  issuerFiscalType: 'responsable_inscripto' | 'monotributista' = 'responsable_inscripto',
): string | null {
  const t = String(tipo || 'B').toUpperCase();
  const cond = normalizeIvaCondition(clientIvaCondition);
  const cuitDigits = String(clientCuit ?? '').replace(/\D/g, '');

  if (issuerFiscalType === 'monotributista') return null; // serie C para todos

  if (t === 'C') {
    return 'La Factura C sólo la emite un monotributista; siendo Responsable Inscripto corresponde A o B según el cliente.';
  }
  if (t === 'A' || t === 'M') {
    if (cond !== 'responsable_inscripto') {
      return `El comprobante ${t} sólo puede emitirse a un cliente Responsable Inscripto (este cliente es "${clientIvaCondition || 'sin condición'}").`;
    }
    if (cuitDigits.length !== 11) {
      return `El comprobante ${t} exige el CUIT del cliente (11 dígitos).`;
    }
  }
  if (t === 'B' && cond === 'responsable_inscripto') {
    return 'A un cliente Responsable Inscripto corresponde Factura A (no B).';
  }
  if ((t === 'NC' || t === 'ND') && cond === 'responsable_inscripto' && cuitDigits.length !== 11) {
    return 'La nota de crédito/débito A exige el CUIT del cliente (11 dígitos).';
  }
  return null;
}

/**
 * Tipo de documento del receptor para WSFE (`DocTipo`): 80 CUIT, 96 DNI,
 * 99 consumidor final (sin identificar). Elige según el largo del número.
 */
export function receptorDocType(cuitOrDni: string | null | undefined): { docType: number; docNumber: string } {
  const digits = String(cuitOrDni ?? '').replace(/\D/g, '');
  if (digits.length === 11) return { docType: 80, docNumber: digits };
  if (digits.length >= 7 && digits.length <= 8) return { docType: 96, docNumber: digits };
  return { docType: 99, docNumber: '0' };
}
