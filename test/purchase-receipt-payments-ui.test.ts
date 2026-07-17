import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(join(process.cwd(), "src", "new-purchase-receipt.html"), "utf8");

describe("recibo de compra — medios de pago", () => {
  it("permite cargar importes y combinar varios medios", () => {
    expect(html).toContain('id="paymentList"');
    expect(html).toContain("function agregarMedioPago()");
    expect(html).toContain("mediosPago: mediosPago.map");
    expect(html).toContain("Total pagado");
  });

  it("distingue lo aplicado de lo que queda a cuenta", () => {
    expect(html).toContain("Aplicado a facturas");
    expect(html).toContain("Saldo a cuenta");
    expect(html).not.toContain("Agregá al menos una factura al recibo.");
  });
});
