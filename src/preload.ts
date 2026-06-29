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
};

contextBridge.exposeInMainWorld("bartezDesktop", api);

export type BartezDesktopApi = typeof api;
