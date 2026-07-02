import { describe, it, expect, beforeEach } from "vitest";
import {
  persistGoodsReceipt, persistDeliveryNote, persistReceipt, persistPaymentOrder,
  persistSaleOrder, persistQuote, persistInvoice, persistPurchaseOrder, persistPurchaseInvoice,
} from "../src/documents";
import { getDb } from "../src/db";
import { initTestDb, seedArticle } from "./helpers";

beforeEach(() => initTestDb());

const one = (sql: string, ...p: unknown[]) => getDb().prepare(sql).get(...p) as any;
const stockOf = (articleId: string) =>
  one("SELECT COALESCE(SUM(qty),0) q FROM article_stock WHERE article_id=?", articleId).q;
const cashBalance = () => one("SELECT COALESCE(SUM(balance),0) b FROM cash_accounts").b;

describe("documents — recepción de mercadería (stock IN)", () => {
  it("persiste header + ítems y suma stock solo de artículos locales con stock", () => {
    seedArticle("COD1", 1);   // maneja stock
    seedArticle("COD2", 0);   // servicio, no maneja stock
    const res = persistGoodsReceipt({
      proveedorNombre: "Prov", fecha: "02/07/2026", estado: "Recibido",
      items: [
        { codigo: "COD1", descripcion: "Art Uno", cantPedida: 10, cantRecibida: 7 },
        { codigo: "COD2", descripcion: "Servicio", cantPedida: 1, cantRecibida: 1 },
        { codigo: "NOEXISTE", descripcion: "Libre", cantPedida: 3, cantRecibida: 3 },
      ],
    });
    expect(res.number).toMatch(/^RMC-/);
    expect(res.stockMoved).toBe(1);
    expect(stockOf("art-COD1")).toBe(7);
    expect(stockOf("art-COD2")).toBe(0);
    expect(one("SELECT COUNT(*) c FROM goods_receipt_items WHERE receipt_id=?", res.id).c).toBe(3);
    expect(one("SELECT date FROM goods_receipts WHERE id=?", res.id).date).toBe("2026-07-02");
  });

  it("recepción rechazada no mueve stock", () => {
    seedArticle("COD1", 1);
    const res = persistGoodsReceipt({
      proveedorNombre: "Prov", estado: "Rechazada",
      items: [{ codigo: "COD1", cantRecibida: 5 }],
    });
    expect(res.stockMoved).toBe(0);
    expect(stockOf("art-COD1")).toBe(0);
  });

  it("re-guardar la misma recepción no duplica stock (idempotente)", () => {
    seedArticle("COD1", 1);
    const res = persistGoodsReceipt({ proveedorNombre: "P", estado: "Recibido", items: [{ codigo: "COD1", cantRecibida: 7 }] });
    persistGoodsReceipt({ id: res.id, proveedorNombre: "P", estado: "Recibido", items: [{ codigo: "COD1", cantRecibida: 7 }] });
    expect(stockOf("art-COD1")).toBe(7);
    expect(one("SELECT COUNT(*) c FROM stock_movements WHERE reference_id=?", res.id).c).toBe(1);
  });
});

describe("documents — remito (stock OUT)", () => {
  it("descuenta stock de los ítems entregados", () => {
    seedArticle("COD1", 1);
    persistGoodsReceipt({ proveedorNombre: "P", estado: "Recibido", items: [{ codigo: "COD1", cantRecibida: 10 }] });
    const res = persistDeliveryNote({
      clienteNombre: "Cli", fecha: "03/07/2026", estado: "Entregado",
      items: [{ codigo: "COD1", unidad: "un", cantPedida: 3, cantEntregada: 3 }],
    });
    expect(res.number).toMatch(/^REM-/);
    expect(res.stockMoved).toBe(1);
    expect(stockOf("art-COD1")).toBe(7);
  });

  it("remito anulado no descuenta stock", () => {
    seedArticle("COD1", 1);
    persistGoodsReceipt({ proveedorNombre: "P", estado: "Recibido", items: [{ codigo: "COD1", cantRecibida: 10 }] });
    persistDeliveryNote({ clienteNombre: "Cli", estado: "Anulado", items: [{ codigo: "COD1", cantEntregada: 3 }] });
    expect(stockOf("art-COD1")).toBe(10);
  });
});

describe("documents — caja (recibo IN, orden de pago OUT)", () => {
  it("recibo suma a caja y registra ítems", () => {
    const res = persistReceipt({
      clienteNombre: "Cli", fecha: "04/07/2026", concepto: "Cobro", totalCobrado: 5000,
      facturas: [{ nroFact: "A-0001", importe: 5000, cobrado: 5000 }],
    });
    expect(res.number).toMatch(/^REC-/);
    expect(res.cashMoved).toBe(1);
    expect(cashBalance()).toBe(5000);
    expect(one("SELECT COUNT(*) c FROM receipt_items WHERE receipt_id=?", res.id).c).toBe(1);
  });

  it("orden de pago resta de caja", () => {
    persistReceipt({ clienteNombre: "Cli", totalCobrado: 5000, facturas: [{ nroFact: "A-1", cobrado: 5000 }] });
    const res = persistPaymentOrder({
      proveedorNombre: "Prov", estado: "Ejecutada", metodo: "transferencia", totalPago: 2000,
      facturas: [{ nro: "B-9", original: 2000, apagar: 2000 }],
    });
    expect(res.number).toMatch(/^OP-/);
    expect(res.cashMoved).toBe(1);
    expect(cashBalance()).toBe(3000);
  });

  it("orden de pago anulada no mueve caja", () => {
    const res = persistPaymentOrder({ proveedorNombre: "P", estado: "Anulada", totalPago: 999, facturas: [] });
    expect(res.cashMoved).toBe(0);
    expect(cashBalance()).toBe(0);
  });

  it("re-guardar recibo no duplica caja (idempotente)", () => {
    const res = persistReceipt({ clienteNombre: "Cli", totalCobrado: 5000, facturas: [{ nroFact: "A-1", cobrado: 5000 }] });
    persistReceipt({ id: res.id, clienteNombre: "Cli", totalCobrado: 5000, facturas: [{ nroFact: "A-1", cobrado: 5000 }] });
    expect(cashBalance()).toBe(5000);
    expect(one("SELECT COUNT(*) c FROM cash_movements WHERE reference_id=?", res.id).c).toBe(1);
  });
});

describe("documents — comprobantes header + ítems (sin efecto de stock/caja)", () => {
  it("pedido de venta: totales del renderer + ítems", () => {
    const res = persistSaleOrder({
      clienteNombre: "Cli", fecha: "06/07/2026", moneda: "ARS",
      items: [{ codigo: "COD1", descripcion: "X", unidad: "un", cantidad: 2, precio: 100, iva: 21 }],
      totales: { neto: 200, iva21: 42, iva10: 0, total: 242 },
    });
    const h = one("SELECT subtotal, iva_amount, total FROM sale_orders WHERE id=?", res.id);
    expect(res.number).toMatch(/^PED-/);
    expect([h.subtotal, h.iva_amount, h.total]).toEqual([200, 42, 242]);
    expect(one("SELECT COALESCE(SUM(subtotal),0) s FROM sale_order_items WHERE order_id=?", res.id).s).toBe(200);
  });

  it("cotización: total y valid_until", () => {
    const res = persistQuote({
      clienteNombre: "Cli", fecha: "06/07/2026", validoHasta: "20/07/2026",
      items: [{ codigo: "COD1", descripcion: "X", cantidad: 1, precio: 500, iva: 21 }],
      totales: { total: 605 },
    });
    const h = one("SELECT total, valid_until FROM quotes WHERE id=?", res.id);
    expect(h.total).toBe(605);
    expect(h.valid_until).toBe("2026-07-20");
  });

  it("factura de venta: número con punto de venta e IVA por línea", () => {
    const res = persistInvoice({
      tipo: "B", ptoVta: "0001", clienteNombre: "Cli", fecha: "06/07/2026",
      items: [{ codigo: "COD1", descripcion: "X", cantidad: 3, precio: 100, iva: 21 }],
      totales: { neto21: 300, neto10: 0, neto0: 0, iva21: 63, iva10: 0, total: 363 },
    });
    const h = one("SELECT number, subtotal, iva_amount, total FROM invoices WHERE id=?", res.id);
    expect(h.number).toMatch(/^0001-\d{8}$/);
    expect([h.subtotal, h.iva_amount, h.total]).toEqual([300, 63, 363]);
    expect(one("SELECT COALESCE(SUM(iva_amount),0) i FROM invoice_items WHERE invoice_id=?", res.id).i).toBeCloseTo(63);
  });

  it("orden de compra: total calculado server-side desde los ítems", () => {
    const res = persistPurchaseOrder({
      proveedorNombre: "Prov", fecha: "06/07/2026",
      items: [{ codigo: "COD1", descripcion: "X", cantidad: 4, precio: 50, ivaPct: 21, subtotal: 200 }],
    });
    expect(res.number).toMatch(/^OC-/);
    expect(one("SELECT total FROM purchase_orders WHERE id=?", res.id).total).toBe(200);
  });

  it("factura de compra: subtotal + IVA + percepciones = total, número del proveedor", () => {
    const res = persistPurchaseInvoice({
      tipo: "A", nroFactura: "A-0001-00000123", fechaFactura: "06/07/2026", proveedorNombre: "Prov", percepciones: 10,
      items: [{ codigo: "COD1", descripcion: "X", cantidad: 2, precio: 100, ivaPct: 21, subtotal: 200 }],
    });
    const h = one("SELECT number, subtotal, iva_amount, total FROM purchase_invoices WHERE id=?", res.id);
    expect(h.number).toBe("A-0001-00000123");
    expect([h.subtotal, h.iva_amount, h.total]).toEqual([200, 42, 252]);
  });

  it("estos documentos no tocan stock ni caja", () => {
    seedArticle("COD1", 1);
    persistSaleOrder({ clienteNombre: "C", items: [{ codigo: "COD1", cantidad: 2, precio: 100 }], totales: { total: 242 } });
    persistInvoice({ tipo: "B", clienteNombre: "C", items: [{ codigo: "COD1", cantidad: 2, precio: 100 }], totales: { total: 242 } });
    expect(stockOf("art-COD1")).toBe(0);
    expect(cashBalance()).toBe(0);
  });
});
