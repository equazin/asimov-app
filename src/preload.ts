/**
 * Preload de la ventana principal (shell.html).
 * Expone window.asimov con métodos de DB, print, notificaciones y shell.
 */
import { ipcRenderer } from "electron";

// --- types ---------------------------------------------------------------

interface PrintOptions { silent?: boolean; deviceName?: string; usePreferred?: boolean; }
interface NotifyPayload { title?: string; body?: string; }
interface ShellBackground { type: "default" | "color" | "image"; value: string; }
interface BookmarkEntry { id: string; title: string; path: string; createdAt: number; }
interface ShellPreferences { background: ShellBackground; bookmarks: BookmarkEntry[]; }

// --- helpers ------------------------------------------------------------

function applyBackground(bg: ShellBackground): void {
  const b = document.body;
  b.removeAttribute("style");
  if (bg.type === "color") { b.style.background = bg.value; return; }
  if (bg.type === "image") {
    b.style.backgroundImage = `url("${bg.value}")`;
    b.style.backgroundSize = "cover";
    b.style.backgroundAttachment = "fixed";
  }
}

// --- API exposed to renderer --------------------------------------------

let _version = "";
ipcRenderer.invoke("app:version").then((v: string) => { _version = v; }).catch(() => {});

const api = {
  isDesktop: true as const,
  get version() { return _version; },

  // Navigation (shell-internal)
  onNavigate: (cb: (path: string) => void) => {
    ipcRenderer.on("shell:navigate", (_e, path: string) => cb(path));
  },

  // Shell events
  onShortcut: (cb: (action: string) => void) => {
    ipcRenderer.on("shortcut:triggered", (_e, action: string) => cb(action));
  },
  onToggleBookmarks: (cb: () => void) => {
    ipcRenderer.on("shell:toggle-bookmarks", () => cb());
  },
  onBookmarksChanged: (cb: (list: BookmarkEntry[]) => void) => {
    ipcRenderer.on("shell:bookmarks:changed", (_e, list: BookmarkEntry[]) => cb(list));
  },
  onBackgroundChanged: (cb: (bg: ShellBackground) => void) => {
    ipcRenderer.on("shell:background:changed", (_e, bg: ShellBackground) => cb(bg));
  },

  // Form result events (para refrescar listas después de guardar)
  onFormSaved: (channel: string, cb: () => void) => {
    ipcRenderer.on(channel, () => cb());
  },

  // App
  getLaunchAtStartup: () => ipcRenderer.invoke("app:launch-at-startup:get") as Promise<boolean>,
  setLaunchAtStartup: (v: boolean) => ipcRenderer.invoke("app:launch-at-startup:set", v),

  // Print
  print: (opts?: PrintOptions) => ipcRenderer.invoke("print:current", opts ?? {}),
  printDirect: () => ipcRenderer.invoke("print:current", { usePreferred: true }),
  listPrinters: () => ipcRenderer.invoke("print:list"),
  printPreferences: {
    get: () => ipcRenderer.invoke("print:preferred:get"),
    setPrinter: (name: string) => ipcRenderer.invoke("print:preferred:set", name),
    setSilent: (silent: boolean) => ipcRenderer.invoke("print:silent:set", silent),
  },

  // Notify
  notify: (payload: NotifyPayload) => ipcRenderer.invoke("notify:show", payload),

  // Shell prefs
  shell: {
    getPreferences: () => ipcRenderer.invoke("shell:prefs:get") as Promise<ShellPreferences>,
    setBackground: (bg: ShellBackground) => ipcRenderer.invoke("shell:background:set", bg),
    listBookmarks: () => ipcRenderer.invoke("shell:bookmark:list") as Promise<BookmarkEntry[]>,
    addBookmark: (title: string, path: string) => ipcRenderer.invoke("shell:bookmark:add", { title, path }) as Promise<BookmarkEntry[]>,
    removeBookmark: (id: string) => ipcRenderer.invoke("shell:bookmark:remove", id) as Promise<BookmarkEntry[]>,
  },

  // DB — KPIs
  kpis: () => ipcRenderer.invoke("db:kpis"),

  // DB — Clientes
  clients: {
    list: (search = "") => ipcRenderer.invoke("db:clients:list", search),
    get: (id: string) => ipcRenderer.invoke("db:clients:get", id),
    save: (row: unknown) => ipcRenderer.invoke("db:clients:save", row),
    del: (id: string) => ipcRenderer.invoke("db:clients:delete", id),
  },

  // DB — Proveedores
  suppliers: {
    list: (search = "") => ipcRenderer.invoke("db:suppliers:list", search),
    get: (id: string) => ipcRenderer.invoke("db:suppliers:get", id),
    save: (row: unknown) => ipcRenderer.invoke("db:suppliers:save", row),
    del: (id: string) => ipcRenderer.invoke("db:suppliers:delete", id),
  },

  // DB — Artículos
  articles: {
    list: (search = "") => ipcRenderer.invoke("db:articles:list", search),
    get: (id: string) => ipcRenderer.invoke("db:articles:get", id),
    save: (row: unknown) => ipcRenderer.invoke("db:articles:save", row),
    del: (id: string) => ipcRenderer.invoke("db:articles:delete", id),
  },

  // DB — Ventas
  saleOrders: {
    list: (search = "") => ipcRenderer.invoke("db:sale-orders:list", search),
    get: (id: string) => ipcRenderer.invoke("db:sale-orders:get", id),
    save: (row: unknown) => ipcRenderer.invoke("db:sale-orders:save", row),
  },
  quotes: {
    list: (search = "") => ipcRenderer.invoke("db:quotes:list", search),
  },
  invoices: {
    list: (search = "") => ipcRenderer.invoke("db:invoices:list", search),
    get: (id: string) => ipcRenderer.invoke("db:invoices:get", id),
    save: (row: unknown) => ipcRenderer.invoke("db:invoices:save", row),
  },
  deliveryNotes: {
    list: (search = "") => ipcRenderer.invoke("db:delivery-notes:list", search),
  },
  receipts: {
    list: (search = "") => ipcRenderer.invoke("db:receipts:list", search),
  },

  // DB — Compras
  purchaseOrders: {
    list: (search = "") => ipcRenderer.invoke("db:purchase-orders:list", search),
  },
  goodsReceipts: {
    list: (search = "") => ipcRenderer.invoke("db:goods-receipts:list", search),
  },
  purchaseInvoices: {
    list: (search = "") => ipcRenderer.invoke("db:purchase-invoices:list", search),
  },
  paymentOrders: {
    list: (search = "") => ipcRenderer.invoke("db:payment-orders:list", search),
  },

  // DB — Stock
  stock: {
    list: (search = "") => ipcRenderer.invoke("db:stock:list", search),
  },
  stockMovements: {
    list: (search = "") => ipcRenderer.invoke("db:stock-movements:list", search),
  },
  warehouses: {
    list: () => ipcRenderer.invoke("db:warehouses:list"),
    save: (row: unknown) => ipcRenderer.invoke("db:warehouses:save", row),
  },
  serialNumbers: {
    list: (search = "") => ipcRenderer.invoke("db:serial-numbers:list", search),
  },
  stockAlerts: {
    list: () => ipcRenderer.invoke("db:alerts:stock"),
  },

  // DB — Facturación
  priceLists: {
    list: () => ipcRenderer.invoke("db:price-lists:list"),
  },

  // DB — Tesorería
  cashAccounts: {
    list: () => ipcRenderer.invoke("db:cash-accounts:list"),
    movements: (accountId: string) => ipcRenderer.invoke("db:cash-movements:list", accountId),
  },

  // DB — CRM
  crmAccounts: {
    list: (search = "") => ipcRenderer.invoke("db:crm-accounts:list", search),
  },
  opportunities: {
    list: (search = "") => ipcRenderer.invoke("db:opportunities:list", search),
  },

  // DB — RMA
  tickets: {
    list: (search = "") => ipcRenderer.invoke("db:tickets:list", search),
  },
  workOrders: {
    list: (search = "") => ipcRenderer.invoke("db:work-orders:list", search),
  },
  warranties: {
    list: (search = "") => ipcRenderer.invoke("db:warranties:list", search),
  },

  // Pickers
  openClientSelection: (contextId = "") =>
    ipcRenderer.send("shell:open-client-selection", { contextId }),
  openProductSelection: (rowId = "") =>
    ipcRenderer.send("shell:open-product-selection", { rowId }),

  // Abrir formularios nativos desde el shell
  openNativeForm: (type: string) =>
    ipcRenderer.send("shell:open-form", type),
};

// contextIsolation: false → asignación directa en window
(window as unknown as Record<string, unknown>).asimov = api;

// Apply background on load
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const prefs = await ipcRenderer.invoke("shell:prefs:get") as ShellPreferences;
    applyBackground(prefs.background);
  } catch {}
});

// Background change from menu
ipcRenderer.on("shell:background:changed", (_e, bg: ShellBackground) => {
  applyBackground(bg);
});

export type AsimovApi = typeof api;
