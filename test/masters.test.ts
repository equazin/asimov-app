import { describe, it, expect, beforeEach } from "vitest";
import { persistClientForm, persistSupplierForm, persistArticleForm } from "../src/masters";
import { getDb, upsertArticle } from "../src/db";
import { initTestDb } from "./helpers";
import { AIR_KIT_PROXY_NOTE, refreshAirKitProxy } from "../src/air-kit-proxy";

beforeEach(() => initTestDb());

const row = (table: string, id: string) => getDb().prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) as any;

describe("masters — mapeo UI → schema", () => {
  it("cliente: razonSocial/domicilio/telefono/condicionIva → columnas del schema", () => {
    const { id } = persistClientForm({
      razonSocial: "ACME SA", cuit: "30-1", domicilio: "Calle 1",
      telefono: "011", email: "a@b.com", condicionIva: "RI",
    });
    const c = row("clients", id);
    expect(c.business_name).toBe("ACME SA");
    expect(c.address).toBe("Calle 1");
    expect(c.phone).toBe("011");
    expect(c.email).toBe("a@b.com");
    expect(c.fiscal_type).toBe("RI");
    expect(c.cuit).toBe("30-1");
  });

  it("cliente: condicionIva vacía cae a 'final'", () => {
    const { id } = persistClientForm({ razonSocial: "Sin IVA" });
    expect(row("clients", id).fiscal_type).toBe("final");
  });

  it("proveedor: mapea domicilio/telefono y activa", () => {
    const { id } = persistSupplierForm({ razonSocial: "Prov SA", domicilio: "Av 9", telefono: "0800", cuit: "20-9" });
    const s = row("suppliers", id);
    expect(s.business_name).toBe("Prov SA");
    expect(s.address).toBe("Av 9");
    expect(s.phone).toBe("0800");
    expect(s.active).toBe(1);
  });

  it("artículo: importe→sale_price, iva vacío→21, code autogenerado", () => {
    const { id } = persistArticleForm({ descripcion: "Teclado", importe: "1500,50", iva: "" });
    const a = row("articles", id);
    expect(a.name).toBe("Teclado");
    expect(a.sale_price).toBeCloseTo(1500.5);
    expect(a.iva_pct).toBe(21);
    expect(String(a.code)).toMatch(/^ART-/);
  });

  it("artículo: iva y código explícitos se respetan", () => {
    const { id } = persistArticleForm({ codigo: "K1", descripcion: "X", importe: 100, iva: 10.5, categoria: "Insumos" });
    const a = row("articles", id);
    expect(a.iva_pct).toBe(10.5);
    expect(a.code).toBe("K1");
    expect(a.category).toBe("Insumos");
  });

  it("artículo con esquema: crea el kit con sus componentes", () => {
    const { id: compId } = persistArticleForm({ codigo: "SSD240", descripcion: "SSD 240GB", importe: 35000 });
    const { id: kitId } = persistArticleForm({
      codigo: "PC-R5",
      descripcion: "PC ARMADA RYZEN 5",
      importe: 900000,
      esquema: [{ articleId: compId, qty: 1 }, { articleId: "no-existe", qty: 2 }],
    });
    const kit = row("articles", kitId);
    expect(kit.is_kit).toBe(1);
    expect(kit.manages_stock).toBe(0);
    const comps = getDb().prepare("SELECT * FROM kit_components WHERE kit_article_id = ?").all(kitId);
    expect(comps).toHaveLength(1);
  });

  it("artículo con esquema: incorpora componentes del Stock AIR y conserva su stock", () => {
    getDb().prepare("DELETE FROM air_products WHERE air_code = ?").run("AIR-KIT-1");
    getDb().prepare(
      `INSERT INTO air_products (id, air_code, description, category, price_usd, iva_pct, stock, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run("air-kit-1", "AIR-KIT-1", "Memoria AIR", "Memorias", 25, 10.5, 7);

    const { id: kitId } = persistArticleForm({
      codigo: "KIT-AIR",
      descripcion: "Kit con AIR",
      importe: 100,
      esquema: [{ articleId: "air-kit-1", code: "AIR-KIT-1", source: "air", qty: 2 }],
    });

    const proxy = getDb().prepare("SELECT * FROM articles WHERE code = ?").get("AIR-KIT-1") as any;
    expect(proxy.notes).toBe(AIR_KIT_PROXY_NOTE);
    expect(proxy.sale_price).toBe(25);
    expect(getDb().prepare("SELECT qty FROM article_stock WHERE article_id = ?").get(proxy.id)).toMatchObject({ qty: 7 });
    expect(getDb().prepare("SELECT component_article_id, qty FROM kit_components WHERE kit_article_id = ?").get(kitId))
      .toMatchObject({ component_article_id: proxy.id, qty: 2 });

    refreshAirKitProxy({ code: "AIR-KIT-1", name: "Memoria AIR actualizada", price: 30, ivaPct: 21, stock: 4, active: true });
    expect(row("articles", proxy.id)).toMatchObject({ name: "Memoria AIR actualizada", sale_price: 30 });
    expect(getDb().prepare("SELECT qty FROM article_stock WHERE article_id = ?").get(proxy.id)).toMatchObject({ qty: 4 });
  });

  it("artículo: precio_usd se persiste y se preserva si un update no lo envía", () => {
    const { id } = persistArticleForm({ codigo: "U1", descripcion: "SSD", importe: 100000, precio_usd: 80 });
    expect(row("articles", id).price_usd).toBe(80);

    // Update sin precio_usd (p. ej. otro caller de upsertArticle): no debe pisarlo.
    upsertArticle({ id, code: "U1", name: "SSD 240", sale_price: 110000 });
    const after = row("articles", id);
    expect(after.name).toBe("SSD 240");
    expect(after.price_usd).toBe(80);
  });
});
