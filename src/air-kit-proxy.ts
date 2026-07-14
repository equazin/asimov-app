import { dbAll, dbGet, dbRun, upsertArticle } from "./db";

export const AIR_KIT_PROXY_NOTE = "ASIMOV:AIR_KIT_COMPONENT";

interface AirComponentRef {
  articleId?: string;
  code?: string;
  source?: string;
}

interface AirProductRow {
  id: string;
  air_code: string;
  description: string;
  category: string | null;
  price_usd: number;
  iva_pct: number;
  stock: number;
  active: number;
}

function syncProxyStock(articleId: string, qty: number): void {
  const warehouse = dbGet<{ id: string }>("SELECT id FROM warehouses WHERE active = 1 ORDER BY name LIMIT 1");
  if (!warehouse?.id) return;
  dbRun(
    `INSERT INTO article_stock (article_id, warehouse_id, qty)
     VALUES (?, ?, ?)
     ON CONFLICT(article_id, warehouse_id) DO UPDATE SET qty = excluded.qty`,
    [articleId, warehouse.id, Number.isFinite(qty) ? qty : 0],
  );
}

/**
 * Convierte un producto AIR elegido desde Stock en un artículo local enlazable
 * por `kit_components`. Se reutiliza el artículo local si el código ya existe.
 */
export function resolveKitComponentArticle(component: AirComponentRef): string {
  const source = String(component.source ?? "local").trim().toLowerCase();
  const requestedId = String(component.articleId ?? "").trim();
  if (source !== "air") return requestedId;

  const code = String(component.code ?? "").trim();
  const air = dbGet<AirProductRow>(
    `SELECT id, air_code, description, category, price_usd, iva_pct, stock, active
     FROM air_products
     WHERE active = 1 AND (id = ? OR air_code = ?)
     LIMIT 1`,
    [requestedId, code],
  );
  if (!air) throw new Error("El componente de AIR ya no está disponible en Stock.");

  const price = Number(air.price_usd) || 0;
  const existing = dbGet<{ id: string; active: number }>("SELECT id, active FROM articles WHERE code = ? LIMIT 1", [air.air_code]);
  if (existing?.id) {
    if (!existing.active) {
      dbRun(
        `UPDATE articles
         SET name = ?, category = ?, cost_price = ?, sale_price = ?, price_usd = ?,
             iva_pct = ?, manages_stock = 1, active = 1, notes = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [air.description, air.category, price, price, price, Number(air.iva_pct) || 21, AIR_KIT_PROXY_NOTE, existing.id],
      );
      syncProxyStock(existing.id, Number(air.stock) || 0);
    }
    return existing.id;
  }

  const saved = upsertArticle({
    code: air.air_code,
    name: air.description,
    category: air.category,
    unit: "un",
    cost_price: price,
    sale_price: price,
    price_usd: price,
    iva_pct: Number(air.iva_pct) || 21,
    manages_stock: 1,
    active: air.active ? 1 : 0,
    notes: AIR_KIT_PROXY_NOTE,
  });
  syncProxyStock(saved.id, Number(air.stock) || 0);
  return saved.id;
}

/** Mantiene actualizado el artículo local creado para usar un producto AIR en kits. */
export function refreshAirKitProxy(product: {
  code: string;
  name: string;
  category?: string | null;
  price?: number;
  ivaPct?: number;
  stock?: number;
  active?: boolean;
}): void {
  const proxy = dbGet<{ id: string }>(
    "SELECT id FROM articles WHERE code = ? AND notes = ? LIMIT 1",
    [product.code, AIR_KIT_PROXY_NOTE],
  );
  if (!proxy?.id) return;

  const price = Number(product.price) || 0;
  dbRun(
    `UPDATE articles
     SET name = ?, category = ?, cost_price = ?, sale_price = ?, price_usd = ?,
         iva_pct = ?, active = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [product.name, product.category ?? null, price, price, price, Number(product.ivaPct) || 21, product.active ? 1 : 0, proxy.id],
  );
  syncProxyStock(proxy.id, Number(product.stock) || 0);
}

/** Actualiza en lote solo los productos AIR que ya están usados como componentes. */
export function refreshAllAirKitProxies(): void {
  const products = dbAll<{
    code: string;
    name: string;
    category: string | null;
    price: number;
    ivaPct: number;
    stock: number;
    active: number;
  }>(
    `SELECT ap.air_code AS code, ap.description AS name, ap.category,
            ap.price_usd AS price, ap.iva_pct AS ivaPct, ap.stock, ap.active
     FROM articles a
     INNER JOIN air_products ap ON ap.air_code = a.code
     WHERE a.notes = ?`,
    [AIR_KIT_PROXY_NOTE],
  );
  for (const product of products) {
    refreshAirKitProxy({ ...product, active: Boolean(product.active) });
  }
}
