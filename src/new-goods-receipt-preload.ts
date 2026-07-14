import { contextBridge, ipcRenderer } from "electron";

const api = {
  openSupplierSelection: (contextId: string = "rmc-proveedor") => {
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
  pendingPurchaseInvoices: (supplierId = "") =>
    ipcRenderer.invoke("db:doc-links:pending-purchase-invoices", supplierId),
  getSourceItems: (type: string, id: string) =>
    ipcRenderer.invoke("db:doc-links:source-items", type, id),
  saveGoodsReceipt: (receipt: any) => {
    ipcRenderer.send("shell:goods-receipt-saved", { receipt });
  },
  cancel: () => {
    ipcRenderer.send("shell:goods-receipt-saved", { receipt: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewGoodsReceipt", api);
export type AsimovNewGoodsReceiptApi = typeof api;
