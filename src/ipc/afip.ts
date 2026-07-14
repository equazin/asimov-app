/**
 * Handlers IPC de facturación electrónica AFIP/ARCA.
 *
 * Todos los que mutan estado (credenciales, request-cae, retry, libro-iva)
 * requieren rol admin. `afip:request-cae` propaga el snapshot del documento
 * a la nube si se autoriza — misma semántica que hacía la versión monolítica.
 */
import { dialog, ipcMain } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { isCloudConnected } from "../api-client";
import { buildDocEnvelope } from "../document-sync";
import { enqueueChange } from "../sync";
import { isAfipUnavailable } from "../afip/domain";
import {
  getAfipConfig,
  saveAfipCredentials,
  testAfipConnection,
  runAfipDiagnostics,
  requestCae as afipRequestCae,
  authorizeStoredInvoice,
  markInvoicePendingCae,
  markInvoiceRejected,
  retryPendingCae,
  getPendingCaeInvoices,
  consultarPadron,
  buildStoredInvoiceQr,
  type SaveCredentialsInput,
  type CaeRequestInput,
} from "../afip-service";
import { buildLibroIvaVentas } from "../libro-iva";
import { DENY_ADMIN, makeIsAdmin, safeStr, type IpcDeps } from "./shared";

export function registerAfipIpc(deps: IpcDeps): void {
  const isAdmin = makeIsAdmin(deps);

  ipcMain.handle("afip:status", () => {
    try {
      return { ok: true, data: { ...getAfipConfig(), canAuthorize: isAdmin() } };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("afip:save-credentials", (_event, raw: unknown) => {
    if (!isAdmin()) return DENY_ADMIN;
    try {
      const r = (raw ?? {}) as Record<string, unknown>;
      const input: SaveCredentialsInput = {
        cuit: safeStr(r.cuit),
        pointOfSale: Number(r.pointOfSale) || 1,
        env: safeStr(r.env) === "produccion" ? "produccion" : "homologacion",
        certPem: r.certPem !== undefined ? safeStr(r.certPem, 100000) : undefined,
        keyPem: r.keyPem !== undefined ? safeStr(r.keyPem, 100000) : undefined,
        enabled: r.enabled === undefined ? undefined : Boolean(r.enabled),
      };
      return { ok: true, data: saveAfipCredentials(input) };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("afip:test-connection", async () => {
    if (!isAdmin()) return DENY_ADMIN;
    try {
      return await testAfipConnection();
    } catch (err: unknown) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // QR de una factura ya autorizada, para reimprimirla (no se persiste).
  ipcMain.handle("afip:invoice-qr", async (_event, invoiceId: unknown) => {
    try {
      return { ok: true, data: await buildStoredInvoiceQr(safeStr(invoiceId)) };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Diagnóstico del circuito completo (Fase 6: homologación → producción).
  ipcMain.handle("afip:diagnostics", async () => {
    if (!isAdmin()) return DENY_ADMIN;
    try {
      return { ok: true, data: await runAfipDiagnostics() };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("afip:request-cae", async (_event, raw: unknown) => {
    if (!isAdmin()) return DENY_ADMIN;
    try {
      const r = (raw ?? {}) as Record<string, unknown>;
      const input: CaeRequestInput = {
        invoiceId: safeStr(r.invoiceId),
        invoiceType: Number(r.invoiceType) || 6,
        clientCuit: safeStr(r.clientCuit),
        concepto: r.concepto !== undefined ? Number(r.concepto) : undefined,
        date: r.date ? safeStr(r.date, 40) : undefined,
        net: Number(r.net) || 0,
        iva: Number(r.iva) || 0,
        total: Number(r.total) || 0,
        items: Array.isArray(r.items)
          ? (r.items as Array<Record<string, unknown>>).map((it) => ({ ivaRate: Number(it.ivaRate) || 0, subtotal: Number(it.subtotal) || 0 }))
          : [],
        cbtesAsoc: Array.isArray(r.cbtesAsoc)
          ? (r.cbtesAsoc as Array<Record<string, unknown>>).map((c) => ({
              tipo: Number(c.tipo) || 0, ptoVta: Number(c.ptoVta) || 0, nro: Number(c.nro) || 0,
              cuit: c.cuit ? safeStr(c.cuit, 20) : undefined,
            }))
          : undefined,
        condicionIvaReceptor: r.condicionIvaReceptor !== undefined ? Number(r.condicionIvaReceptor) : undefined,
      };
      if (!input.invoiceId) return { ok: false, error: "Falta el identificador de la factura." };
      let data;
      try {
        data = await afipRequestCae(input);
      } catch (err) {
        // Sin conexión: queda "pendiente de CAE" y el reintento automático la levanta.
        const message = err instanceof Error ? err.message : String(err);
        if (isAfipUnavailable(err)) {
          markInvoicePendingCae(input.invoiceId, message);
          return {
            ok: false,
            pending: true,
            error: "No hay conexión con AFIP. La factura quedó \"pendiente de CAE\" y se reintentará automáticamente.",
          };
        }
        markInvoiceRejected(input.invoiceId, message);
        throw err;
      }
      // El CAE cambió la factura local (número/estado): propagar a la nube y refrescar el shell.
      if (isCloudConnected()) {
        try {
          const envelope = buildDocEnvelope("invoice", input.invoiceId);
          if (envelope) enqueueChange("document_snapshot", input.invoiceId, "update", envelope as unknown as Record<string, unknown>);
        } catch { /* best-effort */ }
      }
      const win = deps.getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send("shell:invoice-saved");
      return { ok: true, data };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Autoriza una factura ya guardada usando exclusivamente su snapshot local.
  // No vuelve a insertarla ni acepta importes construidos por el renderer.
  ipcMain.handle("afip:authorize-stored-invoice", async (_event, invoiceId: unknown) => {
    if (!isAdmin()) return DENY_ADMIN;
    const id = safeStr(invoiceId);
    if (!id) return { ok: false, error: "Falta el identificador de la factura." };
    try {
      const data = await authorizeStoredInvoice(id);
      if (isCloudConnected()) {
        try {
          const envelope = buildDocEnvelope("invoice", id);
          if (envelope) enqueueChange("document_snapshot", id, "update", envelope as unknown as Record<string, unknown>);
        } catch { /* best-effort */ }
      }
      const win = deps.getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send("shell:invoice-saved");
      return { ok: true, data };
    } catch (err: unknown) {
      return {
        ok: false,
        pending: isAfipUnavailable(err),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // Reintento manual de facturas "pendiente de CAE" (también corre solo al
  // arrancar y cada 10 min desde main.ts).
  ipcMain.handle("afip:retry-pending", async () => {
    if (!isAdmin()) return DENY_ADMIN;
    try {
      const data = await retryPendingCae();
      if (data.authorized > 0) {
        const win = deps.getMainWindow();
        if (win && !win.isDestroyed()) win.webContents.send("shell:invoice-saved");
      }
      return { ok: true, data: { ...data, pendingLeft: getPendingCaeInvoices().length } };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Padrón: CUIT → razón social + condición de IVA + domicilio.
  ipcMain.handle("afip:padron", async (_event, cuit: unknown) => {
    try {
      return { ok: true, data: await consultarPadron(safeStr(cuit, 20)) };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Libro IVA Ventas (RG 4597): genera los dos TXT y los guarda donde elija el usuario.
  ipcMain.handle("afip:libro-iva-export", async (_event, desde: unknown, hasta: unknown) => {
    if (!isAdmin()) return DENY_ADMIN;
    try {
      const result = buildLibroIvaVentas(safeStr(desde, 10), safeStr(hasta, 10));
      if (result.count === 0) {
        return { ok: false, error: "No hay comprobantes autorizados (con CAE) en ese rango de fechas." };
      }
      const win = deps.getMainWindow();
      const dialogOpts = {
        title: "Elegí la carpeta donde guardar el Libro IVA Ventas",
        properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">,
      };
      const picked = win && !win.isDestroyed()
        ? await dialog.showOpenDialog(win, dialogOpts)
        : await dialog.showOpenDialog(dialogOpts);
      if (picked.canceled || picked.filePaths.length === 0) return { ok: false, error: "Export cancelado." };
      const dir = picked.filePaths[0];
      const cbtePath = path.join(dir, "REGINFO_CV_VENTAS_CBTE.txt");
      const alicPath = path.join(dir, "REGINFO_CV_VENTAS_ALICUOTAS.txt");
      fs.writeFileSync(cbtePath, result.cbte, "latin1");
      fs.writeFileSync(alicPath, result.alicuotas, "latin1");
      return { ok: true, data: { count: result.count, files: [cbtePath, alicPath] } };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
