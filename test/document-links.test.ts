import { beforeEach, describe, expect, it } from "vitest";
import {
  applySourceLink,
  revertSourcesOnAnnul,
  getLinksFor,
  listPendingSaleOrders,
  listPendingDeliveryNotes,
  listClientInvoicesForNote,
  getSourceItems,
} from "../src/document-links";
import { persistSaleOrder, persistDeliveryNote, persistInvoice, annulDocument } from "../src/documents";
import { closeDb, dbAll, dbGet, dbRun, initDb } from "../src/db";

const CLIENT_ID = "cli-1";

function seedBase(): void {
  initDb(":memory:");
  dbRun("INSERT INTO clients (id, business_name) VALUES (?, ?)", [CLIENT_ID, "ACME SRL"]);
  dbRun(
    "INSERT INTO articles (id, code, name, sale_price, iva_pct, manages_stock) VALUES (?,?,?,?,?,?)",
    ["art-1", "R5-5600G", "RYZEN 5 5600G", 250000, 21, 1],
  );
}

function seedOrder(id = "so-1", status = "pendiente"): void {
  dbRun(
    "INSERT INTO sale_orders (id, number, client_id, client_name, status, total) VALUES (?,?,?,?,?,?)",
    [id, `PED-${id}`, CLIENT_ID, "ACME SRL", status, 250000],
  );
  dbRun(
    "INSERT INTO sale_order_items (id, order_id, article_id, code, description, unit, qty, unit_price, iva_pct, subtotal) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [`soi-${id}`, id, "art-1", "R5-5600G", "RYZEN 5 5600G", "un", 2, 250000, 21, 500000],
  );
}

beforeEach(() => {
  seedBase();
});

describe("applySourceLink", () => {
  it("crea el vínculo y marca el pedido como facturado", () => {
    seedOrder();
    dbRun("INSERT INTO invoices (id, number) VALUES (?,?)", ["inv-1", "0001-1"]);

    expect(applySourceLink("invoice", "inv-1", { tipo: "sale-order", id: "so-1" })).toBe(true);
    expect(dbGet<{ status: string }>("SELECT status FROM sale_orders WHERE id='so-1'")?.status).toBe("facturado");
    expect(dbAll("SELECT * FROM document_links")).toHaveLength(1);
  });

  it("es idempotente y rechaza orígenes inexistentes o inválidos", () => {
    seedOrder();
    dbRun("INSERT INTO invoices (id, number) VALUES (?,?)", ["inv-1", "0001-1"]);
    applySourceLink("invoice", "inv-1", { tipo: "sale-order", id: "so-1" });
    applySourceLink("invoice", "inv-1", { tipo: "sale-order", id: "so-1" });
    expect(dbAll("SELECT * FROM document_links")).toHaveLength(1);

    expect(applySourceLink("invoice", "inv-1", { tipo: "sale-order", id: "no-existe" })).toBe(false);
    expect(applySourceLink("invoice", "inv-1", { tipo: "tabla-mala", id: "so-1" })).toBe(false);
    expect(dbAll("SELECT * FROM document_links")).toHaveLength(1);
  });

  it("factura → nota de crédito: vincula sin tocar el estado de la original", () => {
    dbRun("INSERT INTO invoices (id, number, client_id, tipo, status, cae) VALUES (?,?,?,?,?,?)",
      ["inv-orig", "00001-00000010", CLIENT_ID, "A", "autorizada", "75000000000001"]);
    dbRun("INSERT INTO invoices (id, number, client_id, tipo) VALUES (?,?,?,?)",
      ["inv-nc", "00001-00000011", CLIENT_ID, "NC"]);

    expect(applySourceLink("invoice", "inv-nc", { tipo: "invoice", id: "inv-orig" })).toBe(true);
    expect(dbGet<{ status: string }>("SELECT status FROM invoices WHERE id='inv-orig'")?.status).toBe("autorizada");
    // nunca un documento consigo mismo
    expect(applySourceLink("invoice", "inv-orig", { tipo: "invoice", id: "inv-orig" })).toBe(false);
  });
});

describe("listClientInvoicesForNote / getSourceItems(invoice)", () => {
  it("lista facturas del cliente excluyendo NC/ND y anuladas, y trae sus ítems", () => {
    dbRun("INSERT INTO invoices (id, number, client_id, tipo, status) VALUES (?,?,?,?,?)",
      ["inv-a", "00001-00000001", CLIENT_ID, "A", "autorizada"]);
    dbRun("INSERT INTO invoices (id, number, client_id, tipo, status) VALUES (?,?,?,?,?)",
      ["inv-nc", "00001-00000002", CLIENT_ID, "NC", "emitida"]);
    dbRun("INSERT INTO invoices (id, number, client_id, tipo, status) VALUES (?,?,?,?,?)",
      ["inv-anulada", "00001-00000003", CLIENT_ID, "B", "anulada"]);
    dbRun(
      "INSERT INTO invoice_items (id, invoice_id, code, description, qty, unit_price, iva_pct, subtotal) VALUES (?,?,?,?,?,?,?,?)",
      ["ii-1", "inv-a", "R5-5600G", "RYZEN 5 5600G", 2, 250000, 21, 500000],
    );

    const list = listClientInvoicesForNote(CLIENT_ID);
    expect(list.map((d) => d.id)).toEqual(["inv-a"]);

    const items = getSourceItems("invoice", "inv-a");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ code: "R5-5600G", qty: 2, unit_price: 250000, iva_pct: 21 });
  });
});

describe("flujo pedido → remito → factura vía persist*", () => {
  it("remito con origen pedido: vincula y marca pedido remitido", () => {
    seedOrder();
    const res = persistDeliveryNote({
      cliente: { id: CLIENT_ID }, clienteNombre: "ACME SRL",
      items: [{ codigo: "R5-5600G", descripcion: "RYZEN 5 5600G", cantPedida: 2, cantEntregada: 2 }],
      origen: { tipo: "sale-order", id: "so-1" },
    });
    expect(dbGet<{ status: string }>("SELECT status FROM sale_orders WHERE id='so-1'")?.status).toBe("remitido");
    const links = getLinksFor("delivery-note", res.id);
    expect(links.origins).toHaveLength(1);
    expect(links.origins[0].number).toBe("PED-so-1");
  });

  it("factura con origen pedido: vincula, marca facturado y aparece en trazabilidad inversa", () => {
    seedOrder();
    const res = persistInvoice({
      cliente: { id: CLIENT_ID }, clienteNombre: "ACME SRL",
      items: [{ codigo: "R5-5600G", descripcion: "RYZEN 5 5600G", cantidad: 2, precio: 250000, iva: 21 }],
      origen: { tipo: "sale-order", id: "so-1" },
    });
    expect(dbGet<{ status: string }>("SELECT status FROM sale_orders WHERE id='so-1'")?.status).toBe("facturado");
    const fromOrder = getLinksFor("sale-order", "so-1");
    expect(fromOrder.derived).toHaveLength(1);
    expect(fromOrder.derived[0].doc_id).toBe(res.id);
  });

  it("anular la factura devuelve el pedido a pendiente y conserva el vínculo", () => {
    seedOrder();
    const res = persistInvoice({
      cliente: { id: CLIENT_ID }, clienteNombre: "ACME SRL",
      items: [{ codigo: "R5-5600G", descripcion: "X", cantidad: 1, precio: 100, iva: 21 }],
      origen: { tipo: "sale-order", id: "so-1" },
    });
    const annul = annulDocument("invoice", res.id);
    expect(annul.ok).toBe(true);
    expect(dbGet<{ status: string }>("SELECT status FROM sale_orders WHERE id='so-1'")?.status).toBe("pendiente");
    expect(dbAll("SELECT * FROM document_links")).toHaveLength(1);
  });
});

describe("listados de pendientes", () => {
  it("pedidos pendientes para factura excluye facturados y anulados", () => {
    seedOrder("so-1", "pendiente");
    seedOrder("so-2", "facturado");
    seedOrder("so-3", "anulado");
    seedOrder("so-4", "remitido"); // remitido SÍ se puede facturar
    const pending = listPendingSaleOrders(CLIENT_ID, "invoice");
    expect(pending.map((p) => p.id).sort()).toEqual(["so-1", "so-4"]);
    expect(pending[0].items_count).toBe(1);
  });

  it("pedidos pendientes para remito excluye también los remitidos", () => {
    seedOrder("so-1", "pendiente");
    seedOrder("so-4", "remitido");
    const pending = listPendingSaleOrders(CLIENT_ID, "delivery-note");
    expect(pending.map((p) => p.id)).toEqual(["so-1"]);
  });

  it("remitos pendientes excluye facturados/anulados y clientId vacío devuelve []", () => {
    persistDeliveryNote({
      cliente: { id: CLIENT_ID }, clienteNombre: "ACME SRL", estado: "pendiente",
      items: [{ codigo: "R5-5600G", descripcion: "X", cantPedida: 1, cantEntregada: 1 }],
    });
    persistDeliveryNote({
      cliente: { id: CLIENT_ID }, clienteNombre: "ACME SRL", estado: "facturado",
      items: [],
    });
    expect(listPendingDeliveryNotes(CLIENT_ID)).toHaveLength(1);
    expect(listPendingDeliveryNotes("")).toEqual([]);
    expect(listPendingSaleOrders("", "invoice")).toEqual([]);
  });
});

describe("getSourceItems", () => {
  it("pedido: devuelve ítems con precio y iva", () => {
    seedOrder();
    const items = getSourceItems("sale-order", "so-1");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ code: "R5-5600G", qty: 2, unit_price: 250000, iva_pct: 21 });
  });

  it("remito: toma precio e iva del artículo vinculado", () => {
    const res = persistDeliveryNote({
      cliente: { id: CLIENT_ID }, clienteNombre: "ACME SRL",
      items: [{ codigo: "R5-5600G", descripcion: "RYZEN 5 5600G", cantPedida: 3, cantEntregada: 3 }],
    });
    const items = getSourceItems("delivery-note", res.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ qty: 3, unit_price: 250000, iva_pct: 21 });
  });

  it("tipo desconocido devuelve []", () => {
    expect(getSourceItems("otro", "x")).toEqual([]);
  });
});
