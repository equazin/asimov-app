import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb, dbAll, dbGet, initDb } from "../src/db";

afterEach(() => closeDb());

describe("migración del CRM legacy", () => {
  it("agrega las columnas antes de crear sus índices y conserva las oportunidades", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "asimov-crm-migration-")), "legacy.db");
    const legacy = new Database(dbPath);
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE clients (
        id TEXT PRIMARY KEY, code TEXT UNIQUE, business_name TEXT NOT NULL,
        cuit TEXT, fiscal_type TEXT DEFAULT 'final', email TEXT, phone TEXT,
        address TEXT, city TEXT, province TEXT, credit_limit REAL NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1, notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE crm_accounts (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, industry TEXT, website TEXT,
        phone TEXT, email TEXT, address TEXT, notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE opportunities (
        id TEXT PRIMARY KEY, account_id TEXT, title TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0, stage TEXT NOT NULL DEFAULT 'prospecto',
        probability INTEGER NOT NULL DEFAULT 0, expected_close TEXT, notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (account_id) REFERENCES crm_accounts(id)
      );
      INSERT INTO crm_accounts (id,name,email) VALUES ('legacy-client','Cliente anterior','legacy@example.com');
      INSERT INTO opportunities (id,account_id,title,amount) VALUES ('legacy-deal','legacy-client','Renovación',1500);
    `);
    legacy.close();

    expect(() => initDb(dbPath)).not.toThrow();

    const columns = dbAll<{ name: string }>("PRAGMA table_info(opportunities)").map((column) => column.name);
    expect(columns).toEqual(expect.arrayContaining(["client_id", "stage_id", "status", "updated_at"]));
    expect(dbGet("SELECT client_id, status, updated_at FROM opportunities WHERE id='legacy-deal'"))
      .toMatchObject({ client_id: "legacy-client", status: "open" });
    expect(dbGet("SELECT business_name FROM clients WHERE id='legacy-client'"))
      .toMatchObject({ business_name: "Cliente anterior" });
    expect(dbGet("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_opportunities_client'"))
      .toBeTruthy();
    expect(dbGet("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_opportunities_status'"))
      .toBeTruthy();

    closeDb();
    expect(() => initDb(dbPath)).not.toThrow();
    expect(dbGet("SELECT client_id FROM opportunities WHERE id='legacy-deal'"))
      .toMatchObject({ client_id: "legacy-client" });
  });
});
