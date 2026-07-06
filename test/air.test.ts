import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { airRequest, mapAirProduct, mapAirProducts, resetAirAuthCache, AirRateLimitError } from "../src/air";
import { closeDb, dbRun, initDb } from "../src/db";
import { encryptSecret } from "../src/secrets";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

/** Respuesta con body de texto crudo (para simular los notices de PHP de AIR). */
function rawResponse(text: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new Error("no-json")),
    text: () => Promise.resolve(text),
  } as Response;
}

function seedAirConfig(): void {
  initDb(":memory:");
  dbRun("INSERT INTO system_config (key, value) VALUES (?, ?)", ["air_enabled", "true"]);
  dbRun("INSERT INTO system_config (key, value) VALUES (?, ?)", ["air_username", "R19119"]);
  dbRun("INSERT INTO system_config (key, value) VALUES (?, ?)", ["air_password", encryptSecret("secret")]);
  dbRun("INSERT INTO system_config (key, value) VALUES (?, ?)", ["air_base_url", "https://api.air-intra.com/v2"]);
}

beforeEach(() => {
  resetAirAuthCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  closeDb();
});

describe("air — mapAirProduct", () => {
  it("devuelve null si no hay código o el input no es objeto", () => {
    expect(mapAirProduct({ descripcion: "x" })).toBeNull();
    expect(mapAirProduct(null)).toBeNull();
    expect(mapAirProduct("x")).toBeNull();
  });

  it("resuelve código y nombre por alias", () => {
    const p = mapAirProduct({ codigo: "A1", detalle: "Router" })!;
    expect(p.codiart).toBe("A1");
    expect(p.name).toBe("Router");
  });

  it("name cae al código cuando falta descripción", () => {
    expect(mapAirProduct({ codiart: "B2" })!.name).toBe("B2");
  });

  it("parsea precio en formato es-AR (1.234,56)", () => {
    expect(mapAirProduct({ cod: "C3", precio: "1.234,56" })!.price).toBeCloseTo(1234.56);
  });

  it("parsea precio con coma decimal simple (1,5)", () => {
    expect(mapAirProduct({ cod: "C4", pvp: "1,5" })!.price).toBeCloseTo(1.5);
  });

  it("stock plano: toma disponible/fisico/entrante", () => {
    const p = mapAirProduct({ id: "D1", disponible: "10", fisico: "12", entrante: "3" })!;
    expect(p.stockDisp).toBe(10);
    expect(p.stockFisico).toBe(12);
    expect(p.stockEntrante).toBe(3);
  });

  it("stock por depósito: suma las sucursales", () => {
    const p = mapAirProduct({ articulo: "E1", ros: { disponible: 5, fisico: 6 }, cba: { disponible: 4, fisico: 1 } })!;
    expect(p.stockDisp).toBe(9);   // 5 + 4
    expect(p.stockFisico).toBe(7); // 6 + 1
  });

  it("interpreta el estado activo/inactivo", () => {
    expect(mapAirProduct({ cod: "F1", estado: "baja" })!.active).toBe(false);
    expect(mapAirProduct({ cod: "F2", estado: "activo" })!.active).toBe(true);
    expect(mapAirProduct({ cod: "F3" })!.active).toBe(true); // default
  });

  it("parsea IVA del catálogo, default 21 si falta o inválido", () => {
    expect(mapAirProduct({ cod: "H1", iva: "10.5" })!.ivaPct).toBe(10.5);
    expect(mapAirProduct({ cod: "H2", alicuota: 21 })!.ivaPct).toBe(21);
    expect(mapAirProduct({ cod: "H3", iva_pct: 0 })!.ivaPct).toBe(0);
    expect(mapAirProduct({ cod: "H4", iva: 27 })!.ivaPct).toBe(27);
    expect(mapAirProduct({ cod: "H5" })!.ivaPct).toBe(21); // default
    expect(mapAirProduct({ cod: "H6", iva: 15 })!.ivaPct).toBe(21); // invalid → default
  });
});

describe("air — mapAirProducts", () => {
  it("filtra las filas inválidas y conserva el orden", () => {
    const out = mapAirProducts([{ cod: "G1" }, { sinCodigo: 1 }, null, { codigo: "G2" }]);
    expect(out.map((p) => p.codiart)).toEqual(["G1", "G2"]);
  });
});

describe("air — transporte HTTP", () => {
  it("login (GET) + un único POST Bearer con los datos, sin fan-out", async () => {
    seedAirConfig();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "tok-1" }))
      .mockResolvedValueOnce(jsonResponse([{ codiart: "A1", descripcion: "Router" }]));

    vi.stubGlobal("fetch", fetchMock);

    await expect(airRequest("?q=articulos&page=0")).resolves.toEqual([
      { codiart: "A1", descripcion: "Router" },
    ]);
    // Sólo 2 requests: login + POST bearer (antes hacía hasta 8).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("q=login");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ Authorization: "Bearer tok-1" });
  });

  it("ante 401 re-loguea una vez y reintenta el POST", async () => {
    seedAirConfig();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "tok-1" }))          // login inicial
      .mockResolvedValueOnce(jsonResponse({ error_id: 401 }, 401))       // POST → token vencido
      .mockResolvedValueOnce(jsonResponse({ token: "tok-2" }))          // re-login
      .mockResolvedValueOnce(jsonResponse([{ codiart: "B1" }]));         // POST con token nuevo

    vi.stubGlobal("fetch", fetchMock);

    await expect(airRequest("?q=articulos&page=0")).resolves.toEqual([{ codiart: "B1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1].headers).toMatchObject({ Authorization: "Bearer tok-2" });
  });

  it("ante 403 'Too many queries' lanza AirRateLimitError sin reintentar con otra auth", async () => {
    seedAirConfig();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "tok-1" }))
      .mockResolvedValueOnce(
        jsonResponse({ error_id: 403, error_name: "Too many queries detected", error_detail: "esperá 5 min" }, 403),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(airRequest("?q=articulos&page=0")).rejects.toBeInstanceOf(AirRateLimitError);
    // login + 1 POST y nada más (sin fan-out de GET/token).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tolera un notice de PHP antepuesto al JSON y devuelve los datos", async () => {
    seedAirConfig();
    const dirty =
      '<br /><b>Notice</b>: Undefined property: stdClass::$estado in <b>/x/consulta.php</b>[{"codiart":"A1","descripcion":"Router"}]';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "tok-1" }))
      .mockResolvedValueOnce(rawResponse(dirty));

    vi.stubGlobal("fetch", fetchMock);

    await expect(airRequest("?q=articulos&page=0")).resolves.toEqual([
      { codiart: "A1", descripcion: "Router" },
    ]);
  });

  it("si el body no tiene JSON parseable, lanza (no lo toma como página vacía)", async () => {
    seedAirConfig();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "tok-1" }))
      .mockResolvedValueOnce(rawResponse("<br /><b>Notice</b>: error feo sin json"));

    vi.stubGlobal("fetch", fetchMock);

    await expect(airRequest("?q=articulos&page=0")).rejects.toThrow(/no-JSON/);
  });
});
