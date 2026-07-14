/**
 * Offline-first sync engine for Asimov ERP desktop.
 *
 * Strategy:
 * 1. All writes go to local SQLite first (immediate)
 * 2. Writes are logged in a `sync_queue` table
 * 3. When online, pending changes are pushed to the API
 * 4. After push, pull remote changes since last sync
 * 5. Conflicts are resolved with last-write-wins (server wins)
 */
import { dbAll, dbRun, dbGet, getDb } from './db';
import {
  isCloudConnected,
  apiTestConnection,
  getAccessToken,
  getApiBaseUrl,
} from './api-client';
import { net } from 'electron';
import { encryptSecret } from './secrets';
import { ensureSequenceBlocks } from './sequences';
import { applyDocEnvelope, deleteDocLocal, type DocEnvelope } from './document-sync';

const SYNC_INTERVAL_MS = 30_000;
/** Tras este número de intentos fallidos, el cambio se "aparca" (deja de reintentarse). */
const MAX_ATTEMPTS = 8;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
/** Recuerda si el último ciclo encontró la nube caída, para forzar reintento al volver. */
let wasOffline = false;

export function initSyncTables(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      synced_at TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migración para instalaciones previas a v4.6.0 (la tabla existía sin estas columnas).
  try { db.exec('ALTER TABLE sync_queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0'); } catch { /* ya existe */ }
  try { db.exec('ALTER TABLE sync_queue ADD COLUMN next_attempt_at TEXT'); } catch { /* ya existe */ }
}

/** Minutos de espera antes del próximo intento, según cuántos van fallando (backoff exponencial con techo). */
function backoffMinutes(attempts: number): number {
  const schedule = [1, 2, 5, 10, 20, 40, 60, 120];
  return schedule[Math.min(attempts, schedule.length - 1)];
}

/**
 * Marca un fallo transitorio (red caída, 5xx, 429): incrementa intentos y agenda
 * el próximo con backoff. Si se agota `MAX_ATTEMPTS`, el cambio queda aparcado
 * (no se vuelve a intentar hasta un reintento manual/reconexión que lo reactive).
 */
function markTransientFailure(id: number, attempts: number, message: string): void {
  const nextAttempts = attempts + 1;
  if (nextAttempts >= MAX_ATTEMPTS) {
    dbRun(
      "UPDATE sync_queue SET attempts = ?, next_attempt_at = NULL, error = ? WHERE id = ?",
      [nextAttempts, `parked_after_retries: ${message}`.slice(0, 500), id],
    );
    return;
  }
  dbRun(
    "UPDATE sync_queue SET attempts = ?, next_attempt_at = datetime('now', ?), error = ? WHERE id = ?",
    [nextAttempts, `+${backoffMinutes(nextAttempts)} minutes`, message.slice(0, 500), id],
  );
}

/** Marca un fallo permanente (4xx de validación): no tiene sentido reintentar. */
function markPermanentFailure(id: number, message: string): void {
  dbRun(
    "UPDATE sync_queue SET attempts = ?, next_attempt_at = NULL, error = ? WHERE id = ?",
    [MAX_ATTEMPTS, message.slice(0, 500), id],
  );
}

/** Un HTTP status es transitorio si conviene reintentar (red, timeout, rate-limit, 5xx). */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function enqueueChange(
  entity: string,
  entityId: string,
  action: 'create' | 'update' | 'delete',
  payload?: Record<string, unknown>,
): void {
  dbRun(
    `INSERT INTO sync_queue (entity, entity_id, action, payload) VALUES (?, ?, ?, ?)`,
    [entity, entityId, action, payload ? JSON.stringify(payload) : null],
  );
}

export function getLastSyncTimestamp(): string | null {
  const row = dbGet('SELECT value FROM sync_state WHERE key = ?', ['last_sync']) as { value: string } | undefined;
  return row?.value ?? null;
}

function setLastSyncTimestamp(ts: string): void {
  dbRun(
    `INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_sync', ?)`,
    [ts],
  );
}

interface QueueEntry {
  id: number;
  entity: string;
  entity_id: string;
  action: string;
  payload: string | null;
  created_at: string;
  attempts: number;
}

/**
 * Cambios listos para enviar: sin sincronizar, no aparcados (attempts < MAX) y
 * cuyo backoff ya venció (`next_attempt_at` vacío o en el pasado).
 */
export function getPendingChanges(): QueueEntry[] {
  return dbAll(
    `SELECT * FROM sync_queue
     WHERE synced_at IS NULL
       AND attempts < ?
       AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now'))
     ORDER BY id ASC LIMIT 100`,
    [MAX_ATTEMPTS],
  ) as QueueEntry[];
}

/** Cuenta lo que aún no se sincronizó (incluye lo que espera backoff, excluye lo aparcado). */
export function getPendingCount(): number {
  const row = dbGet(
    'SELECT COUNT(*) as count FROM sync_queue WHERE synced_at IS NULL AND attempts < ?',
    [MAX_ATTEMPTS],
  ) as { count: number };
  return row.count;
}

/** Cambios definitivamente varados (agotaron reintentos o fallo permanente). */
export function getParkedCount(): number {
  const row = dbGet(
    'SELECT COUNT(*) as count FROM sync_queue WHERE synced_at IS NULL AND attempts >= ?',
    [MAX_ATTEMPTS],
  ) as { count: number };
  return row.count;
}

/**
 * Reactiva los cambios que esperaban backoff para que se reintenten ya. Se llama
 * al recuperar la conexión: no tiene sentido esperar el backoff si la nube volvió.
 * No toca los aparcados (attempts >= MAX) para no reintentar en loop lo que ya falló definitivamente.
 */
function resetBackoffForRetryable(): void {
  dbRun(
    'UPDATE sync_queue SET next_attempt_at = NULL WHERE synced_at IS NULL AND attempts < ?',
    [MAX_ATTEMPTS],
  );
}

/** Reintenta manualmente los cambios aparcados (los "desagota" para un nuevo ciclo). */
export function retryParkedChanges(): number {
  const parked = getParkedCount();
  dbRun(
    'UPDATE sync_queue SET attempts = 0, next_attempt_at = NULL, error = NULL WHERE synced_at IS NULL AND attempts >= ?',
    [MAX_ATTEMPTS],
  );
  return parked;
}

async function pushChanges(): Promise<{ pushed: number; errors: number }> {
  const pending = getPendingChanges();
  if (pending.length === 0) return { pushed: 0, errors: 0 };

  let pushed = 0;
  let errors = 0;

  const baseUrl = getApiBaseUrl();
  const token = getAccessToken();
  if (!token) return { pushed: 0, errors: pending.length };

  const cloudNative = pending.filter((entry) => isCloudNativeEntity(entry.entity));
  if (cloudNative.length > 0) {
    const result = await pushCloudNativeChanges(cloudNative, baseUrl, token);
    pushed += result.pushed;
    errors += result.errors;
  }

  for (const entry of pending.filter((item) => !isCloudNativeEntity(item.entity))) {
    try {
      const entityPath = entityToApiPath(entry.entity);
      let method: string;
      let url: string;

      switch (entry.action) {
        case 'create':
          method = 'POST';
          url = `${baseUrl}/${entityPath}`;
          break;
        case 'update':
          method = 'PATCH';
          url = `${baseUrl}/${entityPath}/${entry.entity_id}`;
          break;
        case 'delete':
          method = 'DELETE';
          url = `${baseUrl}/${entityPath}/${entry.entity_id}`;
          break;
        default:
          continue;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };

      const body = entry.action !== 'delete' && entry.payload
        ? entry.payload
        : undefined;

      const response = await net.fetch(url, { method, headers, body });

      if (response.ok) {
        dbRun(
          "UPDATE sync_queue SET synced_at = datetime('now'), error = NULL WHERE id = ?",
          [entry.id],
        );
        pushed++;
      } else if (response.status === 409) {
        dbRun(
          "UPDATE sync_queue SET synced_at = datetime('now'), error = 'conflict_server_wins' WHERE id = ?",
          [entry.id],
        );
        pushed++;
      } else {
        const errBody = await response.text().catch(() => 'Unknown error');
        const message = `HTTP ${response.status}: ${errBody}`;
        if (isTransientStatus(response.status)) {
          markTransientFailure(entry.id, entry.attempts, message);
        } else {
          markPermanentFailure(entry.id, message);
        }
        errors++;
      }
    } catch (err) {
      // Excepción de red (fetch falló): siempre transitorio → reintentar con backoff.
      markTransientFailure(entry.id, entry.attempts, String(err));
      errors++;
    }
  }

  return { pushed, errors };
}

function isCloudNativeEntity(entity: string): boolean {
  return (
    entity === 'integration_config' ||
    entity === 'external_catalog_product' ||
    entity === 'document_snapshot' ||
    entity === 'exchange_rate' ||
    entity === 'document_link' ||
    entity === 'kit_set'
  );
}

async function pushCloudNativeChanges(
  entries: QueueEntry[],
  baseUrl: string,
  token: string,
): Promise<{ pushed: number; errors: number }> {
  const changes = entries.map((entry) => ({
    entity: entry.entity,
    action: entry.action,
    id: entry.entity_id,
    data: entry.payload ? JSON.parse(entry.payload) as Record<string, unknown> : {},
  }));

  try {
    const response = await net.fetch(`${baseUrl}/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ changes }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => 'Unknown error');
      const message = `HTTP ${response.status}: ${errBody}`;
      for (const entry of entries) {
        if (isTransientStatus(response.status)) {
          markTransientFailure(entry.id, entry.attempts, message);
        } else {
          markPermanentFailure(entry.id, message);
        }
      }
      return { pushed: 0, errors: entries.length };
    }

    const result = await response.json() as {
      success: boolean;
      data?: { conflicts?: string[] };
    };
    const conflicts = new Set(result.data?.conflicts ?? []);
    let pushed = 0;
    let errors = 0;

    for (const entry of entries) {
      if (conflicts.has(entry.entity_id)) {
        // El server no pudo aplicar el cambio: puede ser un hipo transitorio de DB
        // o un dato inválido. Reintentamos con backoff; si persiste, se aparca.
        markTransientFailure(entry.id, entry.attempts, 'sync_conflict');
        errors++;
      } else {
        dbRun("UPDATE sync_queue SET synced_at = datetime('now'), error = NULL WHERE id = ?", [entry.id]);
        pushed++;
      }
    }

    return { pushed, errors };
  } catch (err) {
    // Excepción de red en el batch: transitorio para todos.
    for (const entry of entries) {
      markTransientFailure(entry.id, entry.attempts, String(err));
    }
    return { pushed: 0, errors: entries.length };
  }
}

function entityToApiPath(entity: string): string {
  const map: Record<string, string> = {
    client: 'clients',
    supplier: 'suppliers',
    product: 'products',
    article: 'products',
    document: 'documents',
    stock_movement: 'stock/movements',
  };
  return map[entity] ?? entity;
}

async function pullChanges(): Promise<number> {
  const lastSync = getLastSyncTimestamp();
  const baseUrl = getApiBaseUrl();
  const token = getAccessToken();
  if (!token) return 0;

  const since = lastSync ?? '2020-01-01T00:00:00.000Z';
  const url = `${baseUrl}/sync/pull?since=${encodeURIComponent(since)}`;

  try {
    const response = await net.fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return 0;

    const result = await response.json() as {
      success: boolean;
      data: {
        changes: Array<{
          entity: string;
          action: string;
          id: string;
          data: Record<string, unknown>;
          updatedAt: string;
        }>;
        serverTimestamp: string;
      };
    };

    if (!result.success) return 0;

    const { changes, serverTimestamp } = result.data;

    for (const change of changes) {
      // Un cambio que falle (p.ej. FK de un maestro aún no aplicado) no debe
      // abortar el resto del pull; se reintentará en el próximo ciclo.
      try {
        applyRemoteChange(change);
      } catch {
        // best-effort por cambio
      }
    }

    setLastSyncTimestamp(serverTimestamp);
    return changes.length;
  } catch {
    return 0;
  }
}

/**
 * Traduce el shape del server (camelCase, Prisma) al del SQLite local (snake_case).
 * Solo se copian las columnas conocidas; el resto se ignora para no romper el schema.
 */
type RemoteRow = Record<string, unknown>;
function mapClient(d: RemoteRow): RemoteRow {
  return {
    id: d.id,
    code: d.code ?? null,
    name: d.name ?? d.razonSocial ?? '',
    tax_id: d.taxId ?? d.cuit ?? null,
    email: d.email ?? null,
    phone: d.phone ?? null,
    address: d.address ?? null,
    city: d.city ?? null,
    province: d.province ?? null,
    postal_code: d.postalCode ?? null,
    country: d.country ?? null,
    iva_condition: d.ivaCondition ?? d.condicionIva ?? null,
    price_list: d.priceList ?? null,
    notes: d.notes ?? null,
    active: d.active === false || d.deletedAt ? 0 : 1,
    created_at: d.createdAt ?? null,
    updated_at: d.updatedAt ?? null,
  };
}
function mapSupplier(d: RemoteRow): RemoteRow {
  return {
    id: d.id,
    code: d.code ?? null,
    name: d.name ?? '',
    tax_id: d.taxId ?? d.cuit ?? null,
    email: d.email ?? null,
    phone: d.phone ?? null,
    address: d.address ?? null,
    city: d.city ?? null,
    province: d.province ?? null,
    country: d.country ?? null,
    iva_condition: d.ivaCondition ?? null,
    notes: d.notes ?? null,
    active: d.active === false || d.deletedAt ? 0 : 1,
    created_at: d.createdAt ?? null,
    updated_at: d.updatedAt ?? null,
  };
}
function mapArticle(d: RemoteRow): RemoteRow {
  return {
    id: d.id,
    code: d.code ?? d.sku ?? null,
    barcode: d.barcode ?? null,
    name: d.name ?? d.description ?? '',
    description: d.description ?? null,
    category: d.category ?? null,
    brand: d.brand ?? null,
    unit: d.unit ?? null,
    cost: d.cost ?? 0,
    price: d.price ?? 0,
    iva_rate: d.ivaRate ?? d.ivaPct ?? 21,
    stock: d.stock ?? 0,
    stock_min: d.stockMin ?? 0,
    active: d.active === false || d.deletedAt ? 0 : 1,
    created_at: d.createdAt ?? null,
    updated_at: d.updatedAt ?? null,
  };
}

function mapAirProduct(d: RemoteRow): RemoteRow {
  return {
    id: d.id ?? `air-${d.externalCode ?? d.external_code ?? d.air_code}`,
    air_code: d.externalCode ?? d.external_code ?? d.air_code ?? '',
    description: d.description ?? d.name ?? '',
    part_number: d.partNumber ?? d.part_number ?? null,
    brand: d.brand ?? null,
    category: d.category ?? null,
    unit: d.unit ?? 'un',
    price_usd: d.priceUsd ?? d.price_usd ?? 0,
    price_ars: d.priceArs ?? d.price_ars ?? 0,
    iva_pct: d.ivaPct ?? d.iva_pct ?? 21,
    stock: d.stock ?? 0,
    active: d.active === false || d.deletedAt ? 0 : 1,
    raw_json: typeof d.rawJson === 'string'
      ? d.rawJson
      : JSON.stringify(d.rawJson ?? d.raw_json ?? {}),
    synced_at: d.syncedAt ?? d.synced_at ?? d.updatedAt ?? new Date().toISOString(),
  };
}

function applyAirConfig(data: RemoteRow): void {
  const provider = String(data.provider ?? '');
  if (provider !== 'air') return;
  const rawConfig = data.config;
  if (!rawConfig || typeof rawConfig !== 'object') return;
  const cfg = rawConfig as Record<string, unknown>;
  const entries: Array<[string, string]> = [
    ['air_enabled', cfg.enabled === true ? 'true' : 'false'],
    ['air_username', String(cfg.username ?? '')],
    ['air_base_url', String(cfg.baseUrl ?? cfg.base_url ?? '')],
    ['air_sync_interval', String(cfg.syncIntervalMinutes ?? cfg.sync_interval ?? '15')],
  ];
  const password = String(cfg.password ?? '');
  if (password) entries.push(['air_password', encryptSecret(password)]);

  for (const [key, value] of entries) {
    dbRun('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)', [key, value]);
  }
}

/** Descubre columnas reales del SQLite local para filtrar el payload mapeado. */
function tableColumns(table: string): Set<string> {
  const rows = dbAll(`PRAGMA table_info(${table})`, []) as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

function upsertRow(table: string, id: string, data: RemoteRow): void {
  const db = getDb();
  const allowed = tableColumns(table);
  const cols = Object.keys(data).filter((k) => allowed.has(k) && data[k] !== undefined);
  if (cols.length === 0) return;
  const values = cols.map((c) => data[c] as string | number | null);
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updates}`,
  ).run(...values);
  void id;
}

function softDeleteRow(table: string, id: string): void {
  const db = getDb();
  const allowed = tableColumns(table);
  if (allowed.has('active')) {
    db.prepare(`UPDATE ${table} SET active = 0 WHERE id = ?`).run(id);
  } else {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  }
}

function upsertAirProduct(data: RemoteRow): void {
  const row = mapAirProduct(data);
  if (!row.air_code) return;
  getDb().prepare(
    `INSERT INTO air_products (
       id, air_code, description, part_number, brand, category, unit,
       price_usd, price_ars, iva_pct, stock, active, raw_json, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(air_code) DO UPDATE SET
       description = excluded.description,
       part_number = excluded.part_number,
       brand = excluded.brand,
       category = excluded.category,
       unit = excluded.unit,
       price_usd = excluded.price_usd,
       price_ars = excluded.price_ars,
       iva_pct = excluded.iva_pct,
       stock = excluded.stock,
       active = excluded.active,
       raw_json = excluded.raw_json,
       synced_at = excluded.synced_at`,
  ).run(
    row.id,
    row.air_code,
    row.description,
    row.part_number,
    row.brand,
    row.category,
    row.unit,
    row.price_usd,
    row.price_ars,
    row.iva_pct,
    row.stock,
    row.active,
    row.raw_json,
    row.synced_at,
  );
}

function mapExchangeRate(d: RemoteRow): RemoteRow {
  return {
    casa: d.casa ?? '',
    nombre: d.nombre ?? d.name ?? '',
    compra: d.compra ?? 0,
    venta: d.venta ?? 0,
    source_date: d.sourceDate ?? d.source_date ?? null,
    fetched_at: d.fetchedAt ?? d.fetched_at ?? null,
  };
}

function mapDocumentLink(d: RemoteRow): RemoteRow {
  return {
    source_type: d.sourceType ?? d.source_type ?? '',
    source_id: d.sourceId ?? d.source_id ?? '',
    target_type: d.targetType ?? d.target_type ?? '',
    target_id: d.targetId ?? d.target_id ?? '',
    created_at: d.createdAt ?? d.created_at ?? null,
  };
}

interface KitSetComponent {
  id?: string;
  componentArticleId?: string;
  component_article_id?: string;
  qty?: number;
}

function applyKitSet(kitArticleId: string, data: RemoteRow): void {
  if (!kitArticleId) return;
  const rawComponents = Array.isArray(data.components) ? data.components : [];
  const components = (rawComponents as KitSetComponent[])
    .map((c) => ({
      id: String(c?.id ?? ''),
      componentArticleId: String(c?.componentArticleId ?? c?.component_article_id ?? ''),
      qty: Number(c?.qty ?? 0),
    }))
    .filter((c) => c.id && c.componentArticleId && c.qty > 0);

  const db = getDb();
  const tx = db.transaction(() => {
    dbRun('DELETE FROM kit_components WHERE kit_article_id = ?', [kitArticleId]);
    for (const c of components) {
      dbRun(
        'INSERT OR REPLACE INTO kit_components (id, kit_article_id, component_article_id, qty) VALUES (?,?,?,?)',
        [c.id, kitArticleId, c.componentArticleId, c.qty],
      );
    }
    // Mismo efecto que setKitComponents(): sincronizar el flag is_kit.
    dbRun('UPDATE articles SET is_kit = ?, manages_stock = ? WHERE id = ?', [
      components.length > 0 ? 1 : 0,
      components.length > 0 ? 0 : 1,
      kitArticleId,
    ]);
  });
  tx();
}

function softDeleteAirProduct(data: RemoteRow): void {
  const code = String(data.externalCode ?? data.external_code ?? data.air_code ?? '');
  if (!code) return;
  dbRun('UPDATE air_products SET active = 0 WHERE air_code = ?', [code]);
}

/**
 * Aplica un cambio remoto en la base local. El server manda entidades lógicas:
 *   client → clients, supplier → suppliers, product → articles.
 *
 * Los documentos del desktop viajan como `document_snapshot` (envelope lossless:
 * cabecera + ítems + movimientos de stock/caja) y se aplican con `applyDocEnvelope`
 * sin re-ejecutar efectos. El caso `document` (normalizado, web/mobile) queda
 * reservado para cuando el panel opere documentos.
 */
function applyRemoteChange(change: {
  entity: string;
  action: string;
  id: string;
  data: Record<string, unknown>;
}): void {
  switch (change.entity) {
    case 'client': {
      const row = mapClient(change.data);
      row.id = change.id;
      if (change.action === 'delete') softDeleteRow('clients', change.id);
      else upsertRow('clients', change.id, row);
      break;
    }
    case 'supplier': {
      const row = mapSupplier(change.data);
      row.id = change.id;
      if (change.action === 'delete') softDeleteRow('suppliers', change.id);
      else upsertRow('suppliers', change.id, row);
      break;
    }
    case 'product': {
      const row = mapArticle(change.data);
      row.id = change.id;
      if (change.action === 'delete') softDeleteRow('articles', change.id);
      else upsertRow('articles', change.id, row);
      break;
    }
    case 'integration_config':
      if (change.action !== 'delete') applyAirConfig(change.data);
      break;
    case 'external_catalog_product': {
      const provider = String(change.data.provider ?? '');
      if (provider !== 'air') break;
      if (change.action === 'delete') softDeleteAirProduct(change.data);
      else upsertAirProduct(change.data);
      break;
    }
    case 'document_snapshot': {
      // Documentos multi-PC como envelope lossless (cabecera + ítems + movimientos).
      if (change.action === 'delete') {
        const env = change.data as unknown as DocEnvelope;
        const type = String(env?.type ?? env?.header?.type ?? '');
        if (type) deleteDocLocal(type, change.id);
      } else {
        applyDocEnvelope(change.data as unknown as DocEnvelope);
      }
      break;
    }
    case 'exchange_rate': {
      // Cotización de dólar: insert-only, se dedupe por id.
      const row = mapExchangeRate(change.data);
      row.id = change.id;
      upsertRow('exchange_rates', change.id, row);
      break;
    }
    case 'document_link': {
      // Vínculo entre documentos: inmutable, dedupe por (source, target).
      if (change.action === 'delete') {
        dbRun('DELETE FROM document_links WHERE id = ?', [change.id]);
      } else {
        const row = mapDocumentLink(change.data);
        row.id = change.id;
        upsertRow('document_links', change.id, row);
      }
      break;
    }
    case 'kit_set': {
      // Reemplazo atómico del set de componentes del kit (misma semántica que
      // setKitComponents en el desktop origen).
      applyKitSet(change.id, change.data);
      break;
    }
    case 'document':
      // Documentos normalizados (creados desde web/mobile). Se mapearán cuando el
      // panel opere documentos; hoy el canal multi-PC del desktop usa document_snapshot.
      break;
    default:
      break;
  }
}

export async function runSync(): Promise<{
  pushed: number;
  pulled: number;
  errors: number;
}> {
  if (isSyncing) return { pushed: 0, pulled: 0, errors: 0 };
  if (!isCloudConnected()) return { pushed: 0, pulled: 0, errors: 0 };

  const isOnline = await apiTestConnection();
  if (!isOnline) {
    wasOffline = true;
    return { pushed: 0, pulled: 0, errors: 0 };
  }

  // Acabamos de recuperar la conexión: reintentar ya lo que estaba esperando backoff.
  if (wasOffline) {
    resetBackoffForRetryable();
    wasOffline = false;
  }

  isSyncing = true;
  try {
    // Reservar bloques de numeración pendientes antes de push (para que los
    // documentos que se creen a continuación ya tengan números autoritativos).
    await ensureSequenceBlocks();

    const pushResult = await pushChanges();
    const pulled = await pullChanges();

    return {
      pushed: pushResult.pushed,
      pulled,
      errors: pushResult.errors,
    };
  } finally {
    isSyncing = false;
  }
}

export function startSyncTimer(): void {
  if (syncTimer) return;
  syncTimer = setInterval(() => {
    runSync().catch(() => {});
  }, SYNC_INTERVAL_MS);
}

export function stopSyncTimer(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

export function getSyncStatus(): {
  connected: boolean;
  pendingChanges: number;
  parkedChanges: number;
  lastSync: string | null;
  syncing: boolean;
} {
  return {
    connected: isCloudConnected(),
    pendingChanges: getPendingCount(),
    parkedChanges: getParkedCount(),
    lastSync: getLastSyncTimestamp(),
    syncing: isSyncing,
  };
}
