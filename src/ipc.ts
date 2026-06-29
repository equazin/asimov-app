/**
 * Handlers IPC del proceso principal.
 *
 * Exponen al renderer (vía preload/contextBridge) sólo lo necesario:
 *  - configuración de servidor (multi-cliente)
 *  - historial de servidores
 *  - impresión nativa
 *  - notificaciones del SO
 *  - retry de conexión offline
 * Todo input que cruza el puente se valida acá; nunca se confía en el renderer.
 */
import { app, BrowserWindow, ipcMain, net, Notification } from "electron";
import {
  getLaunchAtStartup,
  getServerUrl,
  setServerUrl,
  clearServerUrl,
  normalizeServerUrl,
  getServerHistory,
  removeFromHistory,
  updateHistoryLabel,
  hasCompletedOnboarding,
  setOnboardingDone,
  getShellPreferences,
  setShellBackground,
  getBookmarks,
  addBookmark,
  removeBookmark,
  getPrintPreferences,
  setPreferredPrinter,
  setSilentPrint,
  type ShellBackground,
} from "./config";
import { setLaunchAtStartupEnabled } from "./tray";

interface IpcDeps {
  onServerChanged: () => void;
  getMainWindow: () => BrowserWindow | null;
  onRetry: () => void;
}

export interface ServerValidationResult {
  ok: boolean;
  url?: string;
  error?: string;
}

function normalizeAdminPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "/admin";
  try {
    const parsed = new URL(trimmed);
    return normalizeAdminPath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch {}
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.startsWith("/admin") ? withSlash : "/admin";
}

function normalizeShellBackground(raw: unknown): ShellBackground {
  const data = (raw ?? {}) as { type?: unknown; value?: unknown };
  const type = String(data.type ?? "default");
  const value = String(data.value ?? "").trim();
  if (type === "color" && /^#[0-9a-f]{6}$/i.test(value)) return { type: "color", value };
  if (type === "image" && value) return { type: "image", value };
  return { type: "default", value: "" };
}

/**
 * Verifica que la URL responda y parezca un servidor BARTEZ.
 */
export function probeServer(url: string): Promise<ServerValidationResult> {
  return new Promise((resolve) => {
    const request = net.request({ method: "GET", url });
    const timeout = setTimeout(() => {
      request.abort();
      resolve({ ok: false, error: "El servidor no respondió a tiempo." });
    }, 8000);

    request.on("response", (response) => {
      clearTimeout(timeout);
      const status = response.statusCode;
      response.on("data", () => {});
      response.on("end", () => {
        if (status >= 200 && status < 500) {
          resolve({ ok: true, url });
        } else {
          resolve({ ok: false, error: `El servidor respondió ${status}.` });
        }
      });
    });

    request.on("error", () => {
      clearTimeout(timeout);
      resolve({ ok: false, error: "No se pudo conectar con el servidor." });
    });

    request.end();
  });
}

export function registerIpcHandlers(deps: IpcDeps): void {
  // --- App info ------------------------------------------------------------
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:launch-at-startup:get", () => getLaunchAtStartup());
  ipcMain.handle("app:launch-at-startup:set", (_event, value: unknown) => {
    setLaunchAtStartupEnabled(Boolean(value));
    return { ok: true, enabled: getLaunchAtStartup() };
  });

  // --- Configuración de servidor -------------------------------------------
  ipcMain.handle("server:get", () => getServerUrl());

  ipcMain.handle("server:validate", async (_event, raw: unknown) => {
    const normalized = normalizeServerUrl(String(raw ?? ""));
    if (!normalized) {
      return { ok: false, error: "URL inválida. Ej: https://bartez.com.ar" } satisfies ServerValidationResult;
    }
    return probeServer(normalized);
  });

  ipcMain.handle("server:set", async (_event, raw: unknown) => {
    const normalized = normalizeServerUrl(String(raw ?? ""));
    if (!normalized) {
      return { ok: false, error: "URL inválida." } satisfies ServerValidationResult;
    }
    const probe = await probeServer(normalized);
    if (!probe.ok) return probe;
    setServerUrl(normalized);
    deps.onServerChanged();
    return { ok: true, url: normalized } satisfies ServerValidationResult;
  });

  ipcMain.handle("server:change", () => {
    clearServerUrl();
    deps.onServerChanged();
    return { ok: true } satisfies ServerValidationResult;
  });

  // --- Historial de servidores ---------------------------------------------
  ipcMain.handle("server:history", () => getServerHistory());

  ipcMain.handle("server:history:remove", (_event, url: unknown) => {
    removeFromHistory(String(url ?? ""));
    return getServerHistory();
  });

  ipcMain.handle("server:history:label", (_event, url: unknown, label: unknown) => {
    updateHistoryLabel(String(url ?? ""), String(label ?? ""));
    return getServerHistory();
  });

  // --- Onboarding ------------------------------------------------------------
  ipcMain.handle("onboarding:status", () => hasCompletedOnboarding());
  ipcMain.handle("onboarding:done", () => {
    setOnboardingDone();
    return { ok: true };
  });

  // --- Shell GESES ----------------------------------------------------------
  ipcMain.handle("shell:prefs:get", () => getShellPreferences());

  ipcMain.handle("shell:background:set", (_event, raw: unknown) => {
    return setShellBackground(normalizeShellBackground(raw));
  });

  ipcMain.handle("shell:bookmark:list", () => getBookmarks());

  ipcMain.handle("shell:bookmark:add", (_event, raw: unknown) => {
    const data = (raw ?? {}) as { title?: unknown; path?: unknown };
    return addBookmark({
      title: String(data.title ?? ""),
      path: normalizeAdminPath(String(data.path ?? "")),
    });
  });

  ipcMain.handle("shell:bookmark:remove", (_event, id: unknown) => {
    return removeBookmark(String(id ?? ""));
  });

  // --- Retry (offline screen) ----------------------------------------------
  ipcMain.handle("offline:retry", async () => {
    const url = getServerUrl();
    if (!url) return { ok: false, error: "Sin servidor configurado." };
    const probe = await probeServer(url);
    if (probe.ok) deps.onRetry();
    return probe;
  });

  // --- Impresión nativa ----------------------------------------------------
  ipcMain.handle("print:current", async (event, opts: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? deps.getMainWindow();
    if (!window) return { ok: false, error: "No hay ventana activa." };
    const options = (opts ?? {}) as { silent?: boolean; deviceName?: string };
    return new Promise((resolve) => {
      window.webContents.print(
        {
          silent: Boolean(options.silent),
          deviceName: options.deviceName,
          printBackground: true,
        },
        (success, failureReason) => {
          resolve(success ? { ok: true } : { ok: false, error: failureReason });
        },
      );
    });
  });

  ipcMain.handle("print:list", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? deps.getMainWindow();
    if (!window) return [];
    try {
      return await window.webContents.getPrintersAsync();
    } catch {
      return [];
    }
  });

  ipcMain.handle("print:preferred:get", () => getPrintPreferences());

  ipcMain.handle("print:preferred:set", (_event, deviceName: unknown) => {
    return setPreferredPrinter(String(deviceName ?? ""));
  });

  ipcMain.handle("print:silent:set", (_event, silent: unknown) => {
    return setSilentPrint(Boolean(silent));
  });

  // --- API proxy (pickers fetch real data through main process) ---------------
  ipcMain.handle("api:fetch", async (_event, endpoint: unknown) => {
    const serverUrl = getServerUrl();
    if (!serverUrl) return { ok: false, error: "Sin servidor configurado.", data: [] };
    const path = String(endpoint ?? "");
    if (!path.startsWith("/api/")) return { ok: false, error: "Endpoint inválido.", data: [] };
    const url = `${serverUrl}${path}`;
    return new Promise((resolve) => {
      const request = net.request({ method: "GET", url, partition: "persist:bartez" });
      const timeout = setTimeout(() => {
        request.abort();
        resolve({ ok: false, error: "Timeout.", data: [] });
      }, 10000);
      let body = "";
      request.on("response", (response) => {
        clearTimeout(timeout);
        response.on("data", (chunk) => { body += chunk.toString(); });
        response.on("end", () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            try {
              resolve({ ok: true, data: JSON.parse(body) });
            } catch {
              resolve({ ok: false, error: "Respuesta no es JSON.", data: [] });
            }
          } else {
            resolve({ ok: false, error: `HTTP ${response.statusCode}`, data: [] });
          }
        });
      });
      request.on("error", () => {
        clearTimeout(timeout);
        resolve({ ok: false, error: "Error de conexión.", data: [] });
      });
      request.end();
    });
  });

  // --- Notificaciones del SO -----------------------------------------------
  ipcMain.handle("notify:show", (_event, payload: unknown) => {
    if (!Notification.isSupported()) return { ok: false };
    const data = (payload ?? {}) as { title?: string; body?: string };
    const notification = new Notification({
      title: data.title ?? "Asimov",
      body: data.body ?? "",
    });
    notification.on("click", () => {
      const window = deps.getMainWindow();
      if (window) {
        if (window.isMinimized()) window.restore();
        window.focus();
      }
    });
    notification.show();
    return { ok: true };
  });
}
