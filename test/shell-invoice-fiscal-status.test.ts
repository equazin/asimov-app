import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const shell = readFileSync(resolve(process.cwd(), "src/shell.html"), "utf8");
const main = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");

describe("estado fiscal de facturas en el shell", () => {
  it("abre el detalle fiscal con doble clic y también por teclado", () => {
    expect(shell).toContain("openInvoiceFiscalStatus: (id) => openInvoiceFiscalStatus(id)");
    expect(shell).toContain('row.addEventListener("dblclick"');
    expect(shell).toContain('row.addEventListener("keydown"');
    expect(shell).toContain('event.key !== "Enter" && event.key !== " "');
  });

  it("ofrece autorizar o reintentar sin permitir editar manualmente el CAE", () => {
    expect(shell).toContain("Autorizar en ARCA");
    expect(shell).toContain("Reintentar en ARCA");
    expect(shell).toContain("no se pueden modificar manualmente");
    expect(shell).not.toMatch(/<input[^>]+(?:cae|estado fiscal)/i);
  });

  it("permite consolidar una factura ya guardada antes de imprimirla o autorizarla", () => {
    expect(shell).toContain('class="invoice-consolidated"');
    expect(shell).toContain('class="invoice-consolidated-label"');
    expect(shell).toContain("un solo renglón con el precio total");
    expect(shell).toContain("api.invoices.setPrintPreferences");
    expect(shell).toContain('await savePrintPreferences(false)) await reprintDoc("factura"');
    expect(shell).toMatch(/authorizeButton\.addEventListener[\s\S]*await savePrintPreferences\(false\)[\s\S]*authorizeStoredInvoice/);
  });

  it("reconoce todos los roles administrativos en renderer y proceso principal", () => {
    const roles = '["admin", "owner", "superadmin"]';
    expect(shell).toContain(`${roles}.includes(currentRole)`);
    expect(main).toContain(`${roles}.includes(String(currentUser?.role ?? "").toLowerCase())`);
  });
});
