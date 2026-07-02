/**
 * Verificación de integración de los documentos de Fase 1 contra una DB SQLite
 * temporal aislada. Corre bajo Node puro con un stub de `electron`, ejercitando
 * el código real de db.js y documents.js.
 *   node scripts/verify-documents.js
 */
const Module = require("node:module");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asimov-verify-"));
const fakeElectron = { app: { getPath: () => tmp } };
const origLoad = Module._load;
Module._load = function (request) {
  if (request === "electron") return fakeElectron;
  return origLoad.apply(this, arguments);
};

const { initDb, getDb, dbGet } = require("../dist/db.js");
const docs = require("../dist/documents.js");

initDb();
const db = getDb();
db.prepare("INSERT INTO articles (id,code,name,manages_stock,active) VALUES ('art-1','COD1','Art Uno',1,1)").run();

const checks = [];
const check = (name, cond) => { checks.push({ name, ok: !!cond }); };

// ── Recepción → stock +7 ──────────────────────────────────────────────
const gr = docs.persistGoodsReceipt({
  proveedorNombre: "Prov", fecha: "02/07/2026", estado: "Recibido",
  items: [{ codigo: "COD1", descripcion: "Art Uno", cantPedida: 10, cantRecibida: 7 }],
});
let stock = dbGet("SELECT COALESCE(SUM(qty),0) q FROM article_stock WHERE article_id='art-1'").q;
check("recepción persiste + stock 7", gr.number && gr.stockMoved === 1 && stock === 7);

// ── Remito → stock -3 (queda 4) ───────────────────────────────────────
const dn = docs.persistDeliveryNote({
  clienteNombre: "Cli", fecha: "03/07/2026", estado: "Entregado",
  items: [{ codigo: "COD1", descripcion: "Art Uno", unidad: "un", cantPedida: 3, cantEntregada: 3 }],
});
stock = dbGet("SELECT COALESCE(SUM(qty),0) q FROM article_stock WHERE article_id='art-1'").q;
const movNet = dbGet("SELECT COALESCE(SUM(qty),0) q FROM stock_movements WHERE article_id='art-1'").q;
check("remito persiste + stock baja a 4", dn.number && dn.stockMoved === 1 && stock === 4 && movNet === 4);

// ── Recibo → caja +5000 ───────────────────────────────────────────────
const rec = docs.persistReceipt({
  clienteNombre: "Cli", fecha: "04/07/2026", concepto: "Cobro",
  totalCobrado: 5000,
  facturas: [{ nroFact: "A-0001", importe: 5000, saldo: 5000, cobrado: 5000 }],
});
let balance = dbGet("SELECT COALESCE(SUM(balance),0) b FROM cash_accounts").b;
const recItems = dbGet("SELECT COUNT(*) c FROM receipt_items WHERE receipt_id=?", [rec.id]).c;
check("recibo persiste + caja +5000", rec.number && rec.cashMoved === 1 && balance === 5000 && recItems === 1);

// ── Orden de pago → caja -2000 (queda 3000) ───────────────────────────
const op = docs.persistPaymentOrder({
  proveedorNombre: "Prov", fecha: "05/07/2026", estado: "Ejecutada", metodo: "transferencia",
  totalPago: 2000,
  facturas: [{ nro: "B-0009", original: 2000, apagar: 2000 }],
});
balance = dbGet("SELECT COALESCE(SUM(balance),0) b FROM cash_accounts").b;
check("orden de pago persiste + caja 3000", op.number && op.cashMoved === 1 && balance === 3000);

// ── Idempotencia: re-guardar la recepción no re-suma stock ────────────
docs.persistGoodsReceipt({
  id: gr.id, proveedorNombre: "Prov", fecha: "02/07/2026", estado: "Recibido",
  items: [{ codigo: "COD1", descripcion: "Art Uno", cantPedida: 10, cantRecibida: 7 }],
});
stock = dbGet("SELECT COALESCE(SUM(qty),0) q FROM article_stock WHERE article_id='art-1'").q;
check("re-guardar recepción NO duplica (stock sigue 4)", stock === 4);

// ── Idempotencia caja: re-guardar el recibo no re-suma ────────────────
docs.persistReceipt({ id: rec.id, clienteNombre: "Cli", fecha: "04/07/2026", totalCobrado: 5000,
  facturas: [{ nroFact: "A-0001", importe: 5000, cobrado: 5000 }] });
balance = dbGet("SELECT COALESCE(SUM(balance),0) b FROM cash_accounts").b;
check("re-guardar recibo NO duplica (caja sigue 3000)", balance === 3000);

// ── Documentos header + ítems (sin efecto de stock/caja) ──────────────
const so = docs.persistSaleOrder({
  clienteNombre: "Cli", fecha: "06/07/2026", moneda: "ARS",
  items: [{ codigo: "COD1", descripcion: "Art Uno", unidad: "un", cantidad: 2, precio: 100, iva: 21 }],
  totales: { neto: 200, iva21: 42, iva10: 0, total: 242 },
});
let hdr = dbGet("SELECT subtotal, iva_amount, total FROM sale_orders WHERE id=?", [so.id]);
let its = dbGet("SELECT COUNT(*) c, COALESCE(SUM(subtotal),0) s FROM sale_order_items WHERE order_id=?", [so.id]);
check("pedido de venta: header 200/42/242 + 1 ítem sub 200",
  so.number && hdr.subtotal === 200 && hdr.iva_amount === 42 && hdr.total === 242 && its.c === 1 && its.s === 200);

const qt = docs.persistQuote({
  clienteNombre: "Cli", fecha: "06/07/2026",
  items: [{ codigo: "COD1", descripcion: "Art Uno", cantidad: 1, precio: 500, iva: 21 }],
  totales: { total: 605 },
});
hdr = dbGet("SELECT total FROM quotes WHERE id=?", [qt.id]);
its = dbGet("SELECT COUNT(*) c FROM quote_items WHERE quote_id=?", [qt.id]);
check("cotización: total 605 + 1 ítem", qt.number && hdr.total === 605 && its.c === 1);

const inv = docs.persistInvoice({
  tipo: "B", ptoVta: "0001", clienteNombre: "Cli", fecha: "06/07/2026",
  items: [{ codigo: "COD1", descripcion: "Art Uno", cantidad: 3, precio: 100, iva: 21 }],
  totales: { neto21: 300, neto10: 0, neto0: 0, iva21: 63, iva10: 0, total: 363 },
});
hdr = dbGet("SELECT number, subtotal, iva_amount, total, tipo FROM invoices WHERE id=?", [inv.id]);
its = dbGet("SELECT COUNT(*) c, COALESCE(SUM(iva_amount),0) i FROM invoice_items WHERE invoice_id=?", [inv.id]);
check("factura venta: 300/63/363, nro con PtoVta, iva línea 63",
  inv.number && hdr.number.startsWith("0001-") && hdr.subtotal === 300 && hdr.iva_amount === 63 && hdr.total === 363 && its.c === 1 && its.i === 63);

const po = docs.persistPurchaseOrder({
  proveedorNombre: "Prov", fecha: "06/07/2026",
  items: [{ codigo: "COD1", descripcion: "Art Uno", cantidad: 4, precio: 50, ivaPct: 21, subtotal: 200 }],
});
hdr = dbGet("SELECT total FROM purchase_orders WHERE id=?", [po.id]);
its = dbGet("SELECT COUNT(*) c FROM purchase_order_items WHERE order_id=?", [po.id]);
check("orden de compra: total 200 + 1 ítem", po.number && hdr.total === 200 && its.c === 1);

const pi = docs.persistPurchaseInvoice({
  tipo: "A", nroFactura: "A-0001-00000123", fechaFactura: "06/07/2026", proveedorNombre: "Prov", percepciones: 10,
  items: [{ codigo: "COD1", descripcion: "Art Uno", cantidad: 2, precio: 100, ivaPct: 21, subtotal: 200 }],
});
hdr = dbGet("SELECT number, subtotal, iva_amount, total FROM purchase_invoices WHERE id=?", [pi.id]);
its = dbGet("SELECT COUNT(*) c FROM purchase_invoice_items WHERE invoice_id=?", [pi.id]);
check("factura compra: 200 + IVA 42 + perc 10 = total 252",
  pi.number === "A-0001-00000123" && hdr.subtotal === 200 && hdr.iva_amount === 42 && hdr.total === 252 && its.c === 1);

// Los documentos header-only NO deben tocar stock ni caja.
const stockUnchanged = dbGet("SELECT COALESCE(SUM(qty),0) q FROM article_stock WHERE article_id='art-1'").q;
const cashUnchanged = dbGet("SELECT COALESCE(SUM(balance),0) b FROM cash_accounts").b;
check("documentos header-only NO mueven stock (sigue 4) ni caja (sigue 3000)",
  stockUnchanged === 4 && cashUnchanged === 3000);

// ── Totales recalculados en el main (ignora los `totales` del renderer) ────
const soBad = docs.persistSaleOrder({
  clienteNombre: "Cli", fecha: "07/07/2026", moneda: "ARS",
  items: [{ codigo: "COD1", descripcion: "Art Uno", unidad: "un", cantidad: 2, precio: 100, iva: 21 }],
  totales: { neto: 999999, iva21: 999999, iva10: 0, total: 999999 },
});
let bad = dbGet("SELECT subtotal, iva_amount, total FROM sale_orders WHERE id=?", [soBad.id]);
check("pedido: totales se recalculan del ítem (ignora `totales` adulterados)",
  bad.subtotal === 200 && bad.iva_amount === 42 && bad.total === 242);

const invBad = docs.persistInvoice({
  tipo: "B", ptoVta: "0001", clienteNombre: "Cli", fecha: "07/07/2026",
  items: [{ codigo: "COD1", descripcion: "Art Uno", cantidad: 3, precio: 100, iva: 21 }],
  totales: { neto21: 1, iva21: 1, total: 1 },
});
bad = dbGet("SELECT subtotal, iva_amount, total FROM invoices WHERE id=?", [invBad.id]);
check("factura: totales se recalculan del ítem (ignora `totales` adulterados)",
  bad.subtotal === 300 && bad.iva_amount === 63 && bad.total === 363);

// ── Anular con reversa explícita de efectos ────────────────────────────────
// Punto de partida: stock 4, caja 3000.
const annDn = docs.annulDocument("delivery-note", dn.id);
stock = dbGet("SELECT COALESCE(SUM(qty),0) q FROM article_stock WHERE article_id='art-1'").q;
const dnStatus = dbGet("SELECT status FROM delivery_notes WHERE id=?", [dn.id]).status;
check("anular remito revierte stock (4→7) y marca anulado",
  annDn.ok === true && stock === 7 && /anul/i.test(dnStatus));

const annRec = docs.annulDocument("receipt", rec.id);
balance = dbGet("SELECT COALESCE(SUM(balance),0) b FROM cash_accounts").b;
const recStatus = dbGet("SELECT status FROM receipts WHERE id=?", [rec.id]).status;
check("anular recibo revierte caja (3000→-2000) y marca anulado",
  annRec.ok === true && balance === -2000 && /anul/i.test(recStatus));

const annAgain = docs.annulDocument("receipt", rec.id);
check("anular un documento ya anulado devuelve error", annAgain.ok === false && !!annAgain.error);

const annSo = docs.annulDocument("sale-order", so.id);
const soStatus = dbGet("SELECT status FROM sale_orders WHERE id=?", [so.id]).status;
check("anular documento sin efecto solo marca estado", annSo.ok === true && /anul/i.test(soStatus));

const annMissing = docs.annulDocument("invoice", "no-existe");
check("anular documento inexistente devuelve error", annMissing.ok === false && !!annMissing.error);

let allOk = true;
for (const c of checks) { console.log((c.ok ? "  ok  " : " FAIL ") + c.name); if (!c.ok) allOk = false; }
console.log(allOk ? "VERIFY OK" : "VERIFY FAILED");
process.exit(allOk ? 0 : 1);
