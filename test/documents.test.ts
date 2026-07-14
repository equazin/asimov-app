import { describe, it, expect, beforeEach } from "vitest";
import {
  persistGoodsReceipt, persistDeliveryNote, persistReceipt, persistPaymentOrder,
  persistSaleOrder, persistQuote, persistInvoice, persistPurchaseOrder, persistPurchaseInvoice,
  annulDocument, setInvoicePrintPreferences,
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
    const h = one("SELECT number, status, subtotal, iva_amount, total FROM invoices WHERE id=?", res.id);
    expect(h.number).toMatch(/^0001-\d{8}$/);
    expect(h.status).toBe("borrador");
    expect([h.subtotal, h.iva_amount, h.total]).toEqual([300, 63, 363]);
    expect(one("SELECT COALESCE(SUM(iva_amount),0) i FROM invoice_items WHERE invoice_id=?", res.id).i).toBeCloseTo(63);
  });

  it("factura: al reintentar con el mismo id actualiza el borrador sin duplicarlo", () => {
    const first = persistInvoice({
      tipo: "NC", ptoVta: "0001", nroFact: "15947634", clienteNombre: "Cli",
      items: [{ codigo: "X", descripcion: "Ajuste", cantidad: 1, precio: 100, iva: 21 }],
    });
    const retry = persistInvoice({
      id: first.id, tipo: "NC", ptoVta: "0001", nroFact: "15947634", clienteNombre: "Cli",
      items: [{ codigo: "X", descripcion: "Ajuste", cantidad: 1, precio: 120, iva: 21 }],
    });

    expect(retry.id).toBe(first.id);
    expect(one("SELECT COUNT(*) count FROM invoices WHERE number = ?", ["15947634"]).count).toBe(1);
    expect(one("SELECT total FROM invoices WHERE id = ?", [first.id]).total).toBe(145.2);
  });

  it("factura: guarda usd_rate y show_kit_components (default = 1 si no se pasa)", () => {
    // Default: show_kit_components debe ser 1 cuando el form no lo manda.
    const def = persistInvoice({
      tipo: "B", ptoVta: "0001", clienteNombre: "Cli",
      items: [{ codigo: "X", cantidad: 1, precio: 100, iva: 21 }],
      totales: { total: 121 },
    });
    const h1 = one("SELECT usd_rate, show_kit_components FROM invoices WHERE id=?", def.id);
    expect(h1.usd_rate).toBeNull();
    expect(h1.show_kit_components).toBe(1);

    // Con valores explícitos.
    const res = persistInvoice({
      tipo: "B", ptoVta: "0001", clienteNombre: "Cli",
      items: [{ codigo: "X", cantidad: 1, precio: 100, iva: 21 }],
      totales: { total: 121 },
      cotizacionUsd: 1510.5,
      mostrarComponentesKit: false,
    });
    const h2 = one("SELECT usd_rate, show_kit_components FROM invoices WHERE id=?", res.id);
    expect(h2.usd_rate).toBeCloseTo(1510.5);
    expect(h2.show_kit_components).toBe(0);
  });

  it("factura: convierte precios USD a ARS antes de persistir y conserva el total comercial exacto", () => {
    const res = persistInvoice({
      tipo: "A", ptoVta: "00001", clienteNombre: "CORMETAL S.A",
      monedaPrecios: "USD", cotizacionUsd: 1505,
      items: [
        { codigo: "CPU", cantidad: 1, precio: 273.131625, iva: 10.5 },
        { codigo: "MB", cantidad: 1, precio: 113.60414, iva: 10.5 },
        { codigo: "RAM", cantidad: 2, precio: 195.07241, iva: 10.5 },
        { codigo: "HDD", cantidad: 1, precio: 126.63534, iva: 10.5 },
        { codigo: "SSD", cantidad: 1, precio: 186.53232, iva: 10.5 },
        { codigo: "WC", cantidad: 1, precio: 66.400945, iva: 10.5 },
        { codigo: "PSU", cantidad: 1, precio: 54.82412, iva: 21 },
        { codigo: "CASE", cantidad: 1, precio: 45.574295, iva: 10.5 },
      ],
    });

    const header = one("SELECT subtotal, iva_amount, total, usd_rate, source_currency FROM invoices WHERE id=?", res.id);
    expect(header.total).toBe(2_098_797.75);
    expect(header.subtotal + header.iva_amount).toBeCloseTo(2_098_797.75, 2);
    expect(header.usd_rate).toBe(1505);
    expect(header.source_currency).toBe("USD");
    expect(one("SELECT SUM(subtotal + iva_amount) total FROM invoice_items WHERE invoice_id=?", res.id).total)
      .toBeCloseTo(2_098_797.75, 2);
  });

  it("factura: exige cotización para USD y no reconvierte precios ARS", () => {
    expect(() => persistInvoice({
      clienteNombre: "USD sin cotización", monedaPrecios: "USD",
      items: [{ codigo: "X", cantidad: 1, precio: 100, iva: 21 }],
    })).toThrow(/cotización USD.*válida/i);

    const ars = persistInvoice({
      clienteNombre: "Pesos", monedaPrecios: "ARS", cotizacionUsd: 1505,
      items: [{ codigo: "X", cantidad: 1, precio: 100, iva: 21 }],
    });
    expect(one("SELECT total, source_currency FROM invoices WHERE id=?", ars.id)).toMatchObject({
      total: 121,
      source_currency: "ARS",
    });
  });

  it("factura: guarda consolidated_print + consolidated_label (con fallback de label)", () => {
    // Default: consolidated_print = 0 y label = null cuando el form no lo pide.
    const off = persistInvoice({
      tipo: "B", ptoVta: "0001", clienteNombre: "Cli",
      items: [{ codigo: "X", cantidad: 1, precio: 100, iva: 21 }],
      totales: { total: 121 },
    });
    const h1 = one("SELECT consolidated_print, consolidated_label FROM invoices WHERE id=?", off.id);
    expect(h1.consolidated_print).toBe(0);
    expect(h1.consolidated_label).toBeNull();

    // Activado con label explícito.
    const withLabel = persistInvoice({
      tipo: "B", ptoVta: "0001", clienteNombre: "Cli",
      items: [{ codigo: "X", cantidad: 1, precio: 100, iva: 21 }],
      totales: { total: 121 },
      consolidarItems: true,
      descripcionConsolidada: "PC gaming a medida",
    });
    const h2 = one("SELECT consolidated_print, consolidated_label FROM invoices WHERE id=?", withLabel.id);
    expect(h2.consolidated_print).toBe(1);
    expect(h2.consolidated_label).toBe("PC gaming a medida");

    // Activado SIN label: se guarda el fallback "Equipo armado" en vez de null.
    const noLabel = persistInvoice({
      tipo: "B", ptoVta: "0001", clienteNombre: "Cli",
      items: [{ codigo: "X", cantidad: 1, precio: 100, iva: 21 }],
      totales: { total: 121 },
      consolidarItems: true,
    });
    const h3 = one("SELECT consolidated_print, consolidated_label FROM invoices WHERE id=?", noLabel.id);
    expect(h3.consolidated_print).toBe(1);
    expect(h3.consolidated_label).toBe("Equipo armado");
  });

  it("factura: permite cambiar el formato consolidado después de guardarla", () => {
    const invoice = persistInvoice({
      tipo: "B", ptoVta: "0001", clienteNombre: "Cli",
      items: [
        { codigo: "CPU", descripcion: "Procesador", cantidad: 1, precio: 200, iva: 21 },
        { codigo: "MB", descripcion: "Motherboard", cantidad: 1, precio: 83, iva: 21 },
      ],
    });

    const enabled = setInvoicePrintPreferences(invoice.id, true, "PC completa");
    expect(enabled).toEqual({ id: invoice.id, consolidatedPrint: 1, consolidatedLabel: "PC completa" });
    expect(one("SELECT consolidated_print, consolidated_label FROM invoices WHERE id=?", invoice.id)).toMatchObject({
      consolidated_print: 1,
      consolidated_label: "PC completa",
    });

    setInvoicePrintPreferences(invoice.id, false, "texto ignorado");
    expect(one("SELECT consolidated_print, consolidated_label FROM invoices WHERE id=?", invoice.id)).toMatchObject({
      consolidated_print: 0,
      consolidated_label: null,
    });
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

describe("documents — anulación (reversa de efectos)", () => {
  it("anular una recepción devuelve el stock y marca 'anulado'", () => {
    seedArticle("COD1", 1);
    const gr = persistGoodsReceipt({ proveedorNombre: "P", estado: "Recibido", items: [{ codigo: "COD1", cantRecibida: 7 }] });
    expect(stockOf("art-COD1")).toBe(7);
    expect(annulDocument("goods-receipt", gr.id).ok).toBe(true);
    expect(stockOf("art-COD1")).toBe(0);
    expect(one("SELECT status FROM goods_receipts WHERE id=?", gr.id).status).toBe("anulado");
  });

  it("anular un remito reingresa el stock entregado", () => {
    seedArticle("COD1", 1);
    persistGoodsReceipt({ proveedorNombre: "P", estado: "Recibido", items: [{ codigo: "COD1", cantRecibida: 10 }] });
    const dn = persistDeliveryNote({ clienteNombre: "C", estado: "Entregado", items: [{ codigo: "COD1", cantEntregada: 3 }] });
    expect(stockOf("art-COD1")).toBe(7);
    expect(annulDocument("delivery-note", dn.id).ok).toBe(true);
    expect(stockOf("art-COD1")).toBe(10);
  });

  it("anular un recibo revierte la caja", () => {
    const rec = persistReceipt({ clienteNombre: "C", totalCobrado: 5000, facturas: [{ nroFact: "A-1", cobrado: 5000 }] });
    expect(cashBalance()).toBe(5000);
    expect(annulDocument("receipt", rec.id).ok).toBe(true);
    expect(cashBalance()).toBe(0);
  });

  it("anular una orden de pago revierte la caja", () => {
    persistReceipt({ clienteNombre: "C", totalCobrado: 5000, facturas: [{ nroFact: "A-1", cobrado: 5000 }] });
    const op = persistPaymentOrder({ proveedorNombre: "P", estado: "Ejecutada", totalPago: 2000, facturas: [] });
    expect(cashBalance()).toBe(3000);
    expect(annulDocument("payment-order", op.id).ok).toBe(true);
    expect(cashBalance()).toBe(5000);
  });

  it("anular un documento sin efecto (factura) solo cambia el estado", () => {
    const inv = persistInvoice({ tipo: "B", clienteNombre: "C", items: [{ codigo: "X", cantidad: 1, precio: 100 }], totales: { total: 121 } });
    expect(annulDocument("invoice", inv.id).ok).toBe(true);
    expect(one("SELECT status FROM invoices WHERE id=?", inv.id).status).toBe("anulado");
  });

  it("impide anular localmente una factura autorizada con CAE", () => {
    const inv = persistInvoice({ tipo: "B", clienteNombre: "C", items: [{ codigo: "X", cantidad: 1, precio: 100 }] });
    getDb().prepare("UPDATE invoices SET status='autorizada', cae='75123456789012' WHERE id=?").run(inv.id);

    const result = annulDocument("invoice", inv.id);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/nota de crédito/i);
    expect(one("SELECT status FROM invoices WHERE id=?", inv.id).status).toBe("autorizada");
  });

  it("impide editar una factura que ya tiene CAE", () => {
    const inv = persistInvoice({ tipo: "B", clienteNombre: "C", items: [{ codigo: "X", cantidad: 1, precio: 100 }] });
    getDb().prepare("UPDATE invoices SET status='autorizada', cae='75123456789012' WHERE id=?").run(inv.id);

    expect(() => persistInvoice({ id: inv.id, tipo: "B", clienteNombre: "C editado", items: [{ codigo: "X", cantidad: 2, precio: 100 }] }))
      .toThrow(/autorizada/i);
    expect(one("SELECT cae FROM invoices WHERE id=?", inv.id).cae).toBe("75123456789012");
  });

  it("rechaza doble anulación, tipo inválido e id inexistente", () => {
    const rec = persistReceipt({ clienteNombre: "C", totalCobrado: 100, facturas: [{ nroFact: "A-1", cobrado: 100 }] });
    expect(annulDocument("receipt", rec.id).ok).toBe(true);
    expect(annulDocument("receipt", rec.id).ok).toBe(false);      // ya anulado
    expect(annulDocument("tipo-raro", rec.id).ok).toBe(false);    // tipo no anulable
    expect(annulDocument("receipt", "no-existe").ok).toBe(false); // id inexistente
    expect(cashBalance()).toBe(0);                                 // no se revirtió de más
  });
});
