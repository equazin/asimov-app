import { afterEach, describe, expect, it, vi } from "vitest";
import { airRequest, mapAirProduct, mapAirProducts } from "../src/air";
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

function seedAirConfig(): void {
  initDb(":memory:");
  dbRun("INSERT INTO system_config (key, value) VALUES (?, ?)", ["air_enabled", "true"]);
  dbRun("INSERT INTO system_config (key, value) VALUES (?, ?)", ["air_username", "R19119"]);
  dbRun("INSERT INTO system_config (key, value) VALUES (?, ?)", ["air_password", encryptSecret("secret")]);
  dbRun("INSERT INTO system_config (key, value) VALUES (?, ?)", ["air_base_url", "https://api.air-intra.com/v2"]);
}

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
});

describe("air — mapAirProducts", () => {
  it("filtra las filas inválidas y conserva el orden", () => {
    const out = mapAirProducts([{ cod: "G1" }, { sinCodigo: 1 }, null, { codigo: "G2" }]);
    expect(out.map((p) => p.codiart)).toEqual(["G1", "G2"]);
  });
});

describe("air — transporte HTTP", () => {
  it("reintenta con GET bearer si AIR rechaza el POST bearer con 403", async () => {
    seedAirConfig();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "tok-1" }))
      .mockResolvedValueOnce(jsonResponse("Forbidden", 403))
      .mockResolvedValueOnce(jsonResponse([{ codiart: "A1", descripcion: "Router" }]));

    vi.stubGlobal("fetch", fetchMock);

    await expect(airRequest("?q=articulos&page=0")).resolves.toEqual([
      { codiart: "A1", descripcion: "Router" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "GET" });
  });
});
