/**
 * Libro IVA Ventas — export en el formato de importación de AFIP (RG 4597,
 * "Libro de IVA Digital"): dos archivos de ancho fijo,
 *   - REGINFO_CV_VENTAS_CBTE.txt      (1 registro de 266 posiciones por comprobante)
 *   - REGINFO_CV_VENTAS_ALICUOTAS.txt (1 registro de 62 posiciones por alícuota)
 *
 * Sólo entran comprobantes AUTORIZADOS (con CAE) del rango pedido. Los importes
 * van en centavos sin separador, con ceros a la izquierda.
 */
import { dbAll } from "./db";
import { buildIvaAlicuotas, receptorDocType, resolveVoucherTypeCode } from "./afip/domain";

export interface LibroIvaResult {
  cbte: string;        // contenido de REGINFO_CV_VENTAS_CBTE.txt
  alicuotas: string;   // contenido de REGINFO_CV_VENTAS_ALICUOTAS.txt
  count: number;       // comprobantes incluidos
}

interface InvoiceRow {
  id: string;
  number: string;
  date: string;
  due_date: string | null;
  tipo: string;
  point_of_sale: string;
  client_name: string;
  subtotal: number;
  iva_amount: number;
  total: number;
  cuit: string | null;
  fiscal_type: string | null;
}

// ── Helpers de ancho fijo ───────────────────────────────────────────────────

/** Importe → centavos con ceros a la izquierda (largo 15). Negativos no aplican (NC va en positivo con su tipo). */
export function fmtImporte(n: number, width = 15): string {
  const cents = Math.round(Math.abs(Number(n) || 0) * 100);
  return String(cents).padStart(width, "0");
}

/** Número entero con ceros a la izquierda. */
export function fmtNum(n: number | string, width: number): string {
  const digits = String(n ?? "").replace(/\D/g, "") || "0";
  return digits.slice(-width).padStart(width, "0");
}

/** Texto a lo ancho, recortado y completado con espacios a la derecha. */
export function fmtText(s: string, width: number): string {
  return String(s ?? "").slice(0, width).padEnd(width, " ");
}

/** `yyyy-mm-dd` → `yyyymmdd`. */
export function fmtFecha(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[1]}${m[2]}${m[3]}` : "00000000";
}

// ── Registros ───────────────────────────────────────────────────────────────

export interface CbteRecordInput {
  fecha: string;            // yyyy-mm-dd
  tipoCbte: number;         // código AFIP
  ptoVta: number;
  nro: number;
  docTipo: number;          // 80/96/99
  docNro: string;
  denominacion: string;
  impTotal: number;
  impNetoNoGravado?: number;
  impExento?: number;
  cantAlicuotas: number;
  fechaVtoPago?: string | null;
}

/** Registro de comprobante (266 posiciones, RG 4597 ventas). */
export function buildCbteRecord(r: CbteRecordInput): string {
  const rec =
    fmtFecha(r.fecha) +                    // 1  fecha comprobante (8)
    fmtNum(r.tipoCbte, 3) +                // 2  tipo (3)
    fmtNum(r.ptoVta, 5) +                  // 3  punto de venta (5)
    fmtNum(r.nro, 20) +                    // 4  número desde (20)
    fmtNum(r.nro, 20) +                    // 5  número hasta (20)
    fmtNum(r.docTipo, 2) +                 // 6  cód. doc. comprador (2)
    fmtNum(r.docNro, 20) +                 // 7  nro. doc. comprador (20)
    fmtText(r.denominacion, 30) +          // 8  denominación comprador (30)
    fmtImporte(r.impTotal) +               // 9  importe total (15)
    fmtImporte(r.impNetoNoGravado ?? 0) +  // 10 no neto gravado (15)
    fmtImporte(0) +                        // 11 percepción a no categorizados (15)
    fmtImporte(r.impExento ?? 0) +         // 12 operaciones exentas (15)
    fmtImporte(0) +                        // 13 percepciones imp. nacionales (15)
    fmtImporte(0) +                        // 14 percepciones IIBB (15)
    fmtImporte(0) +                        // 15 percepciones municipales (15)
    fmtImporte(0) +                        // 16 impuestos internos (15)
    "PES" +                                // 17 moneda (3)
    "0001000000" +                         // 18 tipo de cambio (10: 4 ent + 6 dec)
    String(Math.min(r.cantAlicuotas, 9)) + // 19 cantidad de alícuotas (1)
    (r.cantAlicuotas > 0 ? " " : "N") +    // 20 código de operación (1)
    fmtImporte(0) +                        // 21 otros tributos (15)
    fmtFecha(r.fechaVtoPago ?? r.fecha);   // 22 fecha vto. de pago (8)
  if (rec.length !== 266) throw new Error(`Registro CBTE de ${rec.length} posiciones (esperaba 266).`);
  return rec;
}

export interface AlicuotaRecordInput {
  tipoCbte: number;
  ptoVta: number;
  nro: number;
  netoGravado: number;
  codAlicuota: number;   // 3/4/5/6/8/9
  impuestoLiquidado: number;
}

/** Registro de alícuota (62 posiciones, RG 4597 ventas). */
export function buildAlicuotaRecord(r: AlicuotaRecordInput): string {
  const rec =
    fmtNum(r.tipoCbte, 3) +          // tipo (3)
    fmtNum(r.ptoVta, 5) +            // punto de venta (5)
    fmtNum(r.nro, 20) +              // número (20)
    fmtImporte(r.netoGravado) +      // neto gravado (15)
    fmtNum(r.codAlicuota, 4) +       // código de alícuota (4)
    fmtImporte(r.impuestoLiquidado); // impuesto liquidado (15)
  if (rec.length !== 62) throw new Error(`Registro ALICUOTAS de ${rec.length} posiciones (esperaba 62).`);
  return rec;
}

// ── Export desde la DB ──────────────────────────────────────────────────────

/**
 * Genera el libro IVA ventas para el rango [desde, hasta] (ISO `yyyy-mm-dd`)
 * con los comprobantes autorizados (con CAE).
 */
export function buildLibroIvaVentas(desde: string, hasta: string): LibroIvaResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    throw new Error("Rango de fechas inválido: usá el formato yyyy-mm-dd.");
  }
  const rows = dbAll<InvoiceRow>(
    `SELECT f.id, f.number, f.date, f.due_date, f.tipo, f.point_of_sale,
            f.client_name, f.subtotal, f.iva_amount, f.total,
            c.cuit, c.fiscal_type
     FROM invoices f LEFT JOIN clients c ON c.id = f.client_id
     WHERE f.cae IS NOT NULL AND f.cae != ''
       AND f.date >= ? AND f.date <= ?
     ORDER BY f.date, f.number`,
    [desde, hasta],
  );

  const cbteLines: string[] = [];
  const alicLines: string[] = [];
  for (const inv of rows) {
    const items = dbAll<{ iva_pct: number; subtotal: number }>(
      "SELECT iva_pct, subtotal FROM invoice_items WHERE invoice_id = ?", [inv.id],
    );
    const alicuotas = buildIvaAlicuotas(
      items.map((it) => ({ ivaRate: Number(it.iva_pct) || 0, subtotal: Number(it.subtotal) || 0 })),
    );
    const tipoCbte = resolveVoucherTypeCode(String(inv.tipo || "B"), inv.fiscal_type);
    const { docType, docNumber } = receptorDocType(inv.cuit);
    const ptoVta = parseInt(String(inv.point_of_sale), 10) || 1;
    const nro = parseInt(String(inv.number).split("-").pop() ?? "0", 10) || 0;

    cbteLines.push(buildCbteRecord({
      fecha: inv.date,
      tipoCbte,
      ptoVta,
      nro,
      docTipo: docType,
      docNro: docNumber,
      denominacion: inv.client_name || "CONSUMIDOR FINAL",
      impTotal: inv.total,
      cantAlicuotas: alicuotas.length,
      fechaVtoPago: inv.due_date,
    }));
    for (const a of alicuotas) {
      alicLines.push(buildAlicuotaRecord({
        tipoCbte, ptoVta, nro,
        netoGravado: a.BaseImp,
        codAlicuota: a.Id,
        impuestoLiquidado: a.Importe,
      }));
    }
  }

  return {
    cbte: cbteLines.join("\r\n") + (cbteLines.length ? "\r\n" : ""),
    alicuotas: alicLines.join("\r\n") + (alicLines.length ? "\r\n" : ""),
    count: rows.length,
  };
}
