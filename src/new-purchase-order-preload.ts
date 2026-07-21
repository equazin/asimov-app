import { contextBridge, ipcRenderer } from "electron";

const api = {
  openSupplierSelection: (contextId: string = "oc-proveedor") => {
    ipcRenderer.send("shell:open-supplier-selection", { contextId });
  },
  onSupplierSelected: (cb: (data: { id: string; nombre: string; cuit: string; condIva: string; contextId: string }) => void) => {
    ipcRenderer.on("shell:supplier-selected", (_evt, data) => cb(data));
  },
  openProductSelection: (rowId: string) => {
    ipcRenderer.send("shell:open-product-selection", { rowId });
  },
  onProductSelected: (cb: (data: { product: any; rowId: string }) => void) => {
    ipcRenderer.on("shell:product-selected", (_evt, data) => cb(data));
  },
  savePurchaseOrder: (order: any) => {
    ipcRenderer.send("shell:purchase-order-saved", { order });
  },
  // Abre el diálogo del OS y parsea la Nota de Venta de AIR (PDF). Devuelve
  // { ok, cancelled?, data?: AirPdfNota, error? }. Los ítems vienen ya
  // matcheados contra el catálogo local de air_products.
  importAirPdf: () => ipcRenderer.invoke("air:parse-pdf", "") as Promise<{
    ok: boolean;
    cancelled?: boolean;
    error?: string;
    data?: {
      number: string;
      date: string;
      totalArs: number;
      totalUsd: number;
      exchangeRate: number;
      items: Array<{
        qty: number;
        code: string;
        descriptionFromPdf: string;
        subtotal: number;
        unitPrice: number;
        ivaPct: number;
        isPrimary: boolean;
        match: {
          articleId: string | null;
          localName: string | null;
          localCostArs: number | null;
          localCostUsd: number | null;
          localIvaPct: number | null;
        };
      }>;
      unmatchedCodes: string[];
    };
  }>,
  // Busca en `suppliers` un proveedor por nombre (para autoseleccionar AIR).
  findSupplierByName: (name: string) => ipcRenderer.invoke("db:suppliers:find-by-name", name) as Promise<{
    id: string; business_name: string; cuit: string; fiscal_type: string; address: string;
  } | null>,
  cancel: () => {
    ipcRenderer.send("shell:purchase-order-saved", { order: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewPurchaseOrder", api);
export type AsimovNewPurchaseOrderApi = typeof api;
