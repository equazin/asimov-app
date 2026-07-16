import { contextBridge, ipcRenderer } from "electron";

interface EditPrefill {
  id: string;
  code: string;
  name: string;
  sale_price: number;
  price_usd: number;
  iva_pct: number;
  category: string;
  line: string;
  components: Array<{ articleId: string; code: string; name: string; qty: number; cost_price: number; sale_price: number; source?: string }>;
}

const api = {
  createArticle: (article: any) => {
    ipcRenderer.send("shell:article-created", { article });
  },
  // Esquemas/kits: buscar artículos para usarlos como componentes
  searchArticles: (search: string) => ipcRenderer.invoke("db:stock:list", search),
  // Se dispara cuando el shell abre el form en modo edición: rellena todos los campos.
  onEditPrefill: (cb: (data: EditPrefill) => void) => {
    ipcRenderer.on("article-edit:prefill", (_evt, data: EditPrefill) => cb(data));
  },
  cancel: () => {
    // Send a message with null to close the window without creating
    ipcRenderer.send("shell:article-created", { article: null });
  }
};

contextBridge.exposeInMainWorld("asimovNewArticle", api);
export type AsimovNewArticleApi = typeof api;
