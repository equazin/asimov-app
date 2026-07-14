/**
 * Tests de sincronización de documentos multi-PC (envelope lossless).
 *
 * Se crea un documento en la "PC A", se arma su envelope, se limpia el libro
 * (simulando una "PC B" sin ese doc) y se aplica: cabecera, ítems y movimientos
 * de stock/caja deben reconstruirse sin re-ejecutar efectos ni contar doble.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { persistGoodsReceipt, persistInvoice, persistReceipt } from "../src/documents";
import { buildDocEnvelope, applyDocEnvelope, deleteDocLocal } from "../src/document-sync";
import { getDb } from "../src/db";
import { initTestDb, resetLedger, seedArticle } from "./helpers";

beforeEach(() => initTestDb());

const one = (sql: string, ...p: unknown[]) => getDb().prepare(sql).get(...p) as any;
const count = (sql: string, ...p: unknown[]) => (getDb().prepare(sql).get(...p) as { c: number }).c;
const stockQty = (articleId: string): number =>
  one("SELECT qty FROM article_stock WHERE article_id = ?", articleId)?.qty ?? 0;
const cashBalance = (): number => one("SELECT balance FROM cash_accounts WHERE id = 'ca-default'").balance;

describe("document-sync — recepción con efecto de stock", () => {
  it("round-trip: reconstruye cabecera, ítems y stock en la otra PC", () => {
    seedArticle("A1");
    const { id } = persistGoodsReceipt({
      proveedorNombre: "Prov SA",
      estado: "recibido",
      items: [{ codigo: "A1", descripcion: "Art A1", cantPedida: 10, cantRecibida: 10 }],
    });
    expect(stockQty("art-A1")).toBe(10);

    const env = buildDocEnvelope("goods_receipt", id)!;
    expect(env).toBeTruthy();
    expect(env.items).toHaveLength(1);
    expect(env.stockMovements).toHaveLength(1);

    // "PC B": sin el doc; el maestro (artículo) ya llegó por su propio sync.
    resetLedger();
    seedArticle("A1");
    expect(stockQty("art-A1")).toBe(0);

    applyDocEnvelope(env);

    expect(one("SELECT number FROM goods_receipts WHERE id = ?", id)).toBeTruthy();
    expect(count("SELECT COUNT(*) c FROM goods_receipt_items WHERE receipt_id = ?", id)).toBe(1);
    expect(stockQty("art-A1")).toBe(10);
  });

  it("aplicar el mismo envelope dos veces no cuenta doble (idempotente)", () => {
    seedArticle("A1");
    const { id } = persistGoodsReceipt({
      proveedorNombre: "Prov",
      estado: "recibido",
      items: [{ codigo: "A1", descripcion: "Art", cantPedida: 5, cantRecibida: 5 }],
    });
    const env = buildDocEnvelope("goods_receipt", id)!;

    resetLedger();
    seedArticle("A1");
    applyDocEnvelope(env);
    applyDocEnvelope(env);

    expect(stockQty("art-A1")).toBe(5);
    expect(count("SELECT COUNT(*) c FROM stock_movements WHERE reference_id = ?", id)).toBe(1);
  });
});

describe("document-sync — recibo con efecto de caja", () => {
  it("round-trip: reconstruye el recibo y el ingreso a caja", () => {
    const { id } = persistReceipt({
      clienteNombre: "Cliente",
      estado: "emitido",
      totalCobrado: 500,
      facturas: [{ nroFact: "F1", importe: 500, cobrado: 500 }],
    });
    expect(cashBalance()).toBe(500);

    const env = buildDocEnvelope("receipt", id)!;
    expect(env.cashMovements).toHaveLength(1);

    resetLedger();
    expect(cashBalance()).toBe(0);

    applyDocEnvelope(env);

    expect(one("SELECT total FROM receipts WHERE id = ?", id)).toBeTruthy();
    expect(cashBalance()).toBe(500);
  });
});

describe("document-sync — propagación de baja", () => {
  it("deleteDocLocal borra el doc y revierte sus efectos", () => {
    seedArticle("A1");
    const { id } = persistGoodsReceipt({
      proveedorNombre: "Prov",
      estado: "recibido",
      items: [{ codigo: "A1", descripcion: "Art", cantPedida: 3, cantRecibida: 3 }],
    });
    expect(stockQty("art-A1")).toBe(3);

    deleteDocLocal("goods_receipt", id);

    expect(one("SELECT id FROM goods_receipts WHERE id = ?", id)).toBeUndefined();
    expect(count("SELECT COUNT(*) c FROM goods_receipt_items WHERE receipt_id = ?", id)).toBe(0);
    expect(stockQty("art-A1")).toBe(0);
  });
});

describe("document-sync — estados fiscales", () => {
  it("un snapshot sin CAE no puede quitar una autorización local", () => {
    const { id } = persistInvoice({
      tipo: "B", clienteNombre: "Cliente",
      items: [{ codigo: "A1", descripcion: "Artículo", cantidad: 1, precio: 100, iva: 21 }],
    });
    const stale = buildDocEnvelope("invoice", id)!;
    stale.header.status = "emitida";
    stale.header.cae = null;

    getDb().prepare(
      "UPDATE invoices SET status='autorizada',cae='75123456789012',cae_expiry='2026-07-24',number='00001-00000004' WHERE id=?",
    ).run(id);

    applyDocEnvelope(stale);

    expect(one("SELECT status,cae,number FROM invoices WHERE id=?", id)).toMatchObject({
      status: "autorizada", cae: "75123456789012", number: "00001-00000004",
    });
  });

  it("normaliza snapshots históricos emitidos sin CAE como borradores", () => {
    const { id } = persistInvoice({
      tipo: "B", clienteNombre: "Cliente",
      items: [{ codigo: "A1", descripcion: "Artículo", cantidad: 1, precio: 100, iva: 21 }],
    });
    const legacy = buildDocEnvelope("invoice", id)!;
    legacy.header.status = "emitida";
    getDb().prepare("DELETE FROM invoice_items WHERE invoice_id=?").run(id);
    getDb().prepare("DELETE FROM invoices WHERE id=?").run(id);

    applyDocEnvelope(legacy);

    expect(one("SELECT status FROM invoices WHERE id=?", id).status).toBe("borrador");
  });
});
