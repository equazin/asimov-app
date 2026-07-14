import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "src/new-purchase-order.html"), "utf8");

describe("controles de la orden de compra", () => {
  it("conecta el selector de proveedor mediante un evento del módulo", () => {
    expect(html).toContain('id="btnPickSupplier"');
    expect(html).toContain("getElementById('btnPickSupplier').addEventListener('click',abrirProveedorPicker)");
    expect(html).not.toContain('onclick="abrirProveedorPicker()"');
  });

  it("conecta los demás botones que viven dentro del módulo", () => {
    expect(html).toContain("getElementById('btnAddItem').addEventListener");
    expect(html).toContain("getElementById('btnPickProduct').addEventListener");
    expect(html).toContain("getElementById('btnSave').addEventListener");
    expect(html).toContain("getElementById('btnPrint').addEventListener");
    expect(html).toContain("getElementById('btnAnnul').addEventListener");
  });

  it("carga la selección directamente en los inputs sin entidades HTML", () => {
    expect(html).toContain("value = String(data.nombre||'')");
    expect(html).not.toContain("value = esc(data.nombre||'')");
  });

  it("vincula el selector de artículos con la fila activa y usa el costo de stock", () => {
    expect(html).toContain("openProductSelection(String(activeRowId))");
    expect(html).toContain("if(!data || !data.product) return");
    expect(html).toContain("var product = data.product");
    expect(html).toContain("tr.dataset.articleId = product.articleId || product.id || ''");
    expect(html).toContain("parseFloat(product.costo || product.cost_price || '0')");
    expect(html).toContain("articleId: tr.dataset.articleId || null");
  });
});
