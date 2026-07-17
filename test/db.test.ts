import { describe, it, expect, beforeEach } from "vitest";
import {
  getDb, dbAll, dbGet, dbRun, nextSequence, formatDocNumber,
  upsertClient, upsertSupplier, upsertArticle, getDashboardKpis,
} from "../src/db";
import { initTestDb, seedArticle } from "./helpers";

beforeEach(() => initTestDb());

describe("db — inicialización y semillas", () => {
  it("initDb siembra depósito y caja por defecto", () => {
    expect(dbGet("SELECT id FROM warehouses WHERE id='wh-default'")).toBeTruthy();
    expect(dbGet("SELECT id FROM cash_accounts WHERE id='ca-default'")).toBeTruthy();
  });

  it("incluye el error fiscal persistido en las facturas", () => {
    const columns = dbAll<{ name: string }>("PRAGMA table_info(invoices)");
    expect(columns.map((column) => column.name)).toContain("afip_error");
  });

  it("incluye moneda de origen, cotización y preferencia de kits en pedidos y cotizaciones", () => {
    for (const table of ["sale_orders", "quotes"]) {
      const columns = dbAll<{ name: string }>(`PRAGMA table_info(${table})`).map((column) => column.name);
      expect(columns).toEqual(expect.arrayContaining(["usd_rate", "source_currency", "show_kit_components"]));
    }
  });

  it("permite el mismo número fiscal en tipos de comprobante distintos", () => {
    dbRun("INSERT INTO invoices (id,number,tipo) VALUES (?,?,?)", ["f-a", "00001-00000001", "A"]);
    expect(() => dbRun("INSERT INTO invoices (id,number,tipo) VALUES (?,?,?)", ["nc-a", "00001-00000001", "NC"]))
      .not.toThrow();
  });
});

describe("db — secuencias y numeración", () => {
  it("nextSequence incrementa por nombre de forma independiente", () => {
    expect(nextSequence("foo")).toBe(1);
    expect(nextSequence("foo")).toBe(2);
    expect(nextSequence("bar")).toBe(1);
  });

  it("formatDocNumber arma PREFIJO-YYMM-00001", () => {
    expect(formatDocNumber("PED", 5)).toMatch(/^PED-\d{4}-00005$/);
  });
});

describe("db — helpers y upserts", () => {
  it("dbRun/dbAll/dbGet operan sobre la conexión", () => {
    dbRun("INSERT INTO system_config (key, value) VALUES (?, ?)", ["k", "v"]);
    expect(dbGet("SELECT value FROM system_config WHERE key='k'")).toMatchObject({ value: "v" });
    expect(dbAll("SELECT * FROM system_config")).toHaveLength(1);
  });

  it("upsertClient crea y luego actualiza el mismo id (no duplica)", () => {
    const { id } = upsertClient({ business_name: "ACME" });
    upsertClient({ id, business_name: "ACME 2" });
    expect(dbAll("SELECT * FROM clients")).toHaveLength(1);
    expect(dbGet("SELECT business_name FROM clients WHERE id=?", [id])).toMatchObject({ business_name: "ACME 2" });
  });

  it("upsertSupplier y upsertArticle persisten con id generado", () => {
    expect(upsertSupplier({ business_name: "Prov" }).id).toBeTruthy();
    expect(upsertArticle({ code: "A1", name: "Art" }).id).toBeTruthy();
  });
});

describe("db — KPIs del dashboard", () => {
  it("devuelve totales coherentes con los datos", () => {
    seedArticle("COD1", 1);
    upsertClient({ business_name: "Cli 1" });
    dbRun("INSERT INTO sale_orders (id,number,date,status,total) VALUES ('so1','PED-1',date('now'),'confirmado',1000)");
    dbRun("INSERT INTO invoices (id,number,date,status,total) VALUES ('inv1','FAC-1',date('now'),'autorizada',750)");
    dbRun("INSERT INTO tickets (id,number,status) VALUES ('t1','TCK-1','abierto')");
    const k = getDashboardKpis();
    expect(k.clientsTotal).toBe(1);
    expect(k.salesToday).toBe(750);
    expect(k.ticketsOpen).toBe(1);
    expect(typeof k.cashBalance).toBe("number");
  });
});
