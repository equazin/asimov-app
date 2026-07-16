/**
 * Persistencia de documentos con sus efectos transaccionales (stock, caja).
 *
 * A diferencia de los datos maestros (masters.ts), un documento no solo se
 * guarda: ejecuta efectos. Una recepción incrementa stock, un remito lo
 * disminuye, un recibo ingresa dinero a caja y una orden de pago lo egresa.
 * Toda la operación va en una única transacción SQLite.
 *
 * Convención de signos:
 *   stock_movements.qty y cash_movements.amount se guardan CON SIGNO
 *   (positivo = entrada/ingreso, negativo = salida/egreso). Así, el saldo se
 *   obtiene sumando, y el update de existencias/balance es siempre `+= delta`.
 */
import { getDb, dbGet, dbRun, nextSequence, formatDocNumber } from "./db";
import { randomUUID } from "node:crypto";
import { enqueueChange } from "./sync";
import { isCloudConnected } from "./api-client";
import { buildDocEnvelope } from "./document-sync";
import { applySourceLink, revertSourcesOnAnnul, type DocumentSource } from "./document-links";
import { explodeKitComponents } from "./kits";

/**
 * Encola el documento (cabecera + ítems + movimientos) para push a la nube.
 * Best-effort y solo con sesión cloud: nunca rompe el guardado local.
 */
export function enqueueDocSnapshot(type: string, id: string): void {
  if (!isCloudConnected()) return;
  try {
    const envelope = buildDocEnvelope(type, id);
    if (envelope) enqueueChange("document_snapshot", id, "update", envelope as unknown as Record<string, unknown>);
  } catch {
    // best-effort: si la cola falla, el guardado local ya ocurrió.
  }
}

function str(v: unknown, max = 500): string {
  return String(v ?? "").slice(0, max).trim();
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Normaliza fechas dd/mm/yyyy o ISO a `yyyy-mm-dd`; si no reconoce, usa hoy. */
function normalizeDate(v: unknown): string {
  const s = str(v);
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function defaultWarehouseId(): string {
  const w = dbGet<{ id: string }>("SELECT id FROM warehouses WHERE active = 1 ORDER BY name LIMIT 1");
  return w?.id ?? "wh-default";
}

function defaultCashAccountId(): string {
  const c = dbGet<{ id: string }>("SELECT id FROM cash_accounts WHERE active = 1 ORDER BY name LIMIT 1");
  return c?.id ?? "ca-default";
}

function findArticleByCode(code: string): { id: string; manages_stock: number; is_kit: number } | undefined {
  if (!code) return undefined;
  return dbGet<{ id: string; manages_stock: number; is_kit: number }>(
    "SELECT id, manages_stock, is_kit FROM articles WHERE code = ? LIMIT 1",
    [code],
  );
}

/**
 * Registra un movimiento de stock con signo y ajusta `article_stock` en `+= delta`.
 * `signedQty` positivo = entrada, negativo = salida.
 */
function applyStockDelta(
  articleId: string,
  warehouseId: string,
  signedQty: number,
  type: string,
  refType: string,
  refId: string,
  note: string,
): void {
  dbRun(
    `INSERT INTO stock_movements (id,article_id,warehouse_id,type,qty,reference_type,reference_id,notes)
     VALUES (?,?,?,?,?,?,?,?)`,
    [randomUUID(), articleId, warehouseId, type, signedQty, refType, refId, note],
  );
  dbRun(
    `INSERT INTO article_stock (article_id, warehouse_id, qty)
     VALUES (?, ?, ?)
     ON CONFLICT(article_id, warehouse_id) DO UPDATE SET qty = qty + excluded.qty`,
    [articleId, warehouseId, signedQty],
  );
}

/**
 * Registra un movimiento de caja con signo y ajusta el balance de la cuenta.
 * `signedAmount` positivo = ingreso, negativo = egreso.
 */
function applyCashDelta(accountId: string, signedAmount: number, type: string, concept: string, refType: string, refId: string): void {
  dbRun(
    `INSERT INTO cash_movements (id,account_id,type,amount,concept,reference_type,reference_id)
     VALUES (?,?,?,?,?,?,?)`,
    [randomUUID(), accountId, type, signedAmount, concept, refType, refId],
  );
  dbRun("UPDATE cash_accounts SET balance = balance + ? WHERE id = ?", [signedAmount, accountId]);
}

export interface PersistResult {
  id: string;
  number: string;
  stockMoved?: number;
  cashMoved?: number;
}

// ─── Recepción de mercadería (stock IN) ──────────────────────────────────────

export interface GoodsReceiptForm {
  id?: string;
  nroRmc?: string;
  fecha?: string;
  proveedorId?: string;
  proveedorNombre?: string;
  ocOrigen?: string;
  estado?: string;
  notasInternas?: string;
  items?: Array<{ codigo?: string; descripcion?: string; cantPedida?: number | string; cantRecibida?: number | string }>;
  /** Factura de compra de origen. */
  origen?: DocumentSource | null;
}

export function persistGoodsReceipt(form: GoodsReceiptForm): PersistResult {
  const db = getDb();
  const id = str(form.id) || randomUUID();
  const items = Array.isArray(form.items) ? form.items : [];
  const warehouseId = defaultWarehouseId();
  const date = normalizeDate(form.fecha);
  const estado = str(form.estado) || "pendiente";
  const rejected = /rechaz|anul|cancel/i.test(estado);
  let number = str(form.nroRmc);
  let stockMoved = 0;

  const tx = db.transaction(() => {
    if (!number) number = formatDocNumber("RC", nextSequence("goods-receipt"));
    dbRun(
      `INSERT OR REPLACE INTO goods_receipts (id,number,supplier_id,supplier_name,purchase_order_id,date,status,warehouse_id,notes,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM goods_receipts WHERE id=?),datetime('now')))`,
      [id, number, str(form.proveedorId) || null, str(form.proveedorNombre), str(form.ocOrigen) || null, date, estado, warehouseId, str(form.notasInternas), id],
    );
    // Revertir stock previo de este documento antes de re-aplicar (re-guardado).
    reverseStockFor("goods_receipt", id);
    dbRun("DELETE FROM goods_receipt_items WHERE receipt_id = ?", [id]);

    for (const item of items) {
      const code = str(item.codigo);
      const qtyReceived = num(item.cantRecibida);
      const article = findArticleByCode(code);
      dbRun(
        "INSERT INTO goods_receipt_items (id,receipt_id,article_id,code,description,qty_ordered,qty_received,unit_price) VALUES (?,?,?,?,?,?,?,?)",
        [randomUUID(), id, article?.id ?? null, code, str(item.descripcion), num(item.cantPedida), qtyReceived, 0],
      );
      if (!rejected && article && article.manages_stock && qtyReceived > 0) {
        applyStockDelta(article.id, warehouseId, qtyReceived, "entrada", "goods_receipt", id, `Remito de compra ${number}`);
        stockMoved++;
      }
    }
    if (form.origen) applySourceLink("goods-receipt", id, form.origen);
  });

  tx();
  enqueueDocSnapshot("goods_receipt", id);
  return { id, number, stockMoved };
}

// ─── Remito (stock OUT) ──────────────────────────────────────────────────────

export interface DeliveryNoteForm {
  id?: string;
  nroRem?: string;
  fecha?: string;
  estado?: string;
  cliente?: { id?: string } | null;
  clienteNombre?: string;
  observaciones?: string;
  items?: Array<{ codigo?: string; descripcion?: string; unidad?: string; cantPedida?: number | string; cantEntregada?: number | string }>;
  /** Pedido de origen (traído al form): crea vínculo y lo marca "remitido". */
  origen?: DocumentSource | null;
}

export function persistDeliveryNote(form: DeliveryNoteForm): PersistResult {
  const db = getDb();
  const id = str(form.id) || randomUUID();
  const items = Array.isArray(form.items) ? form.items : [];
  const warehouseId = defaultWarehouseId();
  const date = normalizeDate(form.fecha);
  const estado = str(form.estado) || "pendiente";
  const cancelled = /anul|cancel/i.test(estado);
  let number = str(form.nroRem);
  let stockMoved = 0;

  const tx = db.transaction(() => {
    if (!number) number = formatDocNumber("REM", nextSequence("delivery-note"));
    dbRun(
      `INSERT OR REPLACE INTO delivery_notes (id,number,client_id,client_name,date,status,notes,created_at)
       VALUES (?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM delivery_notes WHERE id=?),datetime('now')))`,
      [id, number, str(form.cliente?.id) || null, str(form.clienteNombre), date, estado, str(form.observaciones), id],
    );
    reverseStockFor("delivery_note", id);
    dbRun("DELETE FROM delivery_note_items WHERE note_id = ?", [id]);

    for (const item of items) {
      const code = str(item.codigo);
      const qtyDelivered = num(item.cantEntregada);
      const article = findArticleByCode(code);
      dbRun(
        "INSERT INTO delivery_note_items (id,note_id,article_id,code,description,unit,qty_ordered,qty_delivered) VALUES (?,?,?,?,?,?,?,?)",
        [randomUUID(), id, article?.id ?? null, code, str(item.descripcion), str(item.unidad) || "un", num(item.cantPedida), qtyDelivered],
      );
      if (!cancelled && article && qtyDelivered > 0) {
        if (article.is_kit) {
          // Kit/esquema: el stock se descuenta de cada componente, no del kit.
          for (const comp of explodeKitComponents(article.id)) {
            if (!comp.manages_stock) continue;
            applyStockDelta(comp.component_article_id, warehouseId, -(comp.qty * qtyDelivered), "salida", "delivery_note", id, `Remito ${number} (kit ${code})`);
            stockMoved++;
          }
        } else if (article.manages_stock) {
          applyStockDelta(article.id, warehouseId, -qtyDelivered, "salida", "delivery_note", id, `Remito ${number}`);
          stockMoved++;
        }
      }
    }
    if (form.origen) applySourceLink("delivery-note", id, form.origen);
  });

  tx();
  enqueueDocSnapshot("delivery_note", id);
  return { id, number, stockMoved };
}

// ─── Recibo (cobro → caja IN) ────────────────────────────────────────────────

export interface ReceiptForm {
  id?: string;
  nroRec?: string;
  fecha?: string;
  estado?: string;
  cliente?: { id?: string } | null;
  clienteNombre?: string;
  concepto?: string;
  totalCobrado?: number | string;
  facturas?: Array<{ nroFact?: string; importe?: number | string; saldo?: number | string; cobrado?: number | string }>;
}

export function persistReceipt(form: ReceiptForm): PersistResult {
  const db = getDb();
  const id = str(form.id) || randomUUID();
  const facturas = Array.isArray(form.facturas) ? form.facturas : [];
  const date = normalizeDate(form.fecha);
  const estado = str(form.estado) || "emitido";
  const cancelled = /anul|cancel/i.test(estado);
  const total = num(form.totalCobrado);
  const cashAccountId = defaultCashAccountId();
  let number = str(form.nroRec);
  let cashMoved = 0;

  const tx = db.transaction(() => {
    if (!number) number = formatDocNumber("REC", nextSequence("receipt"));
    dbRun(
      `INSERT OR REPLACE INTO receipts (id,number,client_id,client_name,date,status,total,payment_method,notes,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM receipts WHERE id=?),datetime('now')))`,
      [id, number, str(form.cliente?.id) || null, str(form.clienteNombre), date, estado, total, "varios", str(form.concepto), id],
    );
    reverseCashFor("receipt", id);
    dbRun("DELETE FROM receipt_items WHERE receipt_id = ?", [id]);

    for (const f of facturas) {
      dbRun(
        "INSERT INTO receipt_items (id,receipt_id,invoice_number,original_amount,paid_amount) VALUES (?,?,?,?,?)",
        [randomUUID(), id, str(f.nroFact), num(f.importe ?? f.saldo), num(f.cobrado)],
      );
    }
    if (!cancelled && total > 0) {
      applyCashDelta(cashAccountId, total, "ingreso", `Recibo ${number}`, "receipt", id);
      cashMoved = 1;
    }
  });

  tx();
  enqueueDocSnapshot("receipt", id);
  return { id, number, cashMoved };
}

// ─── Orden de pago (caja OUT) ────────────────────────────────────────────────

export interface PaymentOrderForm {
  id?: string;
  nroOP?: string;
  fecha?: string;
  proveedorId?: string;
  proveedorNombre?: string;
  concepto?: string;
  estado?: string;
  metodo?: string;
  totalPago?: number | string;
  facturas?: Array<{ nro?: string; original?: number | string; apagar?: number | string }>;
}

export function persistPaymentOrder(form: PaymentOrderForm): PersistResult {
  const db = getDb();
  const id = str(form.id) || randomUUID();
  const facturas = Array.isArray(form.facturas) ? form.facturas : [];
  const date = normalizeDate(form.fecha);
  const estado = str(form.estado) || "borrador";
  const cancelled = /anul|cancel/i.test(estado);
  const total = num(form.totalPago);
  const cashAccountId = defaultCashAccountId();
  let number = str(form.nroOP);
  let cashMoved = 0;

  const tx = db.transaction(() => {
    if (!number) number = formatDocNumber("OP", nextSequence("payment-order"));
    dbRun(
      `INSERT OR REPLACE INTO payment_orders (id,number,supplier_id,supplier_name,date,status,total,payment_method,notes,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM payment_orders WHERE id=?),datetime('now')))`,
      [id, number, str(form.proveedorId) || null, str(form.proveedorNombre), date, estado, total, str(form.metodo) || "transferencia", str(form.concepto), id],
    );
    reverseCashFor("payment_order", id);
    dbRun("DELETE FROM payment_order_items WHERE order_id = ?", [id]);

    for (const f of facturas) {
      dbRun(
        "INSERT INTO payment_order_items (id,order_id,invoice_number,original_amount,paid_amount) VALUES (?,?,?,?,?)",
        [randomUUID(), id, str(f.nro), num(f.original), num(f.apagar)],
      );
    }
    if (!cancelled && total > 0) {
      applyCashDelta(cashAccountId, -total, "egreso", `Orden de pago ${number}`, "payment_order", id);
      cashMoved = 1;
    }
  });

  tx();
  enqueueDocSnapshot("payment_order", id);
  return { id, number, cashMoved };
}

// ─── Recibo de compra (caja OUT) ─────────────────────────────────────────────
// Espejo del Recibo de venta: documenta un pago concreto que salda una o
// varias facturas de compra. A diferencia de la Orden de pago (que autoriza el
// pago), el Recibo de compra es el comprobante del pago efectivo — misma
// nomenclatura que el Recibo de venta pero contra proveedor.

export interface PurchaseReceiptForm {
  id?: string;
  nroRec?: string;
  fecha?: string;
  estado?: string;
  proveedor?: { id?: string } | null;
  proveedorNombre?: string;
  concepto?: string;
  totalPagado?: number | string;
  metodo?: string;
  facturas?: Array<{ nroFact?: string; invoiceId?: string; importe?: number | string; saldo?: number | string; pagado?: number | string }>;
}

export function persistPurchaseReceipt(form: PurchaseReceiptForm): PersistResult {
  const db = getDb();
  const id = str(form.id) || randomUUID();
  const facturas = Array.isArray(form.facturas) ? form.facturas : [];
  const date = normalizeDate(form.fecha);
  const estado = str(form.estado) || "emitido";
  const cancelled = /anul|cancel/i.test(estado);
  const total = num(form.totalPagado);
  const cashAccountId = defaultCashAccountId();
  let number = str(form.nroRec);
  let cashMoved = 0;

  const tx = db.transaction(() => {
    if (!number) number = formatDocNumber("RCP", nextSequence("purchase-receipt"));
    dbRun(
      `INSERT OR REPLACE INTO purchase_receipts (id,number,supplier_id,supplier_name,date,status,total,payment_method,notes,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM purchase_receipts WHERE id=?),datetime('now')))`,
      [id, number, str(form.proveedor?.id) || null, str(form.proveedorNombre), date, estado, total, str(form.metodo) || "transferencia", str(form.concepto), id],
    );
    reverseCashFor("purchase_receipt", id);
    dbRun("DELETE FROM purchase_receipt_items WHERE receipt_id = ?", [id]);

    for (const f of facturas) {
      dbRun(
        "INSERT INTO purchase_receipt_items (id,receipt_id,invoice_id,invoice_number,original_amount,paid_amount) VALUES (?,?,?,?,?,?)",
        [randomUUID(), id, str(f.invoiceId) || null, str(f.nroFact), num(f.importe ?? f.saldo), num(f.pagado)],
      );
    }
    if (!cancelled && total > 0) {
      applyCashDelta(cashAccountId, -total, "egreso", `Recibo de compra ${number}`, "purchase_receipt", id);
      cashMoved = 1;
    }
  });

  tx();
  enqueueDocSnapshot("purchase_receipt", id);
  return { id, number, cashMoved };
}

// ─── Documentos sin efecto de stock/caja (solo header + ítems) ───────────────
// Pedido de venta, cotización, orden de compra, factura de compra y factura de
// venta se persisten con sus ítems. No mueven stock ni caja: eso ocurre en su
// documento derivado (remito, recepción, recibo…).
//
// Decisión de negocio (2026-07-02): la factura de venta NO descuenta stock. El
// remito es el único documento que da salida de stock, para evitar el doble
// descuento cuando de un mismo pedido se emiten remito + factura.

function lineSubtotal(qty: number, price: number): number {
  return Math.round(qty * price * 100) / 100;
}

const round2 = (value: number): number => Math.round(Number((value * 100).toFixed(6))) / 100;

function lineGrossFromNet(net: number, ivaPct: number): number {
  return round2(net + round2(net * ivaPct / 100));
}

/**
 * Convierte precios comerciales USD a importes fiscales ARS. La regla parte de
 * cada renglón tal como lo ve el operador (precio unitario redondeado a 2
 * decimales), convierte su total con IVA y luego recompone neto + IVA en ARS.
 * Una conciliación de centavos garantiza que el total sea exactamente
 * round2(totalUSD × cotización) sin romper la relación de alícuotas que valida
 * WSFE.
 */
function normalizeSaleItemsToArs(items: SaleDocItem[], currency: string, usdRate: number): SaleDocItem[] {
  if (currency !== "USD") {
    return items.map((item) => {
      const qty = num(item.cantidad);
      const unitPrice = round2(num(item.precio));
      const discount = Math.min(100, Math.max(0, num(item.descuento)));
      const targetNet = round2(qty * unitPrice * (1 - discount / 100));
      return { ...item, precio: qty > 0 ? targetNet / qty : 0, descuento: 0 };
    });
  }
  if (!Number.isFinite(usdRate) || usdRate <= 0) {
    throw new Error("Ingresá una cotización USD → ARS válida antes de guardar el comprobante.");
  }

  const converted = items.map((item) => {
    const qty = num(item.cantidad);
    const ivaPct = num(item.iva) || 21;
    const sourceUnitPrice = round2(num(item.precio));
    const discount = Math.min(100, Math.max(0, num(item.descuento)));
    const sourceNet = round2(qty * sourceUnitPrice * (1 - discount / 100));
    const sourceIva = round2(sourceNet * ivaPct / 100);
    const targetGross = round2((sourceNet + sourceIva) * usdRate);
    const targetNet = ivaPct > 0 ? round2(targetGross / (1 + ivaPct / 100)) : targetGross;
    return { item, qty, ivaPct, sourceGross: round2(sourceNet + sourceIva), targetNet };
  });

  const expectedGrossCents = Math.round(round2(converted.reduce((sum, line) => sum + line.sourceGross, 0) * usdRate) * 100);
  let actualGrossCents = converted.reduce(
    (sum, line) => sum + Math.round(lineGrossFromNet(line.targetNet, line.ivaPct) * 100),
    0,
  );

  for (let guard = 0; actualGrossCents !== expectedGrossCents && guard < 1000; guard++) {
    const remaining = expectedGrossCents - actualGrossCents;
    const direction = remaining > 0 ? 1 : -1;
    let adjusted = false;
    for (const line of converted) {
      if (line.qty <= 0) continue;
      const previousGross = Math.round(lineGrossFromNet(line.targetNet, line.ivaPct) * 100);
      const candidateNet = round2(line.targetNet + direction * 0.01);
      if (candidateNet < 0) continue;
      const candidateGross = Math.round(lineGrossFromNet(candidateNet, line.ivaPct) * 100);
      const change = candidateGross - previousGross;
      if (change === 0 || Math.abs(remaining - change) >= Math.abs(remaining)) continue;
      line.targetNet = candidateNet;
      actualGrossCents += change;
      adjusted = true;
      break;
    }
    if (!adjusted) throw new Error("No se pudieron conciliar los centavos de la conversión USD → ARS.");
  }
  if (actualGrossCents !== expectedGrossCents) {
    throw new Error("La conversión USD → ARS no pudo obtener un total fiscal consistente.");
  }

  return converted.map((line) => ({
    ...line.item,
    precio: line.qty > 0 ? line.targetNet / line.qty : 0,
    descuento: 0,
  }));
}

/**
 * Calcula los totales de un documento de venta a partir de sus ítems.
 * El header SIEMPRE se deriva de las líneas persistidas (neto = Σ qty×precio,
 * IVA = Σ redondeo(neto_línea × iva%), total = neto + IVA); no se confía en los
 * `totales` que envía el renderer, que pueden venir mal calculados o adulterados.
 */
function computeSaleTotals(items: SaleDocItem[]): { subtotal: number; ivaAmount: number; total: number } {
  let subtotal = 0;
  let ivaAmount = 0;
  for (const it of items) {
    const sub = lineSubtotal(num(it.cantidad), num(it.precio));
    const ivaPct = num(it.iva) || 21;
    subtotal += sub;
    ivaAmount += Math.round(sub * ivaPct) / 100;
  }
  const r2 = (n: number): number => Math.round(n * 100) / 100;
  subtotal = r2(subtotal);
  ivaAmount = r2(ivaAmount);
  return { subtotal, ivaAmount, total: r2(subtotal + ivaAmount) };
}

export interface SaleDocItem {
  articleId?: string;
  codigo?: string; descripcion?: string; unidad?: string;
  cantidad?: number | string; precio?: number | string; descuento?: number | string; iva?: number | string;
}

function saleSourceCurrency(monedaPrecios?: string, moneda?: string): "USD" | "ARS" {
  const source = str(monedaPrecios || moneda).toUpperCase();
  return source.startsWith("USD") ? "USD" : "ARS";
}

function resolveSaleArticleId(item: SaleDocItem): string | null {
  const requestedId = str(item.articleId);
  if (requestedId) {
    const found = dbGet<{ id: string }>("SELECT id FROM articles WHERE id = ? LIMIT 1", [requestedId]);
    if (found?.id) return found.id;
  }
  return findArticleByCode(str(item.codigo))?.id ?? null;
}

export interface SaleOrderForm {
  id?: string; nroPedido?: string; fecha?: string; deliveryDate?: string;
  cliente?: { id?: string } | null; clienteNombre?: string; moneda?: string;
  estado?: string; observaciones?: string;
  items?: SaleDocItem[];
  totales?: { neto?: number; iva21?: number; iva10?: number; total?: number };
  cotizacionUsd?: number | string | null;
  monedaPrecios?: "USD" | "ARS" | string;
  mostrarComponentesKit?: boolean;
}

export function persistSaleOrder(form: SaleOrderForm): PersistResult {
  const db = getDb();
  const id = str(form.id) || randomUUID();
  const sourceItems = Array.isArray(form.items) ? form.items : [];
  const sourceCurrency = saleSourceCurrency(form.monedaPrecios, form.moneda);
  const requestedUsdRate = num(form.cotizacionUsd);
  const items = normalizeSaleItemsToArs(sourceItems, sourceCurrency, requestedUsdRate);
  const totals = computeSaleTotals(items);
  const date = normalizeDate(form.fecha);
  let number = str(form.nroPedido);

  const tx = db.transaction(() => {
    if (!number) number = formatDocNumber("PED", nextSequence("sale-orders"));
    dbRun(
      `INSERT OR REPLACE INTO sale_orders (id,number,client_id,client_name,date,delivery_date,status,currency,usd_rate,source_currency,show_kit_components,subtotal,iva_amount,total,notes,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM sale_orders WHERE id=?),datetime('now')),datetime('now'))`,
      [id, number, str(form.cliente?.id) || null, str(form.clienteNombre), date, normalizeDate(form.deliveryDate),
       str(form.estado) || "borrador", "ARS", sourceCurrency === "USD" && requestedUsdRate > 0 ? requestedUsdRate : null, sourceCurrency,
       form.mostrarComponentesKit === false ? 0 : 1,
       totals.subtotal, totals.ivaAmount, totals.total, str(form.observaciones), id],
    );
    dbRun("DELETE FROM sale_order_items WHERE order_id = ?", [id]);
    for (const it of items) {
      const qty = num(it.cantidad), price = num(it.precio);
      dbRun(
        "INSERT INTO sale_order_items (id,order_id,article_id,code,description,unit,qty,unit_price,iva_pct,subtotal) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [randomUUID(), id, resolveSaleArticleId(it), str(it.codigo), str(it.descripcion), str(it.unidad) || "un", qty, price, num(it.iva) || 21, lineSubtotal(qty, price)],
      );
    }
  });
  tx();
  enqueueDocSnapshot("sale_order", id);
  return { id, number };
}

export interface QuoteForm {
  id?: string; nroCot?: string; fecha?: string; validoHasta?: string;
  cliente?: { id?: string } | null; clienteNombre?: string; moneda?: string; estado?: string; observaciones?: string;
  items?: SaleDocItem[];
  totales?: { total?: number };
  cotizacionUsd?: number | string | null;
  monedaPrecios?: "USD" | "ARS" | string;
  mostrarComponentesKit?: boolean;
}

export function persistQuote(form: QuoteForm): PersistResult {
  const db = getDb();
  const id = str(form.id) || randomUUID();
  const sourceItems = Array.isArray(form.items) ? form.items : [];
  const sourceCurrency = saleSourceCurrency(form.monedaPrecios, form.moneda);
  const requestedUsdRate = num(form.cotizacionUsd);
  const items = normalizeSaleItemsToArs(sourceItems, sourceCurrency, requestedUsdRate);
  const totals = computeSaleTotals(items);
  const date = normalizeDate(form.fecha);
  const clientName = str(form.clienteNombre) || "Cliente ocasional";
  let number = str(form.nroCot);

  const tx = db.transaction(() => {
    if (!number) number = formatDocNumber("COT", nextSequence("quote"));
    dbRun(
      `INSERT OR REPLACE INTO quotes (id,number,client_id,client_name,date,valid_until,status,currency,usd_rate,source_currency,show_kit_components,subtotal,iva_amount,total,notes,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM quotes WHERE id=?),datetime('now')))`,
      [id, number, str(form.cliente?.id) || null, clientName, date, normalizeDate(form.validoHasta),
       str(form.estado) || "borrador", "ARS", sourceCurrency === "USD" && requestedUsdRate > 0 ? requestedUsdRate : null, sourceCurrency,
       form.mostrarComponentesKit === false ? 0 : 1,
       totals.subtotal, totals.ivaAmount, totals.total, str(form.observaciones), id],
    );
    dbRun("DELETE FROM quote_items WHERE quote_id = ?", [id]);
    for (const it of items) {
      const qty = num(it.cantidad), price = num(it.precio);
      dbRun(
        "INSERT INTO quote_items (id,quote_id,article_id,code,description,qty,unit_price,iva_pct,subtotal) VALUES (?,?,?,?,?,?,?,?,?)",
        [randomUUID(), id, resolveSaleArticleId(it), str(it.codigo), str(it.descripcion), qty, price, num(it.iva) || 21, lineSubtotal(qty, price)],
      );
    }
  });
  tx();
  enqueueDocSnapshot("quote", id);
  return { id, number };
}

export interface InvoiceForm {
  id?: string; tipo?: string; ptoVta?: string; nroFact?: string; fecha?: string;
  cliente?: { id?: string } | null; clienteNombre?: string; observaciones?: string;
  items?: SaleDocItem[];
  totales?: { neto21?: number; neto10?: number; neto0?: number; iva21?: number; iva10?: number; total?: number };
  /** Documento de origen (pedido/remito traído al form): crea vínculo y propaga estado. */
  origen?: DocumentSource | null;
  /** Cotización USD → ARS del día. Se imprime en el pie para que la contra-parte
   *  pueda reconstruir el USD original si el pedido fue tomado en dólares. */
  cotizacionUsd?: number | string | null;
  /** Moneda de los precios ingresados. Compatibilidad: si se omite, se asume ARS. */
  monedaPrecios?: "USD" | "ARS" | string;
  /** Preferencia por factura: al imprimir, desplegar (true/undefined) u ocultar
   *  (false) los componentes de cada ítem que sea un kit. Default = true. */
  mostrarComponentesKit?: boolean;
  /** Modo consolidado: al imprimir mostrar UN solo renglón (con `descripcionConsolidada`)
   *  y todos los ítems reales como sub-líneas sin precio. Útil para armados custom
   *  que no ameritan crear un kit en el catálogo. */
  consolidarItems?: boolean;
  /** Descripción que se imprime como línea principal cuando `consolidarItems=true`.
   *  Ejemplos: "PC gaming a medida", "Kit oficina completo". */
  descripcionConsolidada?: string;
}

export function persistInvoice(form: InvoiceForm): PersistResult {
  const db = getDb();
  const id = str(form.id) || randomUUID();
  const existing = dbGet<{ cae: string | null }>("SELECT cae FROM invoices WHERE id = ?", [id]);
  if (existing?.cae) {
    throw new Error("La factura ya está autorizada por ARCA y no puede editarse.");
  }
  const sourceItems = Array.isArray(form.items) ? form.items : [];
  const sourceCurrency = str(form.monedaPrecios).toUpperCase() === "USD" ? "USD" : "ARS";
  const requestedUsdRate = num(form.cotizacionUsd);
  const items = normalizeSaleItemsToArs(sourceItems, sourceCurrency, requestedUsdRate);
  const totals = computeSaleTotals(items);
  const date = normalizeDate(form.fecha);
  const tipo = str(form.tipo) || "B";
  const pos = str(form.ptoVta) || "0001";
  let number = str(form.nroFact);

  const tx = db.transaction(() => {
    if (!number) number = `${pos}-${String(nextSequence(`invoice-${tipo}`)).padStart(8, "0")}`;
    const cotiz = requestedUsdRate;
    const usdRate = Number.isFinite(cotiz) && cotiz > 0 ? cotiz : null;
    // Default true si no vino explícitamente en el form (compat con formularios previos).
    const showKits = form.mostrarComponentesKit === false ? 0 : 1;
    const consolidated = form.consolidarItems === true ? 1 : 0;
    const consolidatedLabel = consolidated ? (str(form.descripcionConsolidada) || "Equipo armado") : null;
    dbRun(
      `INSERT INTO invoices (id,number,client_id,client_name,date,tipo,point_of_sale,status,subtotal,iva_amount,total,afip_error,notes,usd_rate,source_currency,show_kit_components,consolidated_print,consolidated_label)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         number=excluded.number, client_id=excluded.client_id, client_name=excluded.client_name,
         date=excluded.date, tipo=excluded.tipo, point_of_sale=excluded.point_of_sale,
         status='borrador', subtotal=excluded.subtotal, iva_amount=excluded.iva_amount,
         total=excluded.total, afip_error=NULL, notes=excluded.notes,
         usd_rate=excluded.usd_rate, source_currency=excluded.source_currency,
         show_kit_components=excluded.show_kit_components,
         consolidated_print=excluded.consolidated_print, consolidated_label=excluded.consolidated_label`,
      [id, number, str(form.cliente?.id) || null, str(form.clienteNombre), date, tipo, pos, "borrador",
       totals.subtotal, totals.ivaAmount, totals.total, null, str(form.observaciones),
       usdRate, sourceCurrency, showKits, consolidated, consolidatedLabel],
    );
    dbRun("DELETE FROM invoice_items WHERE invoice_id = ?", [id]);
    for (const it of items) {
      const qty = num(it.cantidad), price = num(it.precio), ivaPct = num(it.iva) || 21;
      const sub = lineSubtotal(qty, price);
      dbRun(
        "INSERT INTO invoice_items (id,invoice_id,article_id,code,description,qty,unit_price,iva_pct,subtotal,iva_amount) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [randomUUID(), id, findArticleByCode(str(it.codigo))?.id ?? null, str(it.codigo), str(it.descripcion), qty, price, ivaPct, sub, Math.round(sub * ivaPct) / 100],
      );
    }
    if (form.origen) applySourceLink("invoice", id, form.origen);
  });
  tx();
  enqueueDocSnapshot("invoice", id);
  return { id, number };
}

export function setInvoicePrintPreferences(
  invoiceId: string,
  consolidateItems: boolean,
  consolidatedLabel?: string,
): { id: string; consolidatedPrint: number; consolidatedLabel: string | null } {
  const id = str(invoiceId);
  if (!id) throw new Error("La factura no es válida.");
  const invoice = dbGet<{ id: string; consolidated_print: number; consolidated_label: string | null }>(
    "SELECT id, consolidated_print, consolidated_label FROM invoices WHERE id = ?",
    [id],
  );
  if (!invoice) throw new Error("No se encontró la factura.");

  const consolidatedPrint = consolidateItems ? 1 : 0;
  const label = consolidatedPrint ? (str(consolidatedLabel, 160) || "Equipo armado") : null;
  if (Number(invoice.consolidated_print || 0) === consolidatedPrint && invoice.consolidated_label === label) {
    return { id, consolidatedPrint, consolidatedLabel: label };
  }
  dbRun(
    "UPDATE invoices SET consolidated_print = ?, consolidated_label = ? WHERE id = ?",
    [consolidatedPrint, label, id],
  );
  enqueueDocSnapshot("invoice", id);
  return { id, consolidatedPrint, consolidatedLabel: label };
}

export interface PurchaseDocItem {
  articleId?: string; codigo?: string; descripcion?: string; unidad?: string;
  cantidad?: number | string; precio?: number | string; ivaPct?: number | string; subtotal?: number | string;
}

export interface PurchaseOrderForm {
  id?: string; nroOC?: string; fecha?: string; fechaEntrega?: string;
  proveedorId?: string; proveedorNombre?: string; estado?: string; notasInternas?: string;
  items?: PurchaseDocItem[];
}

export function persistPurchaseOrder(form: PurchaseOrderForm): PersistResult {
  const db = getDb();
  const id = str(form.id) || randomUUID();
  const items = Array.isArray(form.items) ? form.items : [];
  const date = normalizeDate(form.fecha);
  let number = str(form.nroOC);
  const total = items.reduce((s, it) => s + (num(it.subtotal) || lineSubtotal(num(it.cantidad), num(it.precio))), 0);

  const tx = db.transaction(() => {
    if (!number) number = formatDocNumber("OC", nextSequence("purchase-order"));
    dbRun(
      `INSERT OR REPLACE INTO purchase_orders (id,number,supplier_id,supplier_name,date,expected_date,status,total,notes,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM purchase_orders WHERE id=?),datetime('now')))`,
      [id, number, str(form.proveedorId) || null, str(form.proveedorNombre), date, normalizeDate(form.fechaEntrega),
       str(form.estado) || "borrador", Math.round(total * 100) / 100, str(form.notasInternas), id],
    );
    dbRun("DELETE FROM purchase_order_items WHERE order_id = ?", [id]);
    for (const it of items) {
      const qty = num(it.cantidad), price = num(it.precio);
      const rawIvaPct = Number(it.ivaPct);
      const ivaPct = Number.isFinite(rawIvaPct) ? rawIvaPct : 21;
      const requestedArticleId = str(it.articleId);
      const articleId = requestedArticleId
        ? dbGet<{ id: string }>("SELECT id FROM articles WHERE id = ? LIMIT 1", [requestedArticleId])?.id
        : undefined;
      dbRun(
        "INSERT INTO purchase_order_items (id,order_id,article_id,code,description,qty,unit_price,iva_pct,subtotal) VALUES (?,?,?,?,?,?,?,?,?)",
        [randomUUID(), id, articleId ?? findArticleByCode(str(it.codigo))?.id ?? null, str(it.codigo), str(it.descripcion), qty, price, ivaPct, num(it.subtotal) || lineSubtotal(qty, price)],
      );
    }
  });
  tx();
  enqueueDocSnapshot("purchase_order", id);
  return { id, number };
}

export interface PurchaseInvoiceForm {
  id?: string; tipo?: string; nroFactura?: string; fechaFactura?: string; fechaVencimiento?: string;
  cae?: string; proveedorId?: string; proveedorNombre?: string; estadoCont?: string;
  percepciones?: number | string; notas?: string;
  items?: PurchaseDocItem[];
  /** Orden de compra de origen. */
  origen?: DocumentSource | null;
}

export function persistPurchaseInvoice(form: PurchaseInvoiceForm): PersistResult {
  const db = getDb();
  const id = str(form.id) || randomUUID();
  const items = Array.isArray(form.items) ? form.items : [];
  const date = normalizeDate(form.fechaFactura);
  const tipo = str(form.tipo) || "A";
  let number = str(form.nroFactura);

  let subtotal = 0, ivaAmount = 0;
  for (const it of items) {
    const net = num(it.subtotal) || lineSubtotal(num(it.cantidad), num(it.precio));
    subtotal += net;
    ivaAmount += net * (num(it.ivaPct) / 100);
  }
  const total = Math.round((subtotal + ivaAmount + num(form.percepciones)) * 100) / 100;

  const tx = db.transaction(() => {
    if (!number) number = formatDocNumber("FC", nextSequence("purchase-invoice"));
    dbRun(
      `INSERT OR REPLACE INTO purchase_invoices (id,number,supplier_id,supplier_name,date,due_date,tipo,status,subtotal,iva_amount,total,cae,notes,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM purchase_invoices WHERE id=?),datetime('now')))`,
      [id, number, str(form.proveedorId) || null, str(form.proveedorNombre), date, normalizeDate(form.fechaVencimiento),
       tipo, str(form.estadoCont) || "pendiente", Math.round(subtotal * 100) / 100, Math.round(ivaAmount * 100) / 100, total, str(form.cae) || null, str(form.notas), id],
    );
    dbRun("DELETE FROM purchase_invoice_items WHERE invoice_id = ?", [id]);
    for (const it of items) {
      const qty = num(it.cantidad), price = num(it.precio);
      dbRun(
        "INSERT INTO purchase_invoice_items (id,invoice_id,article_id,code,description,qty,unit_price,iva_pct,subtotal) VALUES (?,?,?,?,?,?,?,?,?)",
        [randomUUID(), id, findArticleByCode(str(it.codigo))?.id ?? null, str(it.codigo), str(it.descripcion), qty, price, num(it.ivaPct) || 21, num(it.subtotal) || lineSubtotal(qty, price)],
      );
    }
    if (form.origen) applySourceLink("purchase-invoice", id, form.origen);
  });
  tx();
  enqueueDocSnapshot("purchase_invoice", id);
  return { id, number };
}

// ─── Reversas (para re-guardado idempotente) ─────────────────────────────────

/** Deshace los movimientos de stock de un documento (devuelve las existencias). */
function reverseStockFor(refType: string, refId: string): void {
  const prev = getDb()
    .prepare("SELECT article_id, warehouse_id, qty FROM stock_movements WHERE reference_type = ? AND reference_id = ?")
    .all(refType, refId) as Array<{ article_id: string; warehouse_id: string; qty: number }>;
  for (const m of prev) {
    dbRun("UPDATE article_stock SET qty = qty - ? WHERE article_id = ? AND warehouse_id = ?", [m.qty, m.article_id, m.warehouse_id]);
  }
  dbRun("DELETE FROM stock_movements WHERE reference_type = ? AND reference_id = ?", [refType, refId]);
}

/** Deshace los movimientos de caja de un documento (revierte el balance). */
function reverseCashFor(refType: string, refId: string): void {
  const prev = getDb()
    .prepare("SELECT account_id, amount FROM cash_movements WHERE reference_type = ? AND reference_id = ?")
    .all(refType, refId) as Array<{ account_id: string; amount: number }>;
  for (const m of prev) {
    dbRun("UPDATE cash_accounts SET balance = balance - ? WHERE id = ?", [m.amount, m.account_id]);
  }
  dbRun("DELETE FROM cash_movements WHERE reference_type = ? AND reference_id = ?", [refType, refId]);
}

// ─── Anulación desde la lista (reversa explícita) ────────────────────────────
// Anular un documento ya confirmado revierte sus efectos (stock o caja) y marca
// su estado como "anulado", en una sola transacción. La reversa reutiliza los
// mismos helpers idempotentes del re-guardado, así que anular es seguro aunque
// el documento no tenga efectos (pedido, cotización, facturas: solo cambia el
// estado). Los nombres de tabla/refType provienen de este mapa fijo interno
// —nunca del renderer—, por lo que la interpolación en el SQL es segura.
type AnnulEffect = "stock" | "cash" | "none";
const ANNULLABLE: Record<string, { table: string; refType: string; effect: AnnulEffect }> = {
  "delivery-note":    { table: "delivery_notes",    refType: "delivery_note",    effect: "stock" },
  "goods-receipt":    { table: "goods_receipts",    refType: "goods_receipt",    effect: "stock" },
  "receipt":          { table: "receipts",          refType: "receipt",          effect: "cash" },
  "payment-order":    { table: "payment_orders",    refType: "payment_order",    effect: "cash" },
  "sale-order":       { table: "sale_orders",        refType: "sale_order",       effect: "none" },
  "quote":            { table: "quotes",             refType: "quote",            effect: "none" },
  "invoice":          { table: "invoices",           refType: "invoice",          effect: "none" },
  "purchase-order":   { table: "purchase_orders",    refType: "purchase_order",   effect: "none" },
  "purchase-invoice": { table: "purchase_invoices",  refType: "purchase_invoice", effect: "none" },
};

export interface AnnulResult {
  ok: boolean;
  error?: string;
}

/**
 * Anula un documento por tipo + id: revierte sus efectos de stock/caja (si los
 * tuvo) y deja su estado en "anulado". Idempotente y seguro ante documentos ya
 * anulados o inexistentes.
 */
export function annulDocument(type: string, id: string): AnnulResult {
  const cfg = ANNULLABLE[str(type)];
  if (!cfg) return { ok: false, error: `Tipo de documento no anulable: ${type}` };
  const docId = str(id);
  if (!docId) return { ok: false, error: "Falta el identificador del documento." };

  const db = getDb();
  const row = dbGet<{ status: string; cae?: string | null }>(
    type === "invoice"
      ? "SELECT status, cae FROM invoices WHERE id = ?"
      : `SELECT status FROM ${cfg.table} WHERE id = ?`,
    [docId],
  );
  if (!row) return { ok: false, error: "Documento no encontrado." };
  if (/anul|cancel/i.test(str(row.status))) return { ok: false, error: "El documento ya está anulado." };
  if (type === "invoice" && row.cae) {
    return {
      ok: false,
      error: "Una factura autorizada por ARCA no puede anularse localmente. Emití una nota de crédito asociada.",
    };
  }

  const tx = db.transaction(() => {
    if (cfg.effect === "stock") reverseStockFor(cfg.refType, docId);
    else if (cfg.effect === "cash") reverseCashFor(cfg.refType, docId);
    dbRun(`UPDATE ${cfg.table} SET status = 'anulado' WHERE id = ?`, [docId]);
    // Los documentos de origen vinculados (pedido/remito) vuelven a "pendiente"
    // para poder facturarse o remitirse de nuevo.
    revertSourcesOnAnnul(str(type), docId);
  });
  tx();
  enqueueDocSnapshot(cfg.refType, docId);
  return { ok: true };
}
