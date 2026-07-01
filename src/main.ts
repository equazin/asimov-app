/**
 * Proceso principal de Asimov ERP.
 *
 * App completamente nativa: todas las pantallas son HTML local con SQLite.
 * No hay carga de servidores remotos, sin partición de sesión web.
 */
import { app, BrowserWindow, globalShortcut, ipcMain } from "electron";
import * as path from "node:path";
import {
  getWindowBounds,
  setWindowBounds,
  getPrintPreferences,
  type WindowBounds,
} from "./config";
import { buildAppMenu } from "./menu";
import { registerIpcHandlers } from "./ipc";
import { initAutoUpdater, checkForUpdateManual } from "./updater";
import { initTray, isQuitting, syncLaunchAtStartup } from "./tray";
import { initDb, dbAll } from "./db";

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------
const SHELL_FILE            = path.join(__dirname, "shell.html");
const APP_ICON_FILE         = path.join(__dirname, "icon.png");
const PRODUCT_SELECTION_FILE = path.join(__dirname, "product-selection.html");
const NEW_ARTICLE_FILE      = path.join(__dirname, "new-article.html");
const CLIENT_SELECTION_FILE = path.join(__dirname, "client-selection.html");
const NEW_CLIENT_FILE       = path.join(__dirname, "new-client.html");
const NEW_SUPPLIER_FILE     = path.join(__dirname, "new-supplier.html");
const NEW_SALE_ORDER_FILE   = path.join(__dirname, "new-sale-order.html");
const NEW_QUOTE_FILE        = path.join(__dirname, "new-quote.html");
const NEW_INVOICE_FILE      = path.join(__dirname, "new-invoice.html");
const NEW_DELIVERY_NOTE_FILE = path.join(__dirname, "new-delivery-note.html");
const NEW_RECEIPT_FILE      = path.join(__dirname, "new-receipt.html");
const NEW_PURCHASE_ORDER_FILE   = path.join(__dirname, "new-purchase-order.html");
const NEW_GOODS_RECEIPT_FILE    = path.join(__dirname, "new-goods-receipt.html");
const NEW_PURCHASE_INVOICE_FILE = path.join(__dirname, "new-purchase-invoice.html");
const NEW_PAYMENT_ORDER_FILE    = path.join(__dirname, "new-payment-order.html");

// Custom title bar para ventanas de formularios nativos (estilo GESES)
const TITLE_BAR_OVERLAY = { color: "#e8e5da", symbolColor: "#1f2937", height: 32 } as const;
const TITLE_BAR_STYLE = "hidden" as const;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let mainWindow: BrowserWindow | null = null;

type NativeFormType =
  | "article" | "client" | "supplier"
  | "sale-order" | "quote" | "invoice" | "delivery-note" | "receipt"
  | "purchase-order" | "goods-receipt" | "purchase-invoice" | "payment-order";

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
let newPurchaseOrderWindow: BrowserWindow | null = null;
let newGoodsReceiptWindow: BrowserWindow | null = null;
let newPurchaseInvoiceWindow: BrowserWindow | null = null;
let newPaymentOrderWindow: BrowserWindow | null = null;

function isDev(): boolean {
  return process.env.BARTEZ_DEV === "1" || !app.isPackaged;
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
// Main window
// ---------------------------------------------------------------------------

function createMainWindow(): BrowserWindow {
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
    title: "Asimov ERP",
    icon: APP_ICON_FILE,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
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
    if (!isQuitting()) {
      event.preventDefault();
      window.hide();
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  window.on("closed", () => {
    mainWindow = null;
  });

  window.webContents.once("did-finish-load", () => window.show());
  void window.loadFile(SHELL_FILE);

  return window;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// ---------------------------------------------------------------------------
// Global shortcuts (F2=nuevo, F3=buscar, F5=refrescar, F8=guardar, F9=imprimir)
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
          { silent: prefs.silentPrint && !!prefs.preferredPrinter, deviceName: prefs.preferredPrinter || undefined, printBackground: true },
          () => {},
        );
        return;
      }
      focused.webContents.send("shortcut:triggered", action);
    });
  }
}

// ---------------------------------------------------------------------------
// Native form orchestration
// ---------------------------------------------------------------------------

function openNativeForm(type: NativeFormType): void {
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  switch (type) {
    case "article":     createNewArticleWindowStandalone(parent); break;
    case "client":      createNewClientWindowStandalone(parent); break;
    case "supplier":    createNewSupplierWindowStandalone(parent); break;
    case "sale-order":  createNewSaleOrderWindowStandalone(parent); break;
    case "quote":       createNewQuoteWindowStandalone(parent); break;
    case "invoice":     createNewInvoiceWindowStandalone(parent); break;
    case "delivery-note": createNewDeliveryNoteWindowStandalone(parent); break;
    case "receipt":     createNewReceiptWindowStandalone(parent); break;
    case "purchase-order":   createNewPurchaseOrderWindowStandalone(parent); break;
    case "goods-receipt":    createNewGoodsReceiptWindowStandalone(parent); break;
    case "purchase-invoice": createNewPurchaseInvoiceWindowStandalone(parent); break;
    case "payment-order":    createNewPaymentOrderWindowStandalone(parent); break;
  }
}

// ---------------------------------------------------------------------------
// Single-instance lock
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    initDb();

    registerIpcHandlers({ getMainWindow });
    buildAppMenu({ isDev: isDev(), openNativeForm });
    registerGlobalShortcuts();
    syncLaunchAtStartup();
    initTray({ getMainWindow });

    mainWindow = createMainWindow();

    if (!isDev()) initAutoUpdater();

    // --- Shell "Nuevo" buttons → abrir formularios nativos ---
    ipcMain.on("shell:open-form", (_event, type: NativeFormType) => {
      openNativeForm(type);
    });

    // --- Chequeo manual de actualizaciones ---
    ipcMain.handle("app:check-update", () => checkForUpdateManual());

    // --- Product picker IPC ---
    ipcMain.on("shell:open-product-selection", (event, data: { rowId: string }) => {
      const sender = BrowserWindow.fromWebContents(event.sender);
      if (sender) createProductSelectionWindow(sender, data.rowId);
    });

    ipcMain.on("shell:product-selected-forward", (_event, data: { product: unknown; rowId: string }) => {
      if (productSelectionWindow && !productSelectionWindow.isDestroyed()) {
        const parent = productSelectionWindow.getParentWindow();
        if (parent && !parent.isDestroyed()) parent.webContents.send("shell:product-selected", data);
        productSelectionWindow.close();
      }
    });

    ipcMain.on("shell:open-new-article", () => {
      if (productSelectionWindow && !productSelectionWindow.isDestroyed()) {
        createNewArticleWindow(productSelectionWindow);
      }
    });

    ipcMain.on("shell:article-created", (_event, data: { article: unknown }) => {
      if (productSelectionWindow && !productSelectionWindow.isDestroyed()) {
        productSelectionWindow.webContents.send("shell:new-article-added", data.article);
      }
      if (newArticleWindow && !newArticleWindow.isDestroyed()) newArticleWindow.close();
    });

    // --- Client picker IPC ---
    ipcMain.on("shell:open-client-selection", (event, data: { contextId: string }) => {
      const sender = BrowserWindow.fromWebContents(event.sender);
      if (sender) createClientSelectionWindow(sender, data.contextId || "");
    });

    ipcMain.on("shell:client-selected-forward", (_event, data: { client: unknown; contextId: string }) => {
      if (clientSelectionWindow && !clientSelectionWindow.isDestroyed()) {
        const parent = clientSelectionWindow.getParentWindow();
        if (parent && !parent.isDestroyed()) parent.webContents.send("shell:client-selected", data);
        clientSelectionWindow.close();
      }
    });

    ipcMain.on("shell:open-new-client", () => {
      const parent = clientSelectionWindow ?? mainWindow;
      if (parent && !parent.isDestroyed()) createNewClientWindow(parent);
    });

    ipcMain.on("shell:client-created", (_event, data: { client: unknown }) => {
      if (data.client && clientSelectionWindow && !clientSelectionWindow.isDestroyed()) {
        clientSelectionWindow.webContents.send("shell:new-client-added", data.client);
      }
      if (newClientWindow && !newClientWindow.isDestroyed()) newClientWindow.close();
    });

    // --- Supplier IPC ---
    ipcMain.on("shell:open-new-supplier", (event) => {
      const sender = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
      if (sender && !sender.isDestroyed()) createNewSupplierWindow(sender);
    });

    ipcMain.on("shell:supplier-created", (_event, data: { supplier: unknown }) => {
      if (newSupplierWindow && !newSupplierWindow.isDestroyed()) {
        const parent = newSupplierWindow.getParentWindow();
        if (parent && !parent.isDestroyed() && data.supplier) {
          parent.webContents.send("shell:new-supplier-added", data.supplier);
        }
        newSupplierWindow.close();
      }
    });

    // --- Form save IPC (close window on save) ---
    ipcMain.on("shell:sale-order-saved", () => { if (newSaleOrderWindow && !newSaleOrderWindow.isDestroyed()) newSaleOrderWindow.close(); });
    ipcMain.on("shell:quote-saved", () => { if (newQuoteWindow && !newQuoteWindow.isDestroyed()) newQuoteWindow.close(); });
    ipcMain.on("shell:invoice-saved", () => { if (newInvoiceWindow && !newInvoiceWindow.isDestroyed()) newInvoiceWindow.close(); });
    ipcMain.on("shell:delivery-note-saved", () => { if (newDeliveryNoteWindow && !newDeliveryNoteWindow.isDestroyed()) newDeliveryNoteWindow.close(); });
    ipcMain.on("shell:receipt-saved", () => { if (newReceiptWindow && !newReceiptWindow.isDestroyed()) newReceiptWindow.close(); });
    ipcMain.on("shell:purchase-order-saved", () => { if (newPurchaseOrderWindow && !newPurchaseOrderWindow.isDestroyed()) newPurchaseOrderWindow.close(); });
    ipcMain.on("shell:goods-receipt-saved", () => { if (newGoodsReceiptWindow && !newGoodsReceiptWindow.isDestroyed()) newGoodsReceiptWindow.close(); });
    ipcMain.on("shell:purchase-invoice-saved", () => { if (newPurchaseInvoiceWindow && !newPurchaseInvoiceWindow.isDestroyed()) newPurchaseInvoiceWindow.close(); });
    ipcMain.on("shell:payment-order-saved", () => { if (newPaymentOrderWindow && !newPaymentOrderWindow.isDestroyed()) newPaymentOrderWindow.close(); });

    app.on("activate", () => {
      if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow();
      else { mainWindow.show(); mainWindow.focus(); }
    });
  });

  app.on("window-all-closed", () => {
    globalShortcut.unregisterAll();
    if (process.platform !== "darwin") app.quit();
  });
}

// ---------------------------------------------------------------------------
// Product selection (modal — launched from within a form)
// ---------------------------------------------------------------------------

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
    title: "Selección de Artículos",
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

  productSelectionWindow.on("closed", () => { productSelectionWindow = null; });
  productSelectionWindow.setMenu(null);
  void productSelectionWindow.loadFile(PRODUCT_SELECTION_FILE);
}

function loadProductsForPicker(): void {
  if (!productSelectionWindow || productSelectionWindow.isDestroyed()) return;
  try {
    const rows = dbAll(
      "SELECT id, code, name, unit, sale_price, iva_pct, category FROM articles WHERE active = 1 ORDER BY name LIMIT 1000",
      [],
    ) as Array<Record<string, unknown>>;
    const mapped = rows.map((a) => ({
      codigo: a.code,
      descripcion: a.name,
      importe: String(a.sale_price ?? "0.00"),
      iva: String(a.iva_pct ?? "21"),
      st: "0",
      compro: "0",
      entr: "0",
      linea: "",
      categoria: a.category ?? "",
    }));
    productSelectionWindow?.webContents.send("product-selection:loaded", mapped);
  } catch {}
}

// ---------------------------------------------------------------------------
// Client selection (modal — launched from within a form)
// ---------------------------------------------------------------------------

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

  clientSelectionWindow.on("closed", () => { clientSelectionWindow = null; });
  clientSelectionWindow.setMenu(null);
  void clientSelectionWindow.loadFile(CLIENT_SELECTION_FILE);
}

function loadClientsForPicker(): void {
  if (!clientSelectionWindow || clientSelectionWindow.isDestroyed()) return;
  try {
    const rows = dbAll(
      "SELECT id, code, business_name, cuit, phone, address FROM clients WHERE active = 1 ORDER BY business_name LIMIT 1000",
      [],
    ) as Array<Record<string, unknown>>;
    const mapped = rows.map((c) => ({
      id: c.id,
      codigo: c.code ?? c.id,
      razonSocial: c.business_name ?? "",
      domicilio: c.address ?? "",
      telefono: c.phone ?? "",
      cuit: c.cuit ?? "",
    }));
    clientSelectionWindow?.webContents.send("client-selection:loaded", mapped);
  } catch {
    clientSelectionWindow?.webContents.send("client-selection:loaded", []);
  }
}

// ---------------------------------------------------------------------------
// Modal form creators (opened from within other forms)
// ---------------------------------------------------------------------------

function createNewArticleWindow(parentWindow: BrowserWindow) {
  if (newArticleWindow && !newArticleWindow.isDestroyed()) { newArticleWindow.focus(); return; }
  newArticleWindow = new BrowserWindow({
    width: 900, height: 600, resizable: true, parent: parentWindow, modal: true,
    show: false, backgroundColor: "#f0f0f0", title: "Artículos — NUEVO", icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE, titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: { preload: path.join(__dirname, "new-article-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  newArticleWindow.once("ready-to-show", () => newArticleWindow?.show());
  newArticleWindow.on("closed", () => { newArticleWindow = null; });
  newArticleWindow.setMenu(null);
  void newArticleWindow.loadFile(NEW_ARTICLE_FILE);
}

function createNewClientWindow(parentWindow: BrowserWindow) {
  if (newClientWindow && !newClientWindow.isDestroyed()) { newClientWindow.focus(); return; }
  newClientWindow = new BrowserWindow({
    width: 920, height: 640, resizable: true, parent: parentWindow, modal: true,
    show: false, backgroundColor: "#f0f0f0", title: "Clientes — NUEVO", icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE, titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: { preload: path.join(__dirname, "new-client-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  newClientWindow.once("ready-to-show", () => newClientWindow?.show());
  newClientWindow.on("closed", () => { newClientWindow = null; });
  newClientWindow.setMenu(null);
  void newClientWindow.loadFile(NEW_CLIENT_FILE);
}

function createNewSupplierWindow(parentWindow: BrowserWindow) {
  if (newSupplierWindow && !newSupplierWindow.isDestroyed()) { newSupplierWindow.focus(); return; }
  newSupplierWindow = new BrowserWindow({
    width: 920, height: 640, resizable: true, parent: parentWindow, modal: true,
    show: false, backgroundColor: "#f0f0f0", title: "Proveedores — NUEVO", icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE, titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: { preload: path.join(__dirname, "new-supplier-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  newSupplierWindow.once("ready-to-show", () => newSupplierWindow?.show());
  newSupplierWindow.on("closed", () => { newSupplierWindow = null; });
  newSupplierWindow.setMenu(null);
  void newSupplierWindow.loadFile(NEW_SUPPLIER_FILE);
}

// ---------------------------------------------------------------------------
// Standalone form creators (opened from menu — non-modal)
// ---------------------------------------------------------------------------

function makeStandaloneForm(
  windowRef: BrowserWindow | null,
  setRef: (w: BrowserWindow | null) => void,
  opts: { width: number; height: number; minWidth?: number; minHeight?: number; bg: string; title: string; preload: string; file: string },
  parent: BrowserWindow | null,
): void {
  if (windowRef && !windowRef.isDestroyed()) { windowRef.focus(); return; }
  const win = new BrowserWindow({
    width: opts.width, height: opts.height,
    minWidth: opts.minWidth, minHeight: opts.minHeight,
    resizable: true, parent: parent ?? undefined, modal: false,
    show: false, backgroundColor: opts.bg, title: opts.title, icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE, titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: { preload: path.join(__dirname, opts.preload), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => setRef(null));
  win.setMenu(null);
  void win.loadFile(opts.file);
  setRef(win);
}

function createNewArticleWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newArticleWindow, (w) => { newArticleWindow = w; }, { width: 920, height: 640, bg: "#f0f0f0", title: "Artículos — NUEVO", preload: "new-article-preload.js", file: NEW_ARTICLE_FILE }, parent);
}

function createNewClientWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newClientWindow, (w) => { newClientWindow = w; }, { width: 920, height: 640, bg: "#f0f0f0", title: "Clientes — NUEVO", preload: "new-client-preload.js", file: NEW_CLIENT_FILE }, parent);
}

function createNewSupplierWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newSupplierWindow, (w) => { newSupplierWindow = w; }, { width: 920, height: 640, bg: "#f0f0f0", title: "Proveedores — NUEVO", preload: "new-supplier-preload.js", file: NEW_SUPPLIER_FILE }, parent);
}

function createNewSaleOrderWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newSaleOrderWindow, (w) => { newSaleOrderWindow = w; }, { width: 1120, height: 740, minWidth: 900, minHeight: 600, bg: "#f0efe8", title: "Pedidos de Venta — NUEVO", preload: "new-sale-order-preload.js", file: NEW_SALE_ORDER_FILE }, parent);
}

function createNewQuoteWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newQuoteWindow, (w) => { newQuoteWindow = w; }, { width: 1120, height: 740, minWidth: 900, minHeight: 600, bg: "#f0efe8", title: "Cotizaciones — NUEVA", preload: "new-quote-preload.js", file: NEW_QUOTE_FILE }, parent);
}

function createNewInvoiceWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newInvoiceWindow, (w) => { newInvoiceWindow = w; }, { width: 1160, height: 780, minWidth: 960, minHeight: 640, bg: "#f0efe8", title: "Facturas de Venta — NUEVA", preload: "new-invoice-preload.js", file: NEW_INVOICE_FILE }, parent);
}

function createNewDeliveryNoteWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newDeliveryNoteWindow, (w) => { newDeliveryNoteWindow = w; }, { width: 1080, height: 720, minWidth: 880, minHeight: 580, bg: "#f0efe8", title: "Remitos — NUEVO", preload: "new-delivery-note-preload.js", file: NEW_DELIVERY_NOTE_FILE }, parent);
}

function createNewReceiptWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newReceiptWindow, (w) => { newReceiptWindow = w; }, { width: 1080, height: 720, minWidth: 860, minHeight: 580, bg: "#f0efe8", title: "Recibos — NUEVO", preload: "new-receipt-preload.js", file: NEW_RECEIPT_FILE }, parent);
}

function createNewPurchaseOrderWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newPurchaseOrderWindow, (w) => { newPurchaseOrderWindow = w; }, { width: 1140, height: 760, minWidth: 900, minHeight: 580, bg: "#f0ede4", title: "Compras — NUEVA ORDEN", preload: "new-purchase-order-preload.js", file: NEW_PURCHASE_ORDER_FILE }, parent);
}

function createNewGoodsReceiptWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newGoodsReceiptWindow, (w) => { newGoodsReceiptWindow = w; }, { width: 1080, height: 720, minWidth: 860, minHeight: 560, bg: "#e4f0ed", title: "Compras — RECEPCIÓN", preload: "new-goods-receipt-preload.js", file: NEW_GOODS_RECEIPT_FILE }, parent);
}

function createNewPurchaseInvoiceWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newPurchaseInvoiceWindow, (w) => { newPurchaseInvoiceWindow = w; }, { width: 1160, height: 780, minWidth: 900, minHeight: 580, bg: "#f5e8ea", title: "Compras — FACTURA PROVEEDOR", preload: "new-purchase-invoice-preload.js", file: NEW_PURCHASE_INVOICE_FILE }, parent);
}

function createNewPaymentOrderWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newPaymentOrderWindow, (w) => { newPaymentOrderWindow = w; }, { width: 1080, height: 720, minWidth: 860, minHeight: 560, bg: "#f5f0e0", title: "Tesorería — ORDEN DE PAGO", preload: "new-payment-order-preload.js", file: NEW_PAYMENT_ORDER_FILE }, parent);
}
