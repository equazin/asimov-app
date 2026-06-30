import { contextBridge, ipcRenderer } from "electron";

const api = {
  openSupplierSelection: () => {
    ipcRenderer.send("shell:open-client-selection", { contextId: "rmc-proveedor" });
  },
  onSupplierSelected: (cb: (data: { client: any; contextId: string }) => void) => {
    ipcRenderer.on("shell:client-selected", (_evt, data) => cb(data));
  },
  openProductSelection: (rowId: string) => {
    ipcRenderer.send("shell:open-product-selection", { rowId });
  },
  onProductSelected: (cb: (data: { product: any; rowId: string }) => void) => {
    ipcRenderer.on("shell:product-selected", (_evt, data) => cb(data));
  },
  saveGoodsReceipt: (receipt: any) => {
    ipcRenderer.send("shell:goods-receipt-saved", { receipt });
  },
  cancel: () => {
    ipcRenderer.send("shell:goods-receipt-saved", { receipt: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewGoodsReceipt", api);
export type AsimovNewGoodsReceiptApi = typeof api;
