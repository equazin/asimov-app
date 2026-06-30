/**
 * Handlers IPC del proceso principal.
 * Toda comunicación renderer → main pasa por aquí con validación de entrada.
 */
import { app, BrowserWindow, ipcMain, Notification } from "electron";
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
    return dbAll(`SELECT a.id, a.code, a.name, a.unit, a.sale_price,
                         COALESCE(SUM(s.qty),0) as stock_total,
                         COALESCE(MIN(s.min_qty),0) as min_qty
                  FROM articles a LEFT JOIN article_stock s ON s.article_id = a.id
                  WHERE a.active = 1 AND a.manages_stock = 1 AND (a.name LIKE ? OR a.code LIKE ?)
                  GROUP BY a.id ORDER BY a.name LIMIT 500`, [q, q]);
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
}
