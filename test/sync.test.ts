/**
 * Tests del endurecimiento de la cola de sync (retry con backoff + reconexión).
 *
 * Se mockea `electron.net.fetch` y `api-client` para manejar runSync() sin red
 * real: así se verifica que un fallo transitorio NO pierde el cambio (lo agenda
 * para reintento) y que un fallo permanente lo aparca.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const fetchMock = vi.fn();
const authorizedFetchMock = vi.fn();

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
  CloudSessionExpiredError: class CloudSessionExpiredError extends Error {},
  isCloudConnected: vi.fn(() => true),
  apiTestConnection: vi.fn(() => Promise.resolve(true)),
  apiAuthorizedFetch: (...args: unknown[]) => authorizedFetchMock(...args),
}));

import { initDb, getDb } from "../src/db";
import {
  initSyncTables,
  enqueueChange,
  getPendingChanges,
  getPendingCount,
  getParkedCount,
  retryParkedChanges,
  recoverRetryableParkedChanges,
  recoverLegacySyncConflicts,
  compactPendingChanges,
  getLastSyncTimestamp,
  onSyncApplied,
  runSync,
  stopSyncTimer,
} from "../src/sync";
import * as apiClient from "../src/api-client";
import { enqueueLocalBootstrap, inspectBootstrapState } from "../src/sync-bootstrap";
import { enqueueIfCloud } from "../src/ipc/shared";
import { notifyAfipConfigSync } from "../src/afip-service";

/** Respuesta que devolverá el mock para el POST/PATCH de push (el pull siempre va vacío). */
let pushResponse: { ok: boolean; status: number; body?: string };

beforeEach(() => {
  initDb();
  initSyncTables();
  getDb().exec("DELETE FROM sync_queue; DELETE FROM sync_state;");
  vi.mocked(apiClient.apiTestConnection).mockResolvedValue(true);

  pushResponse = { ok: true, status: 200 };
  authorizedFetchMock.mockReset();
  authorizedFetchMock.mockImplementation((url: string) => {
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
      json: async () => ({ success: true, data: { conflicts: [] } }),
    });
  });
});

afterEach(() => stopSyncTimer());

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

  it("reactiva automáticamente los bloqueados recuperables por 401 y 413", () => {
    getDb().prepare(
      "INSERT INTO sync_queue (entity, entity_id, action, attempts, error) VALUES (?,?,?,?,?)",
    ).run("external_catalog_product", "air:A1", "update", 8, "HTTP 401: Token inválido o expirado");
    getDb().prepare(
      "INSERT INTO sync_queue (entity, entity_id, action, attempts, error) VALUES (?,?,?,?,?)",
    ).run("external_catalog_product", "air:A2", "update", 8, "HTTP 422: dato inválido");
    getDb().prepare(
      "INSERT INTO sync_queue (entity, entity_id, action, attempts, error) VALUES (?,?,?,?,?)",
    ).run("external_catalog_product", "air:A3", "update", 8, "HTTP 413: request entity too large");

    expect(recoverRetryableParkedChanges()).toBe(2);
    expect(getPendingCount()).toBe(2);
    expect(getParkedCount()).toBe(1);
  });

  it("reactiva conflictos opacos creados por versiones anteriores", () => {
    getDb().prepare(
      "INSERT INTO sync_queue (entity, entity_id, action, attempts, error, next_attempt_at) VALUES (?,?,?,?,?,datetime('now','+2 hours'))",
    ).run("product", "p-old", "update", 8, "parked_after_retries: sync_conflict");

    expect(recoverLegacySyncConflicts()).toBe(1);
    expect(getPendingChanges()).toHaveLength(1);
    expect(queueRow()).toMatchObject({ attempts: 0, error: null, next_attempt_at: null });
  });

  it("conserva el detalle que devuelve la API para un conflicto real", async () => {
    enqueueChange("product", "p-bad", "update", { code: "DUP", name: "Duplicado" });
    authorizedFetchMock.mockImplementation((url: string) => Promise.resolve({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => String(url).includes("/sync/pull")
        ? { success: true, data: { changes: [], serverTimestamp: new Date().toISOString() } }
        : { success: true, data: {
            conflicts: ["p-bad"],
            conflictDetails: [{ id: "p-bad", entity: "product", error: "Código duplicado" }],
          } },
    }));

    await runSync();

    expect(queueRow().error).toContain("product:p-bad: Código duplicado");
  });

  it("compacta estados AIR repetidos y conserva el payload más nuevo", () => {
    enqueueChange("external_catalog_product", "air:A1", "update", { stock: 1 });
    enqueueChange("external_catalog_product", "air:A1", "update", { stock: 9 });

    expect(compactPendingChanges()).toBe(1);
    const pending = getPendingChanges();
    expect(pending).toHaveLength(1);
    expect(JSON.parse(pending[0].payload ?? "{}").stock).toBe(9);
  });

  it("limita cada ciclo a 250 cambios", async () => {
    for (let i = 0; i < 300; i++) {
      enqueueChange("exchange_rate", `rate-${i}`, "create", { casa: "test", compra: i, venta: i });
    }

    const result = await runSync();

    expect(result.pushed).toBe(250);
    expect(getPendingCount()).toBe(50);
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

  it("no avanza el cursor si una fila remota no se puede aplicar", async () => {
    const change = {
      entity: "document_snapshot",
      action: "update",
      id: "o1",
      updatedAt: "2026-07-14T10:00:00.000Z",
      data: {
        type: "sale_order",
        header: { id: "o1", number: "PV-1", client_id: "missing", date: "2026-07-14" },
        items: [], stockMovements: [], cashMovements: [],
      },
    };
    authorizedFetchMock.mockImplementation((url: string) => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          changes: String(url).includes("/sync/pull") ? [change] : [],
          serverTimestamp: "2026-07-14T10:01:00.000Z",
        },
      }),
      text: async () => "",
    }));

    const first = await runSync();
    expect(first.errors).toBe(1);
    expect(getLastSyncTimestamp()).toBeNull();

    getDb().prepare("INSERT INTO clients (id, business_name) VALUES (?,?)").run("missing", "Cliente");
    const second = await runSync();
    expect(second.errors).toBe(0);
    expect(getLastSyncTimestamp()).toBe("2026-07-14T10:01:00.000Z");
  });

  it("prepara una carga inicial sin serializar contraseñas ni tokens", () => {
    getDb().exec("DELETE FROM sale_order_items; DELETE FROM sale_orders; DELETE FROM clients; DELETE FROM air_products; DELETE FROM system_config;");
    getDb().prepare("INSERT INTO clients (id, code, business_name) VALUES (?,?,?)").run("c-local", "C1", "Cliente local");
    getDb().prepare("INSERT INTO sale_orders (id, number, client_id) VALUES (?,?,?)").run("o-local", "PV-LOCAL", "c-local");
    getDb().prepare(
      "INSERT INTO air_products (id, air_code, description, iva_pct, stock) VALUES (?,?,?,?,?)",
    ).run("air-local", "AIR1", "Producto AIR", 10.5, 3);
    getDb().prepare("INSERT INTO system_config (key,value) VALUES (?,?)").run("air_password", "secreto-air");
    getDb().prepare("INSERT INTO system_config (key,value) VALUES (?,?)").run("wa_token", "secreto-wa");

    expect(inspectBootstrapState()).toMatchObject({ clients: 1, documents: 1, airProducts: 1 });
    const result = enqueueLocalBootstrap();
    expect(result.queued).toBe(5);

    const payloads = getDb().prepare("SELECT payload FROM sync_queue WHERE synced_at IS NULL").all() as Array<{ payload: string }>;
    const serialized = payloads.map((p) => p.payload).join("\n");
    expect(serialized).not.toContain("secreto-air");
    expect(serialized).not.toContain("secreto-wa");
  });

  it("aplica la configuración no secreta de WhatsApp y conserva el token local", async () => {
    getDb().exec("DELETE FROM sync_queue; DELETE FROM sync_state; DELETE FROM system_config;");
    getDb().prepare("INSERT INTO system_config (key,value) VALUES (?,?)").run("wa_token", "token-local-cifrado");
    authorizedFetchMock.mockImplementation(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          changes: [{
            entity: "integration_config", action: "update", id: "whatsapp", updatedAt: "2026-07-14T10:00:00.000Z",
            data: { provider: "whatsapp", config: { enabled: true, baseUrl: "https://bot.test", botPhone: "549341", pollIntervalMinutes: 2 } },
          }],
          serverTimestamp: "2026-07-14T10:01:00.000Z",
        },
      }),
      text: async () => "",
    }));

    expect((await runSync()).errors).toBe(0);
    const rows = getDb().prepare("SELECT key,value FROM system_config WHERE key LIKE 'wa_%'").all() as Array<{ key: string; value: string }>;
    expect(Object.fromEntries(rows.map((row) => [row.key, row.value]))).toMatchObject({
      wa_enabled: "true",
      wa_base_url: "https://bot.test",
      wa_bot_phone: "549341",
      wa_poll_interval: "2",
      wa_token: "token-local-cifrado",
    });
  });

  it("la config de ARCA no filtra certificado ni clave privada", () => {
    getDb().exec("DELETE FROM sync_queue");
    getDb().prepare("INSERT OR REPLACE INTO system_config (key,value) VALUES (?,?)").run("afip_enabled", "true");
    getDb().prepare("INSERT OR REPLACE INTO system_config (key,value) VALUES (?,?)").run("afip_cuit", "30111111119");
    getDb().prepare("INSERT OR REPLACE INTO system_config (key,value) VALUES (?,?)").run("afip_point_of_sale", "3");
    getDb().prepare("INSERT OR REPLACE INTO system_config (key,value) VALUES (?,?)").run("afip_env", "produccion");
    getDb().prepare("INSERT OR REPLACE INTO system_config (key,value) VALUES (?,?)").run("afip_cert", "FAKE:-----BEGIN CERTIFICATE-----\nMIICiDCCAfGgAwIBAgIQG3\n-----END CERTIFICATE-----");
    getDb().prepare("INSERT OR REPLACE INTO system_config (key,value) VALUES (?,?)").run("afip_key", "FAKE:-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0Z3VS5\n-----END RSA PRIVATE KEY-----");

    notifyAfipConfigSync();

    const payload = getDb().prepare("SELECT payload FROM sync_queue WHERE entity='integration_config' AND entity_id='afip'").get() as { payload: string } | undefined;
    expect(payload).toBeDefined();
    expect(payload?.payload).not.toContain("BEGIN RSA PRIVATE KEY");
    expect(payload?.payload).not.toContain("BEGIN CERTIFICATE");
    expect(JSON.parse(payload?.payload ?? "{}").config.hasCert).toBe(true);
    expect(JSON.parse(payload?.payload ?? "{}").config.hasKey).toBe(true);
  });

  it("aplica oportunidades, actividades y tareas CRM remotas", async () => {
    getDb().exec("DELETE FROM sync_queue; DELETE FROM sync_state; DELETE FROM opportunities; DELETE FROM crm_activities; DELETE FROM crm_tasks;");
    getDb().prepare("INSERT INTO clients (id, code, business_name) VALUES (?,?,?)").run("crm-client-1", "C-CRM", "Cliente CRM");
    authorizedFetchMock.mockImplementation(() => Promise.resolve({
      ok: true, status: 200, text: async () => "",
      json: async () => ({
        success: true,
        data: {
          changes: [
            { entity: "crm_opportunity", action: "update", id: "opp-1", updatedAt: "2026-07-14T10:00:00.000Z", data: { id: "opp-1", client_id: null, name: "Venta", stage: "prospecting", value: 5000, probability: 30, status: "open", active: 1 } },
            { entity: "crm_activity", action: "update", id: "act-1", updatedAt: "2026-07-14T10:00:01.000Z", data: { id: "act-1", client_id: "crm-client-1", opportunity_id: "opp-1", type: "call", notes: "Llamada", date: "2026-07-14T10:00:00.000Z", active: 1 } },
            { entity: "crm_task", action: "update", id: "task-1", updatedAt: "2026-07-14T10:00:02.000Z", data: { id: "task-1", client_id: null, opportunity_id: "opp-1", title: "Seguimiento", due_date: "2026-07-15T10:00:00.000Z", completed: 0, active: 1 } },
          ],
          serverTimestamp: "2026-07-14T10:01:00.000Z",
        },
      }),
    }));

    expect((await runSync()).errors).toBe(0);
    expect(getDb().prepare("SELECT title FROM opportunities WHERE id=?").get("opp-1")).toMatchObject({ title: "Venta" });
    expect(getDb().prepare("SELECT body FROM crm_activities WHERE id=?").get("act-1")).toMatchObject({ body: "Llamada" });
    expect(getDb().prepare("SELECT title FROM crm_tasks WHERE id=?").get("task-1")).toMatchObject({ title: "Seguimiento" });
  });

  it("mapea businessName y precios del servidor a las columnas SQLite", async () => {
    getDb().exec("DELETE FROM sync_queue; DELETE FROM sync_state;");
    const changes = [
      {
        entity: "client", action: "update", id: "cloud-client", updatedAt: "2026-07-14T10:00:00.000Z",
        data: { id: "cloud-client", code: "CLOUD-C", businessName: "Cliente nube", cuit: "20111111112", fiscalType: "ri" },
      },
      {
        entity: "supplier", action: "update", id: "cloud-supplier", updatedAt: "2026-07-14T10:00:01.000Z",
        data: { id: "cloud-supplier", code: "CLOUD-P", businessName: "Proveedor nube", cuit: "30222222223" },
      },
      {
        entity: "product", action: "update", id: "cloud-product", updatedAt: "2026-07-14T10:00:02.000Z",
        data: { id: "cloud-product", code: "CLOUD-A", name: "Artículo nube", costPrice: 80, salePrice: 120, ivaRate: 10.5 },
      },
    ];
    authorizedFetchMock.mockImplementation(() => Promise.resolve({
      ok: true, status: 200, text: async () => "",
      json: async () => ({ success: true, data: { changes, serverTimestamp: "2026-07-14T10:01:00.000Z" } }),
    }));

    expect((await runSync()).errors).toBe(0);
    expect(getDb().prepare("SELECT business_name, cuit, fiscal_type FROM clients WHERE id=?").get("cloud-client"))
      .toMatchObject({ business_name: "Cliente nube", cuit: "20111111112", fiscal_type: "ri" });
    expect(getDb().prepare("SELECT business_name, cuit FROM suppliers WHERE id=?").get("cloud-supplier"))
      .toMatchObject({ business_name: "Proveedor nube", cuit: "30222222223" });
    expect(getDb().prepare("SELECT name, cost_price, sale_price, iva_pct FROM articles WHERE id=?").get("cloud-product"))
      .toMatchObject({ name: "Artículo nube", cost_price: 80, sale_price: 120, iva_pct: 10.5 });
  });
  it("publica las entidades aplicadas para refrescar las ventanas abiertas", async () => {
    getDb().exec("DELETE FROM sync_queue; DELETE FROM sync_state;");
    const received: Array<{ pulled: number; changedEntities: string[] }> = [];
    const unsubscribe = onSyncApplied((event) => received.push(event));
    authorizedFetchMock.mockImplementation(() => Promise.resolve({
      ok: true, status: 200, text: async () => "",
      json: async () => ({ success: true, data: {
        changes: [{ entity: "client", action: "update", id: "live-client", updatedAt: "2026-07-17T18:00:00.000Z", data: { businessName: "En vivo" } }],
        serverTimestamp: "2026-07-17T18:00:01.000Z",
      } }),
    }));

    await runSync();
    unsubscribe();

    expect(received).toContainEqual(expect.objectContaining({ pulled: 1, changedEntities: ["client"] }));
  });
});

describe("enqueueIfCloud — encolado de bajas de maestros", () => {
  it("encola delete de cliente cuando hay sesión cloud", () => {
    getDb().prepare("INSERT INTO clients (id, code, business_name) VALUES (?,?,?)").run("c-del", "C-DEL", "Cliente");
    enqueueIfCloud("client", "c-del", "delete");
    const row = getDb().prepare("SELECT entity, action, entity_id FROM sync_queue ORDER BY id DESC LIMIT 1").get() as {
      entity: string;
      action: string;
      entity_id: string;
    };
    expect(row).toMatchObject({ entity: "client", action: "delete", entity_id: "c-del" });
  });

  it("encola delete de proveedor cuando hay sesión cloud", () => {
    getDb().prepare("INSERT INTO suppliers (id, code, business_name) VALUES (?,?,?)").run("s-del", "P-DEL", "Proveedor");
    enqueueIfCloud("supplier", "s-del", "delete");
    const row = getDb().prepare("SELECT entity, action, entity_id FROM sync_queue ORDER BY id DESC LIMIT 1").get() as {
      entity: string;
      action: string;
      entity_id: string;
    };
    expect(row).toMatchObject({ entity: "supplier", action: "delete", entity_id: "s-del" });
  });

  it("encola delete de artículo cuando hay sesión cloud", () => {
    getDb().prepare("INSERT INTO articles (id, code, name) VALUES (?,?,?)").run("a-del", "A-DEL", "Artículo");
    enqueueIfCloud("product", "a-del", "delete");
    const row = getDb().prepare("SELECT entity, action, entity_id FROM sync_queue ORDER BY id DESC LIMIT 1").get() as {
      entity: string;
      action: string;
      entity_id: string;
    };
    expect(row).toMatchObject({ entity: "product", action: "delete", entity_id: "a-del" });
  });

  it("no encola si no hay sesión cloud", () => {
    getDb().exec("DELETE FROM sync_queue");
    vi.mocked(apiClient.isCloudConnected).mockReturnValue(false);
    enqueueIfCloud("client", "c-no-cloud", "delete");
    const count = getDb().prepare("SELECT COUNT(*) as n FROM sync_queue").get() as { n: number };
    expect(count.n).toBe(0);
    vi.mocked(apiClient.isCloudConnected).mockReturnValue(true);
  });
});
