/**
 * Preload de la ventana principal (shell.html).
 * Expone window.asimov con métodos de DB, print, notificaciones y shell.
 */
import { contextBridge, ipcRenderer } from "electron";

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

const api = {
  isDesktop: true as const,
  // Bajo contextBridge los getters se evalúan una sola vez, así que la versión se
  // expone como método asíncrono (se resuelve contra el main cada vez que se pide).
  appVersion: () => ipcRenderer.invoke("app:version") as Promise<string>,

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

  // Auth
  auth: {
    current: () => ipcRenderer.invoke("auth:current") as Promise<{ id: string; name: string; email: string; role: string } | null>,
    logout: () => ipcRenderer.send("auth:logout"),
  },

  // App
  getLaunchAtStartup: () => ipcRenderer.invoke("app:launch-at-startup:get") as Promise<boolean>,
  setLaunchAtStartup: (v: boolean) => ipcRenderer.invoke("app:launch-at-startup:set", v),
  checkForUpdate: () => ipcRenderer.invoke("app:check-update") as Promise<{ status: string; version?: string }>,

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
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),

  // Shell prefs
  shell: {
    getPreferences: () => ipcRenderer.invoke("shell:prefs:get") as Promise<ShellPreferences>,
    setBackground: (bg: ShellBackground) => ipcRenderer.invoke("shell:background:set", bg),
    listBookmarks: () => ipcRenderer.invoke("shell:bookmark:list") as Promise<BookmarkEntry[]>,
    addBookmark: (title: string, path: string) => ipcRenderer.invoke("shell:bookmark:add", { title, path }) as Promise<BookmarkEntry[]>,
    removeBookmark: (id: string) => ipcRenderer.invoke("shell:bookmark:remove", id) as Promise<BookmarkEntry[]>,
  },

  // Documentos — anular desde la lista (revierte stock/caja y marca "anulado")
  annulDocument: (type: string, id: string) =>
    ipcRenderer.invoke("shell:document-annul", { type, id }) as Promise<{ ok: boolean; error?: string }>,

  // Documentos — borrar físicamente (solo anulados/rechazados/sin CAE)
  deleteDocument: (type: string, id: string) =>
    ipcRenderer.invoke("shell:document-delete", { type, id }) as Promise<{ ok: boolean; error?: string }>,

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
    get: (id: string) => ipcRenderer.invoke("db:quotes:get", id),
  },
  invoices: {
    list: (search = "") => ipcRenderer.invoke("db:invoices:list", search),
    get: (id: string) => ipcRenderer.invoke("db:invoices:get", id),
    save: (row: unknown) => ipcRenderer.invoke("db:invoices:save", row),
    setPrintPreferences: (input: { id: string; consolidated: boolean; consolidatedLabel?: string }) =>
      ipcRenderer.invoke("db:invoices:set-print-preferences", input),
  },
  deliveryNotes: {
    list: (search = "") => ipcRenderer.invoke("db:delivery-notes:list", search),
    get: (id: string) => ipcRenderer.invoke("db:delivery-notes:get", id),
  },
  receipts: {
    list: (search = "") => ipcRenderer.invoke("db:receipts:list", search),
    get: (id: string) => ipcRenderer.invoke("db:receipts:get", id),
  },
  // Notas de comisión (costo de sobrefacturación): documento interno derivado de una factura.
  commissionNotes: {
    list: (search = "") => ipcRenderer.invoke("db:commission-notes:list", search),
    get: (id: string) => ipcRenderer.invoke("db:commission-notes:get", id),
    preview: (invoiceId: string, ratePct?: number) =>
      ipcRenderer.invoke("db:commission-notes:preview", { invoiceId, ratePct }) as Promise<{ ok: boolean; error?: string; invoice_number?: string; rate_pct?: number; base_amount?: number; total?: number; lines?: unknown[] }>,
    create: (input: { invoiceId: string; clienteId?: string; clienteNombre?: string; ratePct?: number; observaciones?: string }) =>
      ipcRenderer.invoke("shell:commission-note:create", input) as Promise<{ ok: boolean; error?: string; id?: string; number?: string; total?: number }>,
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
  purchaseReceipts: {
    list: (search = "") => ipcRenderer.invoke("db:purchase-receipts:list", search),
    get: (id: string) => ipcRenderer.invoke("db:purchase-receipts:get", id),
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

  // DB — CRM (unificado con clients)
  crm: {
    accounts: {
      list: (search = "", status = "all") => ipcRenderer.invoke("crm:accounts:list", search, status),
      get: (id: string) => ipcRenderer.invoke("crm:accounts:get", id),
    },
    pipeline: {
      list: () => ipcRenderer.invoke("crm:pipeline:list"),
      save: (row: unknown) => ipcRenderer.invoke("crm:pipeline:save", row),
      delete: (id: string) => ipcRenderer.invoke("crm:pipeline:delete", id),
    },
    opportunities: {
      list: (search = "", status = "open") => ipcRenderer.invoke("crm:opportunities:list", search, status),
      get: (id: string) => ipcRenderer.invoke("crm:opportunities:get", id),
      save: (row: unknown) => ipcRenderer.invoke("crm:opportunities:save", row),
      delete: (id: string) => ipcRenderer.invoke("crm:opportunities:delete", id),
      history: (id: string) => ipcRenderer.invoke("crm:opportunities:history", id),
    },
    activities: {
      list: (clientId: string) => ipcRenderer.invoke("crm:activities:list", clientId),
      recent: (limit = 50) => ipcRenderer.invoke("crm:activities:recent", limit),
      save: (row: unknown) => ipcRenderer.invoke("crm:activities:save", row),
      delete: (id: string) => ipcRenderer.invoke("crm:activities:delete", id),
    },
    tasks: {
      list: (status = "pending", assignedTo?: string) => ipcRenderer.invoke("crm:tasks:list", status, assignedTo),
      client: (clientId: string) => ipcRenderer.invoke("crm:tasks:client", clientId),
      get: (id: string) => ipcRenderer.invoke("crm:tasks:get", id),
      save: (row: unknown) => ipcRenderer.invoke("crm:tasks:save", row),
      complete: (id: string) => ipcRenderer.invoke("crm:tasks:complete", id),
      delete: (id: string) => ipcRenderer.invoke("crm:tasks:delete", id),
    },
    clientSummary: (clientId: string) => ipcRenderer.invoke("crm:client-summary", clientId),
    pipelineSummary: () => ipcRenderer.invoke("crm:pipeline-summary"),
  },

  // DB — Cta Cte
  ctaCteClients: {
    list: (search = "") => ipcRenderer.invoke("db:cta-cte:clients:list", search),
    detail: (clientId: string) => ipcRenderer.invoke("db:cta-cte:clients:detail", clientId),
  },
  ctaCteSuppliers: {
    list: (search = "") => ipcRenderer.invoke("db:cta-cte:suppliers:list", search),
    detail: (supplierId: string) => ipcRenderer.invoke("db:cta-cte:suppliers:detail", supplierId),
  },

  // DB — Reportes
  reports: {
    sales:       (from: string, to: string) => ipcRenderer.invoke("db:reports:sales",       { from, to }),
    purchases:   (from: string, to: string) => ipcRenderer.invoke("db:reports:purchases",   { from, to }),
    topArticles: (from: string, to: string) => ipcRenderer.invoke("db:reports:top-articles",{ from, to }),
  },

  // DB — Diario / Auditoría / Export
  diario: {
    list: (from: string, to: string) => ipcRenderer.invoke("db:diario:list", { from, to }),
  },
  audit: {
    recent: () => ipcRenderer.invoke("db:audit:recent"),
  },
  exportCsv: {
    invoices:  (from: string, to: string) => ipcRenderer.invoke("db:export:invoices-csv",  { from, to }),
    purchases: (from: string, to: string) => ipcRenderer.invoke("db:export:purchases-csv", { from, to }),
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

  // Sistema Config
  config: {
    getAll: () => ipcRenderer.invoke("db:config:get-all") as Promise<{ key: string; value: string }[]>,
    set: (key: string, value: string) => ipcRenderer.invoke("db:config:set", { key, value }),
  },

  // Usuarios
  users: {
    list: () => ipcRenderer.invoke("db:users:list"),
    save: (row: unknown) => ipcRenderer.invoke("db:users:save", row),
    toggle: (id: string) => ipcRenderer.invoke("db:users:toggle", id),
  },

  // Base de Conocimiento
  knowledge: {
    list: (search = "") => ipcRenderer.invoke("db:knowledge:list", search),
    get: (id: string) => ipcRenderer.invoke("db:knowledge:get", id),
    save: (row: unknown) => ipcRenderer.invoke("db:knowledge:save", row),
    del: (id: string) => ipcRenderer.invoke("db:knowledge:delete", id),
  },

  // Conversaciones
  conversations: {
    list: (search = "") => ipcRenderer.invoke("db:conversations:list", search),
    get: (id: string) => ipcRenderer.invoke("db:conversations:get", id),
    create: (row: unknown) => ipcRenderer.invoke("db:conversations:create", row),
    addMessage: (row: unknown) => ipcRenderer.invoke("db:conversations:add-message", row),
    close: (id: string) => ipcRenderer.invoke("db:conversations:close", id),
  },

  // Pickers
  openClientSelection: (contextId = "") =>
    ipcRenderer.send("shell:open-client-selection", { contextId }),
  openProductSelection: (rowId = "") =>
    ipcRenderer.send("shell:open-product-selection", { rowId }),

  // Abrir formularios nativos desde el shell
  openNativeForm: (type: string, context?: Record<string, unknown>) =>
    ipcRenderer.send("shell:open-form", context ? { type, context } : type),
  openInvoiceAdjustment: (invoiceId: string, kind: "NC" | "ND") =>
    ipcRenderer.invoke("shell:open-invoice-adjustment", { invoiceId, kind }) as Promise<{ ok: boolean; error?: string }>,
  openInvoiceEdit: (invoiceId: string) =>
    ipcRenderer.invoke("shell:open-invoice-edit", invoiceId) as Promise<{ ok: boolean; error?: string }>,

  // --- AIR S.R.L. Integration ---
  air: {
    getConfig: () => ipcRenderer.invoke("air:config:get"),
    isEnabled: () => ipcRenderer.invoke("air:enabled") as Promise<boolean>,
    listProducts: (search = "") => ipcRenderer.invoke("air:products:list", search),
    countProducts: () => ipcRenderer.invoke("air:products:count") as Promise<{ total: number; active: number }>,
    syncHistory: () => ipcRenderer.invoke("air:sync:history"),
    runSync: () => ipcRenderer.invoke("air:sync:run"),
    testConnection: () => ipcRenderer.invoke("air:test-connection") as Promise<{ ok: boolean; message: string; productCount?: number }>,
    startSyncTimer: () => ipcRenderer.invoke("air:sync-timer:start"),
    stopSyncTimer: () => ipcRenderer.invoke("air:sync-timer:stop"),
  },

  // --- Bot de WhatsApp de Bartez ---
  whatsapp: {
    getConfig: () => ipcRenderer.invoke("wa:config:get") as Promise<{
      enabled: boolean; baseUrl: string; botPhone: string; pollIntervalMinutes: number; hasToken: boolean;
    }>,
    isEnabled: () => ipcRenderer.invoke("wa:enabled") as Promise<boolean>,
    listChats: (search = "") => ipcRenderer.invoke("wa:chats:list", search),
    listMessages: (chatId: string) => ipcRenderer.invoke("wa:messages:list", chatId),
    sendMessage: (chatId: string, body: string) =>
      ipcRenderer.invoke("wa:messages:send", { chatId, body }) as Promise<{ ok: boolean; message?: unknown; error?: string }>,
    sendTemplate: (chatId: string, template: string, languageCode: string, bodyParams: string[], preview: string) =>
      ipcRenderer.invoke("wa:messages:send-template", { chatId, template, languageCode, bodyParams, preview }) as Promise<{ ok: boolean; message?: unknown; error?: string }>,
    runSync: () => ipcRenderer.invoke("wa:sync:run"),
    syncHistory: () => ipcRenderer.invoke("wa:sync:history"),
    testConnection: () => ipcRenderer.invoke("wa:test-connection") as Promise<{ ok: boolean; message: string; chatCount?: number }>,
    startPoll: () => ipcRenderer.invoke("wa:poll:start"),
    stopPoll: () => ipcRenderer.invoke("wa:poll:stop"),
  },

  // --- Cotización del dólar (DolarAPI, auto cada 30 min) ---
  dolar: {
    latest: () => ipcRenderer.invoke("dolar:latest") as Promise<{ ok: boolean; data?: unknown[]; error?: string }>,
    history: (casa = "blue", limit = 100) => ipcRenderer.invoke("dolar:history", casa, limit) as Promise<{ ok: boolean; data?: unknown[]; error?: string }>,
    refresh: () => ipcRenderer.invoke("dolar:refresh") as Promise<{ ok: boolean; data?: unknown[]; error?: string }>,
    reprice: (casa = "blue") => ipcRenderer.invoke("dolar:reprice", casa) as Promise<{ ok: boolean; data?: { updated: number; rate: number; casa: string }; error?: string }>,
    onUpdated: (cb: (rates: unknown[]) => void) => {
      ipcRenderer.on("dolar:updated", (_e, rates: unknown[]) => cb(rates));
    },
  },

  // --- AFIP / ARCA (facturación electrónica, desktop directo) ---
  afip: {
    status: () => ipcRenderer.invoke("afip:status") as Promise<{ ok: boolean; data?: { enabled: boolean; canAuthorize: boolean; cuit: string; pointOfSale: number; env: string; hasCert: boolean; hasKey: boolean; certExpires: string | null }; error?: string }>,
    saveCredentials: (input: { cuit: string; pointOfSale: number; env: string; certPem?: string; keyPem?: string; enabled?: boolean }) =>
      ipcRenderer.invoke("afip:save-credentials", input) as Promise<{ ok: boolean; data?: { certExpires: string | null }; error?: string }>,
    testConnection: () => ipcRenderer.invoke("afip:test-connection") as Promise<{ ok: boolean; message: string; expiration?: string }>,
    diagnostics: () => ipcRenderer.invoke("afip:diagnostics") as Promise<{ ok: boolean; data?: { env: string; ok: boolean; steps: Array<{ id: string; label: string; status: "ok" | "warn" | "error" | "skip"; detail: string }> }; error?: string }>,
    invoiceQr: (invoiceId: string) => ipcRenderer.invoke("afip:invoice-qr", invoiceId) as Promise<{ ok: boolean; data?: { qrUrl: string; qrDataUrl: string }; error?: string }>,
    authorizeStoredInvoice: (invoiceId: string) => ipcRenderer.invoke("afip:authorize-stored-invoice", invoiceId) as Promise<{ ok: boolean; pending?: boolean; data?: { cae: string; caeExpiration: string; number: string; qrDataUrl: string; observations: Array<{ code: string; msg: string }> }; error?: string }>,
    requestCae: (input: unknown) => ipcRenderer.invoke("afip:request-cae", input) as Promise<{ ok: boolean; pending?: boolean; data?: { cae: string; caeExpiration: string; number: string; observations: Array<{ code: string; msg: string }> }; error?: string }>,
    retryPending: () => ipcRenderer.invoke("afip:retry-pending") as Promise<{ ok: boolean; data?: { authorized: number; stillPending: number; rejected: Array<{ invoiceId: string; error: string }>; pendingLeft: number }; error?: string }>,
    padron: (cuit: string) => ipcRenderer.invoke("afip:padron", cuit) as Promise<{ ok: boolean; data?: { cuit: string; razonSocial: string; condicionIva: string; domicilio: string; localidad: string; provincia: string; codPostal: string }; error?: string }>,
    libroIvaExport: (desde: string, hasta: string) => ipcRenderer.invoke("afip:libro-iva-export", desde, hasta) as Promise<{ ok: boolean; data?: { count: number; files: string[] }; error?: string }>,
  },

  // Esquemas / kits — necesario en el shell para expandir componentes al reimprimir
  // una factura vieja con show_kit_components = 1.
  kits: {
    get: (articleId: string) => ipcRenderer.invoke("db:kits:get", articleId) as Promise<{ ok: boolean; data?: { components: Array<{ component_article_id: string; code: string; name: string; qty: number; cost_price: number; sale_price: number }>; componentsCost: number; componentsSalePrice: number; buildableStock: number }; error?: string }>,
    set: (articleId: string, components: Array<{ articleId: string; qty: number }>) => ipcRenderer.invoke("db:kits:set", articleId, components) as Promise<{ ok: boolean; data?: { count: number }; error?: string }>,
  },

  // Sincronización con la API v2 (Render). Sirve para el badge de estado
  // en el status bar y para forzar un push/pull manual desde la UI.
  cloudSync: {
    status: () => ipcRenderer.invoke("sync:status") as Promise<{ connected: boolean; pendingChanges: number; parkedChanges: number; lastSync: string | null; syncing: boolean; lastError: string | null }>,
    queueDetails: () => ipcRenderer.invoke("sync:queue-details") as Promise<{ pending: Array<{ id: number; entity: string; entity_id: string; action: string; attempts: number; error: string | null; created_at: string; next_attempt_at: string | null }>; parked: Array<{ id: number; entity: string; entity_id: string; action: string; attempts: number; error: string | null; created_at: string; next_attempt_at: string | null }> }>,
    run: () => ipcRenderer.invoke("sync:run") as Promise<{ ok: boolean; pushed?: number; pulled?: number; errors?: number; error?: string }>,
    retryParked: () => ipcRenderer.invoke("sync:retry-parked") as Promise<{ ok: boolean; reactivated: number; pushed?: number; pulled?: number; errors?: number }>,
    bootstrapStatus: () => ipcRenderer.invoke("sync:bootstrap-status") as Promise<{ clients: number; suppliers: number; products: number; documents: number; airProducts: number; hasLocalBusinessData: boolean }>,
    deviceIntegrations: () => ipcRenderer.invoke("sync:device-integrations") as Promise<{ airPassword: boolean; whatsappToken: boolean; arcaCertificate: boolean; arcaPrivateKey: boolean }>,
    bootstrapUpload: () => ipcRenderer.invoke("sync:bootstrap-upload") as Promise<{ ok: boolean; queued?: number; compacted?: number; error?: string }>,
    cloudStatus: () => ipcRenderer.invoke("cloud:status") as Promise<{ connected: boolean; user: { email: string; name: string; role: string; tenantId: string } | null; apiUrl: string }>,
    login: (email: string, password: string) => ipcRenderer.invoke("cloud:login", { email, password }) as Promise<{ ok: boolean; error?: string; user?: { email: string; name: string; role: string; tenantId: string }; tenantId?: string }>,
    logout: () => ipcRenderer.invoke("cloud:logout") as Promise<{ ok: boolean }>,
  },
};

// contextIsolation: true → puente seguro; no se toca el prototipo de window ni se
// expone Node/Electron al renderer. El preload conserva acceso al DOM (world del
// preload) para aplicar el fondo persistido, aunque el `api` viva aislado.
contextBridge.exposeInMainWorld("asimov", api);

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
