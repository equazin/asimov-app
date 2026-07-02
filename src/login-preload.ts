import { contextBridge, ipcRenderer } from "electron";

const api = {
  login: (username: string, password: string) =>
    ipcRenderer.invoke("auth:login", { username, password }) as Promise<{ ok: boolean; error?: string }>,
};

contextBridge.exposeInMainWorld("asimovLogin", api);
export type AsimovLoginApi = typeof api;
