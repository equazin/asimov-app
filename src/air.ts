/**
 * Cliente HTTP de la API de AIR S.R.L. para Electron (Node.js puro).
 *
 * Porta la lógica de lib/integrations/air/client.ts (versión web) a un módulo
 * standalone que usa `fetch` (disponible en Node 18+ / Electron 33).
 * No depende de Prisma ni de ningún ORM — usa directamente better-sqlite3 vía
 * los helpers de db.ts.
 *
 * Auth: token bearer obtenido con `?q=login`. Se cachea en memoria.
 * En 401 se re-loguea una vez y reintenta.
 */

import { dbAll, dbRun } from "./db";
import * as crypto from "node:crypto";

// ─── Configuración ──────────────────────────────────────────────────────────

const AIR_BASE_URL = "https://api.air-intra.com/v2";
const TOKEN_TTL_MS = 50 * 60 * 1000;
const TOKEN_SKEW_MS = 30_000;
const MAX_PAGES = 500;

// ─── Token en memoria ───────────────────────────────────────────────────────

let memToken: { token: string; expiresAt: number } | null = null;

// ─── Helpers de config ──────────────────────────────────────────────────────

export interface AirLocalConfig {
  enabled: boolean;
  username: string;
  password: string;
  baseUrl: string;
  syncIntervalMinutes: number;
}

/**
 * Lee la configuración de AIR de la tabla system_config (SQLite local).
 * Las claves son: air_enabled, air_username, air_password, air_base_url, air_sync_interval.
 */
export function getAirLocalConfig(): AirLocalConfig {
  const rows = dbAll<{ key: string; value: string }>(
    "SELECT key, value FROM system_config WHERE key LIKE 'air_%' ORDER BY key",
  );
  const cfg: Record<string, string> = {};
  for (const r of rows) cfg[r.key] = r.value;

  return {
    enabled: cfg.air_enabled === "true" || cfg.air_enabled === "1",
    username: cfg.air_username ?? "",
    password: cfg.air_password ?? "",
    baseUrl: cfg.air_base_url?.trim() || AIR_BASE_URL,
    syncIntervalMinutes: Math.max(1, parseInt(cfg.air_sync_interval ?? "15", 10) || 15),
  };
}

export function isAirEnabled(): boolean {
  return getAirLocalConfig().enabled;
}

// ─── Extracción de token ────────────────────────────────────────────────────

function extractToken(json: unknown): string | null {
  if (typeof json === "string") return json.trim() || null;
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    for (const k of ["token", "access_token", "accessToken", "bearer", "jwt", "Token", "auth"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    if (o.data) return extractToken(o.data);
  }
  return null;
}

// ─── Login ──────────────────────────────────────────────────────────────────

async function login(): Promise<string> {
  const cfg = getAirLocalConfig();
  if (!cfg.username || !cfg.password) {
    throw new Error("AIR: faltan credenciales (configurá usuario y contraseña en Integraciones).");
  }
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const url = `${base}/?q=login&user=${encodeURIComponent(cfg.username)}&pass=${encodeURIComponent(cfg.password)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`AIR login HTTP ${res.status}`);
  const json: unknown = await res.json().catch(() => null);
  const token = extractToken(json);
  if (!token) throw new Error("AIR login: no se encontró token en la respuesta.");
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  memToken = { token, expiresAt };
  return token;
}

async function getToken(force = false): Promise<string> {
  if (!force && memToken && memToken.expiresAt > Date.now() + TOKEN_SKEW_MS) {
    return memToken.token;
  }
  return login();
}

// ─── Request genérico ───────────────────────────────────────────────────────

function asArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object" && Array.isArray((json as Record<string, unknown>).data)) {
    return (json as Record<string, unknown>).data as unknown[];
  }
  return [];
}

async function airRequest(query: string): Promise<unknown[]> {
  const cfg = getAirLocalConfig();
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const sep = query.startsWith("?") ? "" : "/";
  const url = `${base}${sep}${query}`;
  const doFetch = (token: string): Promise<Response> =>
    fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });

  let token = await getToken();
  let res = await doFetch(token);
  if (res.status === 401) {
    token = await getToken(true);
    res = await doFetch(token);
  }
  if (!res.ok) throw new Error(`AIR ${query} HTTP ${res.status}`);
  const json: unknown = await res.json().catch(() => null);
  return asArray(json);
}

export function fetchArticulosPage(page: number): Promise<unknown[]> {
  return airRequest(`?q=articulos&page=${page}`);
}

export function fetchSypPage(page: number): Promise<unknown[]> {
  return airRequest(`?q=syp&page=${page}`);
}

// ─── Mapper ─────────────────────────────────────────────────────────────────

export interface AirProductNormalized {
  codiart: string;
  name: string;
  partNumber: string | null;
  rubro: string | null;
  grupo: string | null;
  categoria: string | null;
  price: number | null;
  stockDisp: number;
  stockFisico: number;
  stockEntrante: number;
  active: boolean;
}

type Raw = Record<string, unknown>;

function pick(obj: Raw, keys: readonly string[]): unknown {
  const lowerMap = new Map<string, unknown>();
  for (const k of Object.keys(obj)) lowerMap.set(k.toLowerCase(), obj[k]);
  for (const k of keys) {
    const v = lowerMap.get(k.toLowerCase());
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function toStr(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown): number {
  const n = toNum(v);
  return n === null ? 0 : Math.trunc(n);
}

function parseActive(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  const s = String(v).trim().toLowerCase();
  if (["0", "false", "no", "inactivo", "baja", "b", "i"].includes(s)) return false;
  return true;
}

const KEYS = {
  codiart: ["codiart", "codigo", "cod", "id", "articulo", "idarticulo"],
  name: ["descripcion", "descrip", "nombre", "detalle", "desc", "name", "title"],
  rubro: ["rubro"],
  grupo: ["grupo"],
  categoria: ["categoria", "category"],
  price: ["precio", "precio_lista", "preciolista", "precioLista", "pvp", "price", "importe"],
  stockDisp: ["disponible", "stock_d", "stockd", "stockDisponible", "stock_disponible", "d"],
  stockFisico: ["fisico", "físico", "stock_f", "stockf", "stockFisico", "stock_fisico", "f"],
  stockEntrante: ["entrante", "stock_e", "stocke", "stockEntrante", "stock_entrante", "e", "pedido"],
  stockGeneric: ["stock", "existencia", "cantidad"],
  estado: ["estado", "activo", "active", "status"],
} as const;

const LOCATION_KEYS = ["ros", "mza", "cba", "lug", "air", "bsas", "mdp", "sfe", "tuc"] as const;

function sumLocationStock(o: Raw, field: string): number {
  let total = 0;
  for (const loc of LOCATION_KEYS) {
    const locObj = o[loc];
    if (locObj && typeof locObj === "object") {
      const v = (locObj as Raw)[field];
      if (v !== undefined && v !== null) total += toInt(v);
    }
  }
  return total;
}

export function mapAirProduct(raw: unknown): AirProductNormalized | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Raw;
  const codiart = toStr(pick(o, KEYS.codiart));
  if (!codiart) return null;
  const name = toStr(pick(o, KEYS.name)) ?? codiart;

  const flatDisp = pick(o, KEYS.stockDisp);
  const flatFisico = pick(o, KEYS.stockFisico);
  const flatEntrante = pick(o, KEYS.stockEntrante);
  const generic = pick(o, KEYS.stockGeneric);

  const hasLocations = LOCATION_KEYS.some(k => o[k] && typeof o[k] === "object" && (o[k] as Raw).disponible !== undefined);

  let stockDisp: number;
  let stockFisico: number;
  let stockEntrante: number;

  if (hasLocations) {
    stockDisp = sumLocationStock(o, "disponible");
    stockFisico = sumLocationStock(o, "fisico");
    stockEntrante = sumLocationStock(o, "entrante");
  } else {
    stockDisp = toInt(flatDisp !== undefined ? flatDisp : generic);
    stockFisico = toInt(flatFisico);
    stockEntrante = toInt(flatEntrante);
  }

  return {
    codiart,
    name,
    partNumber: toStr(pick(o, ["part_number", "partnumber", "modelo", "model", "sku"])),
    rubro: toStr(pick(o, KEYS.rubro)),
    grupo: toStr(pick(o, KEYS.grupo)),
    categoria: toStr(pick(o, KEYS.categoria)),
    price: toNum(pick(o, KEYS.price)),
    stockDisp,
    stockFisico,
    stockEntrante,
    active: parseActive(pick(o, KEYS.estado)),
  };
}

export function mapAirProducts(rows: readonly unknown[]): AirProductNormalized[] {
  const out: AirProductNormalized[] = [];
  for (const r of rows) {
    const p = mapAirProduct(r);
    if (p) out.push(p);
  }
  return out;
}

// ─── Sync ───────────────────────────────────────────────────────────────────

export interface AirSyncResult {
  runId: string;
  pages: number;
  itemsSynced: number;
  deactivated: number;
  status: "ok" | "error";
  error?: string;
}

export async function runAirSync(): Promise<AirSyncResult> {
  if (!isAirEnabled()) {
    throw new Error("AIR: integración deshabilitada.");
  }

  await getToken(true);

  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  dbRun(
    "INSERT INTO air_sync_runs (id, started_at, status) VALUES (?, ?, 'running')",
    [runId, now],
  );

  let page = 0;
  let itemsSynced = 0;

  try {
    while (page < MAX_PAGES) {
      const raw = await fetchArticulosPage(page);
      if (raw.length === 0) break;

      for (let i = 0; i < raw.length; i++) {
        const rawItem = raw[i];
        const p = mapAirProduct(rawItem);
        if (!p) continue;
        const id = crypto.randomUUID();
        dbRun(
          `INSERT INTO air_products (id, air_code, description, part_number, brand, category, unit, price_usd, iva_pct, stock, active, raw_json, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, 'un', ?, 21, ?, ?, ?, ?)
           ON CONFLICT(air_code) DO UPDATE SET
             description = excluded.description,
             part_number = excluded.part_number,
             brand = excluded.brand,
             category = excluded.category,
             price_usd = excluded.price_usd,
             stock = excluded.stock,
             active = excluded.active,
             raw_json = excluded.raw_json,
             synced_at = excluded.synced_at`,
          [
            id,
            p.codiart,
            p.name,
            p.partNumber,
            p.rubro,
            p.categoria ?? p.grupo,
            p.price ?? 0,
            p.stockDisp,
            p.active ? 1 : 0,
            JSON.stringify(rawItem),
            now,
          ],
        );
        itemsSynced++;
      }
      page++;
    }

    // Desactivar productos que no aparecieron en esta corrida
    const deactivateResult = dbRun(
      "UPDATE air_products SET active = 0 WHERE active = 1 AND synced_at < ?",
      [now],
    );
    const deactivated = deactivateResult.changes;

    dbRun(
      "UPDATE air_sync_runs SET status = 'ok', finished_at = ?, products_synced = ? WHERE id = ?",
      [new Date().toISOString(), itemsSynced, runId],
    );

    return { runId, pages: page, itemsSynced, deactivated, status: "ok" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    dbRun(
      "UPDATE air_sync_runs SET status = 'error', finished_at = ?, error_message = ?, products_synced = ? WHERE id = ?",
      [new Date().toISOString(), message.slice(0, 1000), itemsSynced, runId],
    );
    return { runId, pages: page, itemsSynced, deactivated: 0, status: "error", error: message };
  }
}

// ─── Verificar conexión ─────────────────────────────────────────────────────

export async function testAirConnection(): Promise<{ ok: boolean; message: string; productCount?: number }> {
  try {
    const cfg = getAirLocalConfig();
    if (!cfg.username || !cfg.password) {
      return { ok: false, message: "Faltan usuario y/o contraseña." };
    }
    const token = await getToken(true);
    if (!token) return { ok: false, message: "No se obtuvo token." };

    // Intentar obtener la primera página para verificar
    const firstPage = await fetchArticulosPage(0);
    return {
      ok: true,
      message: `Conexión exitosa. ${firstPage.length} productos en la primera página.`,
      productCount: firstPage.length,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

// ─── Timer de sync automático ───────────────────────────────────────────────

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startAirSyncTimer(): void {
  stopAirSyncTimer();
  if (!isAirEnabled()) return;

  const cfg = getAirLocalConfig();
  const ms = cfg.syncIntervalMinutes * 60 * 1000;

  console.log(`[AIR] Sync automático activado cada ${cfg.syncIntervalMinutes} min.`);
  syncInterval = setInterval(() => {
    if (isAirEnabled()) {
      console.log("[AIR] Ejecutando sync automático…");
      runAirSync()
        .then((r) => console.log(`[AIR] Sync OK: ${r.itemsSynced} productos.`))
        .catch((e) => console.error("[AIR] Sync error:", e));
    }
  }, ms);
}

export function stopAirSyncTimer(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
