import { describe, it, expect, beforeEach } from "vitest";
import { persistClientForm, persistSupplierForm, persistArticleForm } from "../src/masters";
import { getDb } from "../src/db";
import { initTestDb } from "./helpers";

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
});
