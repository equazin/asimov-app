/**
 * Tests del endurecimiento de la cola de sync (retry con backoff + reconexión).
 *
 * Se mockea `electron.net.fetch` y `api-client` para manejar runSync() sin red
 * real: así se verifica que un fallo transitorio NO pierde el cambio (lo agenda
 * para reintento) y que un fallo permanente lo aparca.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("electron", () => {
  const os = require("node:os");
  const fs = require("node:fs");
  const path = require("node:path");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asimov-sync-vitest-"));
  return {
    app: { getPath: () => tmpDir },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from("FAKE:" + s, "utf8"),
      decryptString: (b: Buffer) => Buffer.from(b).toString("utf8").replace(/^FAKE:/, ""),
    },
    net: { fetch: (...args: unknown[]) => fetchMock(...args) },
  };
});

vi.mock("../src/api-client", () => ({
  isCloudConnected: vi.fn(() => true),
  apiTestConnection: vi.fn(() => Promise.resolve(true)),
  getAccessToken: vi.fn(() => "test-token"),
  getApiBaseUrl: vi.fn(() => "https://api.test/api/v1"),
}));

import { initDb, getDb } from "../src/db";
import {
  initSyncTables,
  enqueueChange,
  getPendingChanges,
  getPendingCount,
  getParkedCount,
  retryParkedChanges,
  runSync,
} from "../src/sync";
import * as apiClient from "../src/api-client";

/** Respuesta que devolverá el mock para el POST/PATCH de push (el pull siempre va vacío). */
let pushResponse: { ok: boolean; status: number; body?: string };

beforeEach(() => {
  initDb();
  initSyncTables();
  getDb().exec("DELETE FROM sync_queue; DELETE FROM sync_state;");
  vi.mocked(apiClient.apiTestConnection).mockResolvedValue(true);

  pushResponse = { ok: true, status: 200 };
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes("/sync/pull")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: { changes: [], serverTimestamp: new Date().toISOString() },
        }),
      });
    }
    return Promise.resolve({
      ok: pushResponse.ok,
      status: pushResponse.status,
      text: async () => pushResponse.body ?? "",
    });
  });
});

const queueRow = () => getDb().prepare("SELECT * FROM sync_queue ORDER BY id DESC LIMIT 1").get() as {
  attempts: number;
  next_attempt_at: string | null;
  synced_at: string | null;
  error: string | null;
};

describe("sync queue — retry con backoff", () => {
  it("un fallo transitorio (503) NO pierde el cambio: lo agenda con backoff", async () => {
    enqueueChange("client", "c1", "create", { name: "ACME" });
    pushResponse = { ok: false, status: 503, body: "service unavailable" };

    const res = await runSync();

    expect(res.errors).toBe(1);
    expect(res.pushed).toBe(0);
    const row = queueRow();
    expect(row.synced_at).toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.next_attempt_at).not.toBeNull();
    // Sigue contando como pendiente (no se perdió) pero espera el backoff.
    expect(getPendingCount()).toBe(1);
    expect(getPendingChanges()).toHaveLength(0);
  });

  it("un fallo permanente (422) aparca el cambio sin reintentar", async () => {
    enqueueChange("client", "c1", "create", { name: "ACME" });
    pushResponse = { ok: false, status: 422, body: "validation error" };

    await runSync();

    expect(getParkedCount()).toBe(1);
    expect(getPendingCount()).toBe(0);
    expect(getPendingChanges()).toHaveLength(0);
  });

  it("retryParkedChanges reactiva lo aparcado", async () => {
    enqueueChange("client", "c1", "create", { name: "ACME" });
    pushResponse = { ok: false, status: 422, body: "bad" };
    await runSync();
    expect(getParkedCount()).toBe(1);

    const reactivated = retryParkedChanges();

    expect(reactivated).toBe(1);
    expect(getPendingCount()).toBe(1);
    expect(getPendingChanges()).toHaveLength(1);
  });

  it("un push exitoso marca el cambio como sincronizado y limpia el error", async () => {
    enqueueChange("client", "c1", "create", { name: "ACME" });
    pushResponse = { ok: true, status: 200 };

    const res = await runSync();

    expect(res.pushed).toBe(1);
    const row = queueRow();
    expect(row.synced_at).not.toBeNull();
    expect(row.error).toBeNull();
    expect(getPendingCount()).toBe(0);
  });

  it("al reconectar reactiva el backoff pendiente y reintenta enseguida", async () => {
    enqueueChange("client", "c1", "create", { name: "ACME" });

    // 1) Falla transitorio → queda con next_attempt_at en el futuro.
    pushResponse = { ok: false, status: 503, body: "down" };
    await runSync();
    expect(getPendingChanges()).toHaveLength(0);

    // 2) Se cae la nube (apiTestConnection false) → marca wasOffline.
    vi.mocked(apiClient.apiTestConnection).mockResolvedValueOnce(false);
    await runSync();

    // 3) Vuelve la nube y el push anda: el backoff se resetea y se envía ya.
    pushResponse = { ok: true, status: 200 };
    const res = await runSync();

    expect(res.pushed).toBe(1);
    expect(getPendingCount()).toBe(0);
  });
});
