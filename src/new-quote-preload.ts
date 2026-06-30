import { contextBridge, ipcRenderer } from "electron";

const api = {
  openClientSelection: () => {
    ipcRenderer.send("shell:open-client-selection", { contextId: "cot-cliente" });
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
  saveQuote: (quote: any) => {
    ipcRenderer.send("shell:quote-saved", { quote });
  },
  cancel: () => {
    ipcRenderer.send("shell:quote-saved", { quote: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewQuote", api);
export type AsimovNewQuoteApi = typeof api;
