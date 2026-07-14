/**
 * Vínculos entre documentos (trazabilidad pedido → remito → factura).
 *
 * Cuando una factura "trae" un pedido o remito, se registra el vínculo en
 * document_links y el documento de origen cambia de estado automáticamente:
 *   pedido  → factura : pedido pasa a "facturado"
 *   pedido  → remito  : pedido pasa a "remitido"
 *   remito  → factura : remito pasa a "facturado"
 * Al anular el documento destino, el origen vuelve a "pendiente".
 */
import { randomUUID } from "node:crypto";
import { dbAll, dbGet, dbRun } from "./db";
import { enqueueChange } from "./sync";
import { isCloudConnected } from "./api-client";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type LinkableDocType =
  | "quote"
  | "sale-order"
  | "delivery-note"
  | "invoice"
  | "purchase-order"
  | "purchase-invoice"
  | "goods-receipt";

export interface DocumentSource {
  tipo?: string;
  id?: string;
}

export interface ResolvedLink {
  link_id: string;
  doc_type: string;
  doc_id: string;
  number: string | null;
  date: string | null;
  status: string | null;
  total: number | null;
}

export interface PendingDoc {
  id: string;
  number: string;
  date: string;
  status: string;
  total: number;
  client_name: string;
  items_count: number;
}

export interface PendingPurchaseDoc {
  id: string;
  number: string;
  date: string;
  status: string;
  total: number;
  supplier_id: string | null;
  supplier_name: string;
  supplier_cuit: string;
  items_count: number;
}

export interface SourceItem {
  code: string;
  description: string;
  unit: string;
  qty: number;
  unit_price: number;
  iva_pct: number;
}

/** Tabla y estado que corresponde a cada tipo de documento vinculable. */
const DOC_TABLES: Record<string, { table: string; itemsTable: string; itemsFk: string; hasTotal?: boolean }> = {
  "sale-order": { table: "sale_orders", itemsTable: "sale_order_items", itemsFk: "order_id" },
  "delivery-note": { table: "delivery_notes", itemsTable: "delivery_note_items", itemsFk: "note_id" },
  "invoice": { table: "invoices", itemsTable: "invoice_items", itemsFk: "invoice_id" },
  "quote": { table: "quotes", itemsTable: "quote_items", itemsFk: "quote_id" },
  "purchase-order": { table: "purchase_orders", itemsTable: "purchase_order_items", itemsFk: "order_id" },
  "purchase-invoice": { table: "purchase_invoices", itemsTable: "purchase_invoice_items", itemsFk: "invoice_id" },
  "goods-receipt": { table: "goods_receipts", itemsTable: "goods_receipt_items", itemsFk: "receipt_id", hasTotal: false },
};

/** Estado al que pasa el documento de origen cuando se vincula a un destino. */
function statusForLink(sourceType: string, targetType: string): string | null {
  if (targetType === "invoice" && (sourceType === "sale-order" || sourceType === "delivery-note")) return "facturado";
  if (targetType === "delivery-note" && sourceType === "sale-order") return "remitido";
  if (targetType === "sale-order" && sourceType === "quote") return "aceptada";
  if (targetType === "purchase-invoice" && sourceType === "purchase-order") return "facturado";
  return null;
}

function isAllowedLink(sourceType: string, targetType: string): boolean {
  return (
    (sourceType === "quote" && targetType === "sale-order") ||
    (sourceType === "sale-order" && (targetType === "delivery-note" || targetType === "invoice")) ||
    (sourceType === "delivery-note" && targetType === "invoice") ||
    (sourceType === "invoice" && targetType === "invoice") ||
    (sourceType === "purchase-order" && targetType === "purchase-invoice") ||
    (sourceType === "purchase-invoice" && targetType === "goods-receipt")
  );
}

// ---------------------------------------------------------------------------
// Vinculación
// ---------------------------------------------------------------------------

/**
 * Crea el vínculo origen → destino (idempotente) y propaga el estado al origen.
 * Pensada para llamarse dentro de la transacción del documento destino.
 */
export function applySourceLink(targetType: LinkableDocType, targetId: string, source: DocumentSource): boolean {
  const sourceType = String(source?.tipo ?? "").trim();
  const sourceId = String(source?.id ?? "").trim();
  const def = DOC_TABLES[sourceType];
  if (!def || !sourceId || !targetId || sourceId === targetId) return false;
  if (!isAllowedLink(sourceType, targetType)) return false;
  const exists = dbGet(`SELECT id FROM ${def.table} WHERE id = ?`, [sourceId]);
  if (!exists) return false;

  const linkId = randomUUID();
  const inserted = dbRun(
    `INSERT OR IGNORE INTO document_links (id, source_type, source_id, target_type, target_id) VALUES (?,?,?,?,?)`,
    [linkId, sourceType, sourceId, targetType, targetId],
  );
  // Solo encolar cuando realmente se creó una fila (INSERT OR IGNORE no cuenta
  // los duplicados) y la nube está conectada. Best-effort: si la cola no está
  // lista (tests), no rompemos el flujo del documento.
  if (inserted?.changes && isCloudConnected()) {
    try {
      enqueueChange('document_link', linkId, 'create', {
        sourceType,
        sourceId,
        targetType,
        targetId,
      });
    } catch { /* best-effort */ }
  }
  const newStatus = statusForLink(sourceType, targetType);
  if (newStatus) {
    dbRun(`UPDATE ${def.table} SET status = ? WHERE id = ?`, [newStatus, sourceId]);
  }
  return true;
}

/**
 * Al anular un documento destino, los orígenes vinculados vuelven a "pendiente"
 * para poder facturarse/remitirse de nuevo. El vínculo se conserva (historial).
 */
export function revertSourcesOnAnnul(targetType: string, targetId: string): number {
  const links = dbAll<{ source_type: string; source_id: string }>(
    "SELECT source_type, source_id FROM document_links WHERE target_type = ? AND target_id = ?",
    [targetType, targetId],
  );
  let reverted = 0;
  for (const link of links) {
    const def = DOC_TABLES[link.source_type];
    if (!def || !statusForLink(link.source_type, targetType)) continue;
    dbRun(`UPDATE ${def.table} SET status = 'pendiente' WHERE id = ? AND status != 'anulado'`, [link.source_id]);
    reverted++;
  }
  return reverted;
}

// ---------------------------------------------------------------------------
// Consulta de trazabilidad
// ---------------------------------------------------------------------------

function resolveDoc(docType: string, docId: string, linkId: string): ResolvedLink {
  const def = DOC_TABLES[docType];
  const row = def
    ? dbGet<{ number: string; date: string; status: string; total: number }>(
        `SELECT number, date, status, ${def.hasTotal === false ? "0" : "total"} AS total FROM ${def.table} WHERE id = ?`, [docId])
    : undefined;
  return {
    link_id: linkId,
    doc_type: docType,
    doc_id: docId,
    number: row?.number ?? null,
    date: row?.date ?? null,
    status: row?.status ?? null,
    total: row?.total ?? null,
  };
}

/** Vínculos de un documento en ambas direcciones (de dónde viene / qué generó). */
export function getLinksFor(docType: string, docId: string): { origins: ResolvedLink[]; derived: ResolvedLink[] } {
  const originLinks = dbAll<{ id: string; source_type: string; source_id: string }>(
    "SELECT id, source_type, source_id FROM document_links WHERE target_type = ? AND target_id = ? ORDER BY created_at",
    [docType, docId],
  );
  const derivedLinks = dbAll<{ id: string; target_type: string; target_id: string }>(
    "SELECT id, target_type, target_id FROM document_links WHERE source_type = ? AND source_id = ? ORDER BY created_at",
    [docType, docId],
  );
  return {
    origins: originLinks.map((l) => resolveDoc(l.source_type, l.source_id, l.id)),
    derived: derivedLinks.map((l) => resolveDoc(l.target_type, l.target_id, l.id)),
  };
}

// ---------------------------------------------------------------------------
// Documentos pendientes para "traer" desde un formulario
// ---------------------------------------------------------------------------

/**
 * Pedidos de venta de un cliente que todavía pueden traerse a un destino:
 * quedan fuera los anulados y los que ya llegaron al estado del destino
 * (facturado siempre; remitido solo cuando el destino es un remito).
 */
export function listPendingSaleOrders(clientId: string, target: "invoice" | "delivery-note"): PendingDoc[] {
  if (!clientId) return [];
  const excluded = target === "delivery-note"
    ? ["facturado", "remitido", "anulado", "cancelado"]
    : ["facturado", "anulado", "cancelado"];
  const placeholders = excluded.map(() => "?").join(",");
  return dbAll<PendingDoc>(
    `SELECT o.id, o.number, o.date, o.status, o.total, o.client_name,
            (SELECT COUNT(*) FROM sale_order_items i WHERE i.order_id = o.id) AS items_count
     FROM sale_orders o
     WHERE o.client_id = ? AND LOWER(o.status) NOT IN (${placeholders})
     ORDER BY o.date DESC, o.created_at DESC LIMIT 50`,
    [clientId, ...excluded],
  );
}

/**
 * Facturas de un cliente que pueden asociarse a una nota de crédito/débito:
 * autorizadas por ARCA con CAE. Los borradores y rechazos no son comprobantes
 * válidos para informar como asociados en una NC/ND.
 */
export function listClientInvoicesForNote(clientId: string): PendingDoc[] {
  if (!clientId) return [];
  return dbAll<PendingDoc>(
    `SELECT f.id, f.number, f.date, f.status, f.total, f.client_name,
            (SELECT COUNT(*) FROM invoice_items i WHERE i.invoice_id = f.id) AS items_count
     FROM invoices f
     WHERE f.client_id = ? AND LOWER(f.status) = 'autorizada'
       AND f.cae IS NOT NULL AND trim(f.cae) <> ''
       AND UPPER(f.tipo) NOT IN ('NC','ND')
     ORDER BY f.date DESC, f.created_at DESC LIMIT 50`,
    [clientId],
  );
}

/** Remitos de un cliente aún no facturados ni anulados. */
export function listPendingDeliveryNotes(clientId: string): PendingDoc[] {
  if (!clientId) return [];
  return dbAll<PendingDoc>(
    `SELECT d.id, d.number, d.date, d.status, 0 AS total, d.client_name,
            (SELECT COUNT(*) FROM delivery_note_items i WHERE i.note_id = d.id) AS items_count
     FROM delivery_notes d
     WHERE d.client_id = ? AND LOWER(d.status) NOT IN ('facturado','anulado','cancelado')
     ORDER BY d.date DESC, d.created_at DESC LIMIT 50`,
    [clientId],
  );
}

/** Órdenes de compra disponibles para generar una factura de compra. */
export function listPendingPurchaseOrders(supplierId = ""): PendingPurchaseDoc[] {
  const params: string[] = [];
  const supplierFilter = supplierId ? "AND o.supplier_id = ?" : "";
  if (supplierId) params.push(supplierId);
  return dbAll<PendingPurchaseDoc>(
    `SELECT o.id, o.number, o.date, o.status, o.total, o.supplier_id,
            COALESCE(s.business_name, o.supplier_name, '') AS supplier_name,
            COALESCE(s.cuit, '') AS supplier_cuit,
            (SELECT COUNT(*) FROM purchase_order_items i WHERE i.order_id = o.id) AS items_count
     FROM purchase_orders o
     LEFT JOIN suppliers s ON s.id = o.supplier_id
     WHERE LOWER(o.status) NOT IN ('facturado','anulado','cancelado')
       ${supplierFilter}
     ORDER BY o.date DESC, o.created_at DESC LIMIT 50`,
    params,
  );
}

/** Facturas de compra aún no usadas por un remito de compra vigente. */
export function listPendingPurchaseInvoices(supplierId = ""): PendingPurchaseDoc[] {
  const params: string[] = [];
  const supplierFilter = supplierId ? "AND f.supplier_id = ?" : "";
  if (supplierId) params.push(supplierId);
  return dbAll<PendingPurchaseDoc>(
    `SELECT f.id, f.number, f.date, f.status, f.total, f.supplier_id,
            COALESCE(s.business_name, f.supplier_name, '') AS supplier_name,
            COALESCE(s.cuit, '') AS supplier_cuit,
            (SELECT COUNT(*) FROM purchase_invoice_items i WHERE i.invoice_id = f.id) AS items_count
     FROM purchase_invoices f
     LEFT JOIN suppliers s ON s.id = f.supplier_id
     WHERE LOWER(f.status) NOT IN ('anulado','cancelado')
       ${supplierFilter}
       AND NOT EXISTS (
         SELECT 1
         FROM document_links l
         JOIN goods_receipts r ON r.id = l.target_id
         WHERE l.source_type = 'purchase-invoice'
           AND l.source_id = f.id
           AND l.target_type = 'goods-receipt'
           AND LOWER(r.status) NOT IN ('anulado','cancelado','rechazado','rechazada')
       )
     ORDER BY f.date DESC, f.created_at DESC LIMIT 50`,
    params,
  );
}

/**
 * Ítems de un documento origen, normalizados para precargar la grilla del
 * destino. Para remitos (sin precio propio) el precio va en 0 y el usuario
 * lo completa o se toma del artículo.
 */
export function getSourceItems(docType: string, docId: string): SourceItem[] {
  if (docType === "sale-order") {
    return dbAll<SourceItem>(
      `SELECT code, description, unit, qty, unit_price, iva_pct
       FROM sale_order_items WHERE order_id = ? ORDER BY rowid`,
      [docId],
    );
  }
  if (docType === "delivery-note") {
    return dbAll<SourceItem>(
      `SELECT i.code, i.description, i.unit, i.qty_delivered AS qty,
              COALESCE(a.sale_price, 0) AS unit_price, COALESCE(a.iva_pct, 21) AS iva_pct
       FROM delivery_note_items i
       LEFT JOIN articles a ON a.id = i.article_id
       WHERE i.note_id = ? ORDER BY i.rowid`,
      [docId],
    );
  }
  if (docType === "quote") {
    return dbAll<SourceItem>(
      `SELECT code, description, 'un' AS unit, qty, unit_price, iva_pct
       FROM quote_items WHERE quote_id = ? ORDER BY rowid`,
      [docId],
    );
  }
  if (docType === "invoice") {
    // Para precargar una nota de crédito/débito con los ítems de la factura.
    return dbAll<SourceItem>(
      `SELECT code, description, 'un' AS unit, qty, unit_price, iva_pct
       FROM invoice_items WHERE invoice_id = ? ORDER BY rowid`,
      [docId],
    );
  }
  if (docType === "purchase-order") {
    return dbAll<SourceItem>(
      `SELECT code, description, 'UN' AS unit, qty, unit_price, iva_pct
       FROM purchase_order_items WHERE order_id = ? ORDER BY rowid`,
      [docId],
    );
  }
  if (docType === "purchase-invoice") {
    return dbAll<SourceItem>(
      `SELECT code, description, 'UN' AS unit, qty, unit_price, iva_pct
       FROM purchase_invoice_items WHERE invoice_id = ? ORDER BY rowid`,
      [docId],
    );
  }
  return [];
}
