/**
 * Cotización del dólar — integración con DolarAPI (https://dolarapi.com).
 *
 * - Fetch automático cada 30 minutos desde el proceso main.
 * - Historial persistido en la tabla exchange_rates.
 * - Repreciado MANUAL de artículos con price_usd > 0 (solo con botón, nunca automático).
 */
import * as crypto from "node:crypto";
import { dbAll, dbGet, dbRun } from "./db";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface DolarRate {
  casa: string;        // "oficial" | "blue" | "bolsa" | "cripto" | ...
  nombre: string;      // "Oficial", "Blue", ...
  compra: number;
  venta: number;
  fechaActualizacion: string; // ISO date que reporta la fuente
}

export interface StoredRate extends DolarRate {
  id: string;
  fetched_at: string;
}

export interface RepriceResult {
  updated: number;
  rate: number;
  casa: string;
}

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

export const DOLAR_API_URL = "https://dolarapi.com/v1/dolares";
export const DOLAR_UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
/** Casas que interesan al negocio; el resto de la respuesta se ignora. */
export const DOLAR_CASAS = ["oficial", "blue", "bolsa", "contadoconliqui", "cripto", "tarjeta"];

// ---------------------------------------------------------------------------
// Parseo / validación (funciones puras, testeables)
// ---------------------------------------------------------------------------

/** Valida y normaliza la respuesta cruda de DolarAPI. Descarta entradas inválidas. */
export function parseDolarResponse(raw: unknown): DolarRate[] {
  if (!Array.isArray(raw)) return [];
  const rates: DolarRate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const casa = typeof r.casa === "string" ? r.casa.trim().toLowerCase() : "";
    const compra = Number(r.compra);
    const venta = Number(r.venta);
    if (!casa || !DOLAR_CASAS.includes(casa)) continue;
    if (!Number.isFinite(venta) || venta <= 0) continue;
    rates.push({
      casa,
      nombre: typeof r.nombre === "string" && r.nombre ? r.nombre : casa,
      compra: Number.isFinite(compra) && compra > 0 ? compra : venta,
      venta,
      fechaActualizacion: typeof r.fechaActualizacion === "string" ? r.fechaActualizacion : "",
    });
  }
  return rates;
}

/** Calcula el precio ARS redondeado a partir de un precio USD y una cotización. */
export function computeArsPrice(priceUsd: number, rate: number): number {
  return Math.round(priceUsd * rate * 100) / 100;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchDolarRates(): Promise<DolarRate[]> {
  const res = await fetch(DOLAR_API_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`DolarAPI respondió ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  const rates = parseDolarResponse(body);
  if (rates.length === 0) {
    throw new Error("DolarAPI devolvió una respuesta sin cotizaciones válidas");
  }
  return rates;
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

/**
 * Guarda un lote de cotizaciones en el historial.
 * Solo inserta si la cotización cambió respecto de la última guardada de esa casa
 * (evita llenar el historial con filas idénticas cada 30 min).
 */
export function storeRates(rates: DolarRate[]): number {
  let inserted = 0;
  for (const rate of rates) {
    const last = dbGet<{ compra: number; venta: number }>(
      "SELECT compra, venta FROM exchange_rates WHERE casa = ? ORDER BY rowid DESC LIMIT 1",
      [rate.casa],
    );
    if (last && last.compra === rate.compra && last.venta === rate.venta) continue;
    dbRun(
      "INSERT INTO exchange_rates (id, casa, nombre, compra, venta, source_date) VALUES (?, ?, ?, ?, ?, ?)",
      [crypto.randomUUID(), rate.casa, rate.nombre, rate.compra, rate.venta, rate.fechaActualizacion || null],
    );
    inserted++;
  }
  return inserted;
}

/** Última cotización guardada de cada casa. */
export function getLatestRates(): StoredRate[] {
  return dbAll<StoredRate>(`
    SELECT er.id, er.casa, er.nombre, er.compra, er.venta,
           er.source_date AS fechaActualizacion, er.fetched_at
    FROM exchange_rates er
    INNER JOIN (
      SELECT casa, MAX(rowid) AS max_rowid
      FROM exchange_rates GROUP BY casa
    ) latest ON latest.casa = er.casa AND latest.max_rowid = er.rowid
    ORDER BY CASE er.casa
      WHEN 'oficial' THEN 0 WHEN 'blue' THEN 1 WHEN 'bolsa' THEN 2
      WHEN 'contadoconliqui' THEN 3 WHEN 'cripto' THEN 4 ELSE 9 END
  `);
}

/** Historial de una casa (por defecto blue), más reciente primero. */
export function getRateHistory(casa: string, limit = 100): StoredRate[] {
  return dbAll<StoredRate>(
    `SELECT id, casa, nombre, compra, venta, source_date AS fechaActualizacion, fetched_at
     FROM exchange_rates WHERE casa = ?
     ORDER BY rowid DESC LIMIT ?`,
    [casa, Math.max(1, Math.min(1000, limit))],
  );
}

// ---------------------------------------------------------------------------
// Repreciado manual
// ---------------------------------------------------------------------------

/**
 * Recalcula sale_price (ARS) de todos los artículos con price_usd > 0 usando la
 * última cotización de venta de la casa indicada. SOLO se ejecuta a pedido del
 * usuario (botón "Repreciar ahora"), nunca automáticamente.
 */
export function repriceArticlesFromUsd(casa: string): RepriceResult {
  const rate = dbGet<{ venta: number }>(
    "SELECT venta FROM exchange_rates WHERE casa = ? ORDER BY rowid DESC LIMIT 1",
    [casa],
  );
  if (!rate || !Number.isFinite(rate.venta) || rate.venta <= 0) {
    throw new Error(`No hay cotización guardada para la casa "${casa}". Actualizá el dólar primero.`);
  }
  const articles = dbAll<{ id: string; price_usd: number }>(
    "SELECT id, price_usd FROM articles WHERE price_usd > 0 AND active = 1",
  );
  let updated = 0;
  for (const art of articles) {
    const newPrice = computeArsPrice(art.price_usd, rate.venta);
    dbRun(
      "UPDATE articles SET sale_price = ?, updated_at = datetime('now') WHERE id = ?",
      [newPrice, art.id],
    );
    updated++;
  }
  return { updated, rate: rate.venta, casa };
}

// ---------------------------------------------------------------------------
// Auto-update (proceso main)
// ---------------------------------------------------------------------------

let dolarTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Hace un fetch inmediato y programa actualizaciones cada 30 minutos.
 * `onUpdate` se invoca con las cotizaciones frescas para difundir a las ventanas.
 * Los errores de red se registran y se reintenta en el próximo ciclo.
 */
export function startDolarAutoUpdate(onUpdate?: (rates: StoredRate[]) => void): void {
  const tick = async (): Promise<void> => {
    try {
      const rates = await fetchDolarRates();
      storeRates(rates);
      if (onUpdate) onUpdate(getLatestRates());
    } catch (err) {
      // Sin red o API caída: se mantiene la última cotización guardada.
      console.error("[dolar] No se pudo actualizar la cotización:", err instanceof Error ? err.message : err);
    }
  };
  void tick();
  stopDolarAutoUpdate();
  dolarTimer = setInterval(() => { void tick(); }, DOLAR_UPDATE_INTERVAL_MS);
}

export function stopDolarAutoUpdate(): void {
  if (dolarTimer) {
    clearInterval(dolarTimer);
    dolarTimer = null;
  }
}

/** Fuerza una actualización inmediata (botón "Actualizar ahora"). */
export async function refreshDolarNow(): Promise<StoredRate[]> {
  const rates = await fetchDolarRates();
  storeRates(rates);
  return getLatestRates();
}
