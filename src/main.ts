/**
 * Proceso principal de Asimov ERP.
 *
 * App completamente nativa: todas las pantallas son HTML local con SQLite.
 * No hay carga de servidores remotos, sin partición de sesión web.
 */
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  getWindowBounds,
  setWindowBounds,
  getPrintPreferences,
  type WindowBounds,
} from "./config";
import { registerIpcHandlers } from "./ipc";
import { registerCloudIpcHandlers } from "./ipc-cloud";
import { getStoredUser } from "./api-client";
import { initAutoUpdater, checkForUpdateManual } from "./updater";
import { initTray, isQuitting, syncLaunchAtStartup } from "./tray";
import { initDb, dbAll, dbGet } from "./db";
import { startDolarAutoUpdate, getPricingUsdRate } from "./dolar";
import { authorizeStoredInvoice, retryPendingCae, getAfipConfig } from "./afip-service";
import { isAfipUnavailable } from "./afip/domain";
import { isAirEnabled } from "./air";
import { loadLocalProductsForPicker, type ProductPickerItem } from "./product-picker";
import { persistClientForm, persistSupplierForm, persistArticleForm } from "./masters";
import { getKitComponents } from "./kits";
import { authenticate, seedDefaultAdmin, DEFAULT_ADMIN, type SessionUser } from "./auth";
import {
  persistGoodsReceipt, persistDeliveryNote, persistReceipt, persistPaymentOrder,
  persistPurchaseReceipt,
  persistSaleOrder, persistQuote, persistInvoice, persistPurchaseOrder, persistPurchaseInvoice,
  annulDocument, deleteDocument, enqueueDocSnapshot,
  createCommissionNoteFromInvoice,
} from "./documents";

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------
const SHELL_FILE            = path.join(__dirname, "shell.html");
const LOGIN_FILE            = path.join(__dirname, "login.html");
const APP_ICON_FILE         = path.join(__dirname, "icon.png");
const PRODUCT_SELECTION_FILE = path.join(__dirname, "product-selection.html");
const NEW_ARTICLE_FILE      = path.join(__dirname, "new-article.html");
const CLIENT_SELECTION_FILE = path.join(__dirname, "client-selection.html");
const SUPPLIER_SELECTION_FILE = path.join(__dirname, "supplier-selection.html");
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
const NEW_PURCHASE_RECEIPT_FILE = path.join(__dirname, "new-purchase-receipt.html");

// Custom title bar para ventanas de formularios nativos (tema Asimov: Ink)
const TITLE_BAR_OVERLAY = { color: "#14171D", symbolColor: "#e6e8ea", height: 32 } as const;
const TITLE_BAR_STYLE = "hidden" as const;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let mainWindow: BrowserWindow | null = null;
let loginWindow: BrowserWindow | null = null;
let currentUser: SessionUser | null = null;

type NativeFormType =
  | "article" | "client" | "supplier"
  | "sale-order" | "quote" | "invoice" | "delivery-note" | "receipt"
  | "purchase-order" | "goods-receipt" | "purchase-invoice" | "payment-order" | "purchase-receipt";

let productSelectionWindow: BrowserWindow | null = null;
let newArticleWindow: BrowserWindow | null = null;
let clientSelectionWindow: BrowserWindow | null = null;
let supplierSelectionWindow: BrowserWindow | null = null;
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
let newPurchaseReceiptWindow: BrowserWindow | null = null;

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
    backgroundColor: "#14171D",
    title: "Asimov ERP",
    icon: APP_ICON_FILE,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
// Login (gate de acceso)
// ---------------------------------------------------------------------------

function createLoginWindow(): BrowserWindow {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return loginWindow;
  }
  loginWindow = new BrowserWindow({
    width: 420,
    height: 620,
    resizable: false,
    maximizable: false,
    show: false,
    backgroundColor: "#14171D",
    title: "Asimov — Ingreso",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "login-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  loginWindow.once("ready-to-show", () => {
    loginWindow?.show();
    console.log("[startup] window-ready:login");
  });
  loginWindow.on("closed", () => { loginWindow = null; });
  loginWindow.setMenu(null);
  loginWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void loginWindow.loadFile(LOGIN_FILE);
  return loginWindow;
}

/** Autenticado con éxito: abre el sistema y cierra el login. */
function completeLogin(user: SessionUser): void {
  currentUser = user;
  mainWindow = createMainWindow();
  if (!isDev()) initAutoUpdater();
  if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
}

/** Cierra la sesión: descarta la ventana principal y vuelve al login. */
function logout(): void {
  currentUser = null;
  const previous = mainWindow;
  mainWindow = null;
  createLoginWindow();
  if (previous && !previous.isDestroyed()) previous.destroy();
}

/** Avisa al shell principal que cambió un conjunto de datos, para que refresque la vista activa. */
function notifyShell(channel: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// ---------------------------------------------------------------------------
// Global shortcuts (F2=nuevo, F3=buscar, F5=refrescar, F8=guardar, F9=imprimir)
// ---------------------------------------------------------------------------

function registerGlobalShortcuts(): void {
  // Acciones globales (teclas F). La navegación por módulos (Ctrl+1..9) la
  // maneja el shell en el renderer, para no capturar esas teclas globalmente.
  const shortcuts: Record<string, string> = {
    F1: "help",
    F2: "new",
    F3: "search",
    F4: "dashboard",
    F5: "refresh",
    F8: "save",
    F9: "print",
  };

  for (const [key, action] of Object.entries(shortcuts)) {
    globalShortcut.register(key, () => {
      const focused = BrowserWindow.getFocusedWindow();
      if (!focused) return;
      if (action === "print") {
        const prefs = getPrintPreferences();
        focused.webContents.print(
          { silent: prefs.silentPrint && !!prefs.preferredPrinter, deviceName: prefs.preferredPrinter || undefined, printBackground: true },
          () => {},
        );
        return;
      }
      if (action === "dashboard") {
        focused.webContents.send("shell:navigate", "/dashboard");
        return;
      }
      // help / new / search / refresh / save → los resuelve el renderer.
      focused.webContents.send("shortcut:triggered", action);
    });
  }
}

// ---------------------------------------------------------------------------
// Native form orchestration
// ---------------------------------------------------------------------------

function sendCrmClientPrefill(window: BrowserWindow | null, contextId: string, context?: Record<string, unknown>): void {
  if (!window || window.isDestroyed() || !context?.client) return;
  const send = () => {
    if (!window.isDestroyed()) window.webContents.send("shell:client-selected", { contextId, client: context.client });
  };
  if (window.webContents.isLoadingMainFrame()) window.webContents.once("did-finish-load", send);
  else send();
}

function openArticleForEdit(articleId: string): void {
  const id = String(articleId ?? "").trim();
  if (!id) return;
  const article = dbGet<Record<string, unknown>>("SELECT * FROM articles WHERE id = ?", [id]);
  if (!article) return;
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  createNewArticleWindowStandalone(parent);
  const win = newArticleWindow;
  if (!win || win.isDestroyed()) return;
  const components = Number(article.is_kit) === 1 ? getKitComponents(id) : [];
  const prefill = {
    id,
    code: String(article.code ?? ""),
    name: String(article.name ?? ""),
    sale_price: Number(article.sale_price ?? 0),
    price_usd: Number(article.price_usd ?? 0),
    iva_pct: Number(article.iva_pct ?? 21),
    category: String(article.category ?? ""),
    line: "",  // el schema local no persiste "línea"; el input queda vacío al editar
    components: components.map((c) => ({
      articleId: c.component_article_id,
      code: c.code,
      name: c.name,
      qty: c.qty,
      cost_price: c.cost_price,
      sale_price: c.sale_price,
      source: "local",
    })),
  };
  const send = () => { if (!win.isDestroyed()) win.webContents.send("article-edit:prefill", prefill); };
  if (win.webContents.isLoadingMainFrame()) win.webContents.once("did-finish-load", send);
  else send();
}

function openNativeForm(type: NativeFormType, context?: Record<string, unknown>): void {
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  switch (type) {
    case "article": {
      const editId = String(context?.articleId ?? "").trim();
      if (editId) openArticleForEdit(editId);
      else createNewArticleWindowStandalone(parent);
      break;
    }
    case "client":      createNewClientWindowStandalone(parent); break;
    case "supplier":    createNewSupplierWindowStandalone(parent); break;
    case "sale-order": {
      const existed = !!newSaleOrderWindow && !newSaleOrderWindow.isDestroyed();
      createNewSaleOrderWindowStandalone(parent);
      if (!existed) sendCrmClientPrefill(newSaleOrderWindow, "pedido-cliente", context);
      break;
    }
    case "quote": {
      const existed = !!newQuoteWindow && !newQuoteWindow.isDestroyed();
      createNewQuoteWindowStandalone(parent);
      if (!existed) sendCrmClientPrefill(newQuoteWindow, "cot-cliente", context);
      break;
    }
    case "invoice":     createNewInvoiceWindowStandalone(parent); break;
    case "delivery-note": createNewDeliveryNoteWindowStandalone(parent); break;
    case "receipt":     createNewReceiptWindowStandalone(parent); break;
    case "purchase-order":   createNewPurchaseOrderWindowStandalone(parent); break;
    case "goods-receipt":    createNewGoodsReceiptWindowStandalone(parent); break;
    case "purchase-invoice": createNewPurchaseInvoiceWindowStandalone(parent); break;
    case "payment-order":    createNewPaymentOrderWindowStandalone(parent); break;
    case "purchase-receipt": createNewPurchaseReceiptWindowStandalone(parent); break;
  }
}

function openInvoiceAdjustment(invoiceId: string, kind: "NC" | "ND"):
  { ok: boolean; error?: string } {
  const id = String(invoiceId ?? "").trim();
  if (!id || (kind !== "NC" && kind !== "ND")) return { ok: false, error: "El ajuste fiscal solicitado no es válido." };
  if (newInvoiceWindow && !newInvoiceWindow.isDestroyed()) {
    newInvoiceWindow.focus();
    return { ok: false, error: "Ya hay un formulario de factura abierto. Cerralo antes de crear la nota." };
  }

  const invoice = dbGet<Record<string, unknown>>(
    `SELECT i.*, c.code AS client_code, c.cuit AS client_cuit,
            c.fiscal_type AS client_fiscal_type, c.address AS client_address
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.id = ?`,
    [id],
  );
  if (!invoice) return { ok: false, error: "No se encontró la factura original." };
  if (!String(invoice.cae ?? "").trim()) {
    return { ok: false, error: "La factura todavía no tiene CAE. Podés anularla localmente sin emitir una nota de crédito." };
  }
  const items = dbAll<Record<string, unknown>>(
    `SELECT article_id, code, description, qty, unit_price, iva_pct
       FROM invoice_items WHERE invoice_id = ? ORDER BY rowid`,
    [id],
  );
  const prefill = {
    kind,
    original: { id, number: invoice.number, date: invoice.date, total: invoice.total },
    client: {
      id: invoice.client_id,
      codigo: invoice.client_code,
      razonSocial: invoice.client_name,
      cuit: invoice.client_cuit,
      condicionIva: invoice.client_fiscal_type,
      domicilio: invoice.client_address,
    },
    items,
    usdRate: invoice.usd_rate,
  };

  createNewInvoiceWindowStandalone(mainWindow && !mainWindow.isDestroyed() ? mainWindow : null);
  const win = newInvoiceWindow;
  if (!win || win.isDestroyed()) return { ok: false, error: "No se pudo abrir el formulario del ajuste fiscal." };
  const sendPrefill = () => {
    if (!win.isDestroyed()) win.webContents.send("invoice-adjustment:prefill", prefill);
  };
  if (win.webContents.isLoadingMainFrame()) win.webContents.once("did-finish-load", sendPrefill);
  else sendPrefill();
  return { ok: true };
}

function openInvoiceForEdit(invoiceId: string): { ok: boolean; error?: string } {
  const id = String(invoiceId ?? "").trim();
  if (!id) return { ok: false, error: "La factura solicitada no es válida." };
  if (String(currentUser?.role ?? "").toLowerCase() === "readonly") {
    return { ok: false, error: "No tenés permisos para editar facturas." };
  }
  if (newInvoiceWindow && !newInvoiceWindow.isDestroyed()) {
    newInvoiceWindow.focus();
    return { ok: false, error: "Ya hay un formulario de factura abierto. Cerralo antes de editar este comprobante." };
  }

  const invoice = dbGet<Record<string, unknown>>(
    `SELECT i.*, c.code AS client_code, c.cuit AS client_cuit,
            c.fiscal_type AS client_fiscal_type, c.address AS client_address
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.id = ?`,
    [id],
  );
  if (!invoice) return { ok: false, error: "No se encontró la factura." };
  if (String(invoice.cae ?? "").trim()) {
    return { ok: false, error: "La factura ya tiene CAE y no puede editarse. Corregila mediante una nota fiscal." };
  }
  if (/anul|cancel/i.test(String(invoice.status ?? ""))) {
    return { ok: false, error: "La factura está anulada y no puede editarse." };
  }

  const items = dbAll<Record<string, unknown>>(
    `SELECT article_id, code, description, qty, unit_price, iva_pct
       FROM invoice_items WHERE invoice_id = ? ORDER BY rowid`,
    [id],
  );
  const prefill = {
    invoice,
    client: {
      id: invoice.client_id,
      codigo: invoice.client_code,
      razonSocial: invoice.client_name,
      cuit: invoice.client_cuit,
      condicionIva: invoice.client_fiscal_type,
      domicilio: invoice.client_address,
    },
    items,
  };

  createNewInvoiceWindowStandalone(mainWindow && !mainWindow.isDestroyed() ? mainWindow : null);
  const win = newInvoiceWindow;
  if (!win || win.isDestroyed()) return { ok: false, error: "No se pudo abrir el editor de la factura." };
  const sendPrefill = () => {
    if (!win.isDestroyed()) win.webContents.send("invoice-edit:prefill", prefill);
  };
  if (win.webContents.isLoadingMainFrame()) win.webContents.once("did-finish-load", sendPrefill);
  else sendPrefill();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Single-instance lock
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : loginWindow;
    if (w && !w.isDestroyed()) {
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
    }
  });

  app.whenReady().then(() => {
    initDb();

    registerIpcHandlers({ getMainWindow, getCurrentUser: () => currentUser });
    // Cloud + sync (v2): IPC handlers para login contra la API de Render,
    // cola de sync offline-first y actualización automática casi en tiempo real.
    registerCloudIpcHandlers((channel, payload) => notifyShell(channel, payload));

    // Cotización del dólar: fetch inmediato + cada 30 min; se difunde a todas
    // las ventanas para el widget del status bar y la vista Dólar.
    startDolarAutoUpdate((rates) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send("dolar:updated", rates);
      }
    });

    // Facturas que quedaron "pendiente de CAE" por falta de conexión: reintento
    // al arrancar (con margen para que la red esté lista) y luego cada 10 min.
    const retryCae = async () => {
      try {
        if (!getAfipConfig().enabled) return;
        const r = await retryPendingCae();
        if (r.authorized > 0) notifyShell("shell:invoice-saved");
      } catch (err) {
        console.error("[afip] reintento de CAE pendientes falló:", err);
      }
    };
    setTimeout(retryCae, 20_000);
    setInterval(retryCae, 10 * 60_000);
    // Sin barra de menú superior: la navegación vive en el sidebar del shell.
    Menu.setApplicationMenu(null);
    registerGlobalShortcuts();
    syncLaunchAtStartup();
    initTray({ getMainWindow });

    // Primer arranque: siembra un admin con contraseña ALEATORIA (no hardcodeada)
    // y la muestra/guarda una única vez para que el operador ingrese y la cambie.
    const initialAdminPassword = seedDefaultAdmin();
    if (initialAdminPassword) {
      let credPath = "";
      try {
        credPath = path.join(app.getPath("userData"), "CREDENCIALES-INICIALES.txt");
        fs.writeFileSync(
          credPath,
          `Asimov — credenciales iniciales del administrador\n\n` +
            `Usuario: admin  (o ${DEFAULT_ADMIN.email})\n` +
            `Contraseña: ${initialAdminPassword}\n\n` +
            `IMPORTANTE: cambiá esta contraseña desde Usuarios apenas ingreses y borrá este archivo.\n`,
          "utf8",
        );
      } catch { /* best-effort */ }
      if (process.env.ASIMOV_SMOKE_TEST !== "1") {
        try {
          dialog.showMessageBoxSync({
            type: "info",
            title: "Asimov — Primer acceso",
            message: "Se creó el usuario administrador.",
            detail:
              `Usuario: admin  (${DEFAULT_ADMIN.email})\n` +
              `Contraseña: ${initialAdminPassword}\n\n` +
              `Guardala y cambiala desde Usuarios apenas ingreses.` +
              (credPath ? `\nTambién quedó en:\n${credPath}` : ""),
          });
        } catch { /* best-effort */ }
      }
    }

    // --- Autenticación (gate de acceso) ---
    ipcMain.handle("auth:login", (_event, creds: { username?: string; password?: string }) => {
      const user = authenticate(String(creds?.username ?? ""), String(creds?.password ?? ""));
      if (!user) return { ok: false, error: "Usuario o contraseña incorrectos." };
      completeLogin(user);
      return { ok: true };
    });
    ipcMain.handle("auth:current", () => currentUser);
    ipcMain.on("auth:logout", () => logout());

    // Login vía nube (v2): tras cloud:login OK, la ventana de login llama
    // acá para que el main abra el shell principal, igual que auth:login.
    ipcMain.handle("cloud:complete-login", () => {
      // Cargamos los datos del store para armar el SessionUser equivalente.
      // getStoredUser() devuelve { userId, email, name, role, tenantId }.
      try {
        const stored = getStoredUser();
        if (!stored) return { ok: false };
        completeLogin({
          id: stored.userId,
          name: stored.name,
          email: stored.email,
          role: stored.role,
        });
        return { ok: true };
      } catch {
        return { ok: false };
      }
    });

    // Arranca en el login; la ventana principal se crea al autenticar.
    createLoginWindow();

    // --- Shell "Nuevo" buttons → abrir formularios nativos ---
    ipcMain.on("shell:open-form", (_event, input: NativeFormType | { type?: NativeFormType; context?: Record<string, unknown> }) => {
      if (typeof input === "string") openNativeForm(input);
      else if (input?.type) openNativeForm(input.type, input.context);
    });
    ipcMain.handle("shell:open-invoice-adjustment", (_event, input: { invoiceId?: string; kind?: string }) =>
      openInvoiceAdjustment(
        String(input?.invoiceId ?? ""),
        String(input?.kind ?? "").toUpperCase() as "NC" | "ND",
      ));
    ipcMain.handle("shell:open-invoice-edit", (_event, invoiceId: string) =>
      openInvoiceForEdit(invoiceId));

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
      if (data.article) {
        try {
          persistArticleForm(data.article as Record<string, unknown>);
          notifyShell("shell:articles-changed");
        } catch (err) {
          console.error("[articles] no se pudo guardar:", err);
        }
      }
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
      if (data.client) {
        try {
          persistClientForm(data.client as Record<string, unknown>);
          // Refrescar la lista del shell y el picker de clientes si están abiertos.
          notifyShell("shell:clients-changed");
          if (clientSelectionWindow && !clientSelectionWindow.isDestroyed()) {
            clientSelectionWindow.webContents.send("shell:new-client-added", data.client);
            loadClientsForPicker();
          }
        } catch (err) {
          console.error("[clients] no se pudo guardar:", err);
        }
      }
      if (newClientWindow && !newClientWindow.isDestroyed()) newClientWindow.close();
    });

    // --- Supplier picker IPC ---
    ipcMain.on("shell:open-supplier-selection", (event, data: { contextId: string }) => {
      const sender = BrowserWindow.fromWebContents(event.sender);
      if (sender) createSupplierSelectionWindow(sender, data?.contextId || "");
    });

    ipcMain.on("shell:supplier-selected-forward", (_event, data: { supplier: Record<string, unknown> | null; contextId: string }) => {
      if (supplierSelectionWindow && !supplierSelectionWindow.isDestroyed()) {
        const parent = supplierSelectionWindow.getParentWindow();
        if (parent && !parent.isDestroyed()) {
          const s = data.supplier;
          parent.webContents.send("shell:supplier-selected", {
            id: s?.id ?? "",
            nombre: s?.razonSocial ?? s?.name ?? "",
            cuit: s?.cuit ?? "",
            condIva: s?.condIva ?? "",
            contextId: data.contextId,
          });
        }
        supplierSelectionWindow.close();
      }
    });

    // --- Supplier IPC ---
    ipcMain.on("shell:open-new-supplier", (event) => {
      const sender = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
      if (sender && !sender.isDestroyed()) createNewSupplierWindow(sender);
    });

    ipcMain.on("shell:supplier-created", (_event, data: { supplier: unknown }) => {
      if (data.supplier) {
        try {
          persistSupplierForm(data.supplier as Record<string, unknown>);
          notifyShell("shell:suppliers-changed");
          if (supplierSelectionWindow && !supplierSelectionWindow.isDestroyed()) {
            supplierSelectionWindow.webContents.send("shell:new-supplier-added", data.supplier);
            loadSuppliersForPicker();
          }
        } catch (err) {
          console.error("[suppliers] no se pudo guardar:", err);
        }
      }
      if (newSupplierWindow && !newSupplierWindow.isDestroyed()) {
        const parent = newSupplierWindow.getParentWindow();
        if (parent && !parent.isDestroyed() && data.supplier) {
          parent.webContents.send("shell:new-supplier-added", data.supplier);
        }
        newSupplierWindow.close();
      }
    });

    // --- Form save IPC (close window on save) ---
    ipcMain.on("shell:sale-order-saved", (_event, data: { order?: unknown }) => {
      if (data && data.order) {
        try { persistSaleOrder(data.order as Record<string, unknown>); notifyShell("shell:sale-order-saved"); }
        catch (err) { console.error("[sale-order] no se pudo guardar:", err); }
      }
      if (newSaleOrderWindow && !newSaleOrderWindow.isDestroyed()) newSaleOrderWindow.close();
    });
    ipcMain.on("shell:quote-saved", (_event, data: { quote?: unknown }) => {
      if (data && data.quote) {
        try { persistQuote(data.quote as Record<string, unknown>); notifyShell("shell:quote-saved"); }
        catch (err) { console.error("[quote] no se pudo guardar:", err); }
      }
      if (newQuoteWindow && !newQuoteWindow.isDestroyed()) newQuoteWindow.close();
    });
    ipcMain.on("shell:invoice-saved", (_event, data: { invoice?: unknown }) => {
      if (data && data.invoice) {
        try { persistInvoice(data.invoice as Record<string, unknown>); notifyShell("shell:invoice-saved"); }
        catch (err) { console.error("[invoice] no se pudo guardar:", err); }
      }
      if (newInvoiceWindow && !newInvoiceWindow.isDestroyed()) newInvoiceWindow.close();
    });
    // Autorizar en AFIP desde el formulario: persiste la factura y pide el CAE en
    // un solo paso, sin cerrar la ventana (para que el operador imprima con CAE).
    ipcMain.handle("shell:invoice-authorize", async (_event, data: { invoice?: Record<string, unknown> }) => {
      if (!["admin", "owner", "superadmin"].includes(String(currentUser?.role ?? "").toLowerCase())) {
        return { ok: false, error: "Solo un administrador puede autorizar comprobantes en ARCA." };
      }
      const invoice = data?.invoice;
      if (!invoice) return { ok: false, error: "Sin datos de factura." };
      let invoiceId = "";
      let invoiceNumber = "";
      try {
        const { id, number } = persistInvoice(invoice as Record<string, unknown>);
        invoiceId = id;
        invoiceNumber = number;
        const result = await authorizeStoredInvoice(id);
        enqueueDocSnapshot("invoice", id);
        notifyShell("shell:invoice-saved");
        return { ok: true, data: result };
      } catch (err) {
        // Sin conexión con AFIP: la factura ya quedó guardada; se marca
        // "pendiente de CAE" y se reintenta automáticamente al recuperar red.
        if (invoiceId && isAfipUnavailable(err)) {
          enqueueDocSnapshot("invoice", invoiceId);
          notifyShell("shell:invoice-saved");
          return {
            ok: false,
            pending: true,
            invoiceId,
            number: invoiceNumber,
            error: "No hay conexión con AFIP. La factura quedó guardada como \"pendiente de CAE\" y se autorizará automáticamente cuando vuelva la conexión.",
          };
        }
        if (invoiceId) enqueueDocSnapshot("invoice", invoiceId);
        return {
          ok: false,
          invoiceId: invoiceId || undefined,
          number: invoiceNumber || undefined,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });
    ipcMain.on("shell:delivery-note-saved", (_event, data: { delivery?: unknown }) => {
      if (data && data.delivery) {
        try {
          persistDeliveryNote(data.delivery as Record<string, unknown>);
          notifyShell("shell:delivery-note-saved");
          notifyShell("shell:articles-changed");
        } catch (err) {
          console.error("[delivery-note] no se pudo guardar:", err);
        }
      }
      if (newDeliveryNoteWindow && !newDeliveryNoteWindow.isDestroyed()) newDeliveryNoteWindow.close();
    });
    ipcMain.on("shell:receipt-saved", (_event, data: { receipt?: unknown }) => {
      if (data && data.receipt) {
        try {
          persistReceipt(data.receipt as Record<string, unknown>);
          notifyShell("shell:receipt-saved");
        } catch (err) {
          console.error("[receipt] no se pudo guardar:", err);
        }
      }
      if (newReceiptWindow && !newReceiptWindow.isDestroyed()) newReceiptWindow.close();
    });
    ipcMain.on("shell:purchase-order-saved", (_event, data: { order?: unknown }) => {
      if (data && data.order) {
        try { persistPurchaseOrder(data.order as Record<string, unknown>); notifyShell("shell:purchase-order-saved"); }
        catch (err) { console.error("[purchase-order] no se pudo guardar:", err); }
      }
      if (newPurchaseOrderWindow && !newPurchaseOrderWindow.isDestroyed()) newPurchaseOrderWindow.close();
    });
    ipcMain.on("shell:goods-receipt-saved", (_event, data: { receipt?: unknown }) => {
      if (data && data.receipt) {
        try {
          persistGoodsReceipt(data.receipt as Record<string, unknown>);
          // Refresca la lista de recepciones y las vistas de stock/dashboard.
          notifyShell("shell:goods-receipt-saved");
          notifyShell("shell:articles-changed");
        } catch (err) {
          console.error("[goods-receipt] no se pudo guardar:", err);
        }
      }
      if (newGoodsReceiptWindow && !newGoodsReceiptWindow.isDestroyed()) newGoodsReceiptWindow.close();
    });
    ipcMain.on("shell:purchase-invoice-saved", (_event, data: { invoice?: unknown }) => {
      if (data && data.invoice) {
        try { persistPurchaseInvoice(data.invoice as Record<string, unknown>); notifyShell("shell:purchase-invoice-saved"); }
        catch (err) { console.error("[purchase-invoice] no se pudo guardar:", err); }
      }
      if (newPurchaseInvoiceWindow && !newPurchaseInvoiceWindow.isDestroyed()) newPurchaseInvoiceWindow.close();
    });
    ipcMain.on("shell:payment-order-saved", (_event, data: { order?: unknown }) => {
      if (data && data.order) {
        try {
          persistPaymentOrder(data.order as Record<string, unknown>);
          notifyShell("shell:payment-order-saved");
        } catch (err) {
          console.error("[payment-order] no se pudo guardar:", err);
        }
      }
      if (newPaymentOrderWindow && !newPaymentOrderWindow.isDestroyed()) newPaymentOrderWindow.close();
    });
    ipcMain.on("shell:purchase-receipt-saved", (_event, data: { receipt?: unknown }) => {
      if (data && data.receipt) {
        try {
          persistPurchaseReceipt(data.receipt as Record<string, unknown>);
          notifyShell("shell:purchase-receipt-saved");
        } catch (err) {
          console.error("[purchase-receipt] no se pudo guardar:", err);
        }
      }
      if (newPurchaseReceiptWindow && !newPurchaseReceiptWindow.isDestroyed()) newPurchaseReceiptWindow.close();
    });

    // --- Crear una nota de comisión (costo de sobrefacturación) desde factura ---
    ipcMain.handle("shell:commission-note:create", (_event, payload: {
      invoiceId?: string; clienteId?: string; clienteNombre?: string; ratePct?: number; observaciones?: string;
    }) => {
      if (currentUser?.role === "readonly") {
        return { ok: false, error: "No tenés permisos para crear notas de comisión." };
      }
      try {
        const result = createCommissionNoteFromInvoice({
          invoiceId: String(payload?.invoiceId ?? ""),
          clienteId: payload?.clienteId ? String(payload.clienteId) : undefined,
          clienteNombre: String(payload?.clienteNombre ?? ""),
          ratePct: typeof payload?.ratePct === "number" ? payload.ratePct : Number(payload?.ratePct),
          observaciones: payload?.observaciones ? String(payload.observaciones) : undefined,
        });
        if (result.ok) notifyShell("shell:articles-changed");
        return result;
      } catch (err) {
        console.error("[commission-note] no se pudo crear:", err);
        return { ok: false, error: err instanceof Error ? err.message : "Error al crear la nota." };
      }
    });

    // --- Borrar físicamente un documento (solo anulados/rechazados/sin CAE) ---
    ipcMain.handle("shell:document-delete", (_event, payload: { type?: string; id?: string }) => {
      if (currentUser?.role === "readonly") {
        return { ok: false, error: "No tenés permisos para borrar documentos." };
      }
      try {
        const result = deleteDocument(String(payload?.type ?? ""), String(payload?.id ?? ""));
        if (result.ok) notifyShell("shell:articles-changed");
        return result;
      } catch (err) {
        console.error("[delete] no se pudo borrar:", err);
        return { ok: false, error: err instanceof Error ? err.message : "Error al borrar." };
      }
    });

    // --- Anular un documento ya confirmado desde la lista (reversa explícita) ---
    ipcMain.handle("shell:document-annul", (_event, payload: { type?: string; id?: string }) => {
      // Un usuario de solo lectura no puede anular documentos.
      if (currentUser?.role === "readonly") {
        return { ok: false, error: "No tenés permisos para anular documentos." };
      }
      try {
        const result = annulDocument(String(payload?.type ?? ""), String(payload?.id ?? ""));
        if (result.ok) {
          // Refresca la lista del documento y las vistas de efectos (stock/caja).
          notifyShell("shell:articles-changed");
        }
        return result;
      } catch (err) {
        console.error("[annul] no se pudo anular:", err);
        return { ok: false, error: err instanceof Error ? err.message : "Error al anular." };
      }
    });

    app.on("activate", () => {
      if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); return; }
      // Sin sesión activa no se recrea el sistema: se vuelve al login.
      if (currentUser) mainWindow = createMainWindow();
      else createLoginWindow();
    });
  }).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[startup] Asimov no pudo iniciar:", error);
    dialog.showErrorBox(
      "Asimov no pudo iniciar",
      `No se pudo preparar la base de datos local.\n\n${detail}\n\nLa aplicación se cerrará sin modificar tus comprobantes.`,
    );
    app.quit();
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
    backgroundColor: "#14171D",
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
    const mapped: ProductPickerItem[] = loadLocalProductsForPicker();

    if (isAirEnabled()) {
      // Los productos de AIR vienen con precio en USD. Se convierten a ARS con la
      // cotización del dólar oficial (venta) ANTES de mandarlos al picker, para
      // que cualquier documento (venta o compra) reciba precios en pesos y no
      // haga falta acordarse de cambiar la moneda. Si no hay cotización todavía
      // (sync sin correr), se dejan en USD y se marcan como tales.
      const usdRate = getPricingUsdRate();
      // Sin tope real: el catálogo completo de AIR ronda 7500+ productos y un
      // LIMIT menor dejaría afuera artículos (p.ej. las notebooks) del picker.
      const airRows = dbAll(
        `SELECT air_code, description, part_number, brand, category, price_usd, iva_pct, stock
         FROM air_products ap
         WHERE active = 1
           AND NOT EXISTS (SELECT 1 FROM articles a WHERE a.active = 1 AND a.code = ap.air_code)
         ORDER BY description LIMIT 20000`,
        [],
      ) as Array<Record<string, unknown>>;
      for (const a of airRows) {
        const priceUsd = Number(a.price_usd) || 0;
        const converted = usdRate > 0;
        const priceArs = converted ? Math.round(priceUsd * usdRate * 100) / 100 : priceUsd;
        mapped.push({
          codigo: String(a.air_code ?? ""),
          descripcion: String(a.description ?? ""),
          unidad: "UN",
          costo: String(priceArs.toFixed(2)),
          importe: String(priceArs.toFixed(2)),
          iva: String(a.iva_pct ?? "21"),
          esquema: false,
          st: String(a.stock ?? "0"),
          compro: "0",
          entr: "0",
          linea: String(a.brand ?? ""),
          categoria: String(a.category ?? ""),
          source: "air",
          // Si se pudo convertir, la lista queda en ARS; si no, sigue en USD y el
          // picker lo muestra para que el operador sepa que falta la cotización.
          moneda: converted ? "ARS" : "USD",
          precioUsd: priceUsd,
          usdRate: converted ? usdRate : 0,
        });
      }
    }

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
    backgroundColor: "#14171D",
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
// Supplier selection (modal — launched from within a form)
// ---------------------------------------------------------------------------

function createSupplierSelectionWindow(parentWindow: BrowserWindow, contextId: string) {
  if (supplierSelectionWindow && !supplierSelectionWindow.isDestroyed()) {
    supplierSelectionWindow.focus();
    return;
  }

  supplierSelectionWindow = new BrowserWindow({
    width: 860,
    height: 540,
    resizable: true,
    parent: parentWindow,
    modal: true,
    show: false,
    backgroundColor: "#14171D",
    title: "Selección de Proveedores",
    icon: APP_ICON_FILE,
    titleBarStyle: TITLE_BAR_STYLE,
    titleBarOverlay: TITLE_BAR_OVERLAY,
    webPreferences: {
      preload: path.join(__dirname, "supplier-selection-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  supplierSelectionWindow.once("ready-to-show", () => {
    supplierSelectionWindow?.show();
    supplierSelectionWindow?.webContents.send("supplier-selection:init", { contextId });
    loadSuppliersForPicker();
  });

  supplierSelectionWindow.on("closed", () => { supplierSelectionWindow = null; });
  supplierSelectionWindow.setMenu(null);
  void supplierSelectionWindow.loadFile(SUPPLIER_SELECTION_FILE);
}

function loadSuppliersForPicker(): void {
  if (!supplierSelectionWindow || supplierSelectionWindow.isDestroyed()) return;
  try {
    const rows = dbAll(
      "SELECT id, code, business_name, cuit, phone, address FROM suppliers WHERE active = 1 ORDER BY business_name LIMIT 1000",
      [],
    ) as Array<Record<string, unknown>>;
    const mapped = rows.map((s) => ({
      id: s.id,
      codigo: s.code ?? s.id,
      razonSocial: s.business_name ?? "",
      domicilio: s.address ?? "",
      telefono: s.phone ?? "",
      cuit: s.cuit ?? "",
      condIva: "",
    }));
    supplierSelectionWindow?.webContents.send("supplier-selection:loaded", mapped);
  } catch {
    supplierSelectionWindow?.webContents.send("supplier-selection:loaded", []);
  }
}

// ---------------------------------------------------------------------------
// Modal form creators (opened from within other forms)
// ---------------------------------------------------------------------------

function createNewArticleWindow(parentWindow: BrowserWindow) {
  if (newArticleWindow && !newArticleWindow.isDestroyed()) { newArticleWindow.focus(); return; }
  newArticleWindow = new BrowserWindow({
    width: 900, height: 600, resizable: true, parent: parentWindow, modal: true,
    show: false, backgroundColor: "#14171D", title: "Artículos — NUEVO", icon: APP_ICON_FILE,
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
    show: false, backgroundColor: "#14171D", title: "Clientes — NUEVO", icon: APP_ICON_FILE,
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
    show: false, backgroundColor: "#14171D", title: "Proveedores — NUEVO", icon: APP_ICON_FILE,
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
  makeStandaloneForm(newSaleOrderWindow, (w) => { newSaleOrderWindow = w; }, { width: 1120, height: 740, minWidth: 900, minHeight: 600, bg: "#14171D", title: "Pedidos de Venta — NUEVO", preload: "new-sale-order-preload.js", file: NEW_SALE_ORDER_FILE }, parent);
}

function createNewQuoteWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newQuoteWindow, (w) => { newQuoteWindow = w; }, { width: 1120, height: 740, minWidth: 900, minHeight: 600, bg: "#14171D", title: "Cotizaciones — NUEVA", preload: "new-quote-preload.js", file: NEW_QUOTE_FILE }, parent);
}

function createNewInvoiceWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newInvoiceWindow, (w) => { newInvoiceWindow = w; }, { width: 1160, height: 780, minWidth: 960, minHeight: 640, bg: "#14171D", title: "Facturas de Venta — NUEVA", preload: "new-invoice-preload.js", file: NEW_INVOICE_FILE }, parent);
}

function createNewDeliveryNoteWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newDeliveryNoteWindow, (w) => { newDeliveryNoteWindow = w; }, { width: 1080, height: 720, minWidth: 880, minHeight: 580, bg: "#14171D", title: "Remitos — NUEVO", preload: "new-delivery-note-preload.js", file: NEW_DELIVERY_NOTE_FILE }, parent);
}

function createNewReceiptWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newReceiptWindow, (w) => { newReceiptWindow = w; }, { width: 1080, height: 720, minWidth: 860, minHeight: 580, bg: "#14171D", title: "Recibos — NUEVO", preload: "new-receipt-preload.js", file: NEW_RECEIPT_FILE }, parent);
}

function createNewPurchaseOrderWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newPurchaseOrderWindow, (w) => { newPurchaseOrderWindow = w; }, { width: 1140, height: 760, minWidth: 900, minHeight: 580, bg: "#14171D", title: "Compras — NUEVA ORDEN", preload: "new-purchase-order-preload.js", file: NEW_PURCHASE_ORDER_FILE }, parent);
}

function createNewGoodsReceiptWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newGoodsReceiptWindow, (w) => { newGoodsReceiptWindow = w; }, { width: 1080, height: 720, minWidth: 860, minHeight: 560, bg: "#14171D", title: "Compras — REMITO DE COMPRA", preload: "new-goods-receipt-preload.js", file: NEW_GOODS_RECEIPT_FILE }, parent);
}

function createNewPurchaseInvoiceWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newPurchaseInvoiceWindow, (w) => { newPurchaseInvoiceWindow = w; }, { width: 1160, height: 780, minWidth: 900, minHeight: 580, bg: "#14171D", title: "Compras — FACTURA DE COMPRA", preload: "new-purchase-invoice-preload.js", file: NEW_PURCHASE_INVOICE_FILE }, parent);
}

function createNewPaymentOrderWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newPaymentOrderWindow, (w) => { newPaymentOrderWindow = w; }, { width: 1080, height: 720, minWidth: 860, minHeight: 560, bg: "#14171D", title: "Tesorería — ORDEN DE PAGO", preload: "new-payment-order-preload.js", file: NEW_PAYMENT_ORDER_FILE }, parent);
}

function createNewPurchaseReceiptWindowStandalone(parent: BrowserWindow | null): void {
  makeStandaloneForm(newPurchaseReceiptWindow, (w) => { newPurchaseReceiptWindow = w; }, { width: 1080, height: 720, minWidth: 860, minHeight: 580, bg: "#14171D", title: "Compras — RECIBO NUEVO", preload: "new-purchase-receipt-preload.js", file: NEW_PURCHASE_RECEIPT_FILE }, parent);
}
