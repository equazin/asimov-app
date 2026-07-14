import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/comprobante-print.css"), "utf8");
const js = readFileSync(resolve(process.cwd(), "src/comprobante-print.js"), "utf8");

function renderDocument(type: string, itemCount: number) {
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
  renderComprobante(type, {
    items: Array.from({ length: itemCount }, (_, index) => ({
      code: String(index + 1), description: `Servicio ${index + 1}`, qty: 1,
      unit: "UN", unitPrice: 10, ivaPct: 21, lineTotal: 10,
    })),
    total: itemCount * 10,
    totals: { subtotal: itemCount * 10, iva: itemCount * 2.1, total: itemCount * 12.1 },
    cae: type === "factura" ? "123" : "",
    qrDataUrl: type === "factura" ? "data:image/png;base64,qr" : "",
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

  it("ancla el resumen y el pie de todos los comprobantes al final de la hoja", () => {
    expect(css).toContain("min-height: calc(100vh - 1px)");
    expect(css).toContain("#print-area.cbt.document-end-pinned .document-end");
    expect(css).toContain("margin-top: auto");
    expect(css).toContain("break-inside: avoid");
    expect(js).toContain('<div class="document-end">');
    expect(js).toContain('(data.items || []).length <= 16');
    expect(js).toMatch(/var documentEnd =[\s\S]*documentSummaryBlock\(type, data\)[\s\S]*footBlock\(\)/);

    for (const type of ["factura", "remito", "pedido", "presupuesto", "recibo"]) {
      const singlePage = renderDocument(type, 1);
      expect(singlePage.className).toContain("document-end-pinned");
      expect(singlePage.innerHTML).toMatch(/document-end[\s\S]*class="foot"/);
    }

    for (const type of ["factura", "remito", "pedido", "presupuesto", "recibo"]) {
      const multiplePages = renderDocument(type, 17);
      expect(multiplePages.className).not.toContain("document-end-pinned");
    }
  });

  it("ubica cada total en el resumen inferior y conserva el QR solo en la factura", () => {
    const invoice = renderDocument("factura", 1);
    expect(invoice.innerHTML).toMatch(
      /class="document-summary with-authorization"[\s\S]*class="fiscal-authorization"[\s\S]*class="afip-cae"[\s\S]*class="totals"/,
    );
    expect(invoice.innerHTML.indexOf('class="totals"')).toBeGreaterThan(invoice.innerHTML.indexOf('class="afip-cae"'));

    for (const type of ["pedido", "presupuesto"]) {
      const document = renderDocument(type, 1);
      expect(document.innerHTML).toMatch(/document-end[\s\S]*document-summary totals-only[\s\S]*class="totals"/);
      expect(document.innerHTML).not.toContain('class="afip-cae"');
    }

    const receipt = renderDocument("recibo", 1);
    expect(receipt.innerHTML).toMatch(/document-summary totals-only[\s\S]*TOTAL RECIBIDO/);
    expect(receipt.innerHTML).not.toContain('class="amount"');

    const deliveryNote = renderDocument("remito", 1);
    expect(deliveryNote.innerHTML).not.toContain('class="document-summary');
    expect(deliveryNote.innerHTML).not.toContain('class="totals"');

    expect(css).toContain("grid-template-columns: minmax(0, 1fr) minmax(260px, .65fr)");
    expect(css).toContain(".cbt .document-summary.totals-only");
  });
});
