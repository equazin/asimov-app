import { contextBridge, ipcRenderer } from "electron";

const api = {
  openClientSelection: () => {
    ipcRenderer.send("shell:open-client-selection", { contextId: "pedido-cliente" });
  },
  onClientSelected: (cb: (data: { client: any; contextId: string }) => void) => {
    ipcRenderer.on("shell:client-selected", (_evt, data) => cb(data));
  },
  openProductSelection: (rowId: string) => {
    ipcRenderer.send("shell:open-product-selection", { rowId });
  },
  onProductSelected: (cb: (data: { product: any; rowId: string }) => void) => {
    ipcRenderer.on("shell:product-selected", (_evt, data) => cb(data));
  },
  saveSaleOrder: (order: any) => {
    ipcRenderer.send("shell:sale-order-saved", { order });
  },
  cancel: () => {
    ipcRenderer.send("shell:sale-order-saved", { order: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewSaleOrder", api);
export type AsimovNewSaleOrderApi = typeof api;
