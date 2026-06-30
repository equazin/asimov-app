/**
 * Menu nativo de Asimov ERP.
 * Navegación local — sin dependencia de servidor web.
 */
import { app, BrowserWindow, dialog, Menu, shell, type MenuItemConstructorOptions } from "electron";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import {
  addBookmark,
  getBookmarks,
  getLaunchAtStartup,
  getPrintPreferences,
  removeBookmark,
  setPreferredPrinter,
  setShellBackground,
  setSilentPrint,
  type BookmarkEntry,
  type ShellBackground,
} from "./config";
import { setLaunchAtStartupEnabled } from "./tray";

interface MenuDeps {
  isDev: boolean;
  openNativeForm: (type: NativeFormType) => void;
}

type NativeFormType =
  | "article" | "client" | "supplier"
  | "sale-order" | "quote" | "invoice" | "delivery-note" | "receipt"
  | "purchase-order" | "goods-receipt" | "purchase-invoice" | "payment-order";

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow();
}

function focusedContents() {
  return focusedWindow()?.webContents;
}

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  });
}

function navigate(path: string): void {
  broadcast("shell:navigate", path);
}

function currentTitle(): string {
  return focusedWindow()?.getTitle().replace(/^Asimov\s+-?\s*/, "") ?? "Pantalla";
}

function currentPath(): string {
  const all = BrowserWindow.getAllWindows();
  for (const w of all) {
    const url = w.webContents.getURL();
    if (url.startsWith("file://")) {
      const base = nodePath.basename(url.split("?")[0]);
      return `/${base.replace(".html", "")}`;
    }
  }
  return "/dashboard";
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
  try { printers = await focused.webContents.getPrintersAsync(); } catch { return; }
  if (printers.length === 0) {
    void dialog.showMessageBox(focused, { type: "info", title: "Impresoras", message: "No se encontraron impresoras instaladas." });
    return;
  }
  const prefs = getPrintPreferences();
  const currentPrinter = prefs.preferredPrinter;
  const printerNames = printers.map((p) => p.displayName || p.name);
  const buttons = [
    ...printerNames.map((name) => name === currentPrinter ? `${name} [actual]` : name),
    "Ninguna (usar diálogo del sistema)",
    "Cancelar",
  ];
  const result = await dialog.showMessageBox(focused, {
    type: "question", title: "Configurar impresora favorita",
    message: "Elegí la impresora predeterminada para impresión directa (F9):",
    detail: currentPrinter ? `Impresora actual: ${currentPrinter}\nImpresión silenciosa: ${prefs.silentPrint ? "Sí" : "No"}` : "No hay impresora favorita configurada.",
    buttons, defaultId: buttons.indexOf(currentPrinter) >= 0 ? buttons.indexOf(currentPrinter) : buttons.length - 1, cancelId: buttons.length - 1,
  });
  const idx = result.response;
  if (idx === buttons.length - 1) return;
  if (idx === buttons.length - 2) { setPreferredPrinter(""); setSilentPrint(false); }
  else { const selected = printerNames[idx]; if (selected) { setPreferredPrinter(selected); setSilentPrint(true); } }
}

function bookmarkMenuItems(deps: MenuDeps, bookmarks: BookmarkEntry[]): MenuItemConstructorOptions[] {
  if (!bookmarks.length) return [{ label: "Sin favoritos guardados", enabled: false }];
  return bookmarks.map((entry) => ({
    label: entry.title,
    submenu: [
      { label: "Abrir", click: () => navigate(entry.path) },
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

type NativeEntry = { label: string; type: NativeFormType; accel: string };

const MODULES: { label: string; navPath?: string; navAccel?: string; forms: NativeEntry[] }[] = [
  {
    label: "Ventas",
    navPath: "/ventas",
    navAccel: "CmdOrCtrl+2",
    forms: [
      { label: "Nuevo Pedido", type: "sale-order", accel: "CmdOrCtrl+Shift+V" },
      { label: "Nueva Cotización", type: "quote", accel: "CmdOrCtrl+Shift+Q" },
      { label: "Nuevo Cliente", type: "client", accel: "CmdOrCtrl+Shift+C" },
    ],
  },
  {
    label: "Compras",
    navPath: "/compras",
    forms: [
      { label: "Nueva Orden de Compra", type: "purchase-order", accel: "CmdOrCtrl+Shift+O" },
      { label: "Nueva Recepción", type: "goods-receipt", accel: "CmdOrCtrl+Shift+G" },
      { label: "Nueva Fact. de Compra", type: "purchase-invoice", accel: "CmdOrCtrl+Shift+I" },
      { label: "Nueva Orden de Pago", type: "payment-order", accel: "CmdOrCtrl+Shift+K" },
      { label: "Nuevo Proveedor", type: "supplier", accel: "CmdOrCtrl+Shift+P" },
    ],
  },
  {
    label: "Stock",
    navPath: "/stock",
    navAccel: "CmdOrCtrl+3",
    forms: [
      { label: "Nuevo Artículo", type: "article", accel: "CmdOrCtrl+Shift+A" },
    ],
  },
  {
    label: "Facturación",
    navPath: "/facturacion",
    forms: [
      { label: "Nueva Factura", type: "invoice", accel: "CmdOrCtrl+Shift+F" },
      { label: "Nuevo Remito", type: "delivery-note", accel: "CmdOrCtrl+Shift+R" },
      { label: "Nuevo Recibo", type: "receipt", accel: "CmdOrCtrl+Shift+E" },
    ],
  },
  {
    label: "Tesorería",
    navPath: "/tesoreria",
    navAccel: "CmdOrCtrl+4",
    forms: [],
  },
  {
    label: "Contabilidad",
    navPath: "/contabilidad",
    forms: [],
  },
  {
    label: "RMA",
    navPath: "/rma",
    forms: [],
  },
  {
    label: "Config",
    navPath: "/config",
    forms: [],
  },
];

function moduleMenu(m: typeof MODULES[number], deps: MenuDeps): MenuItemConstructorOptions {
  const items: MenuItemConstructorOptions[] = [];
  if (m.navPath) {
    items.push({ label: `Ir a ${m.label}`, accelerator: m.navAccel, click: () => navigate(m.navPath!) });
  }
  if (m.forms.length > 0) {
    if (m.navPath) items.push({ type: "separator" });
    for (const f of m.forms) {
      items.push({ label: f.label, accelerator: f.accel, click: () => deps.openNativeForm(f.type) });
    }
  }
  return { label: m.label, submenu: items.length > 0 ? items : [{ label: "Próximamente", enabled: false }] };
}

export function buildAppMenu(deps: MenuDeps): void {
  const bookmarks = getBookmarks();
  const template: MenuItemConstructorOptions[] = [
    {
      label: "Archivo",
      submenu: [
        {
          label: "Dashboard",
          accelerator: "CmdOrCtrl+1",
          click: () => navigate("/dashboard"),
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
              focusedContents()?.print({ silent: true, deviceName: prefs.preferredPrinter, printBackground: true }, () => {});
            }
          },
        },
        { label: "Configurar impresora...", click: () => void showPrinterSetup() },
        { type: "separator" },
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
    ...MODULES.map((m) => moduleMenu(m, deps)),
    {
      label: "Favoritos",
      submenu: [
        { label: "Mostrar/ocultar panel", accelerator: "CmdOrCtrl+B", click: () => broadcast("shell:toggle-bookmarks", null) },
        {
          label: "Agregar pantalla actual",
          accelerator: "CmdOrCtrl+D",
          click: () => {
            const next = addBookmark({ title: currentTitle(), path: currentPath() });
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
        { label: "Fondo predeterminado", click: () => setBackground({ type: "default", value: "" }) },
        { label: "Fondo verde oscuro", click: () => setBackground({ type: "color", value: "#062b19" }) },
        { label: "Fondo crema", click: () => setBackground({ type: "color", value: "#f5f5f0" }) },
        { label: "Elegir imagen de fondo...", click: () => void chooseBackgroundImage() },
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
        { label: "Recargar", accelerator: "CmdOrCtrl+R", click: () => focusedContents()?.reload() },
        { label: "Forzar recarga", accelerator: "CmdOrCtrl+F5", click: () => focusedContents()?.reloadIgnoringCache() },
        { type: "separator" },
        { role: "resetZoom", label: "Zoom normal" },
        { role: "zoomIn", label: "Acercar" },
        { role: "zoomOut", label: "Alejar" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Pantalla completa" },
        ...(deps.isDev ? ([{ role: "toggleDevTools", label: "Herramientas de desarrollo" }] as MenuItemConstructorOptions[]) : []),
      ],
    },
    {
      label: "Ayuda",
      submenu: [
        { label: "Sitio web de Bartez", click: () => void shell.openExternal("https://bartez.com.ar") },
        { label: "Soporte por WhatsApp", click: () => void shell.openExternal("https://wa.me/5493416684350") },
        { type: "separator" },
        { label: `Version ${app.getVersion()}`, enabled: false },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
