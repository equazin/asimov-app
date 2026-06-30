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
`;

// ---------------------------------------------------------------------------
// Secuencias (autonumeración)
// ---------------------------------------------------------------------------

export function nextSequence(name: string): number {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO sequences (name, last) VALUES (?, 0)").run(name);
  const result = db.prepare("UPDATE sequences SET last = last + 1 WHERE name = ? RETURNING last").get(name) as { last: number };
  return result.last;
}

export function formatDocNumber(prefix: string, seq: number): string {
  const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
  return `${prefix}-${yymm}-${String(seq).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------

export function initDb(): void {
  const dbPath = path.join(app.getPath("userData"), "asimov.db");
  _db = new Database(dbPath);
  _db.exec(SCHEMA_SQL);

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
