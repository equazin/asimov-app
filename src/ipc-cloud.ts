/**
 * IPC handlers for cloud/API connectivity and sync.
 * Separados del ipc.ts original para mantener backwards compatibility.
 */
import { ipcMain } from 'electron';
import {
  apiLogin,
  apiLogout,
  apiTestConnection,
  isCloudConnected,
  getStoredUser,
  getApiBaseUrl,
  setApiBaseUrl,
} from './api-client';
import {
  initSyncTables,
  runSync,
  getSyncStatus,
  getSyncQueueDetails,
  startSyncTimer,
  stopSyncTimer,
  retryParkedChanges,
  recoverRetryableParkedChanges,
  recoverLegacySyncConflicts,
  compactPendingChanges,
  onSyncApplied,
  type SyncCycleEvent,
} from './sync';
import { enqueueLocalBootstrap, inspectBootstrapState, inspectDeviceIntegrationStatus } from './sync-bootstrap';

export function registerCloudIpcHandlers(
  notifyRenderer?: (channel: string, payload?: SyncCycleEvent) => void,
): void {
  initSyncTables();
  onSyncApplied((event) => notifyRenderer?.('sync:applied', event));

  // --- Cloud auth ---
  ipcMain.handle('cloud:status', () => ({
    connected: isCloudConnected(),
    user: getStoredUser(),
    apiUrl: getApiBaseUrl(),
  }));

  ipcMain.handle('cloud:login', async (_event, payload: unknown) => {
    const data = (payload ?? {}) as { email?: string; password?: string };
    if (!data.email || !data.password) {
      return { ok: false, error: 'Email y contraseña requeridos' };
    }
    try {
      const result = await apiLogin(data.email, data.password);
      recoverRetryableParkedChanges();
      recoverLegacySyncConflicts();
      compactPendingChanges();
      startSyncTimer();
      let sync: { pushed: number; pulled: number; errors: number } | undefined;
      try { sync = await runSync(); } catch { /* el login no depende del primer ciclo de sync */ }
      return { ok: true, user: result.user, tenantId: result.tenantId, sync };
    } catch (e) {
      return { ok: false, error: String(e instanceof Error ? e.message : e) };
    }
  });

  ipcMain.handle('cloud:logout', async () => {
    stopSyncTimer();
    await apiLogout();
    return { ok: true };
  });

  ipcMain.handle('cloud:test', async () => {
    try {
      const reachable = await apiTestConnection();
      return { ok: true, reachable };
    } catch {
      return { ok: false, reachable: false };
    }
  });

  ipcMain.handle('cloud:set-url', (_event, url: unknown) => {
    if (typeof url !== 'string' || !url.startsWith('http')) {
      return { ok: false, error: 'URL inválida' };
    }
    setApiBaseUrl(url);
    return { ok: true, url };
  });

  // --- Sync ---
  ipcMain.handle('sync:status', () => getSyncStatus());

  ipcMain.handle('sync:queue-details', () => getSyncQueueDetails());

  ipcMain.handle('sync:run', async () => {
    try {
      const result = await runSync();
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e instanceof Error ? e.message : e) };
    }
  });

  ipcMain.handle('sync:start-auto', () => {
    startSyncTimer();
    return { ok: true };
  });

  ipcMain.handle('sync:stop-auto', () => {
    stopSyncTimer();
    return { ok: true };
  });

  // Reactiva los cambios aparcados (que agotaron reintentos) para un nuevo ciclo.
  ipcMain.handle('sync:retry-parked', async () => {
    const reactivated = retryParkedChanges();
    const result = await runSync();
    return { ok: true, reactivated, ...result };
  });

  ipcMain.handle('sync:bootstrap-status', () => inspectBootstrapState());
  ipcMain.handle('sync:device-integrations', () => inspectDeviceIntegrationStatus());

  ipcMain.handle('sync:bootstrap-upload', async () => {
    if (!isCloudConnected()) return { ok: false, error: 'Iniciá sesión en la nube antes de subir datos.' };
    try {
      const bootstrap = enqueueLocalBootstrap();
      const sync = await runSync();
      return { ok: true, ...bootstrap, sync };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // Auto-start sync if user was previously logged in
  if (isCloudConnected()) {
    recoverRetryableParkedChanges();
    recoverLegacySyncConflicts();
    compactPendingChanges();
    startSyncTimer();
    void runSync().catch(() => {});
  }
}
