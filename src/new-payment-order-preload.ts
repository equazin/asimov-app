import { contextBridge, ipcRenderer } from "electron";

const api = {
  openSupplierSelection: () => {
    ipcRenderer.send("shell:open-client-selection", { contextId: "op-proveedor" });
  },
  onSupplierSelected: (cb: (data: { client: any; contextId: string }) => void) => {
    ipcRenderer.on("shell:client-selected", (_evt, data) => cb(data));
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
