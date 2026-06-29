import { contextBridge, ipcRenderer } from "electron";

const api = {
  selectProduct: (product: any, rowId: string) => {
    ipcRenderer.send("shell:product-selected-forward", { product, rowId });
  },
  openNewArticle: () => {
    ipcRenderer.send("shell:open-new-article");
  },
  onSetRowId: (callback: (rowId: string) => void) => {
    ipcRenderer.on("set-row-id", (_event, rowId: string) => callback(rowId));
  },
  onNewArticleAdded: (callback: (article: any) => void) => {
    ipcRenderer.on("shell:new-article-added", (_event, article: any) => callback(article));
  },
  onProductsLoaded: (callback: (products: any[]) => void) => {
    ipcRenderer.on("product-selection:loaded", (_event, products: any[]) => callback(products));
  },
};

contextBridge.exposeInMainWorld("asimovProductSelection", api);
export type AsimovProductSelectionApi = typeof api;
