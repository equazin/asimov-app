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
  // Documentos entrelazados: traer pedido/remito pendiente del cliente
  listPendingSaleOrders: (clientId: string) =>
    ipcRenderer.invoke("db:doc-links:pending-sale-orders", clientId, "invoice"),
  listPendingDeliveryNotes: (clientId: string) =>
    ipcRenderer.invoke("db:doc-links:pending-delivery-notes", clientId),
  getSourceItems: (type: string, id: string) =>
    ipcRenderer.invoke("db:doc-links:source-items", type, id),
  cancel: () => {
    ipcRenderer.send("shell:invoice-saved", { invoice: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewInvoice", api);
export type AsimovNewInvoiceApi = typeof api;
