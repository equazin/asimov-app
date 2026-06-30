/**
 * Configuración local persistente de la app de escritorio (Asimov).
 * Almacena preferencias de ventana, shell y preferencias de impresión.
 * Los datos del ERP viven en SQLite (db.ts), no aquí.
 */
import Store from "electron-store";

export interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

export interface ShellBackground {
  type: "default" | "color" | "image";
  value: string;
}

export interface BookmarkEntry {
  id: string;
  title: string;
  path: string;
  createdAt: number;
}

export interface ShellPreferences {
  background: ShellBackground;
  bookmarks: BookmarkEntry[];
}

export interface PrintPreferences {
  preferredPrinter: string;
  silentPrint: boolean;
}

export interface DesktopConfig {
  windowBounds: WindowBounds;
  launchAtStartup: boolean;
  shell: ShellPreferences;
  print: PrintPreferences;
}

const DEFAULTS: DesktopConfig = {
  windowBounds: { width: 1440, height: 900, maximized: false },
  launchAtStartup: false,
  shell: {
    background: { type: "default", value: "" },
    bookmarks: [],
  },
  print: {
    preferredPrinter: "",
    silentPrint: false,
  },
};

const MAX_BOOKMARKS = 20;

const store = new Store<DesktopConfig>({
  name: "asimov-desktop",
  defaults: DEFAULTS,
});

// ---------------------------------------------------------------------------
// Ventana
// ---------------------------------------------------------------------------

export function getWindowBounds(): WindowBounds {
  return store.get("windowBounds", DEFAULTS.windowBounds);
}

export function setWindowBounds(bounds: WindowBounds): void {
  store.set("windowBounds", bounds);
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

export function getLaunchAtStartup(): boolean {
  return store.get("launchAtStartup", false);
}

export function setLaunchAtStartup(value: boolean): void {
  store.set("launchAtStartup", value);
}

// ---------------------------------------------------------------------------
// Shell preferences
// ---------------------------------------------------------------------------

function getShell(): ShellPreferences {
  return store.get("shell", DEFAULTS.shell);
}

export function getShellPreferences(): ShellPreferences {
  return getShell();
}

export function setShellBackground(background: ShellBackground): ShellPreferences {
  const next: ShellBackground =
    background.type === "color" && background.value
      ? { type: "color", value: background.value }
      : background.type === "image" && background.value
        ? { type: "image", value: background.value }
        : { type: "default", value: "" };
  const shell = { ...getShell(), background: next };
  store.set("shell", shell);
  return shell;
}

export function getBookmarks(): BookmarkEntry[] {
  return getShell().bookmarks ?? [];
}

export function addBookmark(input: { title: string; path: string }): BookmarkEntry[] {
  const path = input.path.trim() || "/";
  const current = getBookmarks().filter((e) => e.path !== path);
  const next: BookmarkEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: (input.title || path).slice(0, 80),
    path,
    createdAt: Date.now(),
  };
  const bookmarks = [next, ...current].slice(0, MAX_BOOKMARKS);
  store.set("shell", { ...getShell(), bookmarks });
  return bookmarks;
}

export function removeBookmark(id: string): BookmarkEntry[] {
  const bookmarks = getBookmarks().filter((e) => e.id !== id);
  store.set("shell", { ...getShell(), bookmarks });
  return bookmarks;
}

// ---------------------------------------------------------------------------
// Impresión
// ---------------------------------------------------------------------------

export function getPrintPreferences(): PrintPreferences {
  return store.get("print", DEFAULTS.print);
}

export function setPreferredPrinter(deviceName: string): PrintPreferences {
  const next: PrintPreferences = { ...getPrintPreferences(), preferredPrinter: deviceName.trim() };
  store.set("print", next);
  return next;
}

export function setSilentPrint(silent: boolean): PrintPreferences {
  const next: PrintPreferences = { ...getPrintPreferences(), silentPrint: silent };
  store.set("print", next);
  return next;
}
