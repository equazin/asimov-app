import { dbAll } from "./db";

export interface ProductPickerItem {
  /** Id del artículo local — necesario para expandir componentes de un kit al imprimir. */
  articleId?: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  costo: string;
  importe: string;
  iva: string;
  esquema: boolean;
  st: string;
  compro: string;
  entr: string;
  linea: string;
  categoria: string;
  source: "local" | "air";
  /** Moneda en la que está expresado `costo`/`importe` YA en la lista. Siempre
   *  "ARS": los artículos AIR (originalmente USD) se convierten antes de enviar
   *  la lista al picker, para que todo documento reciba precios en pesos. */
  moneda: "ARS" | "USD";
  /** Precio original en USD (solo AIR) — para aclarar el origen en el picker. */
  precioUsd?: number;
  /** Cotización usada para convertir USD → ARS (solo AIR). 0 si no había. */
  usdRate?: number;
}

/**
 * Artículos locales listos para el selector comercial. Un kit conserva su
 * precio de venta propio, pero usa como costo la suma de sus componentes.
 */
export function loadLocalProductsForPicker(): ProductPickerItem[] {
  const rows = dbAll<Record<string, unknown>>(
    `SELECT a.id, a.code, a.name, a.unit, a.sale_price, a.iva_pct, a.category, a.is_kit,
            COALESCE(MAX(stock.qty), 0) AS current_stock,
            CASE WHEN a.is_kit = 1 THEN
              COALESCE(SUM(kc.qty * component.cost_price), a.cost_price)
            ELSE a.cost_price END AS effective_cost
     FROM articles a
     LEFT JOIN kit_components kc ON kc.kit_article_id = a.id
     LEFT JOIN articles component ON component.id = kc.component_article_id
     LEFT JOIN (
       SELECT article_id, SUM(qty) AS qty
       FROM article_stock
       GROUP BY article_id
     ) stock ON stock.article_id = a.id
     WHERE a.active = 1
     GROUP BY a.id
     ORDER BY a.name
     LIMIT 1000`,
  );

  return rows.map((article) => ({
    articleId: String(article.id ?? ""),
    codigo: String(article.code ?? ""),
    descripcion: String(article.name ?? ""),
    unidad: String(article.unit ?? "UN") || "UN",
    costo: String(article.effective_cost ?? "0.00"),
    importe: String(article.sale_price ?? "0.00"),
    iva: String(article.iva_pct ?? "21"),
    esquema: Boolean(article.is_kit),
    st: String(article.current_stock ?? "0"),
    compro: "0",
    entr: "0",
    linea: "",
    categoria: String(article.category ?? ""),
    source: "local",
    moneda: "ARS",
  }));
}
