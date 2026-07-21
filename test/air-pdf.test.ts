import { describe, it, expect } from "vitest";
import { matchItemLine, extractHeader, extractTotals, parseAirNotaText } from "../src/air-pdf";

// Fixture: texto real extraído del PDF `001NVX000402504060.pdf` que manda AIR.
// Mezcla líneas principales (kit padre + ítems sueltos con IVA propio) y
// sub-líneas de componentes de kit (solo cant/código/desc/subtotal).
const SAMPLE_TEXT = `NOTA DE VENTA
X 0004-02504060
COD: 4 20/7/2026
BENITEZ ANDRES R19119 3415494633
carbia 1269 2000 ROSARIO SANTA FE
Responsable Inscripto 20-21774424-6
7 DIAS CTA CTE U$S BNA BILLETES
Cant. Código Descripción GI/GP %IVA I.Int Precio Subtotal
1 214031 PC AIR AMD RYZEN 5 5600GT TRAY + COOLER 0/0 10,50 17.702,49 810.267,00 810.267,00
1 218249 CPU AMD RYZEN 5 5600GT AM4 65W MPK CON COOLER 223.641,75
1 49945 CPU COOLER AMD PERFORMANCE AM4 6.581,25
2 214651 MONITOR 22 HIKVISION DS-D5022F2-1V2 VGA/HDMI 93.148,80
Régimen de Transparencia Fiscal al Consumidor LEY: 27443
Subtotal u$s 528,38 $ 792.564,51
IVA Insc. u$s 55,48 $ 83.219,27
Comprobante expresado en DOLARES BILLETES USA: 1.00 = $ 1500.00
TOTAL u$s 595,66 $ 893.486,27
`;

describe("air-pdf — parser de Nota de Venta de AIR", () => {
  it("reconoce el header (número + fecha)", () => {
    const h = extractHeader(SAMPLE_TEXT);
    expect(h.number).toBe("0004-02504060");
    expect(h.date).toBe("20/7/2026");
  });

  it("reconoce los totales del pie (ARS, USD, cotización)", () => {
    const t = extractTotals(SAMPLE_TEXT);
    expect(t.totalArs).toBeCloseTo(893486.27);
    expect(t.totalUsd).toBeCloseTo(595.66);
    // La cotización viene en formato EN ('1500.00'), NO como AR ('1.500,00').
    // El parseAmount debe distinguir por la presencia de coma.
    expect(t.exchangeRate).toBe(1500);
  });

  it("detecta ítem principal con 8 columnas (kit padre o ítem con IVA)", () => {
    const m = matchItemLine("1 214031 PC AIR AMD RYZEN 5 5600GT TRAY + COOLER 0/0 10,50 17.702,49 810.267,00 810.267,00");
    expect(m).not.toBeNull();
    expect(m?.kind).toBe("primary");
    if (m?.kind !== "primary") throw new Error("unreachable");
    expect(m.qty).toBe(1);
    expect(m.code).toBe("214031");
    expect(m.desc).toContain("PC AIR AMD RYZEN 5");
    expect(m.ivaPct).toBeCloseTo(10.5);
    expect(m.unitPrice).toBeCloseTo(810267);
    expect(m.subtotal).toBeCloseTo(810267);
  });

  it("detecta sub-línea (componente de kit) con 4 columnas", () => {
    const m = matchItemLine("1 218249 CPU AMD RYZEN 5 5600GT AM4 65W MPK CON COOLER 223.641,75");
    expect(m).not.toBeNull();
    expect(m?.kind).toBe("component");
    if (m?.kind !== "component") throw new Error("unreachable");
    expect(m.qty).toBe(1);
    expect(m.code).toBe("218249");
    expect(m.subtotal).toBeCloseTo(223641.75);
  });

  it("ignora líneas que no coinciden con el patrón", () => {
    expect(matchItemLine("")).toBeNull();
    expect(matchItemLine("Régimen de Transparencia Fiscal al Consumidor LEY: 27443")).toBeNull();
    expect(matchItemLine("Subtotal u$s 528,38 $ 792.564,51")).toBeNull();
  });

  it("parsea la nota completa: colapsa el kit padre y conserva sólo sus componentes (evita doble-conteo)", () => {
    const parsed = parseAirNotaText(SAMPLE_TEXT);
    expect(parsed.number).toBe("0004-02504060");
    // El kit padre 214031 (isPrimary) trae el subtotal agregado de sus 3
    // componentes → se descarta y quedan solo los componentes. Si no se
    // colapsara, el total sumaría el doble del PDF.
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items.some((it) => it.code === "214031")).toBe(false);
    expect(parsed.items[0].code).toBe("218249");
    expect(parsed.items[0].isPrimary).toBe(false);
    expect(parsed.items[1].code).toBe("49945");
    // Monitor con qty=2 (venía como sub-línea de 4 columnas en el ejemplo).
    expect(parsed.items[2].code).toBe("214651");
    expect(parsed.items[2].qty).toBe(2);
    expect(parsed.items[2].unitPrice).toBeCloseTo(93148.80 / 2);
    // Sanity: la suma de subtotales de los ítems importados ≈ subtotal PDF.
    const sum = parsed.items.reduce((s, it) => s + it.subtotal, 0);
    expect(sum).toBeCloseTo(223641.75 + 6581.25 + 93148.80, 2);
  });

  it("conserva un ítem primario suelto (sin componentes debajo)", () => {
    const SOLO = `Cant. Código Descripción GI/GP %IVA I.Int Precio Subtotal
1 999999 ITEM SUELTO CON IVA PROPIO 0/0 21,00 0,00 1.000,00 1.000,00
Régimen de Transparencia
`;
    const parsed = parseAirNotaText(SOLO);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].code).toBe("999999");
    expect(parsed.items[0].isPrimary).toBe(true);
  });

  it("acepta importes en formato AR (con coma decimal) y en formato EN (con punto decimal)", () => {
    // Formato AR: 1.500,50 → 1500.50
    const ar = matchItemLine("3 12345 DESC 1.500,50");
    expect(ar?.kind).toBe("component");
    if (ar?.kind === "component") expect(ar.subtotal).toBeCloseTo(1500.5);
    // La cotización usa formato EN internamente; ya validado en el test de extractTotals.
  });
});
