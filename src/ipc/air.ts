/**
 * Handlers IPC de integración con AIR S.R.L. (catálogo mayorista).
 *
 * Búsqueda por múltiples términos con "+" (ej. "NB+LENOVO" trae filas que
 * contienen ambos). El resto son wrappers finos sobre `src/air.ts`.
 */
import { ipcMain } from "electron";
import { dbAll, dbGet } from "../db";
import {
  getAirLocalConfig,
  isAirEnabled,
  runAirSync,
  testAirConnection,
  startAirSyncTimer,
  stopAirSyncTimer,
} from "../air";
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
}
