import { contextBridge, ipcRenderer } from "electron";

const api = {
  createSupplier: (supplier: any) => {
    ipcRenderer.send("shell:supplier-created", { supplier });
  },
  cancel: () => {
    ipcRenderer.send("shell:supplier-created", { supplier: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewSupplier", api);
export type AsimovNewSupplierApi = typeof api;
