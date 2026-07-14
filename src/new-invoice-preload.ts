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
    ipcRenderer.invoke("shell:invoice-authorize", { invoice }) as Promise<{ ok: boolean; pending?: boolean; data?: { cae: string; caeExpiration: string; number: string; qrDataUrl: string; observations: Array<{ code: string; msg: string }> }; error?: string }>,
  afipStatus: () =>
    ipcRenderer.invoke("afip:status") as Promise<{ ok: boolean; data?: { enabled: boolean; canAuthorize: boolean; cuit: string }; error?: string }>,
  // Documentos entrelazados: traer pedido/remito pendiente del cliente
  listPendingSaleOrders: (clientId: string) =>
    ipcRenderer.invoke("db:doc-links:pending-sale-orders", clientId, "invoice"),
  listPendingDeliveryNotes: (clientId: string) =>
    ipcRenderer.invoke("db:doc-links:pending-delivery-notes", clientId),
  // Facturas del cliente para asociar a una nota de crédito/débito
  listClientInvoices: (clientId: string) =>
    ipcRenderer.invoke("db:doc-links:client-invoices", clientId),
  getSourceItems: (type: string, id: string) =>
    ipcRenderer.invoke("db:doc-links:source-items", type, id),
  onAdjustmentPrefill: (cb: (data: any) => void) => {
    ipcRenderer.on("invoice-adjustment:prefill", (_event, data) => cb(data));
  },
  // Cotización del dólar — para el default del input "Cotización USD" al abrir el form.
  dolarLatest: () =>
    ipcRenderer.invoke("dolar:latest") as Promise<{ ok: boolean; data?: Array<{ casa: string; venta: number }>; error?: string }>,
  // Componentes de un kit — para el modo "consolidado" al imprimir.
  getKitInfo: (articleId: string) =>
    ipcRenderer.invoke("db:kits:get", articleId) as Promise<{ ok: boolean; data?: { components: Array<{ component_article_id: string; code: string; name: string; qty: number }> }; error?: string }>,
  cancel: () => {
    ipcRenderer.send("shell:invoice-saved", { invoice: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewInvoice", api);
export type AsimovNewInvoiceApi = typeof api;
