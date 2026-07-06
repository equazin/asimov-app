/**
 * Cliente HTTP de la API de AIR S.R.L. para Electron (Node.js puro).
 *
 * Porta la lógica de lib/integrations/air/client.ts (versión web) a un módulo
 * standalone que usa `fetch` (disponible en Node 18+ / Electron 33).
 * No depende de Prisma ni de ningún ORM — usa directamente better-sqlite3 vía
 * los helpers de db.ts.
 *
 * Auth (según api.air-intra.com/docs): login `GET ?q=login&user=&pass=` → token;
 * los endpoints de datos (`q=articulos`, `q=syp`) son **POST** con header
 * `Authorization: Bearer <token>`. El token se cachea en memoria; en 401 se
 * re-loguea una vez y reintenta.
 *
 * Rate-limit (doc): NO hay límite por request — las páginas se piden consecutivas
 * (page=0,1,2… sin esperas). La API sólo pide una **pausa de 5 minutos entre
 * ciclos completos** de descarga. Un 403 "Too many queries" significa que se está
 * reiniciando el ciclo demasiado pronto (o se está hostigando con requests de más).
 */

import { dbAll, dbRun } from "./db";
import { decryptSecret } from "./secrets";
import { enqueueChange } from "./sync";
import * as crypto from "node:crypto";

// ─── Configuración ──────────────────────────────────────────────────────────

const AIR_BASE_URL = "https://api.air-intra.com/v2";
const TOKEN_TTL_MS = 50 * 60 * 1000;
const TOKEN_SKEW_MS = 30_000;
const MAX_PAGES = 500;
/** Pausa mínima entre ciclos completos de descarga que exige la API de AIR. */
const AIR_MIN_CYCLE_MS = 5 * 60 * 1000;

// ─── Token en memoria ───────────────────────────────────────────────────────

let memToken: { token: string; expiresAt: number } | null = null;

// Estado del ciclo de descarga: evita solapar corridas y respeta la pausa entre ciclos.
let airSyncing = false;
let lastCycleEndAt = 0;

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
    password: decryptSecret(cfg.air_password ?? ""),
    baseUrl: cfg.air_base_url?.trim() || AIR_BASE_URL,
    // La API pide ≥5 min entre ciclos; no permitimos configurar menos.
    syncIntervalMinutes: Math.max(5, parseInt(cfg.air_sync_interval ?? "15", 10) || 15),
  };
}

export function isAirEnabled(): boolean {
  return getAirLocalConfig().enabled;
}

export function enqueueAirConfigCloudSync(): void {
  const cfg = getAirLocalConfig();
  enqueueChange("integration_config", "air", "update", {
    provider: "air",
    config: {
      enabled: cfg.enabled,
      username: cfg.username,
      password: cfg.password,
      baseUrl: cfg.baseUrl,
      syncIntervalMinutes: cfg.syncIntervalMinutes,
    },
  });
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

/** Descarta el token cacheado. Llamar al cambiar credenciales o en tests. */
export function resetAirAuthCache(): void {
  memToken = null;
}

// ─── Request genérico ───────────────────────────────────────────────────────

function asArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object" && Array.isArray((json as Record<string, unknown>).data)) {
    return (json as Record<string, unknown>).data as unknown[];
  }
  return [];
}

/** Error de rate-limit de AIR (403 "Too many queries"): hay que esperar, no reintentar. */
export class AirRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AirRateLimitError";
  }
}

/**
 * Parsea el body de AIR tolerando basura previa. El backend (PHP) a veces
 * antepone "notices"/HTML al JSON (p.ej. `<br /><b>Notice</b>: Undefined
 * property: stdClass::$estado …`), lo que rompería un JSON.parse directo. Se
 * intenta parsear tal cual y, si falla, desde el primer `[` o `{`.
 */
function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    /* puede tener notices de PHP antes del JSON */
  }
  const idxs = [text.indexOf("["), text.indexOf("{")].filter((i) => i >= 0);
  if (idxs.length === 0) return null;
  try {
    return JSON.parse(text.slice(Math.min(...idxs)));
  } catch {
    return null;
  }
}

/** Extrae el envelope de error de AIR ({error_id, error_name, error_detail}) si viene JSON. */
function parseAirError(bodyText: string): { id?: number; name?: string; detail?: string } {
  const j = extractJson(bodyText);
  if (j && typeof j === "object") {
    const o = j as Record<string, unknown>;
    return {
      id: Number(o.error_id) || undefined,
      name: typeof o.error_name === "string" ? o.error_name : undefined,
      detail: typeof o.error_detail === "string" ? o.error_detail : undefined,
    };
  }
  return {};
}

/** Un POST autenticado con Bearer, el contrato que documenta AIR para los datos. */
function airPost(url: string, token: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: "{}",
  });
}

export async function airRequest(query: string): Promise<unknown[]> {
  const cfg = getAirLocalConfig();
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const sep = query.startsWith("?") ? "" : "/";
  const url = `${base}${sep}${query}`;

  let token = await getToken();

  // Hasta 2 intentos: el 2º sólo ocurre si el 1º dio 401 (token vencido) y se re-logueó.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await airPost(url, token);
    const text = await res.text().catch(() => "");

    if (res.ok) {
      const json = extractJson(text);
      // Body con contenido pero imposible de parsear (notice de PHP sin JSON
      // detrás): NO devolver [] — eso haría creer que el catálogo terminó y
      // desactivaría productos. Se lanza para marcar la corrida como error.
      if (json === null && text.trim().length > 0) {
        throw new Error(
          `AIR ${query}: respuesta no-JSON (posible notice de PHP): ${text.replace(/\s+/g, " ").slice(0, 160)}`,
        );
      }
      return asArray(json);
    }

    const bodyText = text.replace(/\s+/g, " ").slice(0, 200);
    const airErr = parseAirError(text);

    // 403 "Too many queries" → cooldown de la API: no reintentar, avisar claro.
    if (res.status === 403 || airErr.id === 403) {
      throw new AirRateLimitError(
        `AIR rate-limit: ${airErr.detail ?? "demasiadas consultas"}. La API pide una pausa de ~5 minutos; reintentá luego.`,
      );
    }

    // 401 → token inválido/vencido: re-login una vez y reintentar.
    if (res.status === 401 && attempt === 0) {
      token = await getToken(true);
      continue;
    }

    throw new Error(`AIR ${query}: HTTP ${res.status} ${bodyText}`.trim());
  }

  throw new Error(`AIR ${query}: no se pudo autenticar tras reintentar el login.`);
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
  ivaPct: number;
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
  iva: ["iva", "iva_pct", "ivaPct", "iva_porcentaje", "alicuota", "alicuota_iva", "tax", "tax_rate"],
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

  const rawIva = toNum(pick(o, KEYS.iva));
  const ivaPct = rawIva !== null && [0, 10.5, 21, 27].includes(rawIva) ? rawIva : 21;

  return {
    codiart,
    name,
    partNumber: toStr(pick(o, ["part_number", "partnumber", "modelo", "model", "sku"])),
    rubro: toStr(pick(o, KEYS.rubro)),
    grupo: toStr(pick(o, KEYS.grupo)),
    categoria: toStr(pick(o, KEYS.categoria)),
    price: toNum(pick(o, KEYS.price)),
    ivaPct,
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

  // No solapar: si ya hay una descarga en curso, no arrancamos otra.
  if (airSyncing) {
    throw new Error("AIR: ya hay una sincronización en curso.");
  }

  // Respetar la pausa de ~5 min entre ciclos completos que pide la API.
  const sinceLast = Date.now() - lastCycleEndAt;
  if (lastCycleEndAt && sinceLast < AIR_MIN_CYCLE_MS) {
    const waitMin = Math.ceil((AIR_MIN_CYCLE_MS - sinceLast) / 60_000);
    throw new Error(
      `AIR: esperá ${waitMin} min antes de re-sincronizar (la API pide una pausa de 5 minutos entre ciclos).`,
    );
  }
  airSyncing = true;

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
           VALUES (?, ?, ?, ?, ?, ?, 'un', ?, ?, ?, ?, ?, ?)
           ON CONFLICT(air_code) DO UPDATE SET
             description = excluded.description,
             part_number = excluded.part_number,
             brand = excluded.brand,
             category = excluded.category,
             price_usd = excluded.price_usd,
             iva_pct = excluded.iva_pct,
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
            p.ivaPct,
            p.stockDisp,
            p.active ? 1 : 0,
            JSON.stringify(rawItem),
            now,
          ],
        );
        enqueueChange("external_catalog_product", `air:${p.codiart}`, "update", {
          provider: "air",
          externalCode: p.codiart,
          description: p.name,
          partNumber: p.partNumber,
          brand: p.rubro,
          category: p.categoria ?? p.grupo,
          unit: "un",
          priceUsd: p.price ?? 0,
          priceArs: 0,
          ivaPct: p.ivaPct,
          stock: p.stockDisp,
          active: p.active,
          rawJson: rawItem as Record<string, unknown>,
          syncedAt: now,
        });
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
  } finally {
    // Marca el fin del ciclo (arranca la pausa de 5 min) y libera el lock.
    lastCycleEndAt = Date.now();
    airSyncing = false;
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
