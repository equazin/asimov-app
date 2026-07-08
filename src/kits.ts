/**
 * Esquemas / Kits: un artículo compuesto por otros artículos.
 *
 * Ejemplo: "PC ARMADA RYZEN 5" = Ryzen 5 5600G + Mother A520 + RAM 8GB +
 * SSD 240 + Gabinete kit. El kit tiene UN precio de venta propio (lo maneja
 * el usuario, no es la suma de componentes) y NO maneja stock propio: al
 * remitirse, el stock se descuenta de cada componente. El "stock armable"
 * es el mínimo de (stock componente / cantidad requerida).
 */
import { randomUUID } from "node:crypto";
import { getDb, dbAll, dbGet, dbRun } from "./db";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface KitComponentInput {
  articleId: string;
  qty: number;
}

export interface KitComponent {
  component_article_id: string;
  code: string;
  name: string;
  qty: number;
  cost_price: number;
  sale_price: number;
  manages_stock: number;
  stock_total: number;
}

export interface KitInfo {
  components: KitComponent[];
  /** Suma de costos de componentes (referencia para ver el margen del kit). */
  componentsCost: number;
  /** Suma de precios de venta individuales (referencia contra el precio del kit). */
  componentsSalePrice: number;
  /** Cuántos kits completos se pueden armar con el stock actual. */
  buildableStock: number;
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/**
 * Define (reemplaza) los componentes de un esquema. Lista vacía = deja de ser
 * kit. El kit no maneja stock propio: se fuerza manages_stock = 0 mientras
 * tenga componentes.
 */
export function setKitComponents(kitArticleId: string, components: KitComponentInput[]): { count: number } {
  const kit = dbGet<{ id: string }>("SELECT id FROM articles WHERE id = ?", [kitArticleId]);
  if (!kit) throw new Error("El artículo del esquema no existe.");

  const valid = (Array.isArray(components) ? components : [])
    .map((c) => ({ articleId: String(c?.articleId ?? "").trim(), qty: Number(c?.qty) }))
    .filter((c) => c.articleId && c.articleId !== kitArticleId && Number.isFinite(c.qty) && c.qty > 0);

  const tx = getDb().transaction(() => {
    dbRun("DELETE FROM kit_components WHERE kit_article_id = ?", [kitArticleId]);
    for (const c of valid) {
      const exists = dbGet("SELECT id FROM articles WHERE id = ?", [c.articleId]);
      if (!exists) continue;
      // Un kit no puede contener otro kit (evita explosiones recursivas).
      const isKit = dbGet<{ is_kit: number }>("SELECT is_kit FROM articles WHERE id = ?", [c.articleId]);
      if (isKit?.is_kit) continue;
      dbRun(
        "INSERT INTO kit_components (id, kit_article_id, component_article_id, qty) VALUES (?,?,?,?)",
        [randomUUID(), kitArticleId, c.articleId, c.qty],
      );
    }
    const count = dbGet<{ n: number }>("SELECT COUNT(*) AS n FROM kit_components WHERE kit_article_id = ?", [kitArticleId])?.n ?? 0;
    dbRun("UPDATE articles SET is_kit = ?, manages_stock = ? WHERE id = ?", [count > 0 ? 1 : 0, count > 0 ? 0 : 1, kitArticleId]);
  });
  tx();

  const count = dbGet<{ n: number }>("SELECT COUNT(*) AS n FROM kit_components WHERE kit_article_id = ?", [kitArticleId])?.n ?? 0;
  return { count };
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export function getKitComponents(kitArticleId: string): KitComponent[] {
  return dbAll<KitComponent>(
    `SELECT kc.component_article_id, a.code, a.name, kc.qty,
            a.cost_price, a.sale_price, a.manages_stock,
            COALESCE((SELECT SUM(s.qty) FROM article_stock s WHERE s.article_id = a.id), 0) AS stock_total
     FROM kit_components kc
     INNER JOIN articles a ON a.id = kc.component_article_id
     WHERE kc.kit_article_id = ?
     ORDER BY a.name`,
    [kitArticleId],
  );
}

/** Cuántos kits completos pueden armarse con el stock actual de componentes. */
export function computeBuildableStock(components: ReadonlyArray<Pick<KitComponent, "qty" | "stock_total" | "manages_stock">>): number {
  const relevant = components.filter((c) => c.manages_stock);
  if (relevant.length === 0) return 0;
  return Math.max(0, Math.min(...relevant.map((c) => Math.floor(c.stock_total / c.qty))));
}

export function getKitInfo(kitArticleId: string): KitInfo {
  const components = getKitComponents(kitArticleId);
  return {
    components,
    componentsCost: components.reduce((acc, c) => acc + c.cost_price * c.qty, 0),
    componentsSalePrice: components.reduce((acc, c) => acc + c.sale_price * c.qty, 0),
    buildableStock: computeBuildableStock(components),
  };
}

/** Componentes crudos para la explosión de stock al remitir un kit. */
export function explodeKitComponents(kitArticleId: string): Array<{ component_article_id: string; qty: number; manages_stock: number; code: string }> {
  return dbAll(
    `SELECT kc.component_article_id, kc.qty, a.manages_stock, a.code
     FROM kit_components kc
     INNER JOIN articles a ON a.id = kc.component_article_id
     WHERE kc.kit_article_id = ?`,
    [kitArticleId],
  );
}
