import { contextBridge, ipcRenderer } from "electron";

const api = {
  selectSupplier: (supplier: any, contextId: string) => {
    ipcRenderer.send("shell:supplier-selected-forward", { supplier, contextId });
  },
  openNewSupplier: () => {
    ipcRenderer.send("shell:open-new-supplier");
  },
  onInit: (callback: (data: { contextId: string }) => void) => {
    ipcRenderer.on("supplier-selection:init", (_event, data) => callback(data));
  },
  onSuppliersLoaded: (callback: (suppliers: any[]) => void) => {
    ipcRenderer.on("supplier-selection:loaded", (_event, suppliers) => callback(suppliers));
  },
};

contextBridge.exposeInMainWorld("asimovSupplierSelection", api);
export type AsimovSupplierSelectionApi = typeof api;
