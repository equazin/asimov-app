import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/comprobante-print.css"), "utf8");
const js = readFileSync(resolve(process.cwd(), "src/comprobante-print.js"), "utf8");

function renderInvoice(itemCount: number) {
  const area = { className: "", innerHTML: "" };
  const window: Record<string, unknown> = {};
  runInNewContext(js, {
    window,
    document: { getElementById: () => area },
    Intl,
    Number,
    String,
    isFinite,
    setTimeout,
  });
  const renderComprobante = window.renderComprobante as (type: string, data: unknown) => void;
  renderComprobante("factura", {
    items: Array.from({ length: itemCount }, (_, index) => ({
      code: String(index + 1), description: `Servicio ${index + 1}`, qty: 1,
      unitPrice: 10, ivaPct: 21, lineTotal: 10,
    })),
    totals: { total: itemCount * 10 },
    cae: "123",
    qrDataUrl: "data:image/png;base64,qr",
  });
  return area;
}

describe("impresión monocroma de comprobantes", () => {
  it("aísla el comprobante del esquema oscuro del shell", () => {
    expect(css).toContain("#print-area.cbt,\n  #print-area.cbt *");
    expect(css).toContain("color-scheme: light !important");
  });

  it("imprime papel blanco y texto negro sin fondos decorativos", () => {
    expect(css).toContain("color: #000 !important");
    expect(css).toContain("background-color: #fff !important");
    expect(css).toContain("background-image: none !important");
    expect(css).toContain(".band-right::before { display: none !important; }");
  });

  it("ancla el QR y el pie al final de la hoja", () => {
    expect(css).toContain("min-height: calc(100vh - 1px)");
    expect(css).toContain("#print-area.cbt.document-end-pinned .document-end");
    expect(css).toContain("margin-top: auto");
    expect(css).toContain("break-inside: avoid");
    expect(js).toContain('<div class="document-end">');
    expect(js).toContain('(data.items || []).length <= 16');
    expect(js).toMatch(/var documentEnd =[\s\S]*caeBlock\(data\)[\s\S]*footBlock\(\)/);

    const singlePage = renderInvoice(1);
    expect(singlePage.className).toContain("document-end-pinned");
    expect(singlePage.innerHTML).toMatch(/document-end[\s\S]*afip-cae[\s\S]*class="foot"/);

    const multiplePages = renderInvoice(17);
    expect(multiplePages.className).not.toContain("document-end-pinned");
  });
});
