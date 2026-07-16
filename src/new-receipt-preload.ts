import { contextBridge, ipcRenderer } from "electron";

const api = {
  openClientSelection: () => {
    ipcRenderer.send("shell:open-client-selection", { contextId: "recibo-cliente" });
  },
  onClientSelected: (cb: (data: { client: any; contextId: string }) => void) => {
    ipcRenderer.on("shell:client-selected", (_evt, data) => cb(data));
  },
  // Trae las facturas de venta con saldo pendiente del cliente para el picker.
  // Si `clientId` viene vacío, devuelve las de todos los clientes.
  listClientInvoicesToCollect: (clientId: string) =>
    ipcRenderer.invoke("db:doc-links:client-invoices-to-collect", clientId) as Promise<Array<{
      id: string;
      number: string;
      date: string;
      status: string;
      total: number;
      paid: number;
      balance: number;
      client_id: string | null;
      client_name: string;
      client_cuit: string;
    }>>,
  saveReceipt: (receipt: any) => {
    ipcRenderer.send("shell:receipt-saved", { receipt });
  },
  cancel: () => {
    ipcRenderer.send("shell:receipt-saved", { receipt: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewReceipt", api);
export type AsimovNewReceiptApi = typeof api;
