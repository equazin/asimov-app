/**
 * Sincronización de documentos multi-PC mediante "envelopes" lossless.
 *
 * Los documentos locales viven en tablas heterogéneas por tipo (recibos apuntan
 * a facturas, remitos a artículos, etc.), por lo que normalizarlos a un shape
 * único sería con pérdida. En su lugar, cada documento viaja como un snapshot
 * verbatim de su fila de cabecera, sus ítems y los movimientos de stock/caja que
 * generó. La otra PC lo aplica tal cual, SIN re-ejecutar los efectos (no crea
 * movimientos nuevos: inserta los que ya venían y ajusta los agregados). Así se
 * evita el doble conteo de stock/caja entre PCs.
 */
import { getDb, dbAll, dbGet, dbRun } from './db';

interface DocTableMap {
  header: string;
  items: string;
  itemFk: string;
}

/** Tabla de cabecera, tabla de ítems y FK de ítems para cada tipo de documento. */
const DOC_TABLES: Record<string, DocTableMap> = {
  goods_receipt: { header: 'goods_receipts', items: 'goods_receipt_items', itemFk: 'receipt_id' },
  delivery_note: { header: 'delivery_notes', items: 'delivery_note_items', itemFk: 'note_id' },
  receipt: { header: 'receipts', items: 'receipt_items', itemFk: 'receipt_id' },
  payment_order: { header: 'payment_orders', items: 'payment_order_items', itemFk: 'order_id' },
  sale_order: { header: 'sale_orders', items: 'sale_order_items', itemFk: 'order_id' },
  quote: { header: 'quotes', items: 'quote_items', itemFk: 'quote_id' },
  invoice: { header: 'invoices', items: 'invoice_items', itemFk: 'invoice_id' },
  purchase_order: { header: 'purchase_orders', items: 'purchase_order_items', itemFk: 'order_id' },
  purchase_invoice: { header: 'purchase_invoices', items: 'purchase_invoice_items', itemFk: 'invoice_id' },
};

export function isSyncableDocType(type: string): boolean {
  return type in DOC_TABLES;
}

type Row = Record<string, unknown>;

export interface DocEnvelope {
  type: string;
  header: Row;
  items: Row[];
  stockMovements: Row[];
  cashMovements: Row[];
}

/** Normaliza estados fiscales y evita que un snapshot viejo quite un CAE local. */
function mergeInvoiceFiscalState(header: Row): Row {
  const id = String(header.id ?? '');
  const local = id
    ? dbGet<{ cae: string | null; cae_expiry: string | null; number: string; point_of_sale: string }>(
        'SELECT cae, cae_expiry, number, point_of_sale FROM invoices WHERE id = ?', [id],
      )
    : undefined;
  const remoteCae = String(header.cae ?? '').trim();
  if (local?.cae && !remoteCae) {
    return {
      ...header,
      cae: local.cae,
      cae_expiry: local.cae_expiry,
      number: local.number,
      point_of_sale: local.point_of_sale,
      status: 'autorizada',
      afip_error: null,
    };
  }
  if (remoteCae) return { ...header, status: 'autorizada', afip_error: null };
  if (String(header.status ?? '').toLowerCase() === 'emitida') {
    return { ...header, status: 'borrador' };
  }
  return header;
}

/**
 * Arma el envelope de un documento ya persistido: su cabecera, sus ítems y los
 * movimientos de stock/caja etiquetados con (reference_type=type, reference_id=id).
 */
export function buildDocEnvelope(type: string, id: string): DocEnvelope | null {
  const t = DOC_TABLES[type];
  if (!t) return null;
  const header = dbGet<Row>(`SELECT * FROM ${t.header} WHERE id = ?`, [id]);
  if (!header) return null;
  return {
    type,
    header,
    items: dbAll(`SELECT * FROM ${t.items} WHERE ${t.itemFk} = ?`, [id]) as Row[],
    stockMovements: dbAll(
      'SELECT * FROM stock_movements WHERE reference_type = ? AND reference_id = ?',
      [type, id],
    ) as Row[],
    cashMovements: dbAll(
      'SELECT * FROM cash_movements WHERE reference_type = ? AND reference_id = ?',
      [type, id],
    ) as Row[],
  };
}

/** Columnas reales de una tabla local, para filtrar filas remotas sin romper el schema. */
function tableColumns(table: string): Set<string> {
  const rows = dbAll(`PRAGMA table_info(${table})`, []) as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

/** INSERT OR REPLACE de una fila filtrando a las columnas existentes en la tabla. */
function replaceRow(table: string, row: Row): void {
  const allowed = tableColumns(table);
  const cols = Object.keys(row).filter((k) => allowed.has(k) && row[k] !== undefined);
  if (cols.length === 0) return;
  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map((c) => row[c] as string | number | null);
  getDb()
    .prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`)
    .run(...values);
}

/** Deshace movimientos de stock previos de este documento (idempotencia en re-sync). */
function reverseStock(type: string, id: string): void {
  const prev = dbAll(
    'SELECT article_id, warehouse_id, qty FROM stock_movements WHERE reference_type = ? AND reference_id = ?',
    [type, id],
  ) as Array<{ article_id: string; warehouse_id: string; qty: number }>;
  for (const m of prev) {
    dbRun('UPDATE article_stock SET qty = qty - ? WHERE article_id = ? AND warehouse_id = ?', [
      m.qty,
      m.article_id,
      m.warehouse_id,
    ]);
  }
  dbRun('DELETE FROM stock_movements WHERE reference_type = ? AND reference_id = ?', [type, id]);
}

/** Deshace movimientos de caja previos de este documento (idempotencia en re-sync). */
function reverseCash(type: string, id: string): void {
  const prev = dbAll(
    'SELECT account_id, amount FROM cash_movements WHERE reference_type = ? AND reference_id = ?',
    [type, id],
  ) as Array<{ account_id: string; amount: number }>;
  for (const m of prev) {
    dbRun('UPDATE cash_accounts SET balance = balance - ? WHERE id = ?', [m.amount, m.account_id]);
  }
  dbRun('DELETE FROM cash_movements WHERE reference_type = ? AND reference_id = ?', [type, id]);
}

/**
 * Aplica un envelope remoto en la base local, en una transacción. Reemplaza
 * cabecera e ítems, y re-inserta los movimientos como datos (NO re-ejecuta la
 * lógica del documento) ajustando existencias y saldos de caja.
 */
export function applyDocEnvelope(env: DocEnvelope): void {
  const t = DOC_TABLES[env.type];
  if (!t || !env.header || !env.header.id) return;
  const id = String(env.header.id);

  getDb().transaction(() => {
    // Revertir efectos previos de este doc antes de re-aplicar (idempotente).
    reverseStock(env.type, id);
    reverseCash(env.type, id);

    const header = env.type === 'invoice' ? mergeInvoiceFiscalState(env.header) : env.header;
    replaceRow(t.header, header);

    dbRun(`DELETE FROM ${t.items} WHERE ${t.itemFk} = ?`, [id]);
    for (const item of env.items ?? []) {
      replaceRow(t.items, item);
    }

    for (const m of env.stockMovements ?? []) {
      replaceRow('stock_movements', m);
      dbRun(
        `INSERT INTO article_stock (article_id, warehouse_id, qty) VALUES (?, ?, ?)
         ON CONFLICT(article_id, warehouse_id) DO UPDATE SET qty = qty + excluded.qty`,
        [m.article_id as string, m.warehouse_id as string, m.qty as number],
      );
    }

    for (const m of env.cashMovements ?? []) {
      replaceRow('cash_movements', m);
      dbRun('UPDATE cash_accounts SET balance = balance + ? WHERE id = ?', [
        m.amount as number,
        m.account_id as string,
      ]);
    }
  })();
}

/**
 * Borra localmente un documento y revierte sus efectos (propagación de baja
 * desde otra PC). No hay soft-delete en las tablas por tipo, así que se elimina
 * la fila y sus ítems tras revertir stock/caja.
 */
export function deleteDocLocal(type: string, id: string): void {
  const t = DOC_TABLES[type];
  if (!t) return;
  getDb().transaction(() => {
    reverseStock(type, id);
    reverseCash(type, id);
    dbRun(`DELETE FROM ${t.items} WHERE ${t.itemFk} = ?`, [id]);
    dbRun(`DELETE FROM ${t.header} WHERE id = ?`, [id]);
  })();
}
