import { contextBridge, ipcRenderer } from "electron";

const api = {
  /** Login local (usuarios del SQLite embebido). Se mantiene para modo offline. */
  login: (username: string, password: string) =>
    ipcRenderer.invoke("auth:login", { username, password }) as Promise<{ ok: boolean; error?: string }>,

  // --- Cloud login (v2) ---
  cloudStatus: () =>
    ipcRenderer.invoke("cloud:status") as Promise<{ connected: boolean; user: { email: string; name: string; role: string; tenantId: string } | null; apiUrl: string }>,
  cloudLogin: (email: string, password: string) =>
    ipcRenderer.invoke("cloud:login", { email, password }) as Promise<{ ok: boolean; error?: string; user?: { email: string; name: string; role: string; tenantId: string }; tenantId?: string }>,
  cloudTest: () =>
    ipcRenderer.invoke("cloud:test") as Promise<{ ok: boolean; reachable: boolean }>,
  cloudSetUrl: (url: string) =>
    ipcRenderer.invoke("cloud:set-url", url) as Promise<{ ok: boolean; url?: string; error?: string }>,
  /** Después de un login cloud OK, avisa al main para abrir el shell. */
  cloudCompleteLogin: () =>
    ipcRenderer.invoke("cloud:complete-login") as Promise<{ ok: boolean }>,
};

contextBridge.exposeInMainWorld("asimovLogin", api);
export type AsimovLoginApi = typeof api;
