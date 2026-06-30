import { contextBridge, ipcRenderer } from "electron";

const api = {
  openClientSelection: () => {
    ipcRenderer.send("shell:open-client-selection", { contextId: "factura-cliente" });
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
  saveInvoice: (invoice: any) => {
    ipcRenderer.send("shell:invoice-saved", { invoice });
  },
  cancel: () => {
    ipcRenderer.send("shell:invoice-saved", { invoice: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewInvoice", api);
export type AsimovNewInvoiceApi = typeof api;
