import { contextBridge, ipcRenderer } from "electron";

const api = {
  openSupplierSelection: () => {
    ipcRenderer.send("shell:open-supplier-selection", { contextId: "recibo-compra-proveedor" });
  },
  onSupplierSelected: (cb: (data: { supplier: any; contextId: string }) => void) => {
    ipcRenderer.on("shell:supplier-selected", (_evt, data) => cb(data));
  },
  // Trae las facturas de compra con saldo pendiente del proveedor para el picker.
  // Si `supplierId` viene vacío, devuelve las de todos los proveedores.
  listPurchaseInvoicesToPay: (supplierId: string) =>
    ipcRenderer.invoke("db:doc-links:purchase-invoices-to-pay", supplierId) as Promise<Array<{
      id: string;
      number: string;
      date: string;
      status: string;
      total: number;
      paid: number;
      balance: number;
      supplier_id: string | null;
      supplier_name: string;
      supplier_cuit: string;
    }>>,
  savePurchaseReceipt: (receipt: any) => {
    ipcRenderer.send("shell:purchase-receipt-saved", { receipt });
  },
  cancel: () => {
    ipcRenderer.send("shell:purchase-receipt-saved", { receipt: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewPurchaseReceipt", api);
export type AsimovNewPurchaseReceiptApi = typeof api;
