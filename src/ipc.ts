/**
 * Handlers IPC del proceso principal.
 * Toda comunicación renderer → main pasa por aquí con validación de entrada.
 */
import { app, BrowserWindow, dialog, ipcMain, Notification } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getLaunchAtStartup,
  getShellPreferences,
  setShellBackground,
  getBookmarks,
  addBookmark,
  removeBookmark,
  getPrintPreferences,
  setPreferredPrinter,
  setSilentPrint,
  type ShellBackground,
} from "./config";
import { setLaunchAtStartupEnabled } from "./tray";
import {
  getAirLocalConfig,
  isAirEnabled,
  runAirSync,
  testAirConnection,
  startAirSyncTimer,
  stopAirSyncTimer,
} from "./air";
import {
  dbAll,
  dbGet,
  dbRun,
  getDb,
  getDashboardKpis,
  nextSequence,
  formatDocNumber,
} from "./db";

interface IpcDeps {
  getMainWindow: () => BrowserWindow | null;
}

function normalizeShellBackground(raw: unknown): ShellBackground {
  const data = (raw ?? {}) as { type?: unknown; value?: unknown };
  const type = String(data.type ?? "default");
  const value = String(data.value ?? "").trim();
  if (type === "color" && /^#[0-9a-f]{6}$/i.test(value)) return { type: "color", value };
  if (type === "image" && value) return { type: "image", value };
  return { type: "default", value: "" };
}

function safeStr(v: unknown, max = 500): string {
  return String(v ?? "").slice(0, max).trim();
}

export function registerIpcHandlers(deps: IpcDeps): void {

  // --- App info ------------------------------------------------------------
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:launch-at-startup:get", () => getLaunchAtStartup());
  ipcMain.handle("app:launch-at-startup:set", (_event, value: unknown) => {
    setLaunchAtStartupEnabled(Boolean(value));
    return { ok: true, enabled: getLaunchAtStartup() };
  });

  // --- Shell preferences ---------------------------------------------------
  ipcMain.handle("shell:prefs:get", () => getShellPreferences());

  ipcMain.handle("shell:background:set", (_event, raw: unknown) => {
    return setShellBackground(normalizeShellBackground(raw));
  });

  ipcMain.handle("shell:bookmark:list", () => getBookmarks());

  ipcMain.handle("shell:bookmark:add", (_event, raw: unknown) => {
    const data = (raw ?? {}) as { title?: unknown; path?: unknown };
    return addBookmark({ title: safeStr(data.title), path: safeStr(data.path) });
  });

  ipcMain.handle("shell:bookmark:remove", (_event, id: unknown) => {
    return removeBookmark(safeStr(id));
  });

  // --- Impresión -----------------------------------------------------------
  ipcMain.handle("print:current", async (event, opts: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? deps.getMainWindow();
    if (!window) return { ok: false, error: "No hay ventana activa." };
    const options = (opts ?? {}) as { silent?: boolean; deviceName?: string; usePreferred?: boolean };
    const prefs = getPrintPreferences();
    const useSilent = options.silent ?? (options.usePreferred && prefs.silentPrint && !!prefs.preferredPrinter);
    const deviceName = options.deviceName ?? (options.usePreferred && prefs.preferredPrinter ? prefs.preferredPrinter : undefined);
    return new Promise((resolve) => {
      window.webContents.print(
        { silent: Boolean(useSilent), deviceName, printBackground: true },
        (success, failureReason) => resolve(success ? { ok: true } : { ok: false, error: failureReason }),
      );
    });
  });

  ipcMain.handle("print:list", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? deps.getMainWindow();
    if (!window) return [];
    try { return await window.webContents.getPrintersAsync(); } catch { return []; }
  });

  ipcMain.handle("print:preferred:get", () => getPrintPreferences());
  ipcMain.handle("print:preferred:set", (_event, deviceName: unknown) => setPreferredPrinter(safeStr(deviceName)));
  ipcMain.handle("print:silent:set", (_event, silent: unknown) => setSilentPrint(Boolean(silent)));

  // --- Notificaciones ------------------------------------------------------
  ipcMain.handle("notify:show", (_event, payload: unknown) => {
    if (!Notification.isSupported()) return { ok: false };
    const data = (payload ?? {}) as { title?: string; body?: string };
    const n = new Notification({ title: data.title ?? "Asimov", body: data.body ?? "" });
    n.on("click", () => {
      const w = deps.getMainWindow();
      if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
    });
    n.show();
    return { ok: true };
  });

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
    const r = row as Record<string, unknown>;
    const id = safeStr(r.id) || crypto.randomUUID();
    dbRun(`INSERT OR REPLACE INTO clients (id,code,business_name,cuit,fiscal_type,email,phone,address,city,province,credit_limit,active,notes,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM clients WHERE id=?),datetime('now')),datetime('now'))`,
      [id, r.code, r.business_name, r.cuit, r.fiscal_type, r.email, r.phone, r.address, r.city, r.province, r.credit_limit ?? 0, r.active ?? 1, r.notes, id]);
    return { ok: true, id };
  });
  ipcMain.handle("db:clients:delete", (_event, id: unknown) => {
    dbRun("UPDATE clients SET active = 0 WHERE id = ?", [safeStr(id)]);
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
    const id = safeStr(r.id) || crypto.randomUUID();
    dbRun(`INSERT OR REPLACE INTO suppliers (id,code,business_name,cuit,email,phone,address,city,province,payment_term,active,notes,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM suppliers WHERE id=?),datetime('now')),datetime('now'))`,
      [id, r.code, r.business_name, r.cuit, r.email, r.phone, r.address, r.city, r.province, r.payment_term ?? 0, r.active ?? 1, r.notes, id]);
    return { ok: true, id };
  });
  ipcMain.handle("db:suppliers:delete", (_event, id: unknown) => {
    dbRun("UPDATE suppliers SET active = 0 WHERE id = ?", [safeStr(id)]);
    return { ok: true };
  });

  // --- DB: Artículos -------------------------------------------------------
  ipcMain.handle("db:articles:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll(`SELECT a.*, COALESCE((SELECT SUM(s.qty) FROM article_stock s WHERE s.article_id = a.id),0) as stock_total
                  FROM articles a WHERE a.active = 1 AND (a.name LIKE ? OR a.code LIKE ?) ORDER BY a.name LIMIT 500`, [q, q]);
  });
  ipcMain.handle("db:articles:get", (_event, id: unknown) => dbGet("SELECT * FROM articles WHERE id = ?", [safeStr(id)]));
  ipcMain.handle("db:articles:save", (_event, row: unknown) => {
    const r = row as Record<string, unknown>;
    const id = safeStr(r.id) || crypto.randomUUID();
    dbRun(`INSERT OR REPLACE INTO articles (id,code,name,description,category,unit,cost_price,sale_price,iva_pct,manages_stock,manages_serial,active,notes,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM articles WHERE id=?),datetime('now')),datetime('now'))`,
      [id, r.code, r.name, r.description, r.category, r.unit ?? "un", r.cost_price ?? 0, r.sale_price ?? 0, r.iva_pct ?? 21, r.manages_stock ?? 1, r.manages_serial ?? 0, r.active ?? 1, r.notes, id]);
    return { ok: true, id };
  });
  ipcMain.handle("db:articles:delete", (_event, id: unknown) => {
    dbRun("UPDATE articles SET active = 0 WHERE id = ?", [safeStr(id)]);
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
  ipcMain.handle("db:invoices:save", (_event, row: unknown) => {
    const r = row as Record<string, unknown>;
    const id = safeStr(r.id) || crypto.randomUUID();
    const items = (r.items as unknown[]) ?? [];
    const tx = getDb().transaction(() => {
      if (!safeStr(r.number)) {
        const seq = nextSequence(`invoice-${r.tipo ?? "B"}`);
        r.number = `${r.point_of_sale ?? "0001"}-${String(seq).padStart(8, "0")}`;
      }
      dbRun(`INSERT OR REPLACE INTO invoices (id,number,client_id,client_name,date,due_date,tipo,point_of_sale,status,subtotal,iva_amount,total,cae,cae_expiry,notes,created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT created_at FROM invoices WHERE id=?),datetime('now')))`,
        [id, r.number, r.client_id, r.client_name, r.date, r.due_date, r.tipo ?? "B", r.point_of_sale ?? "0001", r.status ?? "borrador", r.subtotal ?? 0, r.iva_amount ?? 0, r.total ?? 0, r.cae, r.cae_expiry, r.notes, id]);
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

  // --- DB: Remitos ---------------------------------------------------------
  ipcMain.handle("db:delivery-notes:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM delivery_notes WHERE (number LIKE ? OR client_name LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q]);
  });

  // --- DB: Recibos ---------------------------------------------------------
  ipcMain.handle("db:receipts:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM receipts WHERE (number LIKE ? OR client_name LIKE ?) ORDER BY created_at DESC LIMIT 500", [q, q]);
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

  // --- DB: Stock -----------------------------------------------------------
  ipcMain.handle("db:stock:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    const localRows = dbAll(
      `SELECT a.id, a.code, a.name, a.unit, a.sale_price,
              COALESCE(SUM(s.qty),0) as stock_total,
              COALESCE(MIN(s.min_qty),0) as min_qty,
              'local' as source
       FROM articles a LEFT JOIN article_stock s ON s.article_id = a.id
       WHERE a.active = 1 AND a.manages_stock = 1 AND (a.name LIKE ? OR a.code LIKE ?)
       GROUP BY a.id ORDER BY a.name LIMIT 500`, [q, q]);

    if (!isAirEnabled()) return localRows;

    const airRows = dbAll(
      `SELECT id, air_code as code, description as name, 'un' as unit, price_usd as sale_price,
              stock as stock_total, 0 as min_qty, 'air' as source
       FROM air_products
       WHERE active = 1 AND (description LIKE ? OR air_code LIKE ?)
       ORDER BY description LIMIT 5000`, [q, q]);

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

  // --- DB: CRM -------------------------------------------------------------
  ipcMain.handle("db:crm-accounts:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT * FROM crm_accounts WHERE name LIKE ? ORDER BY name LIMIT 500", [q]);
  });
  ipcMain.handle("db:opportunities:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll("SELECT o.*, a.name as account_name FROM opportunities o LEFT JOIN crm_accounts a ON a.id = o.account_id WHERE o.title LIKE ? ORDER BY o.created_at DESC LIMIT 500", [q]);
  });

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
        COALESCE((SELECT SUM(total) FROM invoices WHERE client_id = c.id AND status NOT IN ('cancelado','borrador')),0) AS total_facturado,
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
        FROM invoices WHERE client_id = ? AND status NOT IN ('cancelado','borrador')
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
                  FROM invoices WHERE date BETWEEN ? AND ? AND status NOT IN ('cancelado','borrador')
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
                  WHERE i.date BETWEEN ? AND ? AND i.status NOT IN ('cancelado','borrador')
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
  ipcMain.handle("db:config:get-all", () =>
    dbAll("SELECT key, value FROM system_config ORDER BY key")
  );
  ipcMain.handle("db:config:set", (_event, raw: unknown) => {
    const r = (raw ?? {}) as { key?: unknown; value?: unknown };
    dbRun("INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)",
      [safeStr(r.key), safeStr(r.value, 2000)]);
    return { ok: true };
  });

  // --- DB: Usuarios --------------------------------------------------------
  ipcMain.handle("db:users:list", () =>
    dbAll("SELECT id, name, email, role, active, created_at FROM users ORDER BY name")
  );
  ipcMain.handle("db:users:save", (_event, row: unknown) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const id = safeStr(r.id) || crypto.randomUUID();
    dbRun(`INSERT OR REPLACE INTO users (id, name, email, role, password_hash, active, created_at)
           VALUES (?, ?, ?, ?,
             COALESCE((SELECT password_hash FROM users WHERE id=?), ''),
             ?,
             COALESCE((SELECT created_at FROM users WHERE id=?), datetime('now')))`,
      [id, safeStr(r.name), safeStr(r.email), safeStr(r.role) || "user", id, r.active ?? 1, id]);
    return { ok: true, id };
  });
  ipcMain.handle("db:users:toggle", (_event, id: unknown) => {
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

  // --- AIR S.R.L. Integration -----------------------------------------------

  ipcMain.handle("air:config:get", () => getAirLocalConfig());

  ipcMain.handle("air:enabled", () => isAirEnabled());

  ipcMain.handle("air:products:list", (_event, search: unknown) => {
    const q = `%${safeStr(search)}%`;
    return dbAll(
      `SELECT id, air_code, description, brand, category, price_usd, price_ars, iva_pct, stock, active, synced_at
       FROM air_products
       WHERE active = 1 AND (air_code LIKE ? OR description LIKE ? OR brand LIKE ? OR category LIKE ?)
       ORDER BY description LIMIT 500`,
      [q, q, q, q],
    );
  });

  ipcMain.handle("air:products:count", () => {
    const row = dbGet<{ total: number; active: number }>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active
       FROM air_products`,
    );
    return row ?? { total: 0, active: 0 };
  });

  ipcMain.handle("air:sync:history", () =>
    dbAll(
      `SELECT id, started_at, finished_at, status, products_synced, error_message
       FROM air_sync_runs ORDER BY started_at DESC LIMIT 20`,
    )
  );

  ipcMain.handle("air:sync:run", async () => {
    try {
      return await runAirSync();
    } catch (err: unknown) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("air:test-connection", async () => {
    try {
      return await testAirConnection();
    } catch (err: unknown) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("air:sync-timer:start", () => {
    startAirSyncTimer();
    return { ok: true };
  });

  ipcMain.handle("air:sync-timer:stop", () => {
    stopAirSyncTimer();
    return { ok: true };
  });

}
