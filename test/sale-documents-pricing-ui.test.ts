import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(join(process.cwd(), "src", name), "utf8");

describe("pedidos y cotizaciones — kits, margen y dólar oficial", () => {
  for (const page of ["new-sale-order.html", "new-quote.html"]) {
    it(`${page} carga cotización, convierte a ARS y conserva kits`, () => {
      const html = source(page);
      expect(html).toContain('id="txtCotizacionUsd"');
      expect(html).toContain('id="chkMostrarKit"');
      expect(html).toContain("dolarLatest()");
      expect(html).toContain('casa || "").toLowerCase() === "oficial"');
      expect(html).toContain("row.articleId");
      expect(html).toContain("row.isKit");
      expect(html).toContain("getKitInfo");
      expect(html).toContain("monedaPrecios:");
      expect(html).toContain("cotizacionUsd:");
      expect(html).toContain("mostrarComponentesKit:");
    });
  }

  it("la cotización permite costo, margen por renglón y margen general", () => {
    const html = source("new-quote.html");
    expect(html).toContain('id="txtMargenGral"');
    expect(html).toContain('data-field="costo"');
    expect(html).toContain('data-field="margen"');
    expect(html).toContain("applyGeneralMargin");
  });

  for (const preload of ["new-sale-order-preload.ts", "new-quote-preload.ts"]) {
    it(`${preload} expone la cotización y los kits`, () => {
      const code = source(preload);
      expect(code).toContain('ipcRenderer.invoke("dolar:latest")');
      expect(code).toContain('ipcRenderer.invoke("db:kits:get", articleId)');
    });
  }

  it("la reimpresión recupera kits y cotización histórica", () => {
    const shell = source("shell.html");
    expect(shell).toContain("o.show_kit_components");
    expect(shell).toContain("q.show_kit_components");
    expect(shell).toContain("o.usd_rate");
    expect(shell).toContain("q.usd_rate");
    expect(shell).toContain("await hydratePrintKits(printItems)");
  });
});
