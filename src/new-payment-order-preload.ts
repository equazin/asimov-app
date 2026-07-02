import { contextBridge, ipcRenderer } from "electron";

const api = {
  openSupplierSelection: (contextId: string = "op-proveedor") => {
    ipcRenderer.send("shell:open-supplier-selection", { contextId });
  },
  onSupplierSelected: (cb: (data: { id: string; nombre: string; cuit: string; condIva: string; contextId: string }) => void) => {
    ipcRenderer.on("shell:supplier-selected", (_evt, data) => cb(data));
  },
  savePaymentOrder: (order: any) => {
    ipcRenderer.send("shell:payment-order-saved", { order });
  },
  cancel: () => {
    ipcRenderer.send("shell:payment-order-saved", { order: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewPaymentOrder", api);
export type AsimovNewPaymentOrderApi = typeof api;
