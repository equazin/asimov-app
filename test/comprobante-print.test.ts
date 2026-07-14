import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/comprobante-print.css"), "utf8");

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
});
