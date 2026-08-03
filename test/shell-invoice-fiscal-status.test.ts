import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const shell = readFileSync(resolve(process.cwd(), "src/shell.html"), "utf8");
const main = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");
const preload = readFileSync(resolve(process.cwd(), "src/new-invoice-preload.ts"), "utf8");
const invoiceForm = readFileSync(resolve(process.cwd(), "src/new-invoice.html"), "utf8");
const shellPreload = readFileSync(resolve(process.cwd(), "src/preload.ts"), "utf8");

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

  it("ofrece anulación local para borradores y NC/ND asociadas para facturas con CAE", () => {
    expect(shell).toContain("Anular borrador");
    expect(shell).toContain("Anular con nota de crédito");
    expect(shell).toContain("Crear nota de débito");
    expect(shell).toContain("Anular nota de crédito con nota de débito");
    expect(shell).toContain("Anular nota de débito con nota de crédito");
    expect(shell).toContain('api.openInvoiceAdjustment(id, kind)');
    expect(shell).toContain('openAdjustment("NC")');
    expect(shell).toContain('openAdjustment("ND")');
    expect(main).toContain('ipcMain.handle("shell:open-invoice-adjustment"');
    expect(main).toContain('sendInvoicePrefill(win, "invoice-adjustment:prefill", prefill)');
    // La helper es la que efectivamente emite al canal (compartida por ajuste, edición y nota nueva).
    expect(main).toContain("win.webContents.send(channel, payload)");
    expect(preload).toContain('ipcRenderer.on("invoice-adjustment:prefill"');
    expect(invoiceForm).toContain("onAdjustmentPrefill(applyAdjustmentPrefill)");
    expect(invoiceForm).toContain('document.getElementById("selMonedaPrecios").value = "ARS"');
    expect(invoiceForm).toContain('tipo: "invoice"');
    expect(invoiceForm).toContain("id: currentInvoiceId");
    expect(invoiceForm).toContain("if (res && res.invoiceId) currentInvoiceId = res.invoiceId");
    expect(main).toContain("invoiceId: invoiceId || undefined");
  });

  it("permite editar una factura sin CAE conservando sus datos e id", () => {
    expect(shell).toContain("Editar factura");
    expect(shell).toContain("api.openInvoiceEdit(id)");
    expect(shellPreload).toContain('ipcRenderer.invoke("shell:open-invoice-edit", invoiceId)');
    expect(main).toContain('ipcMain.handle("shell:open-invoice-edit"');
    expect(main).toContain('return { ok: false, error: "No tenés permisos para editar facturas." }');
    expect(main).toContain('sendInvoicePrefill(win, "invoice-edit:prefill", prefill)');
    expect(preload).toContain('ipcRenderer.on("invoice-edit:prefill"');
    expect(invoiceForm).toContain("function applyEditPrefill(data)");
    expect(invoiceForm).toContain("currentInvoiceId = invoice.id || null");
    expect(invoiceForm).toContain("Reintentar autorización en ARCA");
    expect(invoiceForm).toContain("Number.isFinite(Number(it.iva_pct)) ? Number(it.iva_pct) : 21");
  });

  it("reconoce todos los roles administrativos en renderer y proceso principal", () => {
    const roles = '["admin", "owner", "superadmin"]';
    expect(shell).toContain(`${roles}.includes(currentRole)`);
    expect(main).toContain(`${roles}.includes(String(currentUser?.role ?? "").toLowerCase())`);
  });
});
