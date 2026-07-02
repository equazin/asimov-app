import { contextBridge, ipcRenderer } from "electron";

const api = {
  openSupplierSelection: (contextId: string = "fc-proveedor") => {
    ipcRenderer.send("shell:open-supplier-selection", { contextId });
  },
  onSupplierSelected: (cb: (data: { id: string; nombre: string; cuit: string; condIva: string; contextId: string }) => void) => {
    ipcRenderer.on("shell:supplier-selected", (_evt, data) => cb(data));
  },
  openProductSelection: (rowId: string) => {
    ipcRenderer.send("shell:open-product-selection", { rowId });
  },
  onProductSelected: (cb: (data: { product: any; rowId: string }) => void) => {
    ipcRenderer.on("shell:product-selected", (_evt, data) => cb(data));
  },
  savePurchaseInvoice: (invoice: any) => {
    ipcRenderer.send("shell:purchase-invoice-saved", { invoice });
  },
  cancel: () => {
    ipcRenderer.send("shell:purchase-invoice-saved", { invoice: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewPurchaseInvoice", api);
export type AsimovNewPurchaseInvoiceApi = typeof api;
