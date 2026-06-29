import { contextBridge, ipcRenderer } from "electron";

const api = {
  createClient: (client: any) => {
    ipcRenderer.send("shell:client-created", { client });
  },
  cancel: () => {
    ipcRenderer.send("shell:client-created", { client: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewClient", api);
export type AsimovNewClientApi = typeof api;
