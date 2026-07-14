import { beforeEach, describe, expect, it } from "vitest";
import {
  setKitComponents,
  getKitComponents,
  getKitInfo,
  computeBuildableStock,
  explodeKitComponents,
} from "../src/kits";
import { persistDeliveryNote, persistInvoice, annulDocument } from "../src/documents";
import { dbAll, dbGet, dbRun, initDb } from "../src/db";
import { loadLocalProductsForPicker } from "../src/product-picker";

const WH = "wh-default";

function seedArticle(id: string, code: string, cost: number, sale: number, stock: number, managesStock = 1): void {
  dbRun(
    "INSERT INTO articles (id, code, name, cost_price, sale_price, manages_stock) VALUES (?,?,?,?,?,?)",
    [id, code, code, cost, sale, managesStock],
  );
  if (stock > 0) {
    dbRun("INSERT INTO article_stock (article_id, warehouse_id, qty) VALUES (?,?,?)", [id, WH, stock]);
  }
}

function stockOf(articleId: string): number {
  return dbGet<{ qty: number }>(
    "SELECT COALESCE(SUM(qty),0) AS qty FROM article_stock WHERE article_id = ?", [articleId],
  )?.qty ?? 0;
}

/** Kit "PC ARMADA RYZEN 5" con los 5 componentes del caso de uso real. */
function seedPcArmada(): void {
  seedArticle("kit-pc", "PC-R5", 0, 900000, 0);
  seedArticle("cpu", "R5-5600G", 200000, 260000, 10);
  seedArticle("mother", "A520", 90000, 120000, 4);
  seedArticle("ram", "RAM8", 30000, 40000, 8);
  seedArticle("ssd", "SSD240", 25000, 35000, 6);
  seedArticle("gab", "GAB-KIT", 40000, 55000, 5);
  setKitComponents("kit-pc", [
    { articleId: "cpu", qty: 1 },
    { articleId: "mother", qty: 1 },
    { articleId: "ram", qty: 1 },
    { articleId: "ssd", qty: 1 },
    { articleId: "gab", qty: 1 },
  ]);
}

beforeEach(() => {
  initDb(":memory:");
});

describe("setKitComponents", () => {
  it("define componentes, marca is_kit y saca manages_stock del kit", () => {
    seedPcArmada();
    const kit = dbGet<{ is_kit: number; manages_stock: number }>("SELECT is_kit, manages_stock FROM articles WHERE id='kit-pc'");
    expect(kit).toMatchObject({ is_kit: 1, manages_stock: 0 });
    expect(getKitComponents("kit-pc")).toHaveLength(5);
  });

  it("lista vacía desarma el kit y filtra componentes inválidos", () => {
    seedPcArmada();
    setKitComponents("kit-pc", []);
    expect(dbGet<{ is_kit: number }>("SELECT is_kit FROM articles WHERE id='kit-pc'")?.is_kit).toBe(0);

    const { count } = setKitComponents("kit-pc", [
      { articleId: "cpu", qty: 1 },
      { articleId: "no-existe", qty: 1 },
      { articleId: "kit-pc", qty: 1 },     // no puede contenerse a sí mismo
      { articleId: "ram", qty: 0 },        // qty inválida
    ]);
    expect(count).toBe(1);
  });

  it("un kit no puede contener otro kit", () => {
    seedPcArmada();
    seedArticle("kit-2", "COMBO", 0, 100, 0);
    const { count } = setKitComponents("kit-2", [
      { articleId: "kit-pc", qty: 1 },
      { articleId: "ssd", qty: 2 },
    ]);
    expect(count).toBe(1);
    expect(getKitComponents("kit-2")[0].code).toBe("SSD240");
  });

  it("falla con mensaje claro si el artículo kit no existe", () => {
    expect(() => setKitComponents("nope", [])).toThrow(/no existe/);
  });
});

describe("getKitInfo / computeBuildableStock", () => {
  it("suma costos y calcula stock armable (mínimo de componentes)", () => {
    seedPcArmada();
    const info = getKitInfo("kit-pc");
    expect(info.componentsCost).toBe(385000);
    expect(info.componentsSalePrice).toBe(510000);
    expect(info.buildableStock).toBe(4); // limita el mother (4)
  });

  it("respeta cantidades > 1 en el cálculo de armable", () => {
    seedArticle("kit-x", "KX", 0, 100, 0);
    seedArticle("c1", "C1", 10, 20, 10);
    setKitComponents("kit-x", [{ articleId: "c1", qty: 3 }]);
    expect(getKitInfo("kit-x").buildableStock).toBe(3); // floor(10/3)
  });

  it("sin componentes con stock gestionado devuelve 0", () => {
    expect(computeBuildableStock([])).toBe(0);
  });

  it("ofrece el kit al selector con costo de componentes y precio propio", () => {
    seedPcArmada();
    const kit = loadLocalProductsForPicker().find((item) => item.codigo === "PC-R5");
    expect(kit?.esquema).toBe(true);
    expect(Number(kit?.costo)).toBe(385000);
    expect(Number(kit?.importe)).toBe(900000);
  });
});

describe("remito con kit: explosión de stock por componentes", () => {
  it("remitir 2 kits descuenta el stock de cada componente y no del kit", () => {
    seedPcArmada();
    const res = persistDeliveryNote({
      clienteNombre: "ACME",
      items: [{ codigo: "PC-R5", descripcion: "PC ARMADA RYZEN 5", cantPedida: 2, cantEntregada: 2 }],
    });
    expect(res.stockMoved).toBe(5); // 5 componentes movidos
    expect(stockOf("cpu")).toBe(8);
    expect(stockOf("mother")).toBe(2);
    expect(stockOf("gab")).toBe(3);
    expect(stockOf("kit-pc")).toBe(0); // el kit no mueve stock propio
  });

  it("anular el remito devuelve el stock a los componentes", () => {
    seedPcArmada();
    const res = persistDeliveryNote({
      clienteNombre: "ACME",
      items: [{ codigo: "PC-R5", descripcion: "PC", cantPedida: 1, cantEntregada: 1 }],
    });
    expect(stockOf("mother")).toBe(3);
    const annul = annulDocument("delivery-note", res.id);
    expect(annul.ok).toBe(true);
    expect(stockOf("mother")).toBe(4);
    expect(stockOf("cpu")).toBe(10);
  });

  it("explodeKitComponents devuelve los componentes crudos", () => {
    seedPcArmada();
    const parts = explodeKitComponents("kit-pc");
    expect(parts).toHaveLength(5);
    expect(parts.every((p) => p.qty === 1)).toBe(true);
  });
});

describe("factura con kit: una sola línea comercial", () => {
  it("persiste la PC y no expone sus componentes como ítems", () => {
    seedPcArmada();
    const invoice = persistInvoice({
      clienteNombre: "CONSUMIDOR FINAL",
      items: [{ codigo: "PC-R5", descripcion: "PC ARMADA RYZEN 5", cantidad: 1, precio: 1500, iva: 21 }],
    });

    expect(dbAll<{ code: string; unit_price: number }>(
      "SELECT code, unit_price FROM invoice_items WHERE invoice_id = ?",
      [invoice.id],
    )).toEqual([{ code: "PC-R5", unit_price: 1500 }]);
    expect(dbGet<{ subtotal: number; total: number }>(
      "SELECT subtotal, total FROM invoices WHERE id = ?",
      [invoice.id],
    )).toEqual({ subtotal: 1500, total: 1815 });
  });
});
