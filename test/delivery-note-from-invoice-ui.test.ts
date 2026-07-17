import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("remito de venta desde factura", () => {
  const html = readFileSync(join(process.cwd(), "src", "new-delivery-note.html"), "utf8");
  const preload = readFileSync(join(process.cwd(), "src", "new-delivery-note-preload.ts"), "utf8");

  it("ofrece traer factura y no pedido", () => {
    expect(html).toContain("Traer factura");
    expect(html).not.toContain("Traer pedido");
    expect(html).toContain('getSourceItems("invoice", id)');
    expect(html).toContain("facturaVinculada.value = doc.numero");
  });

  it("consulta facturas disponibles mediante el preload", () => {
    expect(preload).toContain("listInvoicesForDeliveryNote");
    expect(preload).toContain("db:doc-links:invoices-for-delivery-note");
  });
});
