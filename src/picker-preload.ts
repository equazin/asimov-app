/**
 * Preload del selector de servidor (pantalla de primer arranque / cambio de servidor).
 * Expone operaciones de configuración de servidor + historial de recientes.
 */
import { contextBridge, ipcRenderer } from "electron";

const api = {
  validate: (url: string) => ipcRenderer.invoke("server:validate", url),
  set: (url: string) => ipcRenderer.invoke("server:set", url),
  getCurrent: () => ipcRenderer.invoke("server:get"),
  getHistory: () => ipcRenderer.invoke("server:history"),
  removeFromHistory: (url: string) => ipcRenderer.invoke("server:history:remove", url),
  setLabel: (url: string, label: string) => ipcRenderer.invoke("server:history:label", url, label),
  isOnboardingDone: () => ipcRenderer.invoke("onboarding:status"),
  completeOnboarding: () => ipcRenderer.invoke("onboarding:done"),
};

contextBridge.exposeInMainWorld("bartezSetup", api);

export type BartezSetupApi = typeof api;
