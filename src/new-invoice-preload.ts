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
  // Autoriza en AFIP: persiste la factura y pide el CAE en un paso; devuelve
  // el CAE/número sin cerrar la ventana (para imprimir con CAE).
  authorizeInvoice: (invoice: any) =>
    ipcRenderer.invoke("shell:invoice-authorize", { invoice }) as Promise<{ ok: boolean; data?: { cae: string; caeExpiration: string; number: string; observations: Array<{ code: string; msg: string }> }; error?: string }>,
  afipStatus: () =>
    ipcRenderer.invoke("afip:status") as Promise<{ ok: boolean; data?: { enabled: boolean; cuit: string }; error?: string }>,
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
