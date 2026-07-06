/**
 * Tests de numeración multi-PC: consumo de bloques Hi/Lo, fallback local con
 * high-water mark, y la reserva de bloques contra la nube (mockeada).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("electron", () => {
  const os = require("node:os");
  const fs = require("node:fs");
  const path = require("node:path");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asimov-seq-vitest-"));
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
  getAccessToken: vi.fn(() => "test-token"),
  getApiBaseUrl: vi.fn(() => "https://api.test/api/v1"),
}));

import { initDb, getDb, nextSequence, storeSequenceBlock, getSequenceRefillNames } from "../src/db";
import { ensureSequenceBlocks } from "../src/sequences";

beforeEach(() => {
  initDb();
  getDb().exec("DELETE FROM sequences; DELETE FROM sequence_blocks; DELETE FROM sequence_refill;");
  fetchMock.mockReset();
});

describe("nextSequence — bloques y fallback", () => {
  it("sin bloque usa correlativo local y marca la secuencia para refill", () => {
    expect(nextSequence("invoice-A")).toBe(1);
    expect(nextSequence("invoice-A")).toBe(2);
    expect(getSequenceRefillNames()).toContain("invoice-A");
  });

  it("con bloque reservado consume el rango del server", () => {
    storeSequenceBlock("remito", 101, 103);
    expect(nextSequence("remito")).toBe(101);
    expect(nextSequence("remito")).toBe(102);
    expect(nextSequence("remito")).toBe(103);
  });

  it("al agotar el bloque, el fallback local no regresa por debajo (high-water)", () => {
    storeSequenceBlock("remito", 101, 102);
    expect(nextSequence("remito")).toBe(101);
    expect(nextSequence("remito")).toBe(102);
    // Bloque agotado → fallback local, pero por encima del último del bloque.
    expect(nextSequence("remito")).toBe(103);
    expect(getSequenceRefillNames()).toContain("remito");
  });

  it("storeSequenceBlock limpia la marca de refill", () => {
    nextSequence("quote"); // genera refill
    expect(getSequenceRefillNames()).toContain("quote");
    storeSequenceBlock("quote", 10, 20);
    expect(getSequenceRefillNames()).not.toContain("quote");
  });
});

describe("ensureSequenceBlocks — reserva contra la nube", () => {
  it("reserva un bloque para cada secuencia marcada y siembra min = high-water local", async () => {
    // Consumir localmente hasta 5 → high-water 5, refill marcado.
    for (let i = 0; i < 5; i++) nextSequence("invoice-B");
    expect(getSequenceRefillNames()).toContain("invoice-B");

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { start: 6, end: 55 } }),
    });

    const reserved = await ensureSequenceBlocks();

    expect(reserved).toBe(1);
    // El body enviado lleva min = 5 (high-water local).
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ name: "invoice-B", min: 5 });
    // El próximo número sale del bloque reservado.
    expect(nextSequence("invoice-B")).toBe(6);
    expect(getSequenceRefillNames()).not.toContain("invoice-B");
  });

  it("no hace nada si no hay secuencias marcadas", async () => {
    const reserved = await ensureSequenceBlocks();
    expect(reserved).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ante error del server deja la marca para reintentar", async () => {
    nextSequence("receipt");
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    const reserved = await ensureSequenceBlocks();

    expect(reserved).toBe(0);
    expect(getSequenceRefillNames()).toContain("receipt");
  });
});
