import { contextBridge, ipcRenderer } from "electron";

const api = {
  createArticle: (article: any) => {
    ipcRenderer.send("shell:article-created", { article });
  },
  cancel: () => {
    // Send a message with null to close the window without creating
    ipcRenderer.send("shell:article-created", { article: null });
  }
};

contextBridge.exposeInMainWorld("asimovNewArticle", api);
export type AsimovNewArticleApi = typeof api;
