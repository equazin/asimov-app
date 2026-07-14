import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const ipc = source("src/ipc/crm.ts");
const preload = source("src/preload.ts");
const shell = source("src/shell.html");
const appIpc = source("src/ipc/app.ts");
const main = source("src/main.ts");
const dbIpc = source("src/ipc.ts");
const copyAssets = source("scripts/copy-assets.js");
const optionalSource = (path: string) => existsSync(resolve(process.cwd(), path)) ? source(path) : "";
const workspace = optionalSource("src/crm-workspace.js");
const styles = optionalSource("src/crm-workspace.css");

describe("espacio CRM operativo", () => {
  it("expone el listado y la ficha de cuentas por IPC", () => {
    expect(ipc).toContain('ipcMain.handle("crm:accounts:list"');
    expect(ipc).toContain('ipcMain.handle("crm:accounts:get"');
    expect(preload).toContain('ipcRenderer.invoke("crm:accounts:list"');
    expect(preload).toContain('ipcRenderer.invoke("crm:accounts:get"');
  });

  it("monta assets aislados para el espacio CRM", () => {
    expect(shell).toContain('id="crm-workspace"');
    expect(shell).toContain('href="crm-workspace.css"');
    expect(shell).toContain('src="crm-workspace.js"');
    expect(copyAssets).toContain('"crm-workspace.js"');
    expect(copyAssets).toContain('"crm-workspace.css"');
    expect(styles).toContain(".crm-workspace");
  });

  it("incluye operaciones reales de cuentas, oportunidades, actividades y tareas", () => {
    expect(workspace).toContain('data-crm-action="new-account"');
    expect(workspace).toContain('data-crm-action="new-opportunity"');
    expect(workspace).toContain('data-crm-action="new-activity"');
    expect(workspace).toContain('data-crm-action="new-task"');
    expect(workspace).toContain('data-crm-action="complete-task"');
    expect(workspace).toContain('data-crm-action="win-opportunity"');
    expect(workspace).toContain('data-crm-action="lose-opportunity"');
    expect(workspace).toContain('data-crm-action="open-account"');
  });

  it("respeta respuestas IPC y permisos de escritura", () => {
    expect(workspace).toContain("function unwrapResponse");
    expect(workspace).toContain("window.A.canWrite()");
    expect(shell).toContain("canWrite: () => CAN_WRITE");
    expect(shell).toContain('if (norm === "cuentas-crm")');
    expect(ipc).toContain('error: "No tenés permisos para modificar el CRM."');
    expect(ipc).toContain("if (!canWrite()) return DENY_WRITE;");
    expect(dbIpc).toContain('error: "No tenés permisos para modificar clientes."');
  });

  it("abre correo, teléfono y web solo con protocolos permitidos", () => {
    expect(appIpc).toContain('ipcMain.handle("app:open-external"');
    expect(appIpc).toContain('["mailto:", "tel:", "https:", "http:"]');
    expect(preload).toContain('ipcRenderer.invoke("app:open-external"');
    expect(workspace).toContain('data-crm-action="call-account"');
    expect(workspace).toContain('data-crm-action="email-account"');
  });

  it("abre cotización y pedido con la cuenta ya seleccionada", () => {
    expect(preload).toContain('context ? { type, context } : type');
    expect(main).toContain('function sendCrmClientPrefill');
    expect(main).toContain('"pedido-cliente", context');
    expect(main).toContain('"cot-cliente", context');
    expect(workspace).toContain('razonSocial: account.business_name');
    expect(workspace).toContain('window.A.openNativeForm(type, {');
  });
});
