import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseDolarResponse,
  computeArsPrice,
  fetchDolarRates,
  storeRates,
  getLatestRates,
  getPricingUsdRate,
  getRateHistory,
  repriceArticlesFromUsd,
  refreshDolarNow,
  stopDolarAutoUpdate,
  type DolarRate,
} from "../src/dolar";
import { closeDb, dbAll, dbGet, dbRun, initDb } from "../src/db";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

const SAMPLE_API_RESPONSE = [
  { moneda: "USD", casa: "oficial", nombre: "Oficial", compra: 1010, venta: 1060, fechaActualizacion: "2026-07-08T13:00:00.000Z" },
  { moneda: "USD", casa: "blue", nombre: "Blue", compra: 1290, venta: 1310, fechaActualizacion: "2026-07-08T13:00:00.000Z" },
  { moneda: "USD", casa: "bolsa", nombre: "Bolsa", compra: 1275, venta: 1295, fechaActualizacion: "2026-07-08T13:00:00.000Z" },
  { moneda: "USD", casa: "mayorista", nombre: "Mayorista", compra: 1000, venta: 1020, fechaActualizacion: "2026-07-08T13:00:00.000Z" },
];

beforeEach(() => {
  initDb(":memory:");
});

afterEach(() => {
  stopDolarAutoUpdate();
  vi.unstubAllGlobals();
  closeDb();
});

describe("parseDolarResponse", () => {
  it("normaliza las casas conocidas y descarta las no listadas", () => {
    const rates = parseDolarResponse(SAMPLE_API_RESPONSE);
    expect(rates.map((r) => r.casa)).toEqual(["oficial", "blue", "bolsa"]);
    expect(rates[1].venta).toBe(1310);
  });

  it("descarta entradas inválidas sin romper", () => {
    const rates = parseDolarResponse([
      null,
      "texto",
      { casa: "blue", compra: "no-num", venta: -5 },
      { casa: "blue", compra: 1290, venta: 1310 },
    ]);
    expect(rates).toHaveLength(1);
    expect(rates[0].compra).toBe(1290);
  });

  it("usa venta como compra cuando compra falta o es inválida", () => {
    const rates = parseDolarResponse([{ casa: "oficial", nombre: "Oficial", venta: 1060 }]);
    expect(rates[0].compra).toBe(1060);
  });

  it("devuelve vacío si la respuesta no es un array", () => {
    expect(parseDolarResponse({ error: "x" })).toEqual([]);
    expect(parseDolarResponse(undefined)).toEqual([]);
  });
});

describe("computeArsPrice", () => {
  it("multiplica y redondea a 2 decimales", () => {
    expect(computeArsPrice(10, 1310)).toBe(13100);
    expect(computeArsPrice(0.333, 1000)).toBe(333);
    expect(computeArsPrice(1.005, 1000)).toBe(1005);
  });
});

describe("fetchDolarRates", () => {
  it("devuelve las cotizaciones parseadas", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(SAMPLE_API_RESPONSE)));
    const rates = await fetchDolarRates();
    expect(rates).toHaveLength(3);
  });

  it("lanza error si la API responde con status de error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(fetchDolarRates()).rejects.toThrow("500");
  });

  it("lanza error si no hay cotizaciones válidas", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    await expect(fetchDolarRates()).rejects.toThrow(/sin cotizaciones/);
  });
});

describe("storeRates / getLatestRates / getRateHistory", () => {
  const blue = (venta: number): DolarRate => ({
    casa: "blue", nombre: "Blue", compra: venta - 20, venta, fechaActualizacion: "2026-07-08T13:00:00.000Z",
  });

  it("persiste cotizaciones y recupera la última por casa", () => {
    const inserted = storeRates(parseDolarResponse(SAMPLE_API_RESPONSE));
    expect(inserted).toBe(3);
    const latest = getLatestRates();
    expect(latest).toHaveLength(3);
    expect(latest[0].casa).toBe("oficial"); // orden fijo
    expect(latest[1].casa).toBe("blue");
  });

  it("no inserta duplicados si la cotización no cambió", () => {
    expect(storeRates([blue(1310)])).toBe(1);
    expect(storeRates([blue(1310)])).toBe(0);
    expect(storeRates([blue(1320)])).toBe(1);
    expect(dbAll("SELECT * FROM exchange_rates WHERE casa = 'blue'")).toHaveLength(2);
  });

  it("getRateHistory devuelve más reciente primero y respeta el límite", () => {
    storeRates([blue(1300)]);
    storeRates([blue(1310)]);
    storeRates([blue(1320)]);
    const history = getRateHistory("blue", 2);
    expect(history).toHaveLength(2);
    expect(history[0].venta).toBe(1320);
  });
});

describe("getPricingUsdRate (cotización de conversión de precios)", () => {
  it("devuelve la venta del oficial cuando existe", () => {
    storeRates(parseDolarResponse(SAMPLE_API_RESPONSE));
    expect(getPricingUsdRate()).toBe(1060); // oficial.venta
  });

  it("cae a otra casa si no hay oficial", () => {
    storeRates([{ casa: "blue", nombre: "Blue", compra: 1290, venta: 1310, fechaActualizacion: "2026-07-08T13:00:00.000Z" }]);
    expect(getPricingUsdRate()).toBe(1310);
  });

  it("devuelve 0 si no hay ninguna cotización", () => {
    expect(getPricingUsdRate()).toBe(0);
  });
});

describe("repriceArticlesFromUsd", () => {
  function seedArticle(id: string, priceUsd: number, salePrice = 0, active = 1): void {
    dbRun(
      "INSERT INTO articles (id, code, name, price_usd, sale_price, active) VALUES (?, ?, ?, ?, ?, ?)",
      [id, `code-${id}`, `Artículo ${id}`, priceUsd, salePrice, active],
    );
  }

  it("recalcula sale_price solo de artículos activos con price_usd > 0", () => {
    storeRates([{ casa: "blue", nombre: "Blue", compra: 1290, venta: 1310, fechaActualizacion: "" }]);
    seedArticle("a1", 100, 50000);       // se reprecia
    seedArticle("a2", 0, 8000);          // sin USD: no se toca
    seedArticle("a3", 50, 1000, 0);      // inactivo: no se toca

    const result = repriceArticlesFromUsd("blue");
    expect(result).toEqual({ updated: 1, rate: 1310, casa: "blue" });

    expect(dbGet<{ sale_price: number }>("SELECT sale_price FROM articles WHERE id = 'a1'")?.sale_price).toBe(131000);
    expect(dbGet<{ sale_price: number }>("SELECT sale_price FROM articles WHERE id = 'a2'")?.sale_price).toBe(8000);
    expect(dbGet<{ sale_price: number }>("SELECT sale_price FROM articles WHERE id = 'a3'")?.sale_price).toBe(1000);
  });

  it("falla con mensaje claro si no hay cotización para la casa", () => {
    expect(() => repriceArticlesFromUsd("blue")).toThrow(/No hay cotización/);
  });
});

describe("refreshDolarNow", () => {
  it("hace fetch, persiste y devuelve las últimas cotizaciones", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(SAMPLE_API_RESPONSE)));
    const latest = await refreshDolarNow();
    expect(latest).toHaveLength(3);
    expect(dbAll("SELECT * FROM exchange_rates")).toHaveLength(3);
  });
});
