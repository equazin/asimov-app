/**
 * Lógica de dominio pura de AFIP/ARCA (sin red ni Nest): códigos de alícuota,
 * desglose de IVA y mapeo de tipos de comprobante. Testeable en aislamiento.
 */

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
