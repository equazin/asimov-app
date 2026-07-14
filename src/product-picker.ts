import { dbAll } from "./db";

export interface ProductPickerItem {
  codigo: string;
  descripcion: string;
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
}

/**
 * Artículos locales listos para el selector comercial. Un kit conserva su
 * precio de venta propio, pero usa como costo la suma de sus componentes.
 */
export function loadLocalProductsForPicker(): ProductPickerItem[] {
  const rows = dbAll<Record<string, unknown>>(
    `SELECT a.id, a.code, a.name, a.unit, a.sale_price, a.iva_pct, a.category, a.is_kit,
            CASE WHEN a.is_kit = 1 THEN
              COALESCE(SUM(kc.qty * component.cost_price), a.cost_price)
            ELSE a.cost_price END AS effective_cost
     FROM articles a
     LEFT JOIN kit_components kc ON kc.kit_article_id = a.id
     LEFT JOIN articles component ON component.id = kc.component_article_id
     WHERE a.active = 1
     GROUP BY a.id
     ORDER BY a.name
     LIMIT 1000`,
  );

  return rows.map((article) => ({
    codigo: String(article.code ?? ""),
    descripcion: String(article.name ?? ""),
    costo: String(article.effective_cost ?? "0.00"),
    importe: String(article.sale_price ?? "0.00"),
    iva: String(article.iva_pct ?? "21"),
    esquema: Boolean(article.is_kit),
    st: "0",
    compro: "0",
    entr: "0",
    linea: "",
    categoria: String(article.category ?? ""),
    source: "local",
  }));
}
