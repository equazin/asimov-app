import { contextBridge, ipcRenderer } from "electron";

const api = {
  selectClient: (client: any, contextId: string) => {
    ipcRenderer.send("shell:client-selected-forward", { client, contextId });
  },
  openNewClient: () => {
    ipcRenderer.send("shell:open-new-client");
  },
  onInit: (callback: (data: { contextId: string }) => void) => {
    ipcRenderer.on("client-selection:init", (_event, data) => callback(data));
  },
  onClientsLoaded: (callback: (clients: any[]) => void) => {
    ipcRenderer.on("client-selection:loaded", (_event, clients) => callback(clients));
  },
};

contextBridge.exposeInMainWorld("asimovClientSelection", api);
export type AsimovClientSelectionApi = typeof api;
