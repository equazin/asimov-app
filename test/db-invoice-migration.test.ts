import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb, dbGet, dbRun, initDb } from "../src/db";

afterEach(() => closeDb());

describe("migración de numeración fiscal", () => {
  it("elimina el UNIQUE global sin perder facturas ni ítems existentes", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "asimov-invoice-migration-")), "legacy.db");
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
      CREATE TABLE invoices (
        id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, client_id TEXT,
        client_name TEXT, date TEXT NOT NULL DEFAULT (date('now')), due_date TEXT,
        tipo TEXT NOT NULL DEFAULT 'B', point_of_sale TEXT NOT NULL DEFAULT '0001',
        status TEXT NOT NULL DEFAULT 'borrador', subtotal REAL NOT NULL DEFAULT 0,
        iva_amount REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0,
        cae TEXT, cae_expiry TEXT, notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (client_id) REFERENCES clients(id)
      );
      CREATE TABLE invoice_items (
        id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, description TEXT NOT NULL,
        qty REAL NOT NULL DEFAULT 1, unit_price REAL NOT NULL DEFAULT 0,
        iva_pct REAL NOT NULL DEFAULT 21, subtotal REAL NOT NULL DEFAULT 0,
        iva_amount REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      );
      INSERT INTO invoices (id,number,tipo,total) VALUES ('original','00001-00000001','A',121);
      INSERT INTO invoice_items (id,invoice_id,description,subtotal,iva_amount)
      VALUES ('item-1','original','Producto',100,21);
    `);
    legacy.close();

    initDb(dbPath);

    expect(dbGet("SELECT total FROM invoices WHERE id='original'")).toMatchObject({ total: 121 });
    expect(dbGet("SELECT description FROM invoice_items WHERE invoice_id='original'"))
      .toMatchObject({ description: "Producto" });
    expect(() => dbRun("INSERT INTO invoices (id,number,tipo) VALUES (?,?,?)", ["credit", "00001-00000001", "NC"]))
      .not.toThrow();
  });
});
