/**
 * Preload de la ventana principal (la que carga el ERP remoto).
 *
 * Expone una API nativa mínima y segura al renderer vía contextBridge.
 * El ERP web puede detectar que corre dentro del desktop (`window.bartezDesktop`)
 * y usar impresión/notificaciones nativas cuando estén disponibles.
 */
import { contextBridge, ipcRenderer } from "electron";

interface PrintOptions {
  silent?: boolean;
  deviceName?: string;
}

interface NotifyPayload {
  title?: string;
  body?: string;
}

interface ShellBackground {
  type: "default" | "color" | "image";
  value: string;
}

interface BookmarkEntry {
  id: string;
  title: string;
  path: string;
  createdAt: number;
}

interface ShellPreferences {
  background: ShellBackground;
  bookmarks: BookmarkEntry[];
}

const SHELL_STYLE_ID = "asimov-geses-shell-style";
const MODULE_STYLE_ID = "asimov-geses-module-style";
const STATUS_ID = "asimov-geses-status";
const BOOKMARKS_ID = "asimov-geses-bookmarks";

function isShellDesktop(): boolean {
  return window.location.protocol === "file:" && window.location.pathname.endsWith("shell.html");
}

function isAdminModule(): boolean {
  return window.location.protocol.startsWith("http") && window.location.pathname.startsWith("/admin");
}

function adminPathFromLocation(): string {
  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return next.startsWith("/admin") ? next : "/admin";
}

function applyBackground(background: ShellBackground): void {
  document.documentElement.dataset.asimovBackground = background.type;
  if (background.type === "color") {
    document.documentElement.style.setProperty("--asimov-shell-background", background.value);
    document.body.style.background = background.value;
    return;
  }
  if (background.type === "image") {
    document.documentElement.style.setProperty("--asimov-shell-background", `url("${background.value}")`);
    document.body.style.backgroundImage = `url("${background.value}")`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundAttachment = "fixed";
    return;
  }
  document.documentElement.style.removeProperty("--asimov-shell-background");
  document.body.style.removeProperty("background");
  document.body.style.removeProperty("backgroundImage");
  document.body.style.removeProperty("backgroundSize");
  document.body.style.removeProperty("backgroundAttachment");
}

function ensureShellStyles(): void {
  if (document.getElementById(SHELL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SHELL_STYLE_ID;
  style.textContent = `
    html.asimov-desktop-shell { padding-bottom: 30px !important; }
    #${STATUS_ID} {
      position: fixed;
      z-index: 2147483646;
      left: 0;
      right: 0;
      bottom: 0;
      height: 30px;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 0 14px;
      background: #062b19;
      color: #f5f5f0;
      border-top: 1px solid rgba(245,245,240,0.14);
      font: 600 12px/1.2 Inter, "Segoe UI", system-ui, sans-serif;
      box-shadow: 0 -8px 26px rgba(6,43,25,0.18);
    }
    #${STATUS_ID} .muted { color: rgba(245,245,240,0.68); font-weight: 500; }
    #${STATUS_ID} .ok { color: #45d06f; }
    #${STATUS_ID} .sep { width: 1px; height: 16px; background: rgba(245,245,240,0.18); }
    #${STATUS_ID} .grow { flex: 1; }
    #${BOOKMARKS_ID} {
      position: fixed;
      z-index: 2147483645;
      top: 0;
      right: 0;
      bottom: 30px;
      width: 300px;
      transform: translateX(310px);
      transition: transform 160ms ease;
      background: #f5f5f0;
      color: #333;
      border-left: 1px solid rgba(20,83,45,0.16);
      box-shadow: -18px 0 44px rgba(6,43,25,0.18);
      font: 500 13px/1.4 Inter, "Segoe UI", system-ui, sans-serif;
      display: flex;
      flex-direction: column;
    }
    #${BOOKMARKS_ID}.visible { transform: translateX(0); }
    #${BOOKMARKS_ID} header {
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 14px;
      border-bottom: 1px solid rgba(20,83,45,0.14);
      font-weight: 800;
    }
    #${BOOKMARKS_ID} button {
      font: inherit;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    #${BOOKMARKS_ID} .list { padding: 10px; display: grid; gap: 8px; overflow: auto; }
    #${BOOKMARKS_ID} .item {
      text-align: left;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid rgba(20,83,45,0.12);
      background: white;
    }
    #${BOOKMARKS_ID} .item:hover { border-color: #d4af37; }
    #${BOOKMARKS_ID} .path { display: block; margin-top: 3px; color: #72746f; font-size: 11px; }
    #${BOOKMARKS_ID} .empty { padding: 18px; color: #72746f; }
  `;
  document.head.appendChild(style);
  document.documentElement.classList.add("asimov-desktop-shell");
}

function ensureModuleStyles(): void {
  if (document.getElementById(MODULE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = MODULE_STYLE_ID;
  style.textContent = `
    html.asimov-desktop-module,
    html.asimov-desktop-module body {
      background: #f5f5f0 !important;
      color: #333333 !important;
      min-height: 100% !important;
    }
    html.asimov-desktop-module {
      --asimov-green: #14532d;
      --asimov-green-strong: #062b19;
      --asimov-cream: #f5f5f0;
      --asimov-gold: #d4af37;
      --asimov-text: #333333;
      --asimov-danger: #e74c3c;
    }
    html.asimov-desktop-module header.fixed.inset-x-0.top-0 {
      display: none !important;
    }
    html.asimov-desktop-module main.pt-12 {
      padding-top: 0 !important;
    }
    html.asimov-desktop-module main > div {
      padding: 14px 16px 18px !important;
      max-width: none !important;
    }
    html.asimov-desktop-module [class*="min-h-screen"] {
      min-height: 100vh !important;
    }
    html.asimov-desktop-module [class*="bg-slate-950"],
    html.asimov-desktop-module [class*="bg-slate-900"],
    html.asimov-desktop-module [class*="bg-zinc-950"],
    html.asimov-desktop-module [class*="bg-neutral-950"],
    html.asimov-desktop-module [class*="bg-gray-950"] {
      background-color: var(--asimov-green-strong) !important;
    }
    html.asimov-desktop-module [class*="bg-slate-50"],
    html.asimov-desktop-module [class*="bg-gray-50"],
    html.asimov-desktop-module [class*="bg-zinc-50"],
    html.asimov-desktop-module [class*="bg-neutral-50"],
    html.asimov-desktop-module [class*="bg-white"] {
      background-color: var(--asimov-cream) !important;
    }
    html.asimov-desktop-module [class*="bg-blue-"],
    html.asimov-desktop-module [class*="bg-sky-"],
    html.asimov-desktop-module [class*="bg-cyan-"],
    html.asimov-desktop-module [class*="1236d8"],
    html.asimov-desktop-module [class*="0f5cff"],
    html.asimov-desktop-module [class*="2563eb"] {
      background-color: var(--asimov-green) !important;
      color: var(--asimov-cream) !important;
      border-color: var(--asimov-green) !important;
    }
    html.asimov-desktop-module [class*="text-blue-"],
    html.asimov-desktop-module [class*="text-sky-"],
    html.asimov-desktop-module [class*="text-cyan-"],
    html.asimov-desktop-module [class*="text-indigo-"],
    html.asimov-desktop-module a:not([class*="bg-"]) {
      color: var(--asimov-green) !important;
    }
    html.asimov-desktop-module [class*="border-blue-"],
    html.asimov-desktop-module [class*="border-sky-"],
    html.asimov-desktop-module [class*="ring-blue-"],
    html.asimov-desktop-module [class*="ring-sky-"] {
      border-color: var(--asimov-gold) !important;
      --tw-ring-color: rgba(212,175,55,0.38) !important;
    }
    html.asimov-desktop-module button[class*="bg-blue-"]:hover,
    html.asimov-desktop-module button[class*="bg-sky-"]:hover,
    html.asimov-desktop-module a[class*="bg-blue-"]:hover,
    html.asimov-desktop-module a[class*="bg-sky-"]:hover {
      background-color: #17613a !important;
    }
    html.asimov-desktop-module input:focus,
    html.asimov-desktop-module select:focus,
    html.asimov-desktop-module textarea:focus,
    html.asimov-desktop-module button:focus-visible,
    html.asimov-desktop-module a:focus-visible {
      outline: 2px solid var(--asimov-gold) !important;
      outline-offset: 2px !important;
      border-color: var(--asimov-gold) !important;
      box-shadow: 0 0 0 3px rgba(212,175,55,0.18) !important;
    }
    html.asimov-desktop-module table thead,
    html.asimov-desktop-module [role="table"] [role="rowgroup"]:first-child {
      background: #e8e5da !important;
      color: var(--asimov-text) !important;
    }
    html.asimov-desktop-module tbody tr:hover,
    html.asimov-desktop-module [role="row"]:hover {
      background: rgba(212,175,55,0.1) !important;
    }
    html.asimov-desktop-module [class*="rounded-xl"],
    html.asimov-desktop-module [class*="rounded-2xl"] {
      border-radius: 8px !important;
    }
    html.asimov-desktop-module [class*="shadow-lg"],
    html.asimov-desktop-module [class*="shadow-xl"],
    html.asimov-desktop-module [class*="shadow-2xl"] {
      box-shadow: 0 16px 42px rgba(6,43,25,0.12) !important;
    }
  `;
  document.head.appendChild(style);
  document.documentElement.classList.add("asimov-desktop-module");
}

function ensureStatusBar(): HTMLElement {
  const existing = document.getElementById(STATUS_ID);
  if (existing) return existing;
  const bar = document.createElement("div");
  bar.id = STATUS_ID;
  document.body.appendChild(bar);
  return bar;
}

function renderStatusBar(serverUrl: string | null): void {
  const bar = ensureStatusBar();
  const update = () => {
    const now = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    const host = serverUrl ? new URL(serverUrl).host : "Sin servidor";
    bar.replaceChildren();
    const parts = [
      ["Asimov", ""],
      ["Servidor", host],
      ["Version", api.version || "dev"],
      ["Conexion", navigator.onLine ? "Online" : "Offline"],
      ["Hora", now],
    ];
    for (const [label, value] of parts) {
      const labelEl = document.createElement("span");
      labelEl.className = "muted";
      labelEl.textContent = label;
      const valueEl = document.createElement("span");
      valueEl.className = label === "Conexion" && navigator.onLine ? "ok" : "";
      valueEl.textContent = value;
      const sep = document.createElement("span");
      sep.className = "sep";
      bar.append(labelEl, valueEl, sep);
    }
    const grow = document.createElement("span");
    grow.className = "grow";
    const hint = document.createElement("span");
    hint.className = "muted";
    hint.textContent = "Ctrl+B favoritos";
    bar.append(grow, hint);
  };
  update();
  setInterval(update, 30_000);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
}

function ensureBookmarksPanel(): HTMLElement {
  const existing = document.getElementById(BOOKMARKS_ID);
  if (existing) return existing;
  const panel = document.createElement("aside");
  panel.id = BOOKMARKS_ID;
  const header = document.createElement("header");
  const title = document.createElement("span");
  title.textContent = "Favoritos";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Cerrar";
  close.addEventListener("click", () => panel.classList.remove("visible"));
  header.append(title, close);
  const list = document.createElement("div");
  list.className = "list";
  panel.append(header, list);
  document.body.appendChild(panel);
  return panel;
}

async function renderBookmarks(bookmarks?: BookmarkEntry[]): Promise<void> {
  const panel = ensureBookmarksPanel();
  const list = panel.querySelector(".list");
  if (!list) return;
  const entries = bookmarks ?? await ipcRenderer.invoke("shell:bookmark:list") as BookmarkEntry[];
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Guardá pantallas frecuentes desde el menú Favoritos.";
    list.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "item";
    item.addEventListener("click", () => {
      window.location.href = entry.path;
      panel.classList.remove("visible");
    });
    const title = document.createElement("strong");
    title.textContent = entry.title;
    const path = document.createElement("span");
    path.className = "path";
    path.textContent = entry.path;
    item.append(title, path);
    list.appendChild(item);
  }
}

async function initShellChrome(): Promise<void> {
  ensureShellStyles();
  const [prefs, serverUrl] = await Promise.all([
    ipcRenderer.invoke("shell:prefs:get") as Promise<ShellPreferences>,
    ipcRenderer.invoke("server:get") as Promise<string | null>,
  ]);
  applyBackground(prefs.background);
  renderStatusBar(serverUrl);
  await renderBookmarks(prefs.bookmarks);
}

const api = {
  /** Marca de plataforma para feature-detection desde la web. */
  isDesktop: true,
  version: process.env.npm_package_version ?? "",

  /** Imprime el documento actualmente cargado en la ventana. */
  print: (options?: PrintOptions) => ipcRenderer.invoke("print:current", options ?? {}),

  /** Lista de impresoras del sistema. */
  listPrinters: () => ipcRenderer.invoke("print:list"),

  /** Muestra una notificación nativa del SO. */
  notify: (payload: NotifyPayload) => ipcRenderer.invoke("notify:show", payload),

  /** URL del servidor configurado. */
  getServerUrl: () => ipcRenderer.invoke("server:get"),

  /** Vuelve al selector de servidor (cambiar de cliente). */
  changeServer: () => ipcRenderer.invoke("server:change"),

  /** Lee o cambia el inicio automatico con Windows/macOS. */
  getLaunchAtStartup: () => ipcRenderer.invoke("app:launch-at-startup:get"),
  setLaunchAtStartup: (enabled: boolean) => ipcRenderer.invoke("app:launch-at-startup:set", enabled),

  /** Shell de operador GESES: preferencias locales y favoritos. */
  shell: {
    getPreferences: () => ipcRenderer.invoke("shell:prefs:get"),
    setBackground: (background: ShellBackground) => ipcRenderer.invoke("shell:background:set", background),
    listBookmarks: () => ipcRenderer.invoke("shell:bookmark:list"),
    addBookmark: (title: string, path = adminPathFromLocation()) =>
      ipcRenderer.invoke("shell:bookmark:add", { title, path }),
    removeBookmark: (id: string) => ipcRenderer.invoke("shell:bookmark:remove", id),
    toggleBookmarks: () => document.getElementById(BOOKMARKS_ID)?.classList.toggle("visible"),
  },
};

contextBridge.exposeInMainWorld("bartezDesktop", api);

ipcRenderer.on("shell:toggle-bookmarks", () => {
  if (!isShellDesktop()) return;
  document.getElementById(BOOKMARKS_ID)?.classList.toggle("visible");
});

ipcRenderer.on("shell:bookmarks:changed", (_event, bookmarks: BookmarkEntry[]) => {
  if (!isShellDesktop()) return;
  void renderBookmarks(bookmarks);
});

ipcRenderer.on("shell:background:changed", (_event, background: ShellBackground) => {
  if (!isShellDesktop()) return;
  applyBackground(background);
});

window.addEventListener("DOMContentLoaded", () => {
  if (isShellDesktop()) {
    void initShellChrome();
  } else if (isAdminModule()) {
    ensureModuleStyles();
  }
});

export type BartezDesktopApi = typeof api;
