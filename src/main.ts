/**
 * Proceso principal de Asimov Desktop.
 *
 * Estrategia: la app NO empaqueta el frontend. Carga la web remota del ERP
 * (`${serverUrl}/admin`) dentro de una ventana nativa con sesion persistente.
 *
 * Flujo de ventanas:
 *  - Sin servidor configurado -> ventana "picker" para elegir servidor.
 *  - Con servidor -> splash screen -> carga web -> ventana principal o pantalla offline.
 */
import { app, BrowserWindow, session, shell } from "electron";
import * as path from "node:path";
import {
  getServerUrl,
  getServerLabel,
  getWindowBounds,
  setWindowBounds,
  type WindowBounds,
} from "./config";
import { buildAppMenu } from "./menu";
import { registerIpcHandlers, probeServer } from "./ipc";
import { initAutoUpdater } from "./updater";
import { initTray, isQuitting, rebuildTrayMenu, syncLaunchAtStartup } from "./tray";

const SESSION_PARTITION = "persist:bartez";

const PICKER_FILE = path.join(__dirname, "picker.html");
const SPLASH_FILE = path.join(__dirname, "splash.html");
const OFFLINE_FILE = path.join(__dirname, "offline.html");
const SHELL_FILE = path.join(__dirname, "shell.html");
const APP_ICON_FILE = path.join(__dirname, "icon.png");

let mainWindow: BrowserWindow | null = null;
let pickerWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let pendingAdminPath: string | null = null;

function isDev(): boolean {
  return process.env.BARTEZ_DEV === "1" || !app.isPackaged;
}

function currentOrigin(): string | null {
  const url = getServerUrl();
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function normalizeAdminPath(input: string | null): string {
  if (!input) return "/admin";
  const raw = input.startsWith("/") ? input : `/${input}`;
  if (!raw.startsWith("/admin")) return "/admin";
  return raw;
}

function adminUrl(pathname = "/admin"): string | null {
  const serverUrl = getServerUrl();
  if (!serverUrl) return null;
  const url = new URL(normalizeAdminPath(pathname), serverUrl);
  return url.toString();
}

function consumePendingAdminPath(): string {
  const next = pendingAdminPath ?? "/admin";
  pendingAdminPath = null;
  return normalizeAdminPath(next);
}

function readDeepLink(argv: string[]): string | null {
  const raw = argv.find((arg) => arg.startsWith("bartez://"));
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const pathParam = url.searchParams.get("path");
    if (pathParam) return normalizeAdminPath(pathParam);
    const combined = `${url.hostname}${url.pathname}`.replace(/^open\/?/, "");
    return normalizeAdminPath(combined || "/admin");
  } catch {
    return null;
  }
}

function registerProtocolHandler(): void {
  if (process.defaultApp) {
    const script = process.argv[1];
    if (script) app.setAsDefaultProtocolClient("bartez", process.execPath, [script]);
    return;
  }
  app.setAsDefaultProtocolClient("bartez");
}

function hardenNavigation(window: BrowserWindow): void {
  window.webContents.on("will-navigate", (event, navUrl) => {
    const allowedOrigin = currentOrigin();
    if (allowedOrigin && navUrl.startsWith(allowedOrigin)) return;
    event.preventDefault();
    void shell.openExternal(navUrl);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
}

function persistBounds(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  const bounds = window.getBounds();
  const next: WindowBounds = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: window.isMaximized(),
  };
  setWindowBounds(next);
}

// ---------------------------------------------------------------------------
// Splash screen
// ---------------------------------------------------------------------------

function createSplashWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 420,
    height: 320,
    resizable: false,
    frame: false,
    transparent: false,
    show: false,
    backgroundColor: "#062b19",
    title: `Asimov - ${getServerLabel()}`,
    icon: APP_ICON_FILE,
    webPreferences: {
      preload: path.join(__dirname, "splash-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    splashWindow = null;
  });

  void window.loadFile(SPLASH_FILE);
  return window;
}

function sendSplashProgress(pct: number, msg: string): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("splash:progress", pct, msg);
  }
}

function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function destroyMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
  mainWindow = null;
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------

function createMainWindow(primary = true): BrowserWindow {
  const saved = getWindowBounds();

  const window = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: "#062b19",
    title: "Asimov",
    icon: APP_ICON_FILE,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: SESSION_PARTITION,
      spellcheck: true,
    },
  });

  if (saved.maximized) window.maximize();

  let saveTimer: NodeJS.Timeout | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistBounds(window), 400);
  };
  window.on("resize", scheduleSave);
  window.on("move", scheduleSave);
  window.on("close", (event) => {
    persistBounds(window);
    if (primary && !isQuitting()) {
      event.preventDefault();
      window.hide();
    }
  });

  hardenNavigation(window);
  window.on("closed", () => {
    if (primary) mainWindow = null;
  });

  return window;
}

function createModuleWindow(pathname: string): BrowserWindow | null {
  const targetUrl = adminUrl(pathname);
  if (!targetUrl) return null;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  }

  const window = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 760,
    minHeight: 520,
    show: false,
    parent: mainWindow ?? undefined,
    modal: false,
    backgroundColor: "#f5f5f0",
    title: `Asimov - ${getServerLabel()} - ${normalizeAdminPath(pathname)}`,
    icon: APP_ICON_FILE,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: SESSION_PARTITION,
      spellcheck: true,
    },
  });

  hardenNavigation(window);
  window.webContents.once("did-finish-load", () => window.show());
  window.webContents.once("did-fail-load", () => window.show());
  void window.loadURL(targetUrl);
  return window;
}

/**
 * Loads the ERP with splash screen flow:
 * 1. Show splash
 * 2. Probe server
 * 3. If OK -> load desktop shell, close splash when ready
 * 4. If fail -> show offline screen, close splash
 */
async function loadWithSplash(): Promise<void> {
  const serverUrl = getServerUrl();
  if (!serverUrl) return;
  const targetPath = pendingAdminPath ? consumePendingAdminPath() : null;

  splashWindow = createSplashWindow();
  sendSplashProgress(10, "Verificando servidor...");

  const probe = await probeServer(serverUrl);
  sendSplashProgress(40, "Servidor encontrado");

  if (!mainWindow) mainWindow = createMainWindow();
  mainWindow.setTitle(`Asimov - ${getServerLabel(serverUrl)}`);

  if (probe.ok) {
    const targetPathToOpen = targetPath;
    sendSplashProgress(60, "Cargando escritorio...");

    mainWindow.webContents.once("did-finish-load", () => {
      sendSplashProgress(100, "Listo");
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          if (targetPathToOpen) createModuleWindow(targetPathToOpen);
        }
        closeSplash();
      }, 300);
    });

    mainWindow.webContents.once("did-fail-load", () => {
      showOffline();
    });

    void mainWindow.loadFile(SHELL_FILE);
  } else {
    showOffline();
  }
}

function showOffline(): void {
  closeSplash();
  if (!mainWindow) mainWindow = createMainWindow();

  const offlinePreload = path.join(__dirname, "offline-preload.js");
  const offlineWindow = new BrowserWindow({
    width: 520,
    height: 480,
    resizable: false,
    show: false,
    backgroundColor: "#062b19",
    title: "Asimov - Sin conexion",
    icon: APP_ICON_FILE,
    webPreferences: {
      preload: offlinePreload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  offlineWindow.once("ready-to-show", () => offlineWindow.show());
  void offlineWindow.loadFile(OFFLINE_FILE);

  // Hide main window while offline is shown
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }

  offlineWindow.on("closed", () => {
    // If main window still has no content, close it too
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      destroyMainWindow();
    }
  });
}

// ---------------------------------------------------------------------------
// Picker (server selection)
// ---------------------------------------------------------------------------

function createPickerWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 520,
    height: 620,
    resizable: false,
    show: false,
    backgroundColor: "#062b19",
    title: "Asimov - Configuracion",
    icon: APP_ICON_FILE,
    webPreferences: {
      preload: path.join(__dirname, "picker-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    pickerWindow = null;
  });

  void window.loadFile(PICKER_FILE);
  return window;
}

// ---------------------------------------------------------------------------
// Window orchestration
// ---------------------------------------------------------------------------

function openAppropriateWindow(): void {
  if (getServerUrl()) {
    void loadWithSplash();
  } else {
    if (!pickerWindow) pickerWindow = createPickerWindow();
    else pickerWindow.focus();
  }
}

function onServerChanged(): void {
  buildAppMenu({ isDev: isDev(), onServerChanged, openApp, openNewWindow });
  rebuildTrayMenu();
  if (getServerUrl()) {
    if (pickerWindow) {
      pickerWindow.close();
      pickerWindow = null;
    }
    void loadWithSplash();
  } else {
    closeSplash();
    if (mainWindow) {
      destroyMainWindow();
    }
    if (!pickerWindow) pickerWindow = createPickerWindow();
  }
}

function onRetry(): void {
  // Close all windows and restart the splash flow
  BrowserWindow.getAllWindows().forEach((w) => {
    if (w !== mainWindow) w.close();
  });
  if (mainWindow) {
    destroyMainWindow();
  }
  void loadWithSplash();
}

function openApp(pathname?: string): void {
  const nextPath = normalizeAdminPath(pathname ?? "/admin");
  if (!getServerUrl()) {
    pendingAdminPath = nextPath;
    openAppropriateWindow();
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    createModuleWindow(nextPath);
    return;
  }

  pendingAdminPath = nextPath;
  openAppropriateWindow();
}

function openNewWindow(pathname = "/admin"): void {
  if (!getServerUrl()) {
    pendingAdminPath = normalizeAdminPath(pathname);
    openAppropriateWindow();
    return;
  }

  createModuleWindow(pathname);
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// ---------------------------------------------------------------------------
// Single-instance lock
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  pendingAdminPath = readDeepLink(process.argv);
  registerProtocolHandler();

  app.on("open-url", (event, url) => {
    event.preventDefault();
    const linkPath = readDeepLink([url]);
    if (linkPath) openApp(linkPath);
  });

  app.on("second-instance", (_event, argv) => {
    const linkPath = readDeepLink(argv);
    if (linkPath) openApp(linkPath);
    const target = mainWindow ?? pickerWindow;
    if (target) {
      if (target.isMinimized()) target.restore();
      target.show();
      target.focus();
    }
  });

  app.whenReady().then(() => {
    const persistentSession = session.fromPartition(SESSION_PARTITION);
    persistentSession.setUserAgent(
      `${persistentSession.getUserAgent()} BartezDesktop/${app.getVersion()}`,
    );

    registerIpcHandlers({ onServerChanged, getMainWindow, onRetry });
    buildAppMenu({ isDev: isDev(), onServerChanged, openApp, openNewWindow });
    syncLaunchAtStartup();
    initTray({ getMainWindow, openApp, onServerChanged });

    openAppropriateWindow();

    if (!isDev()) initAutoUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) openAppropriateWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

