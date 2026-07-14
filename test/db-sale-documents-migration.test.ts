import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb, dbGet, initDb } from "../src/db";

afterEach(() => closeDb());

describe("migración monetaria de pedidos y cotizaciones", () => {
  it("agrega metadatos sin perder documentos existentes", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "asimov-sale-docs-migration-")), "legacy.db");
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE sale_orders (
        id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, client_id TEXT, client_name TEXT,
        date TEXT NOT NULL DEFAULT (date('now')), delivery_date TEXT,
        status TEXT NOT NULL DEFAULT 'borrador', currency TEXT NOT NULL DEFAULT 'ARS',
        subtotal REAL NOT NULL DEFAULT 0, iva_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0, notes TEXT, user_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE quotes (
        id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, client_id TEXT, client_name TEXT,
        date TEXT NOT NULL DEFAULT (date('now')), valid_until TEXT,
        status TEXT NOT NULL DEFAULT 'borrador', total REAL NOT NULL DEFAULT 0,
        notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO sale_orders (id, number, total) VALUES ('pedido-viejo', 'PED-1', 121);
      INSERT INTO quotes (id, number, total) VALUES ('cot-vieja', 'COT-1', 242);
    `);
    legacy.close();

    initDb(dbPath);

    expect(dbGet("SELECT total, source_currency, show_kit_components FROM sale_orders WHERE id='pedido-viejo'"))
      .toMatchObject({ total: 121, source_currency: "ARS", show_kit_components: 1 });
    expect(dbGet("SELECT total, currency, source_currency, show_kit_components FROM quotes WHERE id='cot-vieja'"))
      .toMatchObject({ total: 242, currency: "ARS", source_currency: "ARS", show_kit_components: 1 });
  });
});
