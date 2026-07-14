/**
 * Handlers IPC de cotización del dólar (dolarapi).
 *
 * `dolar:reprice` requiere admin y encola cada artículo repreciado como cambio
 * de producto para que el resto de las PCs vean los nuevos precios.
 */
import { ipcMain } from "electron";
import { dbAll } from "../db";
import {
  getLatestRates,
  getRateHistory,
  refreshDolarNow,
  repriceArticlesFromUsd,
} from "../dolar";
import { DENY_ADMIN, enqueueIfCloud, makeIsAdmin, safeStr, type IpcDeps } from "./shared";

export function registerDolarIpc(deps: IpcDeps): void {
  const isAdmin = makeIsAdmin(deps);

  ipcMain.handle("dolar:latest", () => {
    try {
      return { ok: true, data: getLatestRates() };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("dolar:history", (_event, casa: unknown, limit: unknown) => {
    try {
      const n = Number(limit);
      return { ok: true, data: getRateHistory(safeStr(casa) || "blue", Number.isFinite(n) && n > 0 ? n : 100) };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("dolar:refresh", async () => {
    try {
      return { ok: true, data: await refreshDolarNow() };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Repreciado manual: recalcula precios ARS de artículos con price_usd (solo admin).
  ipcMain.handle("dolar:reprice", (_event, casa: unknown) => {
    if (!isAdmin()) return DENY_ADMIN;
    try {
      const result = repriceArticlesFromUsd(safeStr(casa) || "blue");
      // Los artículos repreciados deben llegar a las otras PCs vía sync cloud.
      const updatedArticles = dbAll<Record<string, unknown>>(
        "SELECT id, code, name, category, unit, sale_price, iva_pct FROM articles WHERE price_usd > 0 AND active = 1",
      );
      for (const art of updatedArticles) {
        enqueueIfCloud("product", String(art.id), "update", {
          code: safeStr(art.code),
          name: safeStr(art.name),
          category: safeStr(art.category) || null,
          unit: safeStr(art.unit) || "un",
          price: Number(art.sale_price) || 0,
          ivaRate: Number(art.iva_pct) || 21,
        });
      }
      return { ok: true, data: result };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
