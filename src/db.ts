/**
 * Capa de base de datos SQLite local para Asimov Desktop.
 * Motor: better-sqlite3 (síncrono, sin callbacks).
 *
 * El archivo .db vive en app.getPath('userData')/asimov.db
 * Funciona offline, sin servidor externo.
 */
import Database from "better-sqlite3";
import { app } from "electron";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) throw new Error("DB no inicializada — llamar initDb() primero");
  return _db;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Secuencias para autonumeración
CREATE TABLE IF NOT EXISTS sequences (
  name  TEXT PRIMARY KEY,
  last  INTEGER NOT NULL DEFAULT 0
);

-- Bloques de numeración reservados al server (Hi/Lo). Cada PC consume su rango
-- [next_val, end_val] localmente (offline-first); al agotarlo pide otro bloque.
-- Garantiza que dos PCs del mismo tenant no tomen el mismo número de comprobante.
CREATE TABLE IF NOT EXISTS sequence_blocks (
  name      TEXT PRIMARY KEY,
  next_val  INTEGER NOT NULL,
  end_val   INTEGER NOT NULL
);

-- Nombres de secuencia que necesitan (re)reservar un bloque en el próximo sync.
CREATE TABLE IF NOT EXISTS sequence_refill (
  name  TEXT PRIMARY KEY
);

-- Config del sistema
CREATE TABLE IF NOT EXISTS system_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- Usuarios
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  password_hash TEXT NOT NULL DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- MAESTROS
-- ============================================================

CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,
  code          TEXT UNIQUE,
  business_name TEXT NOT NULL,
  cuit          TEXT,
  fiscal_type   TEXT DEFAULT 'final',
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  city          TEXT,
  province      TEXT,
  credit_limit  REAL NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id            TEXT PRIMARY KEY,
  code          TEXT UNIQUE,
  business_name TEXT NOT NULL,
  cuit          TEXT,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  city          TEXT,
  province      TEXT,
  payment_term  INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS warehouses (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  address    TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS articles (
  id               TEXT PRIMARY KEY,
  code             TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  category         TEXT,
  unit             TEXT NOT NULL DEFAULT 'un',
  cost_price       REAL NOT NULL DEFAULT 0,
  sale_price       REAL NOT NULL DEFAULT 0,
  iva_pct          REAL NOT NULL DEFAULT 21,
  manages_stock    INTEGER NOT NULL DEFAULT 1,
  manages_serial   INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS article_stock (
  article_id   TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  qty          REAL NOT NULL DEFAULT 0,
  min_qty      REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (article_id, warehouse_id),
  FOREIGN KEY (article_id)   REFERENCES articles(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

CREATE TABLE IF NOT EXISTS serial_numbers (
  id           TEXT PRIMARY KEY,
  article_id   TEXT NOT NULL,
  serial       TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'disponible',
  warehouse_id TEXT,
  client_id    TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES articles(id)
);

CREATE TABLE IF NOT EXISTS price_lists (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  currency    TEXT NOT NULL DEFAULT 'ARS',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS price_list_items (
  id            TEXT PRIMARY KEY,
  price_list_id TEXT NOT NULL,
  article_id    TEXT NOT NULL,
  price         REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (price_list_id) REFERENCES price_lists(id),
  FOREIGN KEY (article_id)    REFERENCES articles(id)
);

-- ============================================================
-- VENTAS
-- ============================================================

CREATE TABLE IF NOT EXISTS sale_orders (
  id            TEXT PRIMARY KEY,
  number        TEXT UNIQUE NOT NULL,
  client_id     TEXT,
  client_name   TEXT,
  date          TEXT NOT NULL DEFAULT (date('now')),
  delivery_date TEXT,
  status        TEXT NOT NULL DEFAULT 'borrador',
  currency      TEXT NOT NULL DEFAULT 'ARS',
  subtotal      REAL NOT NULL DEFAULT 0,
  iva_amount    REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL DEFAULT 0,
  notes         TEXT,
  user_id       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS sale_order_items (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL,
  article_id  TEXT,
  code        TEXT,
  description TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT 'un',
  qty         REAL NOT NULL DEFAULT 1,
  unit_price  REAL NOT NULL DEFAULT 0,
  iva_pct     REAL NOT NULL DEFAULT 21,
  subtotal    REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES sale_orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quotes (
  id           TEXT PRIMARY KEY,
  number       TEXT UNIQUE NOT NULL,
  client_id    TEXT,
  client_name  TEXT,
  date         TEXT NOT NULL DEFAULT (date('now')),
  valid_until  TEXT,
  status       TEXT NOT NULL DEFAULT 'borrador',
  total        REAL NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS quote_items (
  id          TEXT PRIMARY KEY,
  quote_id    TEXT NOT NULL,
  article_id  TEXT,
  code        TEXT,
  description TEXT NOT NULL,
  qty         REAL NOT NULL DEFAULT 1,
  unit_price  REAL NOT NULL DEFAULT 0,
  iva_pct     REAL NOT NULL DEFAULT 21,
  subtotal    REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,
  number        TEXT UNIQUE NOT NULL,
  client_id     TEXT,
  client_name   TEXT,
  date          TEXT NOT NULL DEFAULT (date('now')),
  due_date      TEXT,
  tipo          TEXT NOT NULL DEFAULT 'B',
  point_of_sale TEXT NOT NULL DEFAULT '0001',
  status        TEXT NOT NULL DEFAULT 'borrador',
  subtotal      REAL NOT NULL DEFAULT 0,
  iva_amount    REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL DEFAULT 0,
  cae           TEXT,
  cae_expiry    TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id          TEXT PRIMARY KEY,
  invoice_id  TEXT NOT NULL,
  article_id  TEXT,
  code        TEXT,
  description TEXT NOT NULL,
  qty         REAL NOT NULL DEFAULT 1,
  unit_price  REAL NOT NULL DEFAULT 0,
  iva_pct     REAL NOT NULL DEFAULT 21,
  subtotal    REAL NOT NULL DEFAULT 0,
  iva_amount  REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS delivery_notes (
  id          TEXT PRIMARY KEY,
  number      TEXT UNIQUE NOT NULL,
  client_id   TEXT,
  client_name TEXT,
  date        TEXT NOT NULL DEFAULT (date('now')),
  status      TEXT NOT NULL DEFAULT 'pendiente',
  invoice_id  TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS delivery_note_items (
  id            TEXT PRIMARY KEY,
  note_id       TEXT NOT NULL,
  article_id    TEXT,
  code          TEXT,
  description   TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT 'un',
  qty_ordered   REAL NOT NULL DEFAULT 0,
  qty_delivered REAL NOT NULL DEFAULT 0,
  serial_numbers TEXT,
  FOREIGN KEY (note_id) REFERENCES delivery_notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS receipts (
  id             TEXT PRIMARY KEY,
  number         TEXT UNIQUE NOT NULL,
  client_id      TEXT,
  client_name    TEXT,
  date           TEXT NOT NULL DEFAULT (date('now')),
  status         TEXT NOT NULL DEFAULT 'borrador',
  total          REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'efectivo',
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id             TEXT PRIMARY KEY,
  receipt_id     TEXT NOT NULL,
  invoice_id     TEXT,
  invoice_number TEXT,
  original_amount REAL NOT NULL DEFAULT 0,
  paid_amount    REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
);

-- ============================================================
-- COMPRAS
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            TEXT PRIMARY KEY,
  number        TEXT UNIQUE NOT NULL,
  supplier_id   TEXT,
  supplier_name TEXT,
  date          TEXT NOT NULL DEFAULT (date('now')),
  expected_date TEXT,
  status        TEXT NOT NULL DEFAULT 'borrador',
  total         REAL NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL,
  article_id  TEXT,
  code        TEXT,
  description TEXT NOT NULL,
  qty         REAL NOT NULL DEFAULT 1,
  unit_price  REAL NOT NULL DEFAULT 0,
  iva_pct     REAL NOT NULL DEFAULT 21,
  subtotal    REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id                TEXT PRIMARY KEY,
  number            TEXT UNIQUE NOT NULL,
  supplier_id       TEXT,
  supplier_name     TEXT,
  purchase_order_id TEXT,
  date              TEXT NOT NULL DEFAULT (date('now')),
  status            TEXT NOT NULL DEFAULT 'pendiente',
  warehouse_id      TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id           TEXT PRIMARY KEY,
  receipt_id   TEXT NOT NULL,
  article_id   TEXT,
  code         TEXT,
  description  TEXT NOT NULL,
  qty_ordered  REAL NOT NULL DEFAULT 0,
  qty_received REAL NOT NULL DEFAULT 0,
  unit_price   REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (receipt_id) REFERENCES goods_receipts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id            TEXT PRIMARY KEY,
  number        TEXT NOT NULL,
  supplier_id   TEXT,
  supplier_name TEXT,
  date          TEXT NOT NULL DEFAULT (date('now')),
  due_date      TEXT,
  tipo          TEXT NOT NULL DEFAULT 'A',
  status        TEXT NOT NULL DEFAULT 'pendiente',
  subtotal      REAL NOT NULL DEFAULT 0,
  iva_amount    REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL DEFAULT 0,
  cae           TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id          TEXT PRIMARY KEY,
  invoice_id  TEXT NOT NULL,
  article_id  TEXT,
  code        TEXT,
  description TEXT NOT NULL,
  qty         REAL NOT NULL DEFAULT 1,
  unit_price  REAL NOT NULL DEFAULT 0,
  iva_pct     REAL NOT NULL DEFAULT 21,
  subtotal    REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id             TEXT PRIMARY KEY,
  number         TEXT UNIQUE NOT NULL,
  supplier_id    TEXT,
  supplier_name  TEXT,
  date           TEXT NOT NULL DEFAULT (date('now')),
  status         TEXT NOT NULL DEFAULT 'borrador',
  total          REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'transferencia',
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS payment_order_items (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL,
  invoice_id      TEXT,
  invoice_number  TEXT,
  original_amount REAL NOT NULL DEFAULT 0,
  paid_amount     REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES payment_orders(id) ON DELETE CASCADE
);

-- ============================================================
-- STOCK
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_movements (
  id             TEXT PRIMARY KEY,
  article_id     TEXT NOT NULL,
  warehouse_id   TEXT NOT NULL,
  type           TEXT NOT NULL,
  qty            REAL NOT NULL,
  date           TEXT NOT NULL DEFAULT (datetime('now')),
  reference_type TEXT,
  reference_id   TEXT,
  notes          TEXT,
  user_id        TEXT,
  FOREIGN KEY (article_id)   REFERENCES articles(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

-- ============================================================
-- TESORERÍA
-- ============================================================

CREATE TABLE IF NOT EXISTS cash_accounts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  balance     REAL NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL,
  type           TEXT NOT NULL,
  amount         REAL NOT NULL,
  date           TEXT NOT NULL DEFAULT (datetime('now')),
  concept        TEXT,
  reference_type TEXT,
  reference_id   TEXT,
  user_id        TEXT,
  FOREIGN KEY (account_id) REFERENCES cash_accounts(id)
);

-- ============================================================
-- CRM
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_accounts (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  industry   TEXT,
  website    TEXT,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opportunities (
  id             TEXT PRIMARY KEY,
  account_id     TEXT,
  title          TEXT NOT NULL,
  amount         REAL NOT NULL DEFAULT 0,
  stage          TEXT NOT NULL DEFAULT 'prospecto',
  probability    INTEGER NOT NULL DEFAULT 0,
  expected_close TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES crm_accounts(id)
);

-- ============================================================
-- RMA
-- ============================================================

CREATE TABLE IF NOT EXISTS tickets (
  id           TEXT PRIMARY KEY,
  number       TEXT UNIQUE NOT NULL,
  client_id    TEXT,
  client_name  TEXT,
  article_id   TEXT,
  serial_number TEXT,
  date         TEXT NOT NULL DEFAULT (date('now')),
  status       TEXT NOT NULL DEFAULT 'abierto',
  priority     TEXT NOT NULL DEFAULT 'normal',
  description  TEXT,
  resolution   TEXT,
  assigned_to  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS work_orders (
  id          TEXT PRIMARY KEY,
  number      TEXT UNIQUE NOT NULL,
  ticket_id   TEXT,
  date        TEXT NOT NULL DEFAULT (date('now')),
  status      TEXT NOT NULL DEFAULT 'pendiente',
  assigned_to TEXT,
  diagnosis   TEXT,
  work_done   TEXT,
  parts_used  TEXT,
  hours       REAL NOT NULL DEFAULT 0,
  cost        REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS warranties (
  id              TEXT PRIMARY KEY,
  client_id       TEXT,
  client_name     TEXT,
  article_id      TEXT,
  article_name    TEXT,
  serial_number   TEXT,
  sale_date       TEXT,
  warranty_months INTEGER NOT NULL DEFAULT 12,
  expiry_date     TEXT,
  status          TEXT NOT NULL DEFAULT 'vigente',
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- SISTEMA / CONFIG
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_base (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  category   TEXT,
  content    TEXT,
  tags       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  client_id   TEXT,
  client_name TEXT,
  status      TEXT NOT NULL DEFAULT 'abierta',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  author          TEXT NOT NULL DEFAULT 'usuario',
  body            TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- ============================================================
-- INTEGRACIONES — AIR S.R.L.
-- ============================================================

CREATE TABLE IF NOT EXISTS air_products (
  id            TEXT PRIMARY KEY,
  air_code      TEXT NOT NULL UNIQUE,
  description   TEXT NOT NULL,
  part_number   TEXT,
  brand         TEXT,
  category      TEXT,
  unit          TEXT NOT NULL DEFAULT 'un',
  price_usd     REAL NOT NULL DEFAULT 0,
  price_ars     REAL NOT NULL DEFAULT 0,
  iva_pct       REAL NOT NULL DEFAULT 21,
  stock         REAL NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  raw_json      TEXT,
  synced_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS air_sync_runs (
  id            TEXT PRIMARY KEY,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT,
  status        TEXT NOT NULL DEFAULT 'running',
  products_synced INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

-- ============================================================
-- Vínculos entre documentos (pedido → remito → factura)
-- ============================================================

CREATE TABLE IF NOT EXISTS document_links (
  id          TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_type, source_id, target_type, target_id)
);

-- ============================================================
-- Cotizaciones de moneda (dólar)
-- ============================================================

CREATE TABLE IF NOT EXISTS exchange_rates (
  id         TEXT PRIMARY KEY,
  casa       TEXT NOT NULL,
  nombre     TEXT NOT NULL,
  compra     REAL NOT NULL DEFAULT 0,
  venta      REAL NOT NULL DEFAULT 0,
  source_date TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Índices
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_clients_business_name ON clients(business_name);
CREATE INDEX IF NOT EXISTS idx_clients_cuit          ON clients(cuit);
CREATE INDEX IF NOT EXISTS idx_suppliers_business_name ON suppliers(business_name);
CREATE INDEX IF NOT EXISTS idx_articles_code         ON articles(code);
CREATE INDEX IF NOT EXISTS idx_articles_name         ON articles(name);
CREATE INDEX IF NOT EXISTS idx_sale_orders_client    ON sale_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_sale_orders_date      ON sale_orders(date);
CREATE INDEX IF NOT EXISTS idx_invoices_client       ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date         ON invoices(date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_article ON stock_movements(article_id);
CREATE INDEX IF NOT EXISTS idx_tickets_client        ON tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_air_products_code      ON air_products(air_code);
CREATE INDEX IF NOT EXISTS idx_air_products_desc      ON air_products(description);
CREATE INDEX IF NOT EXISTS idx_air_products_category  ON air_products(category);
CREATE INDEX IF NOT EXISTS idx_air_sync_runs_status   ON air_sync_runs(status);
CREATE INDEX IF NOT EXISTS idx_doc_links_source ON document_links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_doc_links_target ON document_links(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_casa    ON exchange_rates(casa, fetched_at);
`;
// ---------------------------------------------------------------------------
// Secuencias (autonumeración)
// ---------------------------------------------------------------------------

/**
 * Devuelve el próximo número correlativo para `name`.
 *
 * Multi-PC: si hay un bloque reservado a la nube con números disponibles, se
 * consume de ahí (numeración autoritativa por tenant, sin colisiones entre PCs).
 * Cada número consumido actualiza el "high-water mark" local (`sequences.last`)
 * para que cualquier fallback local futuro nunca devuelva un número ya usado.
 *
 * Si no hay bloque (instalación sin nube, o se agotó/aún no se reservó), cae al
 * correlativo local y marca la secuencia para reservar un bloque en el próximo sync.
 */
export function nextSequence(name: string): number {
  const db = getDb();

  const block = db
    .prepare("SELECT next_val, end_val FROM sequence_blocks WHERE name = ?")
    .get(name) as { next_val: number; end_val: number } | undefined;

  if (block && block.next_val <= block.end_val) {
    const value = block.next_val;
    db.prepare("UPDATE sequence_blocks SET next_val = next_val + 1 WHERE name = ?").run(name);
    // High-water mark: el fallback local nunca debe regresar por debajo del bloque.
    db.prepare(
      "INSERT INTO sequences (name, last) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET last = MAX(last, excluded.last)",
    ).run(name, value);
    return value;
  }

  // Fallback local (sin bloque disponible). Se marca para reservar uno pronto.
  db.prepare("INSERT OR IGNORE INTO sequences (name, last) VALUES (?, 0)").run(name);
  const result = db
    .prepare("UPDATE sequences SET last = last + 1 WHERE name = ? RETURNING last")
    .get(name) as { last: number };
  db.prepare("INSERT OR IGNORE INTO sequence_refill (name) VALUES (?)").run(name);
  return result.last;
}

/** Nombres de secuencia que pidieron (re)reservar un bloque a la nube. */
export function getSequenceRefillNames(): string[] {
  const rows = getDb().prepare("SELECT name FROM sequence_refill").all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

/** Correlativo local máximo usado para `name` (piso para sembrar el bloque del server). */
export function getSequenceLocalLast(name: string): number {
  const row = getDb().prepare("SELECT last FROM sequences WHERE name = ?").get(name) as { last: number } | undefined;
  return row?.last ?? 0;
}

/**
 * Guarda un bloque reservado `[start, end]` y quita la marca de refill. Si el
 * bloque local vigente todavía tuviera números, se descartan (hueco menor
 * aceptable en numeración interna) y se pasa al nuevo rango, siempre creciente.
 */
export function storeSequenceBlock(name: string, start: number, end: number): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO sequence_blocks (name, next_val, end_val) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET next_val = excluded.next_val, end_val = excluded.end_val",
  ).run(name, start, end);
  db.prepare("DELETE FROM sequence_refill WHERE name = ?").run(name);
}

export function formatDocNumber(prefix: string, seq: number): string {
  const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
  return `${prefix}-${yymm}-${String(seq).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------

export function initDb(dbPath?: string): void {
  // En tests se pasa ":memory:" para una DB aislada; en la app, el archivo real.
  const file = dbPath ?? path.join(app.getPath("userData"), "asimov.db");
  _db = new Database(file);
  _db.exec(SCHEMA_SQL);

  // Migrations for existing tables
  try { _db.exec("ALTER TABLE air_products ADD COLUMN part_number TEXT"); } catch {}
  // Precio en USD opcional para artículos propios (repreciado por cotización del dólar)
  try { _db.exec("ALTER TABLE articles ADD COLUMN price_usd REAL NOT NULL DEFAULT 0"); } catch {}

  // Datos iniciales: depósito y caja por defecto
  const warehouseExists = (_db.prepare("SELECT id FROM warehouses LIMIT 1").get() as any);
  if (!warehouseExists) {
    _db.prepare("INSERT INTO warehouses (id, name) VALUES (?, ?)").run("wh-default", "Depósito Principal");
  }
  const cashExists = (_db.prepare("SELECT id FROM cash_accounts LIMIT 1").get() as any);
  if (!cashExists) {
    _db.prepare("INSERT INTO cash_accounts (id, name) VALUES (?, ?)").run("ca-default", "Caja Principal");
  }
}

/** Cierra la conexión y resetea el estado. Usado principalmente en tests. */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers genéricos
// ---------------------------------------------------------------------------

export function dbAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function dbGet<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function dbRun(sql: string, params: unknown[] = []): Database.RunResult {
  return getDb().prepare(sql).run(...params);
}

// ---------------------------------------------------------------------------
// Upserts de datos maestros (compartidos por ipc.ts y main.ts)
// ---------------------------------------------------------------------------

/** Persiste un cliente (crea o actualiza). `row` usa nombres de columna del schema. */
export function upsertClient(row: Record<string, unknown>): { id: string } {
  const id = String(row.id ?? "").trim() || randomUUID();
  dbRun(
    `INSERT OR REPLACE INTO clients (id,code,business_name,cuit,fiscal_type,email,phone,address,city,province,credit_limit,active,notes,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM clients WHERE id=?),datetime('now')),datetime('now'))`,
    [id, row.code, row.business_name, row.cuit, row.fiscal_type, row.email, row.phone, row.address, row.city, row.province, row.credit_limit ?? 0, row.active ?? 1, row.notes, id],
  );
  return { id };
}

/** Persiste un proveedor (crea o actualiza). `row` usa nombres de columna del schema. */
export function upsertSupplier(row: Record<string, unknown>): { id: string } {
  const id = String(row.id ?? "").trim() || randomUUID();
  dbRun(
    `INSERT OR REPLACE INTO suppliers (id,code,business_name,cuit,email,phone,address,city,province,payment_term,active,notes,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM suppliers WHERE id=?),datetime('now')),datetime('now'))`,
    [id, row.code, row.business_name, row.cuit, row.email, row.phone, row.address, row.city, row.province, row.payment_term ?? 0, row.active ?? 1, row.notes, id],
  );
  return { id };
}

/** Persiste un artículo (crea o actualiza). `row` usa nombres de columna del schema. */
export function upsertArticle(row: Record<string, unknown>): { id: string } {
  const id = String(row.id ?? "").trim() || randomUUID();
  dbRun(
    `INSERT OR REPLACE INTO articles (id,code,name,description,category,unit,cost_price,sale_price,price_usd,iva_pct,manages_stock,manages_serial,active,notes,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,COALESCE(?,(SELECT price_usd FROM articles WHERE id=?),0),?,?,?,?,?,COALESCE((SELECT created_at FROM articles WHERE id=?),datetime('now')),datetime('now'))`,
    [id, row.code, row.name, row.description, row.category, row.unit ?? "un", row.cost_price ?? 0, row.sale_price ?? 0, row.price_usd ?? null, id, row.iva_pct ?? 21, row.manages_stock ?? 1, row.manages_serial ?? 0, row.active ?? 1, row.notes, id],
  );
  return { id };
}

// ---------------------------------------------------------------------------
// KPIs para el dashboard
// ---------------------------------------------------------------------------

export interface DashboardKpis {
  salesToday: number;
  invoicesPending: number;
  clientsTotal: number;
  articlesLowStock: number;
  purchaseOrdersPending: number;
  ticketsOpen: number;
  cashBalance: number;
}

export function getDashboardKpis(): DashboardKpis {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const salesToday = (db.prepare(
    "SELECT COALESCE(SUM(total),0) as v FROM sale_orders WHERE date = ? AND status != 'cancelado'"
  ).get(today) as any)?.v ?? 0;

  const invoicesPending = (db.prepare(
    "SELECT COUNT(*) as v FROM invoices WHERE status = 'borrador'"
  ).get() as any)?.v ?? 0;

  const clientsTotal = (db.prepare(
    "SELECT COUNT(*) as v FROM clients WHERE active = 1"
  ).get() as any)?.v ?? 0;

  const articlesLowStock = (db.prepare(
    `SELECT COUNT(*) as v FROM article_stock s
     JOIN articles a ON a.id = s.article_id
     WHERE a.manages_stock = 1 AND s.qty <= s.min_qty AND s.min_qty > 0`
  ).get() as any)?.v ?? 0;

  const purchaseOrdersPending = (db.prepare(
    "SELECT COUNT(*) as v FROM purchase_orders WHERE status IN ('borrador','enviada')"
  ).get() as any)?.v ?? 0;

  const ticketsOpen = (db.prepare(
    "SELECT COUNT(*) as v FROM tickets WHERE status IN ('abierto','en_proceso')"
  ).get() as any)?.v ?? 0;

  const cashBalance = (db.prepare(
    "SELECT COALESCE(SUM(balance),0) as v FROM cash_accounts WHERE active = 1"
  ).get() as any)?.v ?? 0;

  return { salesToday, invoicesPending, clientsTotal, articlesLowStock, purchaseOrdersPending, ticketsOpen, cashBalance };
}
