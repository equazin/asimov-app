import { beforeEach, describe, expect, it } from "vitest";
import {
  fmtImporte, fmtNum, fmtText, fmtFecha,
  buildCbteRecord, buildAlicuotaRecord, buildLibroIvaVentas,
} from "../src/libro-iva";
import { dbRun, initDb } from "../src/db";

beforeEach(() => {
  initDb(":memory:");
});

describe("libro-iva — helpers de ancho fijo", () => {
  it("formatea importes en centavos con ceros a la izquierda", () => {
    expect(fmtImporte(121)).toBe("000000000012100");
    expect(fmtImporte(0.015)).toBe("000000000000002"); // redondeo medio-arriba
    expect(fmtImporte(0)).toBe("000000000000000");
  });

  it("números, texto y fechas", () => {
    expect(fmtNum(3, 5)).toBe("00003");
    expect(fmtNum("20-30405060-7", 20)).toBe("00000000020304050607");
    expect(fmtText("ACME SRL", 12)).toBe("ACME SRL    ");
    expect(fmtText("UNA RAZON SOCIAL DEMASIADO LARGA PARA EL CAMPO", 10)).toBe("UNA RAZON ");
    expect(fmtFecha("2026-07-08")).toBe("20260708");
    expect(fmtFecha(null)).toBe("00000000");
  });
});

describe("libro-iva — registros RG 4597", () => {
  it("registro de comprobante mide 266 y el de alícuota 62", () => {
    const cbte = buildCbteRecord({
      fecha: "2026-07-08", tipoCbte: 6, ptoVta: 3, nro: 43,
      docTipo: 80, docNro: "27111111112", denominacion: "ACME SRL",
      impTotal: 121, cantAlicuotas: 1,
    });
    expect(cbte).toHaveLength(266);
    expect(cbte.startsWith("20260708" + "006" + "00003")).toBe(true);
    expect(cbte).toContain("PES0001000000");

    const alic = buildAlicuotaRecord({
      tipoCbte: 6, ptoVta: 3, nro: 43, netoGravado: 100, codAlicuota: 5, impuestoLiquidado: 21,
    });
    expect(alic).toHaveLength(62);
    expect(alic).toBe("006" + "00003" + "00000000000000000043" + "000000000010000" + "0005" + "000000000002100");
  });
});

describe("libro-iva — export desde la DB", () => {
  it("incluye sólo comprobantes con CAE del rango y arma ambos archivos", () => {
    dbRun("INSERT INTO clients (id, business_name, cuit, fiscal_type) VALUES (?,?,?,?)",
      ["cli-1", "ACME SRL", "30712345678", "Responsable Inscripto"]);
    // Autorizada dentro del rango
    dbRun(
      "INSERT INTO invoices (id, number, client_id, client_name, date, tipo, point_of_sale, status, subtotal, iva_amount, total, cae) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      ["inv-1", "00003-00000043", "cli-1", "ACME SRL", "2026-07-08", "A", "00003", "autorizada", 100, 21, 121, "75123456789012"],
    );
    dbRun(
      "INSERT INTO invoice_items (id, invoice_id, code, description, qty, unit_price, iva_pct, subtotal) VALUES (?,?,?,?,?,?,?,?)",
      ["ii-1", "inv-1", "X", "Item", 1, 100, 21, 100],
    );
    // Sin CAE (no entra)
    dbRun(
      "INSERT INTO invoices (id, number, client_id, date, tipo, status, total) VALUES (?,?,?,?,?,?,?)",
      ["inv-2", "00003-00000044", "cli-1", "2026-07-08", "B", "emitida", 50],
    );
    // Fuera de rango (no entra)
    dbRun(
      "INSERT INTO invoices (id, number, client_id, date, tipo, status, total, cae) VALUES (?,?,?,?,?,?,?,?)",
      ["inv-3", "00003-00000042", "cli-1", "2026-06-01", "A", "autorizada", 121, "75000000000001"],
    );

    const res = buildLibroIvaVentas("2026-07-01", "2026-07-31");
    expect(res.count).toBe(1);
    const cbteLines = res.cbte.trimEnd().split("\r\n");
    const alicLines = res.alicuotas.trimEnd().split("\r\n");
    expect(cbteLines).toHaveLength(1);
    expect(alicLines).toHaveLength(1);
    expect(cbteLines[0]).toHaveLength(266);
    // Factura A a RI → tipo 001, CUIT del comprador presente
    expect(cbteLines[0].slice(8, 11)).toBe("001");
    expect(cbteLines[0]).toContain("30712345678");
    expect(alicLines[0]).toHaveLength(62);
  });

  it("rechaza rangos mal formados", () => {
    expect(() => buildLibroIvaVentas("08/07/2026", "2026-07-31")).toThrow(/yyyy-mm-dd/);
  });
});
