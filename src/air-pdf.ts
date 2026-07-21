/**
 * Parser de "Nota de Venta" (pedido) de AIR S.R.L.
 *
 * AIR emite un PDF con este formato (una hoja tipo ticket):
 *
 *   NOTA DE VENTA
 *   X 0004-02504060                            ← número
 *   COD: 4 20/7/2026                           ← fecha
 *   [cliente + domicilio + iva + cuit]
 *   Cant. Código Descripción GI/GP %IVA I.Int Precio Subtotal
 *   1 214031 PC AIR ... 0/0 10,50 17.702,49 810.267,00 810.267,00   ← kit/ítem principal
 *   1 218249 CPU AMD RYZEN 5 ... 223.641,75                          ← sub-línea (componente)
 *   ... más líneas
 *   Subtotal u$s 528,38 $ 792.564,51
 *   TOTAL u$s 595,66 $ 893.486,27
 *
 * Cada renglón que empieza con `<cant> <código> <descripción>` es un artículo
 * de la orden. El precio unitario efectivo se calcula como `subtotal / cant`.
 */
import * as fs from "node:fs";
import { PDFParse } from "pdf-parse";
import { dbGet } from "./db";

export interface AirPdfItem {
  /** Cantidad tal como aparece en el PDF. */
  qty: number;
  /** Código AIR (numérico de 4-7 dígitos). */
  code: string;
  /** Descripción tal como viene en el PDF. */
  descriptionFromPdf: string;
  /** Subtotal del renglón (importe total del ítem). */
  subtotal: number;
  /** Precio unitario efectivo = subtotal / qty. */
  unitPrice: number;
  /** % IVA declarado por AIR (solo en la línea principal; los componentes 0). */
  ivaPct: number;
  /** true = línea principal con GI/GP + %IVA + precio + subtotal (kit padre o ítem suelto con IVA).
   *  false = sub-línea con solo cant/código/desc/subtotal (componente informativo de un kit). */
  isPrimary: boolean;
  /** Si el código está en `air_products`, datos hidratados del catálogo local. */
  match: {
    articleId: string | null;
    localName: string | null;
    localCostArs: number | null;
    localCostUsd: number | null;
    localIvaPct: number | null;
  };
}

export interface AirPdfNota {
  /** Número tipo "0004-02504060" o similar. */
  number: string;
  /** Fecha en formato DD/MM/YYYY tal como aparece en el PDF. */
  date: string;
  /** Total en ARS declarado en el pie. */
  totalArs: number;
  /** Total en USD declarado en el pie (si se detecta la fila). */
  totalUsd: number;
  /** Cotización USD → ARS declarada en el comprobante (1 U$S = X $). */
  exchangeRate: number;
  /** Ítems parseados con match contra el catálogo local. */
  items: AirPdfItem[];
  /** Ítems que no se pudieron matchear contra air_products (para avisar al operador). */
  unmatchedCodes: string[];
  /** Texto crudo del PDF (útil para debug si algo no cuadra). */
  rawText: string;
}

const NUM_LOCALE = /^[\d.]+(,\d+)?$/;

/**
 * Convierte un importe del PDF a número JS. AIR mezcla dos formatos:
 *   - Formato AR ("1.234,56"): punto = miles, coma = decimal → 1234.56
 *   - Formato EN ("1500.00"): punto decimal directo → 1500
 * La discriminación es simple: si el string tiene coma, es AR; si no, es EN.
 */
function parseAmount(raw: string): number {
  if (!raw) return 0;
  const s = raw.trim();
  const cleaned = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Reconoce si una línea del PDF es un renglón de ítem "principal" (con
 * columnas GI/GP + %IVA + Imp.Int + Precio + Subtotal — 8 columnas) o una
 * sub-línea de componente de kit (4 columnas: cant código descripción subtotal).
 */
export function matchItemLine(line: string):
  | { kind: "primary"; qty: number; code: string; desc: string; ivaPct: number; unitPrice: number; subtotal: number }
  | { kind: "component"; qty: number; code: string; desc: string; subtotal: number }
  | null
{
  const clean = line.trim();
  if (!clean) return null;
  // Primary: cant CÓDIGO DESCRIPCIÓN GI/GP %IVA I.Int Precio Subtotal
  const primary = clean.match(/^(\d+)\s+(\d{4,7})\s+(.+?)\s+(\d+\/\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/);
  if (primary) {
    const [, qtyS, code, desc, /* gigp */, ivaS, /* impInt */, priceS, subS] = primary;
    return {
      kind: "primary",
      qty: Number(qtyS) || 0,
      code,
      desc: desc.trim(),
      ivaPct: parseAmount(ivaS),
      unitPrice: parseAmount(priceS),
      subtotal: parseAmount(subS),
    };
  }
  // Component: cant CÓDIGO DESCRIPCIÓN SUBTOTAL
  const comp = clean.match(/^(\d+)\s+(\d{4,7})\s+(.+?)\s+([\d.,]+)$/);
  if (comp && NUM_LOCALE.test(comp[4])) {
    const [, qtyS, code, desc, subS] = comp;
    return {
      kind: "component",
      qty: Number(qtyS) || 0,
      code,
      desc: desc.trim(),
      subtotal: parseAmount(subS),
    };
  }
  return null;
}

/** Extrae header (número + fecha) del bloque de arriba del PDF. */
export function extractHeader(text: string): { number: string; date: string } {
  // Número: "X 0004-02504060" — la letra X puede ser cualquier letra fiscal.
  const numMatch = text.match(/^[A-Z]\s+(\d{4}-\d{6,10})/m) ||
                   text.match(/(\d{4}-\d{6,10})/);
  // Fecha: "COD: 4 20/7/2026" — busca DD/M/YYYY o DD/MM/YYYY.
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  return {
    number: numMatch ? numMatch[1] : "",
    date: dateMatch ? dateMatch[1] : "",
  };
}

/** Extrae totales del pie del PDF (Subtotal / TOTAL / cotización). */
export function extractTotals(text: string): { totalArs: number; totalUsd: number; exchangeRate: number } {
  // "TOTAL u$s 595,66 $ 893.486,27" — anclado a inicio de línea para no
  // capturar accidentalmente "Subtotal u$s ..." (substring de "TOTAL").
  const totalMatch = text.match(/^TOTAL\s+u\$s\s+([\d.,]+)\s+\$\s+([\d.,]+)/im);
  // "Comprobante expresado en DOLARES BILLETES USA: 1.00 = $ 1500.00"
  const rateMatch = text.match(/1[.,]00\s*=\s*\$\s*([\d.,]+)/);
  return {
    totalUsd: totalMatch ? parseAmount(totalMatch[1]) : 0,
    totalArs: totalMatch ? parseAmount(totalMatch[2]) : 0,
    exchangeRate: rateMatch ? parseAmount(rateMatch[1]) : 0,
  };
}

/** Toma el texto del PDF ya extraído y devuelve la Nota parseada. */
export function parseAirNotaText(rawText: string): Omit<AirPdfNota, "items" | "unmatchedCodes"> & {
  items: Array<Omit<AirPdfItem, "match">>;
} {
  const lines = rawText.split(/\r?\n/);
  const header = extractHeader(rawText);
  const totals = extractTotals(rawText);
  // Corta el bloque de ítems entre el header ("Cant. Código ...") y el pie
  // (empieza con "Régimen" / "Subtotal u$s" / "TEL GCBA").
  const startIdx = lines.findIndex((l) => /Cant\.?\s+C[óo]digo\s+Descripci/.test(l));
  const endIdx = lines.findIndex((l, i) => i > startIdx && /(R[ée]gimen|Subtotal\s+u\$s|TEL\s+GCBA)/i.test(l));
  const itemsLines = lines.slice(startIdx + 1, endIdx > startIdx ? endIdx : lines.length);
  const items: Array<Omit<AirPdfItem, "match">> = [];
  for (const line of itemsLines) {
    const m = matchItemLine(line);
    if (!m) continue;
    if (m.kind === "primary") {
      items.push({
        qty: m.qty,
        code: m.code,
        descriptionFromPdf: m.desc,
        subtotal: m.subtotal,
        unitPrice: m.unitPrice || (m.qty > 0 ? m.subtotal / m.qty : 0),
        ivaPct: m.ivaPct,
        isPrimary: true,
      });
    } else {
      items.push({
        qty: m.qty,
        code: m.code,
        descriptionFromPdf: m.desc,
        subtotal: m.subtotal,
        unitPrice: m.qty > 0 ? m.subtotal / m.qty : 0,
        ivaPct: 0, // los componentes de un kit no traen IVA propio
        isPrimary: false,
      });
    }
  }
  return {
    number: header.number,
    date: header.date,
    totalArs: totals.totalArs,
    totalUsd: totals.totalUsd,
    exchangeRate: totals.exchangeRate,
    items,
    rawText,
  };
}

/** Cruza cada ítem contra el catálogo local `air_products` (matcheo por `air_code`). */
export function hydrateItemsWithCatalog(
  items: Array<Omit<AirPdfItem, "match">>,
): { hydrated: AirPdfItem[]; unmatchedCodes: string[] } {
  const unmatched = new Set<string>();
  const hydrated: AirPdfItem[] = items.map((it) => {
    const row = dbGet<{
      id: string;
      description: string;
      price_ars: number;
      price_usd: number;
      iva_pct: number;
    }>(
      "SELECT id, description, price_ars, price_usd, iva_pct FROM air_products WHERE air_code = ? LIMIT 1",
      [it.code],
    );
    if (!row) unmatched.add(it.code);
    return {
      ...it,
      match: {
        articleId: row?.id ?? null,
        localName: row?.description ?? null,
        localCostArs: row?.price_ars ?? null,
        localCostUsd: row?.price_usd ?? null,
        localIvaPct: row?.iva_pct ?? null,
      },
    };
  });
  return { hydrated, unmatchedCodes: [...unmatched] };
}

/** Punto de entrada: recibe la ruta del PDF y devuelve la Nota parseada + matcheada. */
export async function parseAirNotaFromFile(filePath: string): Promise<AirPdfNota> {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  const parsed = parseAirNotaText(result.text);
  const { hydrated, unmatchedCodes } = hydrateItemsWithCatalog(parsed.items);
  return {
    number: parsed.number,
    date: parsed.date,
    totalArs: parsed.totalArs,
    totalUsd: parsed.totalUsd,
    exchangeRate: parsed.exchangeRate,
    items: hydrated,
    unmatchedCodes,
    rawText: parsed.rawText,
  };
}
