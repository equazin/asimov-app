import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const invoiceHtml = readFileSync(resolve(process.cwd(), "src/new-invoice.html"), "utf8");
const productSelectionHtml = readFileSync(resolve(process.cwd(), "src/product-selection.html"), "utf8");
const pickerSource = readFileSync(resolve(process.cwd(), "src/product-picker.ts"), "utf8");

describe("margen global de la factura", () => {
  it("ubica el margen dentro de Totales y recalcula todas las líneas en vivo", () => {
    const totalsPanel = invoiceHtml.indexOf('id="panel-totales"');
    const marginControl = invoiceHtml.indexOf('id="txtMargenGral"');
    expect(totalsPanel).toBeGreaterThan(-1);
    expect(marginControl).toBeGreaterThan(totalsPanel);
    expect(invoiceHtml).toContain('addEventListener("input", applyGeneralMargin)');
    expect(invoiceHtml).toContain("row.precio = base * (1 + margin / 100)");
    expect(invoiceHtml).toContain("row.precio = costo * (1 + margenGral / 100)");
    expect(invoiceHtml).toContain("updateTotalsTab();");
  });

  it("cuando el ítem no trae costo, usa el precio como base y lo persiste como costo", () => {
    // Bug reportado: aplicar margen no cambiaba el total cuando el producto
    // no tenía cost_price o cuando la fila se había cargado a mano.
    expect(invoiceHtml).toContain("var base = row.costo > 0 ? row.costo : row.precio;");
    expect(invoiceHtml).toContain("if (!(row.costo > 0)) row.costo = base;");
  });

  it("expone subtotal e IVA agregados para la impresión", () => {
    expect(invoiceHtml).toMatch(/window\._totals\s*=\s*\{[\s\S]*subtotal:[\s\S]*iva:[\s\S]*total:/);
  });
});

describe("selección comercial de esquemas", () => {
  it("separa costo real y precio de venta e identifica el kit", () => {
    expect(pickerSource).toContain("AS effective_cost");
    expect(pickerSource).toContain("costo: String(article.effective_cost");
    expect(pickerSource).toContain("esquema: Boolean(article.is_kit)");
    expect(invoiceHtml).toContain("data.product.costo");
    expect(invoiceHtml).toContain("data.product.importe");
  });

  it("marca los esquemas como KIT en el selector", () => {
    expect(productSelectionHtml).toContain('class="badge-kit">KIT</span>');
    expect(productSelectionHtml).toContain("prod.esquema");
  });
});
