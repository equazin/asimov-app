import { contextBridge, ipcRenderer } from "electron";

const api = {
  getServerUrl: () => ipcRenderer.invoke("server:get"),
  retry: () => ipcRenderer.invoke("offline:retry"),
  changeServer: () => ipcRenderer.invoke("server:change"),
};

contextBridge.exposeInMainWorld("bartezOffline", api);
