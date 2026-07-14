/**
 * Handlers IPC de app/shell/print/notify.
 *
 * Grupos:
 *  - app:*     — versión y arranque automático con Windows
 *  - shell:*   — preferencias del shell (fondo, bookmarks)
 *  - print:*   — impresión desde ventana activa + printers preferidos
 *  - notify:*  — notificaciones nativas
 */
import { app, BrowserWindow, ipcMain, Notification, shell } from "electron";
import {
  getLaunchAtStartup,
  getShellPreferences,
  setShellBackground,
  getBookmarks,
  addBookmark,
  removeBookmark,
  getPrintPreferences,
  setPreferredPrinter,
  setSilentPrint,
} from "../config";
import { setLaunchAtStartupEnabled } from "../tray";
import { safeStr, normalizeShellBackground, type IpcDeps } from "./shared";

export function registerAppIpc(deps: IpcDeps): void {
  // --- App info ------------------------------------------------------------
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:launch-at-startup:get", () => getLaunchAtStartup());
  ipcMain.handle("app:launch-at-startup:set", (_event, value: unknown) => {
    setLaunchAtStartupEnabled(Boolean(value));
    return { ok: true, enabled: getLaunchAtStartup() };
  });
  ipcMain.handle("app:open-external", async (_event, value: unknown) => {
    try {
      const target = new URL(safeStr(value));
      const allowedProtocols = ["mailto:", "tel:", "https:", "http:"];
      if (!allowedProtocols.includes(target.protocol)) {
        return { ok: false, error: "El enlace externo no está permitido." };
      }
      await shell.openExternal(target.toString());
      return { ok: true };
    } catch {
      return { ok: false, error: "El enlace externo no es válido." };
    }
  });

  // --- Shell preferences ---------------------------------------------------
  ipcMain.handle("shell:prefs:get", () => getShellPreferences());

  ipcMain.handle("shell:background:set", (_event, raw: unknown) => {
    return setShellBackground(normalizeShellBackground(raw));
  });

  ipcMain.handle("shell:bookmark:list", () => getBookmarks());

  ipcMain.handle("shell:bookmark:add", (_event, raw: unknown) => {
    const data = (raw ?? {}) as { title?: unknown; path?: unknown };
    return addBookmark({ title: safeStr(data.title), path: safeStr(data.path) });
  });

  ipcMain.handle("shell:bookmark:remove", (_event, id: unknown) => {
    return removeBookmark(safeStr(id));
  });

  // --- Impresión -----------------------------------------------------------
  ipcMain.handle("print:current", async (event, opts: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? deps.getMainWindow();
    if (!window) return { ok: false, error: "No hay ventana activa." };
    const options = (opts ?? {}) as { silent?: boolean; deviceName?: string; usePreferred?: boolean };
    const prefs = getPrintPreferences();
    const useSilent = options.silent ?? (options.usePreferred && prefs.silentPrint && !!prefs.preferredPrinter);
    const deviceName = options.deviceName ?? (options.usePreferred && prefs.preferredPrinter ? prefs.preferredPrinter : undefined);
    return new Promise((resolve) => {
      window.webContents.print(
        { silent: Boolean(useSilent), deviceName, printBackground: true },
        (success, failureReason) => resolve(success ? { ok: true } : { ok: false, error: failureReason }),
      );
    });
  });

  ipcMain.handle("print:list", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? deps.getMainWindow();
    if (!window) return [];
    try { return await window.webContents.getPrintersAsync(); } catch { return []; }
  });

  ipcMain.handle("print:preferred:get", () => getPrintPreferences());
  ipcMain.handle("print:preferred:set", (_event, deviceName: unknown) => setPreferredPrinter(safeStr(deviceName)));
  ipcMain.handle("print:silent:set", (_event, silent: unknown) => setSilentPrint(Boolean(silent)));

  // --- Notificaciones ------------------------------------------------------
  ipcMain.handle("notify:show", (_event, payload: unknown) => {
    if (!Notification.isSupported()) return { ok: false };
    const data = (payload ?? {}) as { title?: string; body?: string };
    const n = new Notification({ title: data.title ?? "Asimov", body: data.body ?? "" });
    n.on("click", () => {
      const w = deps.getMainWindow();
      if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
    });
    n.show();
    return { ok: true };
  });
}
