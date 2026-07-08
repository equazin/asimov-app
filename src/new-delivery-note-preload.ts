import { contextBridge, ipcRenderer } from "electron";

const api = {
  openClientSelection: () => {
    ipcRenderer.send("shell:open-client-selection", { contextId: "remito-cliente" });
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
  saveDeliveryNote: (delivery: any) => {
    ipcRenderer.send("shell:delivery-note-saved", { delivery });
  },
  // Documentos entrelazados: traer pedido pendiente del cliente
  listPendingSaleOrders: (clientId: string) =>
    ipcRenderer.invoke("db:doc-links:pending-sale-orders", clientId, "delivery-note"),
  getSourceItems: (type: string, id: string) =>
    ipcRenderer.invoke("db:doc-links:source-items", type, id),
  cancel: () => {
    ipcRenderer.send("shell:delivery-note-saved", { delivery: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewDeliveryNote", api);
export type AsimovNewDeliveryNoteApi = typeof api;
