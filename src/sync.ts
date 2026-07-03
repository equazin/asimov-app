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

const SYNC_INTERVAL_MS = 30_000;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;

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
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
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
}

export function getPendingChanges(): QueueEntry[] {
  return dbAll(
    'SELECT * FROM sync_queue WHERE synced_at IS NULL AND error IS NULL ORDER BY id ASC LIMIT 100',
    [],
  ) as QueueEntry[];
}

export function getPendingCount(): number {
  const row = dbGet(
    'SELECT COUNT(*) as count FROM sync_queue WHERE synced_at IS NULL AND error IS NULL',
    [],
  ) as { count: number };
  return row.count;
}

async function pushChanges(): Promise<{ pushed: number; errors: number }> {
  const pending = getPendingChanges();
  if (pending.length === 0) return { pushed: 0, errors: 0 };

  let pushed = 0;
  let errors = 0;

  const baseUrl = getApiBaseUrl();
  const token = getAccessToken();
  if (!token) return { pushed: 0, errors: pending.length };

  for (const entry of pending) {
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
          "UPDATE sync_queue SET synced_at = datetime('now') WHERE id = ?",
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
        dbRun(
          'UPDATE sync_queue SET error = ? WHERE id = ?',
          [errBody.slice(0, 500), entry.id],
        );
        errors++;
      }
    } catch (err) {
      dbRun(
        'UPDATE sync_queue SET error = ? WHERE id = ?',
        [String(err).slice(0, 500), entry.id],
      );
      errors++;
    }
  }

  return { pushed, errors };
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
      applyRemoteChange(change);
    }

    setLastSyncTimestamp(serverTimestamp);
    return changes.length;
  } catch {
    return 0;
  }
}

function applyRemoteChange(change: {
  entity: string;
  action: string;
  id: string;
  data: Record<string, unknown>;
}): void {
  const db = getDb();
  const tableMap: Record<string, string> = {
    client: 'clients',
    supplier: 'suppliers',
    product: 'articles',
    document: 'sale_orders',
  };

  const table = tableMap[change.entity];
  if (!table) return;

  switch (change.action) {
    case 'create':
    case 'update': {
      const columns = Object.keys(change.data);
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map((c) => change.data[c]);

      db.prepare(
        `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
      ).run(...values);
      break;
    }
    case 'delete': {
      db.prepare(`UPDATE ${table} SET active = 0 WHERE id = ?`).run(change.id);
      break;
    }
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
  if (!isOnline) return { pushed: 0, pulled: 0, errors: 0 };

  isSyncing = true;
  try {
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
  lastSync: string | null;
  syncing: boolean;
} {
  return {
    connected: isCloudConnected(),
    pendingChanges: getPendingCount(),
    lastSync: getLastSyncTimestamp(),
    syncing: isSyncing,
  };
}
