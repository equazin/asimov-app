import { contextBridge, ipcRenderer } from "electron";

const api = {
  getVersion: () => ipcRenderer.invoke("app:version"),
  onProgress: (cb: (pct: number, msg: string) => void) => {
    ipcRenderer.on("splash:progress", (_e, pct: number, msg: string) => cb(pct, msg));
  },
};

contextBridge.exposeInMainWorld("bartezSplash", api);
