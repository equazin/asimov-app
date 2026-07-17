/**
 * Handlers IPC del proceso principal — orquestador.
 *
 * Los grupos autocontenidos (app/shell/print/notify, afip, air, wa, dolar)
 * viven en `src/ipc/*.ts`; acá quedan los handlers `db:*` (dominio ERP).
 * Toda comunicación renderer → main pasa por acá con validación de entrada.
 */
import { app, dialog, ipcMain } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { hashPassword } from "./auth";
import { encryptSecret } from "./secrets";
import { enqueueAirConfigCloudSync, isAirEnabled, resetAirAuthCache } from "./air";
import {
  enqueueWhatsappConfigCloudSync,
  isWhatsappEnabled,
  startWhatsappPoll,
  stopWhatsappPoll,
} from "./whatsapp";
import {
  listPendingSaleOrders,
  listPendingDeliveryNotes,
  listClientInvoicesForNote,
  listPendingPurchaseOrders,
  listPendingPurchaseInvoices,
  listPurchaseInvoicesToPay,
  listClientInvoicesToCollect,
  getSourceItems,
  getLinksFor,
} from "./document-links";
import { getKitInfo, setKitComponents } from "./kits";
import { notifyAfipConfigSync } from "./afip-service";
import {
  dbAll,
  dbGet,
  dbRun,
  getDb,
  getDashboardKpis,
  nextSequence,
  formatDocNumber,
  upsertClient,
  upsertSupplier,
  upsertArticle,
} from "./db";
import {
  safeStr,
  enqueueIfCloud,
  makeIsAdmin,
  DENY_ADMIN,
  type IpcDeps,
} from "./ipc/shared";
import { registerAppIpc } from "./ipc/app";
import { registerDolarIpc } from "./ipc/dolar";
import { registerAirIpc } from "./ipc/air";
import { registerWhatsappIpc } from "./ipc/wa";
import { registerAfipIpc } from "./ipc/afip";
import { registerCrmIpc } from "./ipc/crm";
import { setInvoicePrintPreferences, previewCommissionForInvoice } from "./documents";

export function registerIpcHandlers(deps: IpcDeps): void {
  // Grupos autocontenidos extraídos a src/ipc/*.
  registerAppIpc(deps);
  registerDolarIpc(deps);
  registerAirIpc(deps);
  registerWhatsappIpc(deps);
  registerAfipIpc(deps);
  registerCrmIpc(deps);

  // Enforcement de rol en el proceso main (fuente de verdad; el gating del shell
  // es solo UX). Sin sesión se niega por defecto para las acciones sensibles.
  const isAdmin = makeIsAdmin(deps);
  const canWrite = () => {
    const user = deps.getCurrentUser?.();
    return !!user && String(user.role || "").toLowerCase() !== "readonly";
  };

  // --- Dashboard KPIs ------------------------------------------------------
  ipcMain.handle("db:kpis", () => {
    try { return { ok: true, data: getDashboardKpis() }; }
    catch (e) { return { ok: false, error: String(e), data: null }; }
  });

  // --- DB: Clientes --------------------------------------------------------
  ipcMain.handle("db:clients:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM clients WHERE active = 1 AND (business_name LIKE ? OR cuit LIKE ? OR code LIKE ?) ORDER BY business_name LIMIT 500", [q, q, q]);
  });
  ipcMain.handle("db:clients:get", (_event, id: unknown) => dbGet("SELECT * FROM clients WHERE id = ?", [safeStr(id)]));
  ipcMain.handle("db:clients:save", (_event, row: unknown) => {
    if (!canWrite()) return { ok: false, error: "No tenés permisos para modificar clientes." };
    const r = row as Record<string, unknown>;
    const wasExisting = !!safeStr(r.id);
    const { id } = upsertClient(r);
    enqueueIfCloud("client", id, wasExisting ? "update" : "create", {
      code: (r.code as string | null) ?? null,
      name: safeStr(r.business_name),
      taxId: safeStr(r.cuit) || null,
      ivaCondition: safeStr(r.fiscal_type) || null,
      email: safeStr(r.email) || null,
      phone: safeStr(r.phone) || null,
      address: safeStr(r.address) || null,
    });
    return { ok: true, id };
  });
  ipcMain.handle("db:clients:delete", (_event, id: unknown) => {
    if (!canWrite()) return { ok: false, error: "No tenés permisos para modificar clientes." };
    const s = safeStr(id);
    dbRun("UPDATE clients SET active = 0 WHERE id = ?", [s]);
    enqueueIfCloud("client", s, "delete");
    return { ok: true };
  });

  // --- DB: Proveedores -----------------------------------------------------
  ipcMain.handle("db:suppliers:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM suppliers WHERE active = 1 AND (business_name LIKE ? OR cuit LIKE ? OR code LIKE ?) ORDER BY business_name LIMIT 500", [q, q, q]);
  });
  ipcMain.handle("db:suppliers:get", (_event, id: unknown) => dbGet("SELECT * FROM suppliers WHERE id = ?", [safeStr(id)]));
  ipcMain.handle("db:suppliers:save", (_event, row: unknown) => {
    const r = row as Record<string, unknown>;
    const wasExisting = !!safeStr(r.id);
    const { id } = upsertSupplier(r);
    enqueueIfCloud("supplier", id, wasExisting ? "update" : "create", {
      code: (r.code as string | null) ?? null,
      name: safeStr(r.business_name),
      taxId: safeStr(r.cuit) || null,
      email: safeStr(r.email) || null,
      phone: safeStr(r.phone) || null,
      address: safeStr(r.address) || null,
    });
    return { ok: true, id };
  });
  ipcMain.handle("db:suppliers:delete", (_event, id: unknown) => {
    const s = safeStr(id);
    dbRun("UPDATE suppliers SET active = 0 WHERE id = ?", [s]);
    enqueueIfCloud("supplier", s, "delete");
    return { ok: true };
  });

  // --- DB: Artículos -------------------------------------------------------
  ipcMain.handle("db:articles:list", (_event, search: unknown) => {
    const raw = safeStr(search);
    const terms = raw.split("+").map(t => t.trim()).filter(Boolean);
    const conditions = terms.map(() => "(a.name LIKE ? OR a.code LIKE ?)");
    const params = terms.flatMap(t => { const q = `%${t}%`; return [q, q]; });
    const where = conditions.length ? " AND " + conditions.join(" AND ") : "";
    return dbAll(`SELECT a.*, COALESCE((SELECT SUM(s.qty) FROM article_stock s WHERE s.article_id = a.id),0) as stock_total
                  FROM articles a WHERE a.active = 1${where} ORDER BY a.name LIMIT 500`, params);
  });
  ipcMain.handle("db:articles:get", (_event, id: unknown) => dbGet("SELECT * FROM articles WHERE id = ?", [safeStr(id)]));
  ipcMain.handle("db:articles:save", (_event, row: unknown) => {
    const r = row as Record<string, unknown>;
    const wasExisting = !!safeStr(r.id);
    const { id } = upsertArticle(r);
    enqueueIfCloud("product", id, wasExisting ? "update" : "create", {
      code: safeStr(r.code),
      name: safeStr(r.name),
      category: safeStr(r.category) || null,
      unit: safeStr(r.unit) || "un",
      price: Number(r.sale_price) || 0,
      ivaRate: Number(r.iva_pct) || 21,
    });
    return { ok: true, id };
  });
  ipcMain.handle("db:articles:delete", (_event, id: unknown) => {
    const s = safeStr(id);
    dbRun("UPDATE articles SET active = 0 WHERE id = ?", [s]);
    enqueueIfCloud("product", s, "delete");
    return { ok: true };
  });

  // --- DB: Pedidos de venta ------------------------------------------------
  ipcMain.handle("db:sale-orders:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM sale_orders WHERE (number LIKE ? OR client_name LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q]);
  });
  ipcMain.handle("db:sale-orders:get", (_event, id: unknown) => {
    const order = dbGet("SELECT * FROM sale_orders WHERE id = ?", [safeStr(id)]);
    const items = dbAll("SELECT * FROM sale_order_items WHERE order_id = ?", [safeStr(id)]);
    return { ...order, items };
  });
  ipcMain.handle("db:sale-orders:save", (_event, row: unknown) => {
    const r = row as Record<string, unknown>;
    const id = safeStr(r.id) || crypto.randomUUID();
    const items = (r.items as unknown[]) ?? [];
    const tx = getDb().transaction(() => {
      if (!safeStr(r.number)) {
        const seq = nextSequence("sale-orders");
        r.number = formatDocNumber("PED", seq);
      }
      dbRun(`INSERT OR REPLACE INTO sale_orders (id,number,client_id,client_name,date,delivery_date,status,currency,subtotal,iva_amount,total,notes,user_id,created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM sale_orders WHERE id=?),datetime('now')),datetime('now'))`,
        [id, r.number, r.client_id, r.client_name, r.date, r.delivery_date, r.status ?? "borrador", r.currency ?? "ARS", r.subtotal ?? 0, r.iva_amount ?? 0, r.total ?? 0, r.notes, r.user_id, id]);
      dbRun("DELETE FROM sale_order_items WHERE order_id = ?", [id]);
      for (const item of items) {
        const it = item as Record<string, unknown>;
        dbRun("INSERT INTO sale_order_items (id,order_id,article_id,code,description,unit,qty,unit_price,iva_pct,subtotal) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [crypto.randomUUID(), id, it.article_id, it.code, it.description, it.unit ?? "un", it.qty ?? 1, it.unit_price ?? 0, it.iva_pct ?? 21, it.subtotal ?? 0]);
      }
    });
    tx();
    return { ok: true, id, number: r.number };
  });

  // --- DB: Facturas de venta -----------------------------------------------
  ipcMain.handle("db:invoices:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM invoices WHERE (number LIKE ? OR client_name LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q]);
  });
  ipcMain.handle("db:invoices:get", (_event, id: unknown) => {
    const inv = dbGet("SELECT * FROM invoices WHERE id = ?", [safeStr(id)]);
    const items = dbAll("SELECT * FROM invoice_items WHERE invoice_id = ?", [safeStr(id)]);
    return { ...inv, items };
  });
  ipcMain.handle("db:invoices:set-print-preferences", (_event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    try {
      const saved = setInvoicePrintPreferences(
        safeStr(data.id),
        data.consolidated === true,
        safeStr(data.consolidatedLabel),
      );
      return { ok: true, data: saved };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "No se pudo guardar el formato de impresión." };
    }
  });
  ipcMain.handle("db:invoices:save", (_event, row: unknown) => {
    const r = row as Record<string, unknown>;
    const id = safeStr(r.id) || crypto.randomUUID();
    const existing = dbGet<{ cae: string | null }>("SELECT cae FROM invoices WHERE id = ?", [id]);
    if (existing?.cae) return { ok: false, error: "La factura ya está autorizada por ARCA y no puede editarse." };
    const items = (r.items as unknown[]) ?? [];
    const tx = getDb().transaction(() => {
      if (!safeStr(r.number)) {
        const seq = nextSequence(`invoice-${r.tipo ?? "B"}`);
        r.number = `${r.point_of_sale ?? "0001"}-${String(seq).padStart(8, "0")}`;
      }
      dbRun(`INSERT OR REPLACE INTO invoices (id,number,client_id,client_name,date,due_date,tipo,point_of_sale,status,subtotal,iva_amount,total,cae,cae_expiry,afip_error,notes,created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM invoices WHERE id=?),datetime('now')))`,
        [id, r.number, r.client_id, r.client_name, r.date, r.due_date, r.tipo ?? "B", r.point_of_sale ?? "0001", "borrador", r.subtotal ?? 0, r.iva_amount ?? 0, r.total ?? 0, null, null, null, r.notes, id]);
      dbRun("DELETE FROM invoice_items WHERE invoice_id = ?", [id]);
      for (const item of items) {
        const it = item as Record<string, unknown>;
        dbRun("INSERT INTO invoice_items (id,invoice_id,article_id,code,description,qty,unit_price,iva_pct,subtotal,iva_amount) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [crypto.randomUUID(), id, it.article_id, it.code, it.description, it.qty ?? 1, it.unit_price ?? 0, it.iva_pct ?? 21, it.subtotal ?? 0, it.iva_amount ?? 0]);
      }
    });
    tx();
    return { ok: true, id, number: r.number };
  });

  // --- DB: Cotizaciones ----------------------------------------------------
  ipcMain.handle("db:quotes:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM quotes WHERE (number LIKE ? OR client_name LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q]);
  });
  ipcMain.handle("db:quotes:get", (_event, id: unknown) => {
    const quote = dbGet("SELECT * FROM quotes WHERE id = ?", [safeStr(id)]);
    const items = dbAll("SELECT * FROM quote_items WHERE quote_id = ?", [safeStr(id)]);
    return { ...quote, items };
  });

  // --- DB: Remitos ---------------------------------------------------------
  ipcMain.handle("db:delivery-notes:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM delivery_notes WHERE (number LIKE ? OR client_name LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q]);
  });
  ipcMain.handle("db:delivery-notes:get", (_event, id: unknown) => {
    const note = dbGet("SELECT * FROM delivery_notes WHERE id = ?", [safeStr(id)]);
    const items = dbAll("SELECT * FROM delivery_note_items WHERE note_id = ?", [safeStr(id)]);
    return { ...note, items };
  });

  // --- DB: Recibos ---------------------------------------------------------
  ipcMain.handle("db:receipts:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM receipts WHERE (number LIKE ? OR client_name LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q]);
  });
  ipcMain.handle("db:receipts:get", (_event, id: unknown) => {
    const receipt = dbGet("SELECT * FROM receipts WHERE id = ?", [safeStr(id)]);
    const items = dbAll("SELECT * FROM receipt_items WHERE receipt_id = ?", [safeStr(id)]);
    return { ...receipt, items };
  });

  // --- DB: Notas de comisión (costo de sobrefacturación) -------------------
  ipcMain.handle("db:commission-notes:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM commission_notes WHERE (number LIKE ? OR client_name LIKE ? OR invoice_number LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q, q]);
  });
  ipcMain.handle("db:commission-notes:get", (_event, id: unknown) => {
    const note = dbGet("SELECT * FROM commission_notes WHERE id = ?", [safeStr(id)]);
    const items = dbAll("SELECT * FROM commission_note_items WHERE note_id = ?", [safeStr(id)]);
    return { ...note, items };
  });
  // Cálculo sin persistir: el diálogo muestra la comisión antes de crear la nota.
  ipcMain.handle("db:commission-notes:preview", (_event, input: unknown) => {
    const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
    const rate = typeof data.ratePct === "number" ? data.ratePct : Number(data.ratePct);
    return previewCommissionForInvoice(safeStr(data.invoiceId), Number.isFinite(rate) ? rate : undefined);
  });

  // --- DB: Órdenes de compra -----------------------------------------------
  ipcMain.handle("db:purchase-orders:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM purchase_orders WHERE (number LIKE ? OR supplier_name LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q]);
  });

  // --- DB: Recepciones -----------------------------------------------------
  ipcMain.handle("db:goods-receipts:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM goods_receipts WHERE (number LIKE ? OR supplier_name LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q]);
  });

  // --- DB: Facturas de compra ----------------------------------------------
  ipcMain.handle("db:purchase-invoices:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM purchase_invoices WHERE (number LIKE ? OR supplier_name LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q]);
  });

  // --- DB: Órdenes de pago -------------------------------------------------
  ipcMain.handle("db:payment-orders:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM payment_orders WHERE (number LIKE ? OR supplier_name LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q]);
  });

  // --- DB: Recibos de compra -----------------------------------------------
  ipcMain.handle("db:purchase-receipts:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM purchase_receipts WHERE (number LIKE ? OR supplier_name LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q]);
  });
  ipcMain.handle("db:purchase-receipts:get", (_event, id: unknown) => {
    const receipt = dbGet("SELECT * FROM purchase_receipts WHERE id = ?", [safeStr(id)]);
    const items = dbAll("SELECT * FROM purchase_receipt_items WHERE receipt_id = ?", [safeStr(id)]);
    return { ...receipt, items };
  });

  // --- DB: Stock -----------------------------------------------------------
  ipcMain.handle("db:stock:list", (_event, search: unknown) => {
    const raw = safeStr(search);
    const terms = raw.split("+").map(t => t.trim()).filter(Boolean);

    const buildWhere = (nameCol: string, codeCol: string): { clause: string; params: string[] } => {
      if (terms.length === 0) return { clause: "", params: [] };
      const conditions = terms.map(() => `(${nameCol} LIKE ? OR ${codeCol} LIKE ?)`);
      const params = terms.flatMap(t => { const q = `%${t}%`; return [q, q]; });
      return { clause: "AND " + conditions.join(" AND "), params };
    };

    const local = buildWhere("a.name", "a.code");
    const localRows = dbAll(
      `SELECT a.id, a.code, a.name, a.unit, a.cost_price, a.sale_price, a.iva_pct, a.is_kit,
              COALESCE(SUM(s.qty),0) as stock_total,
              COALESCE(MIN(s.min_qty),0) as min_qty,
              'local' as source
       FROM articles a LEFT JOIN article_stock s ON s.article_id = a.id
       WHERE a.active = 1 AND a.manages_stock = 1 ${local.clause}
       GROUP BY a.id ORDER BY a.name LIMIT 500`, local.params);

    if (!isAirEnabled()) return localRows;

    const air = buildWhere("description", "air_code");
    const airRows = dbAll(
      `SELECT id, air_code as code, description as name, 'un' as unit,
              price_usd as cost_price, price_usd as sale_price,
              iva_pct, stock as stock_total, 0 as min_qty, 0 as is_kit, 'air' as source
       FROM air_products ap
       WHERE active = 1
         AND NOT EXISTS (SELECT 1 FROM articles a WHERE a.active = 1 AND a.code = ap.air_code)
         ${air.clause}
       ORDER BY description LIMIT 20000`, air.params);

    return [...(localRows as unknown[]), ...(airRows as unknown[])];
  });

  // --- DB: Movimientos de stock --------------------------------------------
  ipcMain.handle("db:stock-movements:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll(`SELECT sm.*, a.name as article_name, a.code as article_code, w.name as warehouse_name
                  FROM stock_movements sm
                  LEFT JOIN articles a ON a.id = sm.article_id
                  LEFT JOIN warehouses w ON w.id = sm.warehouse_id
                  WHERE a.name LIKE ? OR a.code LIKE ?
                  ORDER BY sm.date DESC LIMIT 500`, [q, q]);
  });

  // --- DB: Depósitos -------------------------------------------------------
  ipcMain.handle("db:warehouses:list", () => dbAll("SELECT * FROM warehouses WHERE active = 1 ORDER BY name"));
  ipcMain.handle("db:warehouses:save", (_event, row: unknown) => {
    const r = row as Record<string, unknown>;
    const id = safeStr(r.id) || crypto.randomUUID();
    dbRun("INSERT OR REPLACE INTO warehouses (id, name, address, active) VALUES (?,?,?,?)",
      [id, r.name, r.address, r.active ?? 1]);
    return { ok: true, id };
  });

  // --- DB: Números de serie ------------------------------------------------
  ipcMain.handle("db:serial-numbers:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll(`SELECT sn.*, a.name as article_name FROM serial_numbers sn
                  LEFT JOIN articles a ON a.id = sn.article_id
                  WHERE sn.serial LIKE ? OR a.name LIKE ? ORDER BY sn.created_at DESC LIMIT 500`, [q, q]);
  });

  // --- DB: Alertas de stock ------------------------------------------------
  ipcMain.handle("db:alerts:stock", () => {
    return dbAll(`SELECT a.id, a.code, a.name, a.unit, s.qty, s.min_qty, w.name as warehouse_name
                  FROM article_stock s
                  JOIN articles a ON a.id = s.article_id
                  JOIN warehouses w ON w.id = s.warehouse_id
                  WHERE a.manages_stock = 1 AND s.qty <= s.min_qty AND s.min_qty > 0
                  ORDER BY (s.qty - s.min_qty) ASC LIMIT 200`);
  });

  // --- DB: Lista de precios ------------------------------------------------
  ipcMain.handle("db:price-lists:list", () => dbAll("SELECT * FROM price_lists WHERE active = 1 ORDER BY name"));

  // --- DB: Caja -----------------------------------------------------------
  ipcMain.handle("db:cash-accounts:list", () => dbAll("SELECT * FROM cash_accounts WHERE active = 1 ORDER BY name"));
  ipcMain.handle("db:cash-movements:list", (_event, accountId: unknown) => {
    return dbAll("SELECT * FROM cash_movements WHERE account_id = ? ORDER BY date DESC LIMIT 500", [safeStr(accountId)]);
  });

  // --- DB: Tickets ---------------------------------------------------------
  ipcMain.handle("db:tickets:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM tickets WHERE (number LIKE ? OR client_name LIKE ? OR description LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q, q]);
  });

  // --- DB: Órdenes de trabajo ----------------------------------------------
  ipcMain.handle("db:work-orders:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll(`SELECT wo.*, t.client_name FROM work_orders wo
                  LEFT JOIN tickets t ON t.id = wo.ticket_id
                  WHERE wo.number LIKE ? OR t.client_name LIKE ? ORDER BY wo.created_at DESC LIMIT 500`, [q, q]);
  });

  // --- DB: Garantías -------------------------------------------------------
  ipcMain.handle("db:warranties:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM warranties WHERE (client_name LIKE ? OR article_name LIKE ? OR serial_number LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q, q]);
  });

  // --- DB: CRM → ahora en src/ipc/crm.ts (crm:opportunities:*, crm:activities:*, etc.) ---

  // --- DB: Autonúmeros -----------------------------------------------------
  ipcMain.handle("db:next-number", (_event, type: unknown) => {
    const seq = nextSequence(safeStr(type));
    return { seq, number: formatDocNumber(safeStr(type).toUpperCase().slice(0, 4), seq) };
  });

  // --- DB: Cta Cte Clientes ------------------------------------------------
  ipcMain.handle("db:cta-cte:clients:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll(`
      SELECT c.id, c.business_name, c.cuit,
        COALESCE((SELECT SUM(total) FROM invoices WHERE client_id = c.id AND status = 'autorizada'),0) AS total_facturado,
        COALESCE((SELECT SUM(total) FROM receipts  WHERE client_id = c.id),0) AS total_cobrado
      FROM clients c
      WHERE c.active = 1 AND (c.business_name LIKE ? OR c.cuit LIKE ?)
      ORDER BY c.business_name LIMIT 500
    `, [q, q]);
  });
  ipcMain.handle("db:cta-cte:clients:detail", (_event, clientId: unknown) => {
    const id = safeStr(clientId);
    return dbAll(`
      SELECT date, 'Factura' AS tipo, number AS referencia, total AS debe, 0 AS haber, status
        FROM invoices WHERE client_id = ? AND status = 'autorizada'
      UNION ALL
      SELECT date, 'Recibo'  AS tipo, number AS referencia, 0 AS debe, total AS haber, status
        FROM receipts WHERE client_id = ?
      ORDER BY date DESC LIMIT 500
    `, [id, id]);
  });

  // --- DB: Cta Cte Proveedores ---------------------------------------------
  ipcMain.handle("db:cta-cte:suppliers:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll(`
      SELECT s.id, s.business_name, s.cuit,
        COALESCE((SELECT SUM(total) FROM purchase_invoices WHERE supplier_id = s.id AND status NOT IN ('cancelado','borrador')),0) AS total_comprado,
        COALESCE((SELECT SUM(total) FROM payment_orders  WHERE supplier_id = s.id AND status NOT IN ('cancelado','borrador')),0) AS total_pagado
      FROM suppliers s
      WHERE s.active = 1 AND (s.business_name LIKE ? OR s.cuit LIKE ?)
      ORDER BY s.business_name LIMIT 500
    `, [q, q]);
  });
  ipcMain.handle("db:cta-cte:suppliers:detail", (_event, supplierId: unknown) => {
    const id = safeStr(supplierId);
    return dbAll(`
      SELECT date, 'Fact. Compra' AS tipo, number AS referencia, total AS debe, 0 AS haber, status
        FROM purchase_invoices WHERE supplier_id = ?
      UNION ALL
      SELECT date, 'Ord. de Pago' AS tipo, number AS referencia, 0 AS debe, total AS haber, status
        FROM payment_orders WHERE supplier_id = ?
      ORDER BY date DESC LIMIT 500
    `, [id, id]);
  });

  // --- DB: Reportes --------------------------------------------------------
  ipcMain.handle("db:reports:sales", (_event, params: unknown) => {
    const p = (params ?? {}) as { from?: string; to?: string };
    const from = safeStr(p.from) || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const to   = safeStr(p.to)   || new Date().toISOString().slice(0, 10);
    return dbAll(`SELECT date, number, client_name, tipo, status, subtotal, iva_amount, total
                  FROM invoices WHERE date BETWEEN ? AND ? AND status = 'autorizada'
                  ORDER BY date DESC LIMIT 1000`, [from, to]);
  });
  ipcMain.handle("db:reports:purchases", (_event, params: unknown) => {
    const p = (params ?? {}) as { from?: string; to?: string };
    const from = safeStr(p.from) || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const to   = safeStr(p.to)   || new Date().toISOString().slice(0, 10);
    return dbAll(`SELECT date, number, supplier_name, tipo, status, subtotal, iva_amount, total
                  FROM purchase_invoices WHERE date BETWEEN ? AND ? AND status NOT IN ('cancelado','borrador')
                  ORDER BY date DESC LIMIT 1000`, [from, to]);
  });
  ipcMain.handle("db:reports:top-articles", (_event, params: unknown) => {
    const p = (params ?? {}) as { from?: string; to?: string };
    const from = safeStr(p.from) || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const to   = safeStr(p.to)   || new Date().toISOString().slice(0, 10);
    return dbAll(`SELECT ii.code, ii.description, SUM(ii.qty) AS qty_total, SUM(ii.subtotal) AS total_neto
                  FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
                  WHERE i.date BETWEEN ? AND ? AND i.status = 'autorizada'
                  GROUP BY ii.code, ii.description ORDER BY total_neto DESC LIMIT 100`, [from, to]);
  });

  // --- DB: Diario (cash movements journal) ---------------------------------
  ipcMain.handle("db:diario:list", (_event, params: unknown) => {
    const p = (params ?? {}) as { from?: string; to?: string };
    const from = safeStr(p.from) || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const to   = safeStr(p.to)   || new Date().toISOString().slice(0, 10);
    return dbAll(`SELECT cm.date, ca.name AS account_name, cm.type, cm.concept, cm.amount,
                         cm.reference_type, cm.reference_id
                  FROM cash_movements cm LEFT JOIN cash_accounts ca ON ca.id = cm.account_id
                  WHERE date(cm.date) BETWEEN ? AND ?
                  ORDER BY cm.date DESC LIMIT 1000`, [from, to]);
  });

  // --- DB: Auditoría -------------------------------------------------------
  ipcMain.handle("db:audit:recent", () => {
    return dbAll(`
      SELECT 'Factura Venta'  AS tipo, number AS ref, client_name   AS quien, date, status, created_at FROM invoices
      UNION ALL
      SELECT 'Pedido Venta',           number,         client_name,           date, status, created_at FROM sale_orders
      UNION ALL
      SELECT 'Recibo',                 number,         client_name,           date, status, created_at FROM receipts
      UNION ALL
      SELECT 'Remito',                 number,         client_name,           date, status, created_at FROM delivery_notes
      UNION ALL
      SELECT 'Fact. Compra',           number,         supplier_name,         date, status, created_at FROM purchase_invoices
      UNION ALL
      SELECT 'Ord. Compra',            number,         supplier_name,         date, status, created_at FROM purchase_orders
      UNION ALL
      SELECT 'Ord. de Pago',           number,         supplier_name,         date, status, created_at FROM payment_orders
      UNION ALL
      SELECT 'Cotización',             number,         client_name,           date, status, created_at FROM quotes
      ORDER BY created_at DESC LIMIT 300
    `);
  });

  // --- DB: Export Contable (CSV) -------------------------------------------
  ipcMain.handle("db:export:invoices-csv", async (_event, params: unknown) => {
    const p = (params ?? {}) as { from?: string; to?: string };
    const from = safeStr(p.from) || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const to   = safeStr(p.to)   || new Date().toISOString().slice(0, 10);

    const { filePath } = await dialog.showSaveDialog({
      title: "Exportar facturas de venta",
      defaultPath: path.join(app.getPath("documents"), `facturas-${from}-${to}.csv`),
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!filePath) return { ok: false, cancelled: true };

    const rows = dbAll<Record<string, unknown>>(
      `SELECT date, number, tipo, client_name, subtotal, iva_amount, total, status
       FROM invoices WHERE date BETWEEN ? AND ? ORDER BY date`, [from, to]
    );
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = "Fecha,Número,Tipo,Cliente,Neto,IVA,Total,Estado\n";
    const csv = rows.map(r => [r.date, r.number, r.tipo, esc(r.client_name), r.subtotal, r.iva_amount, r.total, r.status].join(",")).join("\n");
    fs.writeFileSync(filePath, "﻿" + header + csv, "utf8");
    return { ok: true, filePath };
  });

  // --- DB: Sistema Config --------------------------------------------------
  // Claves cuyo valor son secretos: se cifran en reposo (safeStorage) y nunca se
  // devuelven en el volcado genérico de configuración.
  const SECRET_CONFIG_KEYS = new Set(["air_password", "afip_cert", "afip_key", "afip_ta", "wa_token"]);
  ipcMain.handle("db:config:get-all", () =>
    dbAll<{ key: string; value: string }>("SELECT key, value FROM system_config ORDER BY key")
      .map((r) => (SECRET_CONFIG_KEYS.has(r.key) ? { key: r.key, value: "" } : r))
  );
  ipcMain.handle("db:config:set", (_event, raw: unknown) => {
    const r = (raw ?? {}) as { key?: unknown; value?: unknown };
    const key = safeStr(r.key);
    const value = safeStr(r.value, 2000);
    // Los secretos se guardan cifrados; el resto tal cual.
    const stored = SECRET_CONFIG_KEYS.has(key) ? encryptSecret(value) : value;
    dbRun("INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)", [key, stored]);
    if (key.startsWith("air_")) {
      // Cambió la config de AIR: descartar el token cacheado (puede ser de otras
      // credenciales/URL) y propagar la config a la nube.
      if (["air_username", "air_password", "air_base_url"].includes(key)) {
        try { resetAirAuthCache(); } catch { /* best-effort */ }
      }
      try { enqueueAirConfigCloudSync(); } catch { /* best-effort */ }
    }
    if (key.startsWith("wa_")) {
      // Cambió URL/token/enabled del bot: reiniciar el poll con la config nueva.
      try { stopWhatsappPoll(); if (isWhatsappEnabled()) startWhatsappPoll(); } catch { /* best-effort */ }
      try { enqueueWhatsappConfigCloudSync(); } catch { /* best-effort */ }
    }
    if (key.startsWith("afip_")) {
      // Cambió la config de ARCA: propagar la config pública (sin cert/key) a la nube.
      try { notifyAfipConfigSync(); } catch { /* best-effort */ }
    }
    return { ok: true };
  });

  // --- DB: Usuarios --------------------------------------------------------
  ipcMain.handle("db:users:list", () =>
    dbAll("SELECT id, name, email, role, active, created_at FROM users ORDER BY name")
  );
  ipcMain.handle("db:users:save", (_event, row: unknown) => {
    if (!isAdmin()) return DENY_ADMIN;
    const r = (row ?? {}) as Record<string, unknown>;
    const id = safeStr(r.id) || crypto.randomUUID();
    // Si viene contraseña, se hashea; si no, se preserva la existente (COALESCE).
    const pwd = safeStr(r.password);
    const newHash = pwd ? hashPassword(pwd) : null;
    dbRun(`INSERT OR REPLACE INTO users (id, name, email, role, password_hash, active, created_at)
           VALUES (?, ?, ?, ?,
             COALESCE(?, (SELECT password_hash FROM users WHERE id=?), ''),
             ?,
             COALESCE((SELECT created_at FROM users WHERE id=?), datetime('now')))`,
      [id, safeStr(r.name), safeStr(r.email), safeStr(r.role) || "user", newHash, id, r.active ?? 1, id]);
    return { ok: true, id };
  });
  ipcMain.handle("db:users:toggle", (_event, id: unknown) => {
    if (!isAdmin()) return DENY_ADMIN;
    dbRun("UPDATE users SET active = 1 - active WHERE id = ?", [safeStr(id)]);
    return { ok: true };
  });

  // --- DB: Base de Conocimiento --------------------------------------------
  ipcMain.handle("db:knowledge:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll(
      "SELECT id, title, category, tags, created_at FROM knowledge_base WHERE title LIKE ? OR category LIKE ? OR tags LIKE ? ORDER BY title LIMIT 500",
      [q, q, q]
    );
  });
  ipcMain.handle("db:knowledge:get", (_event, id: unknown) =>
    dbGet("SELECT * FROM knowledge_base WHERE id = ?", [safeStr(id)])
  );
  ipcMain.handle("db:knowledge:save", (_event, row: unknown) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const id = safeStr(r.id) || crypto.randomUUID();
    dbRun(`INSERT OR REPLACE INTO knowledge_base (id, title, category, content, tags, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?,
             COALESCE((SELECT created_at FROM knowledge_base WHERE id=?), datetime('now')),
             datetime('now'))`,
      [id, safeStr(r.title), safeStr(r.category), safeStr(r.content, 50000), safeStr(r.tags), id]);
    return { ok: true, id };
  });
  ipcMain.handle("db:knowledge:delete", (_event, id: unknown) => {
    dbRun("DELETE FROM knowledge_base WHERE id = ?", [safeStr(id)]);
    return { ok: true };
  });

  // --- DB: Conversaciones --------------------------------------------------
  ipcMain.handle("db:conversations:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll(
      `SELECT c.*, (SELECT COUNT(*) FROM conversation_messages WHERE conversation_id = c.id) AS msg_count
       FROM conversations c WHERE c.title LIKE ? OR c.client_name LIKE ?
       ORDER BY c.created_at DESC LIMIT 500`,
      [q, q]
    );
  });
  ipcMain.handle("db:conversations:get", (_event, id: unknown) => {
    const conv = dbGet("SELECT * FROM conversations WHERE id = ?", [safeStr(id)]);
    const msgs = dbAll("SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at ASC", [safeStr(id)]);
    return { ...conv, messages: msgs };
  });
  ipcMain.handle("db:conversations:create", (_event, row: unknown) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const id = crypto.randomUUID();
    dbRun("INSERT INTO conversations (id, title, client_name, status) VALUES (?, ?, ?, ?)",
      [id, safeStr(r.title), safeStr(r.client_name), "abierta"]);
    return { ok: true, id };
  });
  ipcMain.handle("db:conversations:add-message", (_event, raw: unknown) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id = crypto.randomUUID();
    dbRun("INSERT INTO conversation_messages (id, conversation_id, author, body) VALUES (?, ?, ?, ?)",
      [id, safeStr(r.conversation_id), safeStr(r.author) || "usuario", safeStr(r.body, 10000)]);
    return { ok: true, id };
  });
  ipcMain.handle("db:conversations:close", (_event, id: unknown) => {
    dbRun("UPDATE conversations SET status = 'cerrada' WHERE id = ?", [safeStr(id)]);
    return { ok: true };
  });

  ipcMain.handle("db:export:purchases-csv", async (_event, params: unknown) => {
    const p = (params ?? {}) as { from?: string; to?: string };
    const from = safeStr(p.from) || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const to   = safeStr(p.to)   || new Date().toISOString().slice(0, 10);

    const { filePath } = await dialog.showSaveDialog({
      title: "Exportar facturas de compra",
      defaultPath: path.join(app.getPath("documents"), `compras-${from}-${to}.csv`),
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!filePath) return { ok: false, cancelled: true };

    const rows = dbAll<Record<string, unknown>>(
      `SELECT date, number, tipo, supplier_name, subtotal, iva_amount, total, status
       FROM purchase_invoices WHERE date BETWEEN ? AND ? ORDER BY date`, [from, to]
    );
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = "Fecha,Número,Tipo,Proveedor,Neto,IVA,Total,Estado\n";
    const csv = rows.map(r => [r.date, r.number, r.tipo, esc(r.supplier_name), r.subtotal, r.iva_amount, r.total, r.status].join(",")).join("\n");
    fs.writeFileSync(filePath, "﻿" + header + csv, "utf8");
    return { ok: true, filePath };
  });


  // ── Esquemas / Kits ──────────────────────────────────────────────────
  ipcMain.handle("db:kits:get", (_event, articleId: unknown) => {
    try {
      return { ok: true, data: getKitInfo(safeStr(articleId)) };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("db:kits:set", (_event, articleId: unknown, components: unknown) => {
    try {
      const list = Array.isArray(components)
        ? components.map((c) => ({ articleId: safeStr((c as Record<string, unknown>)?.articleId), qty: Number((c as Record<string, unknown>)?.qty) }))
        : [];
      return { ok: true, data: setKitComponents(safeStr(articleId), list) };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Documentos entrelazados (pedido → remito → factura) ──────────────
  ipcMain.handle("db:doc-links:pending-sale-orders", (_event, clientId: unknown, target: unknown) =>
    listPendingSaleOrders(safeStr(clientId), safeStr(target) === "delivery-note" ? "delivery-note" : "invoice"));
  ipcMain.handle("db:doc-links:pending-delivery-notes", (_event, clientId: unknown) =>
    listPendingDeliveryNotes(safeStr(clientId)));
  ipcMain.handle("db:doc-links:client-invoices", (_event, clientId: unknown) =>
    listClientInvoicesForNote(safeStr(clientId)));
  ipcMain.handle("db:doc-links:pending-purchase-orders", (_event, supplierId: unknown) =>
    listPendingPurchaseOrders(safeStr(supplierId)));
  ipcMain.handle("db:doc-links:pending-purchase-invoices", (_event, supplierId: unknown) =>
    listPendingPurchaseInvoices(safeStr(supplierId)));
  ipcMain.handle("db:doc-links:purchase-invoices-to-pay", (_event, supplierId: unknown) =>
    listPurchaseInvoicesToPay(safeStr(supplierId)));
  ipcMain.handle("db:doc-links:client-invoices-to-collect", (_event, clientId: unknown) =>
    listClientInvoicesToCollect(safeStr(clientId)));
  ipcMain.handle("db:doc-links:source-items", (_event, type: unknown, id: unknown) =>
    getSourceItems(safeStr(type), safeStr(id)));
  ipcMain.handle("db:doc-links:get", (_event, type: unknown, id: unknown) =>
    getLinksFor(safeStr(type), safeStr(id)));

}
