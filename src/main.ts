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
import { app, BrowserWindow, globalShortcut, session, shell, ipcMain } from "electron";
import * as path from "node:path";
import {
  getServerUrl,
  getServerLabel,
  getWindowBounds,
  setWindowBounds,
  getPrintPreferences,
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
const PRODUCT_SELECTION_FILE = path.join(__dirname, "product-selection.html");
const NEW_ARTICLE_FILE = path.join(__dirname, "new-article.html");
const CLIENT_SELECTION_FILE = path.join(__dirname, "client-selection.html");
const NEW_CLIENT_FILE = path.join(__dirname, "new-client.html");
const NEW_SUPPLIER_FILE = path.join(__dirname, "new-supplier.html");
const NEW_SALE_ORDER_FILE = path.join(__dirname, "new-sale-order.html");
const NEW_QUOTE_FILE = path.join(__dirname, "new-quote.html");
const NEW_INVOICE_FILE = path.join(__dirname, "new-invoice.html");
const NEW_DELIVERY_NOTE_FILE = path.join(__dirname, "new-delivery-note.html");
const NEW_RECEIPT_FILE = path.join(__dirname, "new-receipt.html");

// Title bar custom estilo GESES: barra crema, texto y botones oscuros.
// Reemplaza la barra nativa de Windows que toma el color de fondo de la página web.
const TITLE_BAR_OVERLAY = {
  color: "#e8e5da",
  symbolColor: "#1f2937",
  height: 32,
} as const;

const TITLE_BAR_STYLE = "hidden" as const;

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
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
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
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
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
  window.setMenu(null);
  window.setMenuBarVisibility(false);
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
// Global shortcuts (atajos estilo GESES: F2=nuevo, F3=buscar, F5=refrescar, F8=guardar)
// ---------------------------------------------------------------------------

function registerGlobalShortcuts(): void {
  const shortcuts: Record<string, string> = {
    F2: "new",
    F3: "search",
    F5: "refresh",
    F8: "save",
    F9: "print",
  };

  for (const [key, action] of Object.entries(shortcuts)) {
    globalShortcut.register(key, () => {
      const focused = BrowserWindow.getFocusedWindow();
      if (!focused) return;
      if (action === "refresh") {
        focused.webContents.reload();
        return;
      }
      if (action === "print") {
        const prefs = getPrintPreferences();
        focused.webContents.print(
          {
            silent: prefs.silentPrint && !!prefs.preferredPrinter,
            deviceName: prefs.preferredPrinter || undefined,
            printBackground: true,
          },
          () => {},
        );
        return;
      }
      focused.webContents.send("shortcut:triggered", action);
    });
  }
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

function openNativeForm(type: "article" | "client" | "supplier" | "sale-order" | "quote" | "invoice" | "delivery-note" | "receipt"): void {
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  switch (type) {
    case "article":
      createNewArticleWindowStandalone(parent);
      break;
    case "client":
      createNewClientWindowStandalone(parent);
      break;
    case "supplier":
      createNewSupplierWindowStandalone(parent);
      break;
    case "sale-order":
      createNewSaleOrderWindowStandalone(parent);
      break;
    case "quote":
      createNewQuoteWindowStandalone(parent);
      break;
    case "invoice":
      createNewInvoiceWindowStandalone(parent);
      break;
    case "delivery-note":
      createNewDeliveryNoteWindowStandalone(parent);
      break;
    case "receipt":
      createNewReceiptWindowStandalone(parent);
      break;
  }
}

function onServerChanged(): void {
  buildAppMenu({ isDev: isDev(), onServerChanged, openApp, openNewWindow, openNativeForm });
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
    buildAppMenu({ isDev: isDev(), onServerChanged, openApp, openNewWindow, openNativeForm });
    registerGlobalShortcuts();
    syncLaunchAtStartup();
    initTray({ getMainWindow, openApp, onServerChanged });

    openAppropriateWindow();

    if (!isDev()) initAutoUpdater();

    ipcMain.on("shell:open-module", (_event, path: string) => {
      if (typeof path === "string" && path.startsWith("/admin")) {
        createModuleWindow(path);
      }
    });

    ipcMain.on("shell:open-product-selection", (event, data: { rowId: string }) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (senderWindow) {
        createProductSelectionWindow(senderWindow, data.rowId);
      }
    });

    ipcMain.on("shell:product-selected-forward", (_event, data: { product: any; rowId: string }) => {
      if (productSelectionWindow && !productSelectionWindow.isDestroyed()) {
        const parent = productSelectionWindow.getParentWindow();
        if (parent && !parent.isDestroyed()) {
          parent.webContents.send("shell:product-selected", data);
        }
        productSelectionWindow.close();
      }
    });

    ipcMain.on("shell:open-new-article", () => {
      if (productSelectionWindow && !productSelectionWindow.isDestroyed()) {
        createNewArticleWindow(productSelectionWindow);
      }
    });

    ipcMain.on("shell:article-created", (_event, data: { article: any }) => {
      if (productSelectionWindow && !productSelectionWindow.isDestroyed()) {
        productSelectionWindow.webContents.send("shell:new-article-added", data.article);
      }
      if (newArticleWindow && !newArticleWindow.isDestroyed()) {
        newArticleWindow.close();
      }
    });

    ipcMain.on("shell:open-client-selection", (event, data: { contextId: string }) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (senderWindow) {
        createClientSelectionWindow(senderWindow, data.contextId || "");
      }
    });

    ipcMain.on("shell:client-selected-forward", (_event, data: { client: any; contextId: string }) => {
      if (clientSelectionWindow && !clientSelectionWindow.isDestroyed()) {
        const parent = clientSelectionWindow.getParentWindow();
        if (parent && !parent.isDestroyed()) {
          parent.webContents.send("shell:client-selected", data);
        }
        clientSelectionWindow.close();
      }
    });

    ipcMain.on("shell:open-new-client", () => {
      const parent = clientSelectionWindow ?? mainWindow;
      if (parent && !parent.isDestroyed()) {
        createNewClientWindow(parent);
      }
    });

    ipcMain.on("shell:client-created", (_event, data: { client: any }) => {
      if (data.client && clientSelectionWindow && !clientSelectionWindow.isDestroyed()) {
        clientSelectionWindow.webContents.send("shell:new-client-added", data.client);
      }
      if (newClientWindow && !newClientWindow.isDestroyed()) {
        newClientWindow.close();
      }
    });

    ipcMain.on("shell:open-new-supplier", (event) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
      if (senderWindow && !senderWindow.isDestroyed()) {
        createNewSupplierWindow(senderWindow);
      }
    });

    ipcMain.on("shell:supplier-created", (_event, data: { supplier: any }) => {
      if (newSupplierWindow && !newSupplierWindow.isDestroyed()) {
        const parent = newSupplierWindow.getParentWindow();
        if (parent && !parent.isDestroyed() && data.supplier) {
          parent.webContents.send("shell:new-supplier-added", data.supplier);
        }
        newSupplierWindow.close();
      }
    });

    ipcMain.on("shell:sale-order-saved", (_event, _data: { order: any }) => {
      if (newSaleOrderWindow && !newSaleOrderWindow.isDestroyed()) {
        newSaleOrderWindow.close();
      }
    });

    ipcMain.on("shell:quote-saved", (_event, _data: { quote: any }) => {
      if (newQuoteWindow && !newQuoteWindow.isDestroyed()) {
        newQuoteWindow.close();
      }
    });

    ipcMain.on("shell:invoice-saved", (_event, _data: { invoice: any }) => {
      if (newInvoiceWindow && !newInvoiceWindow.isDestroyed()) {
        newInvoiceWindow.close();
      }
    });

    ipcMain.on("shell:delivery-note-saved", (_event, _data: { delivery: any }) => {
      if (newDeliveryNoteWindow && !newDeliveryNoteWindow.isDestroyed()) {
        newDeliveryNoteWindow.close();
      }
    });

    ipcMain.on("shell:receipt-saved", (_event, _data: { receipt: any }) => {
      if (newReceiptWindow && !newReceiptWindow.isDestroyed()) {
        newReceiptWindow.close();
      }
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) openAppropriateWindow();
    });
  });

  app.on("window-all-closed", () => {
    globalShortcut.unregisterAll();
    if (process.platform !== "darwin") app.quit();
  });
}

let productSelectionWindow: BrowserWindow | null = null;
let newArticleWindow: BrowserWindow | null = null;
let clientSelectionWindow: BrowserWindow | null = null;
let newClientWindow: BrowserWindow | null = null;
let newSupplierWindow: BrowserWindow | null = null;
let newSaleOrderWindow: BrowserWindow | null = null;
let newQuoteWindow: BrowserWindow | null = null;
let newInvoiceWindow: BrowserWindow | null = null;
let newDeliveryNoteWindow: BrowserWindow | null = null;
let newReceiptWindow: BrowserWindow | null = null;

function createProductSelectionWindow(parentWindow: BrowserWindow, rowId: string) {
  if (productSelectionWindow && !productSelectionWindow.isDestroyed()) {
    productSelectionWindow.focus();
    return;
  }

  productSelectionWindow = new BrowserWindow({
    width: 820,
    height: 520,
    resizable: true,
    parent: parentWindow,
    modal: true,
    show: false,
    backgroundColor: "#ffffff",
    title: "Selección de Artículos de Compra-Venta",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "product-selection-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  productSelectionWindow.once("ready-to-show", () => {
    productSelectionWindow?.show();
    productSelectionWindow?.webContents.send("set-row-id", rowId);
    loadProductsForPicker();
  });

  productSelectionWindow.on("closed", () => {
    productSelectionWindow = null;
  });

  productSelectionWindow.setMenu(null);
  void productSelectionWindow.loadFile(PRODUCT_SELECTION_FILE);
}

async function loadProductsForPicker(): Promise<void> {
  if (!productSelectionWindow || productSelectionWindow.isDestroyed()) return;
  const serverUrl = getServerUrl();
  if (!serverUrl) return;

  try {
    const { net } = require("electron");
    const url = `${serverUrl}/api/products?limit=500`;
    const request = net.request({ method: "GET", url, partition: SESSION_PARTITION });
    let body = "";
    request.on("response", (response: any) => {
      response.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      response.on("end", () => {
        if (!productSelectionWindow || productSelectionWindow.isDestroyed()) return;
        try {
          const parsed = JSON.parse(body);
          const items = parsed.data || parsed.products || parsed || [];
          const mapped = Array.isArray(items) ? items.map((p: any) => ({
            codigo: p.code || p.sku || p.id || "",
            descripcion: p.name || p.description || "",
            importe: String(p.price ?? p.salePrice ?? "0.00"),
            iva: String(p.taxRate ?? "21.00"),
            st: String(p.stock ?? p.quantity ?? "0"),
            compro: "0",
            entr: "0",
            linea: p.brand || p.line || "",
            categoria: p.category || "",
          })) : [];
          if (mapped.length > 0) {
            productSelectionWindow.webContents.send("product-selection:loaded", mapped);
          }
        } catch {}
      });
    });
    request.on("error", () => {});
    request.end();
  } catch {}
}

function createClientSelectionWindow(parentWindow: BrowserWindow, contextId: string) {
  if (clientSelectionWindow && !clientSelectionWindow.isDestroyed()) {
    clientSelectionWindow.focus();
    return;
  }

  clientSelectionWindow = new BrowserWindow({
    width: 860,
    height: 540,
    resizable: true,
    parent: parentWindow,
    modal: true,
    show: false,
    backgroundColor: "#ffffff",
    title: "Selección de Clientes",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "client-selection-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  clientSelectionWindow.once("ready-to-show", () => {
    clientSelectionWindow?.show();
    clientSelectionWindow?.webContents.send("client-selection:init", { contextId });
    loadClientsForPicker();
  });

  clientSelectionWindow.on("closed", () => {
    clientSelectionWindow = null;
  });

  clientSelectionWindow.setMenu(null);
  void clientSelectionWindow.loadFile(CLIENT_SELECTION_FILE);
}

async function loadClientsForPicker(): Promise<void> {
  if (!clientSelectionWindow || clientSelectionWindow.isDestroyed()) return;
  const serverUrl = getServerUrl();
  if (!serverUrl) {
    clientSelectionWindow.webContents.send("client-selection:loaded", []);
    return;
  }

  try {
    const { net } = require("electron");
    const url = `${serverUrl}/api/accounts?limit=500&type=customer`;
    const request = net.request({ method: "GET", url, partition: SESSION_PARTITION });
    let body = "";
    request.on("response", (response: any) => {
      response.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      response.on("end", () => {
        if (!clientSelectionWindow || clientSelectionWindow.isDestroyed()) return;
        try {
          const parsed = JSON.parse(body);
          const accounts = parsed.data || parsed.accounts || parsed || [];
          const mapped = Array.isArray(accounts) ? accounts.map((a: any) => ({
            id: a.id,
            codigo: a.code || a.id,
            razonSocial: a.name || a.razonSocial || "",
            domicilio: a.address || a.domicilio || "",
            telefono: a.phone || a.telefono || "",
            cuit: a.taxId || a.cuit || "",
          })) : [];
          clientSelectionWindow.webContents.send("client-selection:loaded", mapped);
        } catch {
          clientSelectionWindow.webContents.send("client-selection:loaded", []);
        }
      });
    });
    request.on("error", () => {
      if (clientSelectionWindow && !clientSelectionWindow.isDestroyed()) {
        clientSelectionWindow.webContents.send("client-selection:loaded", []);
      }
    });
    request.end();
  } catch {
    clientSelectionWindow.webContents.send("client-selection:loaded", []);
  }
}

function createNewClientWindow(parentWindow: BrowserWindow) {
  if (newClientWindow && !newClientWindow.isDestroyed()) {
    newClientWindow.focus();
    return;
  }

  newClientWindow = new BrowserWindow({
    width: 920,
    height: 640,
    resizable: true,
    parent: parentWindow,
    modal: true,
    show: false,
    backgroundColor: "#f0f0f0",
    title: "Clientes — NUEVO",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "new-client-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  newClientWindow.once("ready-to-show", () => newClientWindow?.show());
  newClientWindow.on("closed", () => { newClientWindow = null; });
  newClientWindow.setMenu(null);
  void newClientWindow.loadFile(NEW_CLIENT_FILE);
}

function createNewSupplierWindow(parentWindow: BrowserWindow) {
  if (newSupplierWindow && !newSupplierWindow.isDestroyed()) {
    newSupplierWindow.focus();
    return;
  }

  newSupplierWindow = new BrowserWindow({
    width: 920,
    height: 640,
    resizable: true,
    parent: parentWindow,
    modal: true,
    show: false,
    backgroundColor: "#f0f0f0",
    title: "Proveedores — NUEVO",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "new-supplier-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  newSupplierWindow.once("ready-to-show", () => newSupplierWindow?.show());
  newSupplierWindow.on("closed", () => { newSupplierWindow = null; });
  newSupplierWindow.setMenu(null);
  void newSupplierWindow.loadFile(NEW_SUPPLIER_FILE);
}

function createNewArticleWindow(parentWindow: BrowserWindow) {
  if (newArticleWindow && !newArticleWindow.isDestroyed()) {
    newArticleWindow.focus();
    return;
  }

  newArticleWindow = new BrowserWindow({
    width: 900,
    height: 600,
    resizable: true,
    parent: parentWindow,
    modal: true,
    show: false,
    backgroundColor: "#f0f0f0",
    title: "Artículos de Compra-Venta. Artículo: NUEVO",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "new-article-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  newArticleWindow.once("ready-to-show", () => {
    newArticleWindow?.show();
  });

  newArticleWindow.on("closed", () => {
    newArticleWindow = null;
  });

  newArticleWindow.setMenu(null);
  void newArticleWindow.loadFile(NEW_ARTICLE_FILE);
}

// ---------------------------------------------------------------------------
// Standalone native forms (opened from menu, non-modal)
// ---------------------------------------------------------------------------

function createNewArticleWindowStandalone(parent: BrowserWindow | null): void {
  const win = new BrowserWindow({
    width: 920,
    height: 640,
    resizable: true,
    parent: parent ?? undefined,
    modal: false,
    show: false,
    backgroundColor: "#f0f0f0",
    title: "Artículos de Compra-Venta — NUEVO",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "new-article-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.setMenu(null);
  void win.loadFile(NEW_ARTICLE_FILE);
}

function createNewClientWindowStandalone(parent: BrowserWindow | null): void {
  const win = new BrowserWindow({
    width: 920,
    height: 640,
    resizable: true,
    parent: parent ?? undefined,
    modal: false,
    show: false,
    backgroundColor: "#f0f0f0",
    title: "Clientes — NUEVO",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "new-client-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.setMenu(null);
  void win.loadFile(NEW_CLIENT_FILE);
}

function createNewSupplierWindowStandalone(parent: BrowserWindow | null): void {
  const win = new BrowserWindow({
    width: 920,
    height: 640,
    resizable: true,
    parent: parent ?? undefined,
    modal: false,
    show: false,
    backgroundColor: "#f0f0f0",
    title: "Proveedores — NUEVO",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "new-supplier-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.setMenu(null);
  void win.loadFile(NEW_SUPPLIER_FILE);
}

function createNewReceiptWindowStandalone(parent: BrowserWindow | null): void {
  if (newReceiptWindow && !newReceiptWindow.isDestroyed()) {
    newReceiptWindow.focus();
    return;
  }

  newReceiptWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 860,
    minHeight: 580,
    resizable: true,
    parent: parent ?? undefined,
    modal: false,
    show: false,
    backgroundColor: "#f0efe8",
    title: "Recibos — NUEVO",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "new-receipt-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  newReceiptWindow.once("ready-to-show", () => newReceiptWindow?.show());
  newReceiptWindow.on("closed", () => { newReceiptWindow = null; });
  newReceiptWindow.setMenu(null);
  void newReceiptWindow.loadFile(NEW_RECEIPT_FILE);
}

function createNewDeliveryNoteWindowStandalone(parent: BrowserWindow | null): void {
  if (newDeliveryNoteWindow && !newDeliveryNoteWindow.isDestroyed()) {
    newDeliveryNoteWindow.focus();
    return;
  }

  newDeliveryNoteWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 580,
    resizable: true,
    parent: parent ?? undefined,
    modal: false,
    show: false,
    backgroundColor: "#f0efe8",
    title: "Remitos — NUEVO",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "new-delivery-note-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  newDeliveryNoteWindow.once("ready-to-show", () => newDeliveryNoteWindow?.show());
  newDeliveryNoteWindow.on("closed", () => { newDeliveryNoteWindow = null; });
  newDeliveryNoteWindow.setMenu(null);
  void newDeliveryNoteWindow.loadFile(NEW_DELIVERY_NOTE_FILE);
}

function createNewInvoiceWindowStandalone(parent: BrowserWindow | null): void {
  if (newInvoiceWindow && !newInvoiceWindow.isDestroyed()) {
    newInvoiceWindow.focus();
    return;
  }

  newInvoiceWindow = new BrowserWindow({
    width: 1160,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    resizable: true,
    parent: parent ?? undefined,
    modal: false,
    show: false,
    backgroundColor: "#f0efe8",
    title: "Facturas de Venta — NUEVA",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "new-invoice-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  newInvoiceWindow.once("ready-to-show", () => newInvoiceWindow?.show());
  newInvoiceWindow.on("closed", () => { newInvoiceWindow = null; });
  newInvoiceWindow.setMenu(null);
  void newInvoiceWindow.loadFile(NEW_INVOICE_FILE);
}

function createNewQuoteWindowStandalone(parent: BrowserWindow | null): void {
  if (newQuoteWindow && !newQuoteWindow.isDestroyed()) {
    newQuoteWindow.focus();
    return;
  }

  newQuoteWindow = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 900,
    minHeight: 600,
    resizable: true,
    parent: parent ?? undefined,
    modal: false,
    show: false,
    backgroundColor: "#f0efe8",
    title: "Cotizaciones — NUEVA",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "new-quote-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  newQuoteWindow.once("ready-to-show", () => newQuoteWindow?.show());
  newQuoteWindow.on("closed", () => { newQuoteWindow = null; });
  newQuoteWindow.setMenu(null);
  void newQuoteWindow.loadFile(NEW_QUOTE_FILE);
}

function createNewSaleOrderWindowStandalone(parent: BrowserWindow | null): void {
  if (newSaleOrderWindow && !newSaleOrderWindow.isDestroyed()) {
    newSaleOrderWindow.focus();
    return;
  }

  newSaleOrderWindow = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 900,
    minHeight: 600,
    resizable: true,
    parent: parent ?? undefined,
    modal: false,
    show: false,
    backgroundColor: "#f0efe8",
    title: "Pedidos de Venta — NUEVO",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "new-sale-order-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  newSaleOrderWindow.once("ready-to-show", () => newSaleOrderWindow?.show());
  newSaleOrderWindow.on("closed", () => { newSaleOrderWindow = null; });
  newSaleOrderWindow.setMenu(null);
  void newSaleOrderWindow.loadFile(NEW_SALE_ORDER_FILE);
}
