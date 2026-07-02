import { describe, it, expect } from "vitest";
import { mapAirProduct, mapAirProducts } from "../src/air";

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
