import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(join(process.cwd(), "src", "shell.html"), "utf8");

describe("gastos internos — interfaz", () => {
  it("ofrece una vista y un formulario con los datos contables mínimos", () => {
    expect(html).toContain('data-view="gastos-internos"');
    expect(html).toContain('id="view-gastos-internos"');
    expect(html).toContain('id="expense-category"');
    expect(html).toContain('id="expense-amount"');
    expect(html).toContain('id="expense-account"');
  });

  it("abre facturas desde el indicador de ventas de hoy", () => {
    expect(html).toContain('label:"Ventas hoy", view:"facturas"');
  });
});
