import { contextBridge, ipcRenderer } from "electron";

const api = {
  openClientSelection: () => {
    ipcRenderer.send("shell:open-client-selection", { contextId: "recibo-cliente" });
  },
  onClientSelected: (cb: (data: { client: any; contextId: string }) => void) => {
    ipcRenderer.on("shell:client-selected", (_evt, data) => cb(data));
  },
  saveReceipt: (receipt: any) => {
    ipcRenderer.send("shell:receipt-saved", { receipt });
  },
  cancel: () => {
    ipcRenderer.send("shell:receipt-saved", { receipt: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewReceipt", api);
export type AsimovNewReceiptApi = typeof api;
