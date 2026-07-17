import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(join(process.cwd(), "src", "shell.html"), "utf8");

describe("ajustes internos de stock — interfaz", () => {
  it("permite elegir artículo, depósito, dirección, cantidad y motivo", () => {
    expect(html).toContain('id="stock-adjustment-modal"');
    expect(html).toContain('id="stock-adjustment-article"');
    expect(html).toContain('id="stock-adjustment-warehouse"');
    expect(html).toContain('id="stock-adjustment-direction"');
    expect(html).toContain('id="stock-adjustment-qty"');
    expect(html).toContain('id="stock-adjustment-reason"');
  });

  it("expone un listado anulable de ajustes", () => {
    expect(html).toContain('data-view="ajustes-stock"');
    expect(html).toContain('annul: "stock-adjustment"');
  });
});
