import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

const shell = read("src/shell.html");
const menu = read("src/menu.ts");
const main = read("src/main.ts");
const invoiceForm = read("src/new-invoice.html");

describe("notas de crédito/débito creadas desde cero", () => {
  it("se pueden abrir desde el shell y desde el menú, sin partir de una factura", () => {
    expect(shell).toContain("A.openNativeForm('invoice', { kind: 'NC' })");
    expect(shell).toContain("A.openNativeForm('invoice', { kind: 'ND' })");
    expect(menu).toContain('{ label: "Nueva Nota de Crédito", type: "invoice", context: { kind: "NC" } }');
    expect(menu).toContain('{ label: "Nueva Nota de Débito", type: "invoice", context: { kind: "ND" } }');
    // El menú tiene que propagar el contexto, no sólo el tipo de formulario.
    expect(menu).toContain("deps.openNativeForm(f.type, f.context)");
  });

  it("el main abre el formulario en modo nota y no pisa una carga en curso", () => {
    expect(main).toContain('const kind = String(context?.kind ?? "").toUpperCase()');
    expect(main).toContain('sendInvoicePrefill(newInvoiceWindow, "invoice-adjustment:prefill", { kind })');
    // Si ya había un formulario abierto se enfoca y no se manda el prefill.
    expect(main).toMatch(/const existed = Boolean\(newInvoiceWindow[\s\S]{0,200}if \(!existed && \(kind === "NC" \|\| kind === "ND"\)\)/);
  });

  it("el formulario acepta un prefill sin factura original y espera que se elija el cliente", () => {
    expect(invoiceForm).toContain("if (!data.original && !data.client)");
    expect(invoiceForm).toContain('document.getElementById("txtClienteNombre").focus()');
  });

  it("elegir el cliente no revierte el tipo NC/ND a factura", () => {
    expect(invoiceForm).toContain("let kindLocked = false");
    expect(invoiceForm).toContain('kindLocked = t === "NC" || t === "ND"');
    expect(invoiceForm).toContain("if (!kindLocked) {");
    // El auto-sugerido de tipo por condición de IVA queda dentro del guard.
    expect(invoiceForm).toMatch(/if \(!kindLocked\) \{[\s\S]{0,300}setTipo\("B"\);/);
  });

  it("no deja guardar una nota sin la factura asociada que exige ARCA", () => {
    expect(invoiceForm).toMatch(
      /\(tipoActual === "NC" \|\| tipoActual === "ND"\) && \(!origenDoc \|\| origenDoc\.tipo !== "invoice"\)/,
    );
    expect(invoiceForm).toContain("ARCA la exige en toda nota de crédito o débito");
  });
});
