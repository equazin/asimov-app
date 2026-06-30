/**
 * Menu nativo de Asimov.
 *
 * La Fase 1 GESES prioriza navegacion por modulo, atajos, favoritos,
 * multi-ventana y preferencias locales sin depender del frontend remoto.
 */
import { app, BrowserWindow, dialog, Menu, shell, type MenuItemConstructorOptions } from "electron";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import {
  addBookmark,
  clearServerUrl,
  getBookmarks,
  getLaunchAtStartup,
  getPrintPreferences,
  getServerHistory,
  getServerLabel,
  removeBookmark,
  setPreferredPrinter,
  setServerUrl,
  setShellBackground,
  setSilentPrint,
  type BookmarkEntry,
  type ShellBackground,
} from "./config";
import { setLaunchAtStartupEnabled } from "./tray";

interface MenuDeps {
  isDev: boolean;
  onServerChanged: () => void;
  openApp: (pathname?: string) => void;
  openNewWindow: (pathname?: string) => void;
  openNativeForm?: (type: "article" | "client" | "supplier" | "sale-order" | "quote") => void;
}

interface ModuleItem {
  label: string;
  path: string;
  accelerator?: string;
}

interface ModuleGroup {
  label: string;
  items: ModuleItem[];
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    label: "Ventas",
    items: [
      { label: "Pedidos", path: "/admin/orders", accelerator: "CmdOrCtrl+2" },
      { label: "Nuevo pedido", path: "/admin/orders/new" },
      { label: "Cotizaciones", path: "/admin/quotes" },
      { label: "Nueva cotizacion", path: "/admin/quotes/new" },
      { label: "Clientes", path: "/admin/clients" },
      { label: "Cuentas", path: "/admin/accounts" },
      { label: "Oportunidades", path: "/admin/opportunities" },
    ],
  },
  {
    label: "Compras",
    items: [
      { label: "Ordenes de compra", path: "/admin/purchase-orders" },
      { label: "Nueva orden de compra", path: "/admin/purchase-orders/new" },
      { label: "Proveedores", path: "/admin/suppliers" },
      { label: "Recepciones", path: "/admin/goods-receipts" },
      { label: "Cuenta proveedores", path: "/admin/supplier-accounts" },
    ],
  },
  {
    label: "Stock",
    items: [
      { label: "Stock", path: "/admin/stock", accelerator: "CmdOrCtrl+3" },
      { label: "Productos", path: "/admin/products" },
      { label: "Movimientos", path: "/admin/stock-movements" },
      { label: "Depositos", path: "/admin/warehouses" },
      { label: "Numeros de serie", path: "/admin/serial-numbers" },
      { label: "Alertas", path: "/admin/alerts" },
    ],
  },
  {
    label: "Facturacion",
    items: [
      { label: "Facturas", path: "/admin/invoices" },
      { label: "Nueva factura", path: "/admin/invoices/new" },
      { label: "Remitos", path: "/admin/delivery-notes" },
      { label: "Nuevo remito", path: "/admin/delivery-notes/new" },
      { label: "Recibos", path: "/admin/receipts" },
      { label: "Listas de precios", path: "/admin/price-lists" },
    ],
  },
  {
    label: "Tesoreria",
    items: [
      { label: "Caja", path: "/admin/cash-accounts", accelerator: "CmdOrCtrl+4" },
      { label: "Cuenta corriente clientes", path: "/admin/customer-accounts" },
      { label: "Cuenta corriente proveedores", path: "/admin/supplier-accounts" },
      { label: "Reportes", path: "/admin/reports" },
    ],
  },
  {
    label: "Contabilidad",
    items: [
      { label: "Contabilidad", path: "/admin/accounting" },
      { label: "Export contable", path: "/admin/accounting-export" },
      { label: "Auditoria", path: "/admin/audit" },
    ],
  },
  {
    label: "RMA",
    items: [
      { label: "Tickets", path: "/admin/tickets" },
      { label: "Ordenes de trabajo", path: "/admin/work-orders" },
      { label: "Garantias", path: "/admin/warranty-terms" },
    ],
  },
  {
    label: "Config",
    items: [
      { label: "Sistema", path: "/admin/sistema" },
      { label: "Usuarios y roles", path: "/admin/team" },
      { label: "Base de conocimiento", path: "/admin/knowledge" },
      { label: "Conversaciones", path: "/admin/conversations" },
    ],
  },
];

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow();
}

function focusedContents() {
  return focusedWindow()?.webContents;
}

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  });
}

function currentAdminPath(): string {
  const current = focusedContents()?.getURL() ?? "";
  try {
    const parsed = new URL(current);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return path.startsWith("/admin") ? path : "/admin";
  } catch {
    return "/admin";
  }
}

function currentTitle(): string {
  return focusedWindow()?.getTitle().replace(/^Asimov\s+-\s+/, "") ?? "Pantalla";
}

const NATIVE_FORM_PATHS = new Set(["/admin/clients", "/admin/suppliers", "/admin/products", "/admin/orders/new", "/admin/quotes/new"]);

const NATIVE_MENU_MAP: Record<string, { label: string; type: "article" | "client" | "supplier" | "sale-order" | "quote"; accel: string }[]> = {
  Ventas: [
    { label: "Nuevo Pedido", type: "sale-order", accel: "CmdOrCtrl+Shift+V" },
    { label: "Nueva Cotización", type: "quote", accel: "CmdOrCtrl+Shift+Q" },
    { label: "Nuevo Cliente", type: "client", accel: "CmdOrCtrl+Shift+C" },
  ],
  Compras: [{ label: "Nuevo Proveedor", type: "supplier", accel: "CmdOrCtrl+Shift+P" }],
  Stock: [{ label: "Nuevo Artículo", type: "article", accel: "CmdOrCtrl+Shift+A" }],
};

function moduleMenu(group: ModuleGroup, deps: MenuDeps): MenuItemConstructorOptions {
  const nativeEntries = deps.openNativeForm ? NATIVE_MENU_MAP[group.label] ?? [] : [];

  const webItems: MenuItemConstructorOptions[] = group.items
    .filter((item) => !NATIVE_FORM_PATHS.has(item.path))
    .map((item) => ({
      label: item.label,
      accelerator: item.accelerator,
      click: () => deps.openApp(item.path),
    }));

  const nativeItems: MenuItemConstructorOptions[] = nativeEntries.length > 0
    ? [
        { type: "separator" as const },
        ...nativeEntries.map((e) => ({
          label: e.label,
          accelerator: e.accel,
          click: () => deps.openNativeForm!(e.type),
        })),
      ]
    : [];

  return {
    label: group.label,
    submenu: [...webItems, ...nativeItems],
  };
}

function bookmarkMenuItems(deps: MenuDeps, bookmarks: BookmarkEntry[]): MenuItemConstructorOptions[] {
  if (!bookmarks.length) return [{ label: "Sin favoritos guardados", enabled: false }];
  return bookmarks.map((entry) => ({
    label: entry.title,
    submenu: [
      {
        label: "Abrir",
        click: () => deps.openApp(entry.path),
      },
      {
        label: "Abrir en nueva ventana",
        click: () => deps.openNewWindow(entry.path),
      },
      {
        label: "Eliminar favorito",
        click: () => {
          const next = removeBookmark(entry.id);
          broadcast("shell:bookmarks:changed", next);
          buildAppMenu(deps);
        },
      },
    ],
  }));
}

function setBackground(background: ShellBackground): void {
  const next = setShellBackground(background).background;
  broadcast("shell:background:changed", next);
}

async function chooseBackgroundImage(): Promise<void> {
  const result = await dialog.showOpenDialog({
    title: "Elegir imagen de fondo",
    properties: ["openFile"],
    filters: [{ name: "Imagenes", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });
  const file = result.filePaths[0];
  if (!file) return;
  const ext = nodePath.extname(file).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  const data = fs.readFileSync(file).toString("base64");
  setBackground({ type: "image", value: `data:${mime};base64,${data}` });
}

async function showPrinterSetup(): Promise<void> {
  const focused = focusedWindow();
  if (!focused) return;

  let printers: Electron.PrinterInfo[] = [];
  try {
    printers = await focused.webContents.getPrintersAsync();
  } catch {
    return;
  }

  if (printers.length === 0) {
    void dialog.showMessageBox(focused, {
      type: "info",
      title: "Impresoras",
      message: "No se encontraron impresoras instaladas.",
    });
    return;
  }

  const prefs = getPrintPreferences();
  const currentPrinter = prefs.preferredPrinter;

  const printerNames = printers.map((p) => p.displayName || p.name);
  const defaultIdx = printerNames.indexOf(currentPrinter);

  const buttons = [
    ...printerNames.map((name) => (name === currentPrinter ? `${name} [actual]` : name)),
    "Ninguna (usar diálogo del sistema)",
    "Cancelar",
  ];

  const result = await dialog.showMessageBox(focused, {
    type: "question",
    title: "Configurar impresora favorita",
    message: "Elegí la impresora predeterminada para impresión directa (F9):",
    detail: currentPrinter
      ? `Impresora actual: ${currentPrinter}\nImpresión silenciosa: ${prefs.silentPrint ? "Sí" : "No"}`
      : "No hay impresora favorita configurada.",
    buttons,
    defaultId: defaultIdx >= 0 ? defaultIdx : buttons.length - 1,
    cancelId: buttons.length - 1,
  });

  const idx = result.response;
  if (idx === buttons.length - 1) return;

  if (idx === buttons.length - 2) {
    setPreferredPrinter("");
    setSilentPrint(false);
  } else {
    const selected = printerNames[idx];
    if (selected) {
      setPreferredPrinter(selected);
      setSilentPrint(true);
    }
  }
}

export function buildAppMenu(deps: MenuDeps): void {
  const recentServers = getServerHistory();
  const bookmarks = getBookmarks();
  const template: MenuItemConstructorOptions[] = [
    {
      label: "Archivo",
      submenu: [
        {
          label: "Abrir inicio",
          accelerator: "CmdOrCtrl+1",
          click: () => deps.openApp("/admin"),
        },
        {
          label: "Nueva ventana",
          accelerator: "CmdOrCtrl+N",
          click: () => deps.openNewWindow(currentAdminPath()),
        },
        {
          label: "Imprimir...",
          accelerator: "CmdOrCtrl+P",
          click: () => focusedContents()?.print({ printBackground: true }),
        },
        {
          label: "Imprimir directo",
          accelerator: "F9",
          enabled: !!getPrintPreferences().preferredPrinter,
          click: () => {
            const prefs = getPrintPreferences();
            if (prefs.preferredPrinter) {
              focusedContents()?.print(
                { silent: true, deviceName: prefs.preferredPrinter, printBackground: true },
                () => {},
              );
            }
          },
        },
        {
          label: "Configurar impresora...",
          click: () => void showPrinterSetup(),
        },
        { type: "separator" },
        {
          label: "Servidores recientes",
          enabled: recentServers.length > 0,
          submenu: recentServers.map((entry) => ({
            label: getServerLabel(entry.url),
            click: () => {
              setServerUrl(entry.url);
              deps.onServerChanged();
            },
          })),
        },
        {
          label: "Cambiar de servidor...",
          click: () => {
            clearServerUrl();
            deps.onServerChanged();
          },
        },
        {
          label: "Abrir al iniciar Windows",
          type: "checkbox",
          checked: getLaunchAtStartup(),
          click: (item) => setLaunchAtStartupEnabled(item.checked),
        },
        { type: "separator" },
        { role: "quit", label: "Salir" },
      ],
    },
    ...MODULE_GROUPS.map((group) => moduleMenu(group, deps)),
    {
      label: "Favoritos",
      submenu: [
        {
          label: "Mostrar/ocultar panel",
          accelerator: "CmdOrCtrl+B",
          click: () => broadcast("shell:toggle-bookmarks", null),
        },
        {
          label: "Agregar pantalla actual",
          accelerator: "CmdOrCtrl+D",
          click: () => {
            const next = addBookmark({ title: currentTitle(), path: currentAdminPath() });
            broadcast("shell:bookmarks:changed", next);
            buildAppMenu(deps);
          },
        },
        { type: "separator" },
        ...bookmarkMenuItems(deps, bookmarks),
      ],
    },
    {
      label: "Apariencia",
      submenu: [
        {
          label: "Fondo predeterminado",
          click: () => setBackground({ type: "default", value: "" }),
        },
        {
          label: "Fondo verde oscuro",
          click: () => setBackground({ type: "color", value: "#062b19" }),
        },
        {
          label: "Fondo crema",
          click: () => setBackground({ type: "color", value: "#f5f5f0" }),
        },
        {
          label: "Elegir imagen de fondo...",
          click: () => void chooseBackgroundImage(),
        },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { role: "undo", label: "Deshacer" },
        { role: "redo", label: "Rehacer" },
        { type: "separator" },
        { role: "cut", label: "Cortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Pegar" },
        { role: "selectAll", label: "Seleccionar todo" },
      ],
    },
    {
      label: "Ver",
      submenu: [
        {
          label: "Recargar",
          accelerator: "CmdOrCtrl+R",
          click: () => focusedContents()?.reload(),
        },
        {
          label: "Forzar recarga",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => focusedContents()?.reloadIgnoringCache(),
        },
        { type: "separator" },
        { role: "resetZoom", label: "Zoom normal" },
        { role: "zoomIn", label: "Acercar" },
        { role: "zoomOut", label: "Alejar" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Pantalla completa" },
        ...(deps.isDev
          ? ([{ role: "toggleDevTools", label: "Herramientas de desarrollo" }] as MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      label: "Ayuda",
      submenu: [
        {
          label: "Sitio web de Bartez",
          click: () => void shell.openExternal("https://bartez.com.ar"),
        },
        {
          label: "Soporte por WhatsApp",
          click: () => void shell.openExternal("https://wa.me/5493416684350"),
        },
        { type: "separator" },
        { label: `Version ${app.getVersion()}`, enabled: false },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
