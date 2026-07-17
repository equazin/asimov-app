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
  industry      TEXT,
  website       TEXT,
  lead_source   TEXT,
  account_status TEXT NOT NULL DEFAULT 'active',
  crm_notes     TEXT,
  assigned_to   TEXT,
  last_contact_at TEXT,
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
  usd_rate      REAL,
  source_currency TEXT NOT NULL DEFAULT 'ARS',
  show_kit_components INTEGER NOT NULL DEFAULT 1,
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
  currency     TEXT NOT NULL DEFAULT 'ARS',
  usd_rate     REAL,
  source_currency TEXT NOT NULL DEFAULT 'ARS',
  show_kit_components INTEGER NOT NULL DEFAULT 1,
  subtotal     REAL NOT NULL DEFAULT 0,
  iva_amount   REAL NOT NULL DEFAULT 0,
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
  number        TEXT NOT NULL,
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
  afip_error    TEXT,
  notes         TEXT,
  usd_rate      REAL,                              -- Cotización USD → ARS usada al emitir (para el pie de la factura impresa)
  source_currency TEXT NOT NULL DEFAULT 'ARS',     -- Moneda en la que el operador ingresó los precios; los importes persistidos siempre quedan en ARS
  show_kit_components INTEGER NOT NULL DEFAULT 1,  -- Al imprimir: 1 = desplegar componentes del kit como sub-líneas; 0 = una sola línea por kit
  consolidated_print INTEGER NOT NULL DEFAULT 0,   -- Al imprimir: 1 = un solo renglón consolidado con la descripción de consolidated_label y todos los ítems como sub-líneas sin precio
  consolidated_label TEXT,                         -- Descripción del renglón consolidado (ej. PC gaming a medida); ignorada si consolidated_print = 0
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

-- Recibo de compra: espejo de la tabla receipts pero contra facturas del proveedor.
-- Documenta un pago concreto que salda una o varias purchase_invoices
-- (idea = recibo de venta, pero con proveedor en el otro lado del mostrador).
CREATE TABLE IF NOT EXISTS purchase_receipts (
  id             TEXT PRIMARY KEY,
  number         TEXT UNIQUE NOT NULL,
  supplier_id    TEXT,
  supplier_name  TEXT,
  date           TEXT NOT NULL DEFAULT (date('now')),
  status         TEXT NOT NULL DEFAULT 'borrador',
  total          REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'transferencia',
  payment_breakdown TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS purchase_receipt_items (
  id              TEXT PRIMARY KEY,
  receipt_id      TEXT NOT NULL,
  invoice_id      TEXT,
  invoice_number  TEXT,
  original_amount REAL NOT NULL DEFAULT 0,
  paid_amount     REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (receipt_id) REFERENCES purchase_receipts(id) ON DELETE CASCADE
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
-- CRM (unificado con clients)
-- ============================================================

-- Pipeline stages configurables (etapas del embudo de ventas)
CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  probability INTEGER NOT NULL DEFAULT 0,
  color       TEXT DEFAULT '#6b7280',
  is_won      INTEGER NOT NULL DEFAULT 0,
  is_lost     INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Oportunidades / deals (vinculadas a clients, no a crm_accounts)
CREATE TABLE IF NOT EXISTS opportunities (
  id             TEXT PRIMARY KEY,
  client_id      TEXT,
  title          TEXT NOT NULL,
  amount         REAL NOT NULL DEFAULT 0,
  stage_id       TEXT,
  stage          TEXT NOT NULL DEFAULT 'prospecto',
  probability    INTEGER NOT NULL DEFAULT 0,
  expected_close TEXT,
  assigned_to    TEXT,
  source         TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'open',
  won_at         TEXT,
  lost_at        TEXT,
  lost_reason    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (stage_id) REFERENCES crm_pipeline_stages(id)
);

-- Historial de cambios de etapa (para reporting y forecasting)
CREATE TABLE IF NOT EXISTS crm_deal_stage_history (
  id            TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  from_stage    TEXT,
  to_stage      TEXT NOT NULL,
  changed_by    TEXT,
  changed_at    TEXT NOT NULL DEFAULT (datetime('now')),
  notes         TEXT,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
);

-- Actividades / interacciones con clientes
CREATE TABLE IF NOT EXISTS crm_activities (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'note',
  subject     TEXT,
  body        TEXT,
  due_date    TEXT,
  completed_at TEXT,
  assigned_to TEXT,
  opportunity_id TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL
);

-- Tareas / recordatorios
CREATE TABLE IF NOT EXISTS crm_tasks (
  id          TEXT PRIMARY KEY,
  client_id   TEXT,
  opportunity_id TEXT,
  title       TEXT NOT NULL,
  description TEXT,
  due_date    TEXT NOT NULL,
  due_time    TEXT,
  priority    TEXT NOT NULL DEFAULT 'normal',
  status      TEXT NOT NULL DEFAULT 'pending',
  assigned_to TEXT,
  completed_at TEXT,
  reminder_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL
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
-- INTEGRACIONES — Bot de WhatsApp de Bartez
-- Cache local de la bandeja; el "source of truth" es el bot (poll cada N seg).
-- ============================================================

CREATE TABLE IF NOT EXISTS wa_chats (
  id              TEXT PRIMARY KEY,     -- id remoto del chat en el bot
  phone           TEXT NOT NULL,        -- E.164 sin '+', ej. "5493414123456"
  name            TEXT,                 -- push name del contacto o razón social si linkea a cliente
  client_id       TEXT,                 -- opcional: cliente vinculado del ERP
  avatar_url      TEXT,
  last_message    TEXT,                 -- preview del último mensaje (para la lista)
  last_message_at TEXT,                 -- ISO 8601
  unread_count    INTEGER NOT NULL DEFAULT 0,
  archived        INTEGER NOT NULL DEFAULT 0,
  synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wa_messages (
  id              TEXT PRIMARY KEY,     -- id del mensaje en el bot (wa_message_id upstream)
  chat_id         TEXT NOT NULL,
  direction       TEXT NOT NULL DEFAULT 'in',  -- 'in' | 'out'
  body            TEXT,
  media_url       TEXT,                 -- imagen/audio/documento remoto
  media_kind      TEXT,                 -- 'image' | 'audio' | 'document' | 'video' | null
  sent_at         TEXT NOT NULL,        -- ISO 8601 del bot (no de la DB local)
  status          TEXT NOT NULL DEFAULT 'received', -- pending|sent|delivered|read|failed|received
  raw_json        TEXT,
  FOREIGN KEY (chat_id) REFERENCES wa_chats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wa_sync_runs (
  id             TEXT PRIMARY KEY,
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at    TEXT,
  status         TEXT NOT NULL DEFAULT 'running',
  chats_synced   INTEGER NOT NULL DEFAULT 0,
  messages_synced INTEGER NOT NULL DEFAULT 0,
  error_message  TEXT
);

-- ============================================================
-- Esquemas / Kits (artículo compuesto por otros artículos)
-- ============================================================

CREATE TABLE IF NOT EXISTS kit_components (
  id                   TEXT PRIMARY KEY,
  kit_article_id       TEXT NOT NULL,
  component_article_id TEXT NOT NULL,
  qty                  REAL NOT NULL DEFAULT 1,
  UNIQUE (kit_article_id, component_article_id),
  FOREIGN KEY (kit_article_id)       REFERENCES articles(id),
  FOREIGN KEY (component_article_id) REFERENCES articles(id)
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
-- Notas de comisión (costo de sobrefacturación) — documento interno
-- ============================================================
-- Documenta lo que el operador realmente cobra a su cliente intermediario
-- cuando factura a un tercero al precio que ese cliente le pasó. NO es fiscal
-- (sin CAE, no va a ARCA): la factura al cliente final ya lleva el circuito
-- fiscal completo. Se genera desde una factura y calcula rate% × (precio − costo)
-- por línea. total = Σ comisión de las líneas.

CREATE TABLE IF NOT EXISTS commission_notes (
  id             TEXT PRIMARY KEY,
  number         TEXT NOT NULL,
  invoice_id     TEXT,                              -- factura de origen
  invoice_number TEXT,
  client_id      TEXT,                              -- cliente intermediario (quien encarga)
  client_name    TEXT,
  date           TEXT NOT NULL DEFAULT (date('now')),
  status         TEXT NOT NULL DEFAULT 'emitido',
  rate_pct       REAL NOT NULL DEFAULT 10.5,        -- tasa aplicada a la diferencia
  base_amount    REAL NOT NULL DEFAULT 0,           -- Σ (precio − costo) × qty
  total          REAL NOT NULL DEFAULT 0,           -- Σ rate% × diferencia
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS commission_note_items (
  id          TEXT PRIMARY KEY,
  note_id     TEXT NOT NULL,
  code        TEXT,
  description TEXT NOT NULL,
  qty         REAL NOT NULL DEFAULT 1,
  unit_cost   REAL NOT NULL DEFAULT 0,
  unit_price  REAL NOT NULL DEFAULT 0,
  diff        REAL NOT NULL DEFAULT 0,              -- (precio − costo) × qty
  commission  REAL NOT NULL DEFAULT 0,              -- rate% × diff
  FOREIGN KEY (note_id) REFERENCES commission_notes(id) ON DELETE CASCADE
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
CREATE INDEX IF NOT EXISTS idx_kit_components_kit ON kit_components(kit_article_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_casa    ON exchange_rates(casa, fetched_at);
CREATE INDEX IF NOT EXISTS idx_wa_chats_phone         ON wa_chats(phone);
CREATE INDEX IF NOT EXISTS idx_wa_chats_last          ON wa_chats(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_chat       ON wa_messages(chat_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage    ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_crm_activities_client  ON crm_activities(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type    ON crm_activities(type);
CREATE INDEX IF NOT EXISTS idx_crm_activities_date    ON crm_activities(created_at);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_client       ON crm_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due          ON crm_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status       ON crm_tasks(status);
CREATE INDEX IF NOT EXISTS idx_deal_history_opp       ON crm_deal_stage_history(opportunity_id);
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
  // Esquemas/kits: el artículo compuesto se marca y sus componentes viven en kit_components
  try { _db.exec("ALTER TABLE articles ADD COLUMN is_kit INTEGER NOT NULL DEFAULT 0"); } catch {}
  // Estado fiscal de facturas: conserva el último error de ARCA para que el
  // operador pueda corregir y reintentar desde la lista.
  try { _db.exec("ALTER TABLE invoices ADD COLUMN afip_error TEXT"); } catch {}
  // Cotización USD → ARS que rigió la venta (para reimprimir con el mismo pie
  // que la factura original, aún si la cotización de hoy cambió).
  try { _db.exec("ALTER TABLE invoices ADD COLUMN usd_rate REAL"); } catch {}
  try { _db.exec("ALTER TABLE invoices ADD COLUMN source_currency TEXT NOT NULL DEFAULT 'ARS'"); } catch {}
  // Preferencia por factura: desplegar (1) u ocultar (0) los componentes del
  // kit en la impresión. Default = 1 (como en el sistema anterior).
  try { _db.exec("ALTER TABLE invoices ADD COLUMN show_kit_components INTEGER NOT NULL DEFAULT 1"); } catch {}
  // Modo "consolidado": al imprimir, se muestra UN solo renglón (label + total)
  // y todos los ítems reales como sub-líneas sin precio individual. Sirve para
  // armados custom (PC a medida) sin necesidad de definir el kit en el catálogo.
  try { _db.exec("ALTER TABLE invoices ADD COLUMN consolidated_print INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { _db.exec("ALTER TABLE invoices ADD COLUMN consolidated_label TEXT"); } catch {}
  // Pedidos y cotizaciones usan la misma regla comercial que las facturas:
  // los precios pueden cargarse en USD, pero los importes persistidos quedan en
  // ARS y se conserva la cotización de origen para reimpresiones auditables.
  for (const table of ["sale_orders", "quotes"]) {
    try { _db.exec(`ALTER TABLE ${table} ADD COLUMN usd_rate REAL`); } catch {}
    try { _db.exec(`ALTER TABLE ${table} ADD COLUMN source_currency TEXT NOT NULL DEFAULT 'ARS'`); } catch {}
    try { _db.exec(`ALTER TABLE ${table} ADD COLUMN show_kit_components INTEGER NOT NULL DEFAULT 1`); } catch {}
  }
  try { _db.exec("ALTER TABLE quotes ADD COLUMN currency TEXT NOT NULL DEFAULT 'ARS'"); } catch {}
  try { _db.exec("ALTER TABLE quotes ADD COLUMN subtotal REAL NOT NULL DEFAULT 0"); } catch {}
  try { _db.exec("ALTER TABLE quotes ADD COLUMN iva_amount REAL NOT NULL DEFAULT 0"); } catch {}
  // Costo unitario por ítem de factura (en ARS, igual escala que unit_price).
  // Necesario para calcular la comisión / costo de sobrefacturación de la factura
  // (rate% × (precio − costo) por línea). Opcional: facturas viejas quedan en 0.
  try { _db.exec("ALTER TABLE invoice_items ADD COLUMN cost REAL NOT NULL DEFAULT 0"); } catch {}
  // Desglose JSON de los medios usados en cada recibo de compra.
  try { _db.exec("ALTER TABLE purchase_receipts ADD COLUMN payment_breakdown TEXT"); } catch {}
  migrateCrmSchema();
  migrateInvoiceNumberUniqueness();
  migrateCrmUnification();
  ensureCrmIndexes();
  _db.exec(`
    UPDATE invoices
       SET status = 'autorizada', afip_error = NULL
     WHERE cae IS NOT NULL AND trim(cae) <> '';
    UPDATE invoices
       SET status = 'borrador'
     WHERE (cae IS NULL OR trim(cae) = '') AND lower(status) = 'emitida';
  `);

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

/**
 * Actualiza el esquema CRM anterior a la unificación con `clients`.
 *
 * Los índices que usan columnas nuevas se crean después de esta migración:
 * SQLite ejecuta todo SCHEMA_SQL aun cuando `CREATE TABLE IF NOT EXISTS` deja
 * intacta una tabla legacy, por lo que intentar indexar `client_id` antes del
 * ALTER impedía que la aplicación llegara a crear su primera ventana.
 */
function migrateCrmSchema(): void {
  const db = getDb();

  const addMissingColumns = (table: "clients" | "opportunities", definitions: Record<string, string>) => {
    const existing = new Set(
      (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map((column) => column.name),
    );
    for (const [name, definition] of Object.entries(definitions)) {
      if (existing.has(name)) continue;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      existing.add(name);
    }
  };

  addMissingColumns("clients", {
    industry: "TEXT",
    website: "TEXT",
    lead_source: "TEXT",
    account_status: "TEXT NOT NULL DEFAULT 'active'",
    crm_notes: "TEXT",
    assigned_to: "TEXT",
    last_contact_at: "TEXT",
  });
  addMissingColumns("opportunities", {
    client_id: "TEXT REFERENCES clients(id)",
    stage_id: "TEXT",
    assigned_to: "TEXT",
    source: "TEXT",
    status: "TEXT NOT NULL DEFAULT 'open'",
    won_at: "TEXT",
    lost_at: "TEXT",
    lost_reason: "TEXT",
    // SQLite no permite agregar a una tabla con datos un default no constante
    // como datetime('now'); CRM ya asigna este valor al crear/editar registros.
    updated_at: "TEXT",
  });
  db.exec(`
    UPDATE opportunities
       SET updated_at = COALESCE(updated_at, created_at, datetime('now'))
     WHERE updated_at IS NULL OR trim(updated_at) = '';
  `);
}

function ensureCrmIndexes(): void {
  getDb().exec(`
    CREATE INDEX IF NOT EXISTS idx_opportunities_client ON opportunities(client_id);
    CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
  `);
}

/**
 * Las numeraciones fiscales se repiten legalmente entre Factura A/B, NC y ND.
 * Versiones anteriores declaraban invoices.number como UNIQUE global, lo que
 * impedía emitir, por ejemplo, una NC 00001-00000001 si ya existía una factura
 * con ese número. Rehacemos sólo esa tabla, conservando ids y relaciones.
 */
function migrateInvoiceNumberUniqueness(): void {
  const db = getDb();
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='invoices'").get() as { sql?: string } | undefined;
  if (!row?.sql || !/number\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i.test(row.sql)) return;

  db.pragma("foreign_keys = OFF");
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE invoices_without_global_number_unique (
        id TEXT PRIMARY KEY,
        number TEXT NOT NULL,
        client_id TEXT,
        client_name TEXT,
        date TEXT NOT NULL DEFAULT (date('now')),
        due_date TEXT,
        tipo TEXT NOT NULL DEFAULT 'B',
        point_of_sale TEXT NOT NULL DEFAULT '0001',
        status TEXT NOT NULL DEFAULT 'borrador',
        subtotal REAL NOT NULL DEFAULT 0,
        iva_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        cae TEXT,
        cae_expiry TEXT,
        afip_error TEXT,
        notes TEXT,
        usd_rate REAL,
        source_currency TEXT NOT NULL DEFAULT 'ARS',
        show_kit_components INTEGER NOT NULL DEFAULT 1,
        consolidated_print INTEGER NOT NULL DEFAULT 0,
        consolidated_label TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (client_id) REFERENCES clients(id)
      );
      INSERT INTO invoices_without_global_number_unique (
        id, number, client_id, client_name, date, due_date, tipo, point_of_sale,
        status, subtotal, iva_amount, total, cae, cae_expiry, afip_error, notes,
        usd_rate, source_currency, show_kit_components, consolidated_print,
        consolidated_label, created_at
      )
      SELECT id, number, client_id, client_name, date, due_date, tipo, point_of_sale,
        status, subtotal, iva_amount, total, cae, cae_expiry, afip_error, notes,
        usd_rate, source_currency, show_kit_components, consolidated_print,
        consolidated_label, created_at
      FROM invoices;
      DROP TABLE invoices;
      ALTER TABLE invoices_without_global_number_unique RENAME TO invoices;
      CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
      COMMIT;
    `);
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

/**
 * Migración CRM: unifica crm_accounts con clients y re-linkea opportunities.
 * Solo se ejecuta si existe la tabla crm_accounts con datos y clients aún no
 * tiene las columnas CRM pobladas desde esta migración.
 */
function migrateCrmUnification(): void {
  const db = getDb();

  // Seed default pipeline stages si no existen
  const stageCount = (db.prepare("SELECT COUNT(*) as c FROM crm_pipeline_stages").get() as { c: number })?.c ?? 0;
  if (stageCount === 0) {
    const defaultStages = [
      { id: "stage-lead", name: "Lead", order: 1, prob: 10, color: "#6b7280" },
      { id: "stage-qualified", name: "Calificado", order: 2, prob: 25, color: "#3b82f6" },
      { id: "stage-proposal", name: "Propuesta", order: 3, prob: 50, color: "#8b5cf6" },
      { id: "stage-negotiation", name: "Negociación", order: 4, prob: 75, color: "#f59e0b" },
      { id: "stage-won", name: "Ganado", order: 5, prob: 100, color: "#10b981", won: 1 },
      { id: "stage-lost", name: "Perdido", order: 6, prob: 0, color: "#ef4444", lost: 1 },
    ];
    for (const s of defaultStages) {
      db.prepare(
        "INSERT OR IGNORE INTO crm_pipeline_stages (id, name, sort_order, probability, color, is_won, is_lost) VALUES (?,?,?,?,?,?,?)"
      ).run(s.id, s.name, s.order, s.prob, s.color, (s as any).won ?? 0, (s as any).lost ?? 0);
    }
  }

  // Migrar crm_accounts → clients (solo si crm_accounts existe y tiene datos)
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='crm_accounts'"
  ).get();
  if (!tableExists) return;

  const accounts = db.prepare("SELECT * FROM crm_accounts").all() as Array<Record<string, unknown>>;
  if (accounts.length === 0) return;

  const tx = db.transaction(() => {
    for (const acc of accounts) {
      const id = String(acc.id);
      // Verificar si ya existe un client con el mismo nombre o email
      const existing = db.prepare(
        "SELECT id FROM clients WHERE lower(business_name) = lower(?) OR (email IS NOT NULL AND lower(email) = lower(?))"
      ).get(String(acc.name ?? ""), String(acc.email ?? "")) as { id: string } | undefined;

      if (existing) {
        // Actualizar el client existente con datos CRM
        db.prepare(
          `UPDATE clients SET industry = COALESCE(industry, ?), website = COALESCE(website, ?),
           crm_notes = COALESCE(crm_notes, ?) WHERE id = ?`
        ).run(acc.industry, acc.website, acc.notes, existing.id);
        // Re-linkear opportunities
        db.prepare(
          "UPDATE opportunities SET client_id = ? WHERE account_id = ?"
        ).run(existing.id, id);
      } else {
        // Crear nuevo client desde crm_account
        db.prepare(
          `INSERT INTO clients (id, business_name, phone, email, address, industry, website, crm_notes, account_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, datetime('now'))`
        ).run(
          id, acc.name, acc.phone, acc.email, acc.address,
          acc.industry, acc.website, acc.notes, acc.created_at
        );
        // Re-linkear opportunities
        db.prepare(
          "UPDATE opportunities SET client_id = ? WHERE account_id = ?"
        ).run(id, id);
      }
    }
  });
  tx();
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
    `INSERT OR REPLACE INTO clients (id,code,business_name,cuit,fiscal_type,email,phone,address,city,province,credit_limit,industry,website,lead_source,account_status,crm_notes,assigned_to,active,notes,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM clients WHERE id=?),datetime('now')),datetime('now'))`,
    [id, row.code, row.business_name, row.cuit, row.fiscal_type, row.email, row.phone, row.address, row.city, row.province, row.credit_limit ?? 0, row.industry, row.website, row.lead_source, row.account_status ?? "active", row.crm_notes, row.assigned_to, row.active ?? 1, row.notes, id],
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
  opportunitiesOpen: number;
  opportunitiesValue: number;
  tasksPending: number;
  tasksOverdue: number;
}

export function getDashboardKpis(): DashboardKpis {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const salesToday = (db.prepare(
    "SELECT COALESCE(SUM(total),0) as v FROM sale_orders WHERE date = ? AND status != 'cancelado'"
  ).get(today) as any)?.v ?? 0;

  const invoicesPending = (db.prepare(
    "SELECT COUNT(*) as v FROM invoices WHERE status IN ('borrador','pendiente_cae','rechazada')"
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

  const opportunitiesOpen = (db.prepare(
    "SELECT COUNT(*) as v FROM opportunities WHERE status = 'open'"
  ).get() as any)?.v ?? 0;

  const opportunitiesValue = (db.prepare(
    "SELECT COALESCE(SUM(amount),0) as v FROM opportunities WHERE status = 'open'"
  ).get() as any)?.v ?? 0;

  const tasksPending = (db.prepare(
    "SELECT COUNT(*) as v FROM crm_tasks WHERE status = 'pending'"
  ).get() as any)?.v ?? 0;

  const tasksOverdue = (db.prepare(
    "SELECT COUNT(*) as v FROM crm_tasks WHERE status = 'pending' AND due_date < ?"
  ).get(today) as any)?.v ?? 0;

  return { salesToday, invoicesPending, clientsTotal, articlesLowStock, purchaseOrdersPending, ticketsOpen, cashBalance, opportunitiesOpen, opportunitiesValue, tasksPending, tasksOverdue };
}
