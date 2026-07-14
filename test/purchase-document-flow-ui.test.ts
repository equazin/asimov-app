import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("flujo visible de compras", () => {
  it("expone remitos y facturas de compra en la navegacion", () => {
    const shell = read("src/shell.html");
    expect(shell).toContain("Remitos de compra");
    expect(shell).toContain('data-view="facturas-compra"');
    expect(shell).toContain("Facturas de compra");
    expect(shell).toContain("/compras/remitos");
    expect(shell).toContain("/compras/facturas");
  });

  it("la factura de compra puede traer una orden", () => {
    const html = read("src/new-purchase-invoice.html");
    const preload = read("src/new-purchase-invoice-preload.ts");
    expect(html).toContain('id="btnTraerOrden"');
    expect(html).toContain("Traer orden de compra");
    expect(html).toContain("pendingPurchaseOrders");
    expect(html).toContain("origen: origenDoc");
    expect(preload).toContain("db:doc-links:pending-purchase-orders");
    expect(preload).toContain("db:doc-links:source-items");
  });

  it("el remito de compra puede traer una factura", () => {
    const html = read("src/new-goods-receipt.html");
    const preload = read("src/new-goods-receipt-preload.ts");
    expect(html).toContain("Nuevo Remito de Compra");
    expect(html).toContain('id="btnTraerFactura"');
    expect(html).toContain("Traer factura");
    expect(html).toContain("pendingPurchaseInvoices");
    expect(html).toContain("origen: origenDoc");
    expect(preload).toContain("db:doc-links:pending-purchase-invoices");
    expect(preload).toContain("db:doc-links:source-items");
  });
});
