/**
 * Configuración local persistente de la app de escritorio.
 *
 * Guarda la URL del servidor (para soportar venta multi-cliente: cada cliente
 * apunta a su propio dominio), historial de servidores recientes, y el estado
 * de la ventana. Se serializa con electron-store en el directorio de userData.
 */
import Store from "electron-store";

export interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

export interface ServerEntry {
  url: string;
  label?: string;
  lastUsed: number;
}

export interface DesktopConfig {
  serverUrl: string;
  windowBounds: WindowBounds;
  launchAtStartup: boolean;
  serverHistory: ServerEntry[];
}

const DEFAULTS: DesktopConfig = {
  serverUrl: "",
  windowBounds: { width: 1440, height: 900, maximized: false },
  launchAtStartup: false,
  serverHistory: [],
};

const MAX_HISTORY = 5;

const store = new Store<DesktopConfig>({
  name: "bartez-desktop",
  defaults: DEFAULTS,
});

export function getServerUrl(): string {
  return store.get("serverUrl", "");
}

export function setServerUrl(url: string): void {
  store.set("serverUrl", url);
  addToHistory(url);
}

export function clearServerUrl(): void {
  store.set("serverUrl", "");
}

export function getWindowBounds(): WindowBounds {
  return store.get("windowBounds", DEFAULTS.windowBounds);
}

export function setWindowBounds(bounds: WindowBounds): void {
  store.set("windowBounds", bounds);
}

export function getLaunchAtStartup(): boolean {
  return store.get("launchAtStartup", false);
}

export function setLaunchAtStartup(value: boolean): void {
  store.set("launchAtStartup", value);
}

export function getServerLabel(url = getServerUrl()): string {
  if (!url) return "Sin servidor";
  const entry = getServerHistory().find((item) => item.url === url);
  if (entry?.label) return entry.label;
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// --- Server history --------------------------------------------------------

export function getServerHistory(): ServerEntry[] {
  return store.get("serverHistory", []);
}

function addToHistory(url: string): void {
  const history = getServerHistory().filter((e) => e.url !== url);
  history.unshift({ url, lastUsed: Date.now() });
  store.set("serverHistory", history.slice(0, MAX_HISTORY));
}

export function removeFromHistory(url: string): void {
  const history = getServerHistory().filter((e) => e.url !== url);
  store.set("serverHistory", history);
}

export function updateHistoryLabel(url: string, label: string): void {
  const history = getServerHistory().map((e) =>
    e.url === url ? { ...e, label: label.trim() || undefined } : e,
  );
  store.set("serverHistory", history);
}

export function hasCompletedOnboarding(): boolean {
  return (store as unknown as { get(key: string, def: boolean): boolean }).get("onboardingDone", false);
}

export function setOnboardingDone(): void {
  (store as unknown as { set(key: string, val: boolean): void }).set("onboardingDone", true);
}

/**
 * Normaliza y valida una URL de servidor ingresada por el usuario.
 * Acepta "bartez.com.ar" → "https://bartez.com.ar". Rechaza esquemas no http(s).
 * Devuelve la URL normalizada (sin barra final) o null si es inválida.
 */
export function normalizeServerUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.origin;
  } catch {
    return null;
  }
}
