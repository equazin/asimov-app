/**
 * Handlers IPC de integración con AIR S.R.L. (catálogo mayorista).
 *
 * Búsqueda por múltiples términos con "+" (ej. "NB+LENOVO" trae filas que
 * contienen ambos). El resto son wrappers finos sobre `src/air.ts`.
 */
import { dialog, ipcMain } from "electron";
import { dbAll, dbGet } from "../db";
import {
  getAirLocalConfig,
  isAirEnabled,
  runAirSync,
  testAirConnection,
  startAirSyncTimer,
  stopAirSyncTimer,
} from "../air";
import { parseAirNotaFromFile } from "../air-pdf";
import { safeStr, type IpcDeps } from "./shared";

export function registerAirIpc(_deps: IpcDeps): void {
  ipcMain.handle("air:config:get", () => getAirLocalConfig());

  ipcMain.handle("air:enabled", () => isAirEnabled());

  ipcMain.handle("air:products:list", (_event, search: unknown) => {
    // Igual que en Stock: "NB+LENOVO" busca filas que contengan TODOS los términos.
    const terms = safeStr(search).split("+").map((t) => t.trim()).filter(Boolean);
    const conditions = terms.map(() => "(air_code LIKE ? OR description LIKE ? OR brand LIKE ? OR category LIKE ?)");
    const params = terms.flatMap((t) => { const q = `%${t}%`; return [q, q, q, q]; });
    const where = conditions.length ? " AND " + conditions.join(" AND ") : "";
    return dbAll(
      `SELECT id, air_code, description, brand, category, price_usd, price_ars, iva_pct, stock, active, synced_at
       FROM air_products
       WHERE active = 1${where}
       ORDER BY description LIMIT 500`,
      params,
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
    ),
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

  // Importa una Nota de Venta de AIR (PDF) y devuelve los ítems parseados
  // + matcheados contra `air_products` local, para autocargar una Orden de
  // Compra. Si `filePath` viene vacío, abre un diálogo del OS para elegirlo.
  ipcMain.handle("air:parse-pdf", async (_event, filePathIn: unknown) => {
    try {
      let filePath = safeStr(filePathIn, 4000);
      if (!filePath) {
        const win = _deps.getMainWindow();
        const picked = win && !win.isDestroyed()
          ? await dialog.showOpenDialog(win, {
              title: "Elegí el PDF del pedido de AIR",
              filters: [{ name: "PDF", extensions: ["pdf"] }],
              properties: ["openFile"],
            })
          : await dialog.showOpenDialog({
              title: "Elegí el PDF del pedido de AIR",
              filters: [{ name: "PDF", extensions: ["pdf"] }],
              properties: ["openFile"],
            });
        if (picked.canceled || picked.filePaths.length === 0) {
          return { ok: false, cancelled: true };
        }
        filePath = picked.filePaths[0];
      }
      const nota = await parseAirNotaFromFile(filePath);
      return { ok: true, data: nota };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
