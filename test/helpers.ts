/**
 * Utilidades de test: inicializa la DB SQLite (en el temp dir mockeado) una vez
 * por archivo y limpia el "libro mayor" antes de cada test para aislarlos. No se
 * borran `warehouses`/`cash_accounts` (los siembra initDb); su saldo se resetea.
 */
import { initDb, getDb } from "../src/db";

let inited = false;

export function initTestDb(): void {
  if (!inited) { initDb(); inited = true; }
  resetLedger();
}

export function resetLedger(): void {
  getDb().exec(`
    DELETE FROM stock_movements;
    DELETE FROM article_stock;
    DELETE FROM cash_movements;
    UPDATE cash_accounts SET balance = 0;
    DELETE FROM delivery_note_items;   DELETE FROM delivery_notes;
    DELETE FROM goods_receipt_items;   DELETE FROM goods_receipts;
    DELETE FROM receipt_items;         DELETE FROM receipts;
    DELETE FROM payment_order_items;   DELETE FROM payment_orders;
    DELETE FROM sale_order_items;      DELETE FROM sale_orders;
    DELETE FROM quote_items;           DELETE FROM quotes;
    DELETE FROM invoice_items;         DELETE FROM invoices;
    DELETE FROM purchase_order_items;  DELETE FROM purchase_orders;
    DELETE FROM purchase_invoice_items;DELETE FROM purchase_invoices;
    DELETE FROM kit_components; DELETE FROM document_links;
    DELETE FROM air_sync_runs; DELETE FROM air_products;
    DELETE FROM clients; DELETE FROM suppliers; DELETE FROM articles;
    DELETE FROM users;
  `);
}

/** Inserta un artículo de prueba. Devuelve su id (`art-<code>`). */
export function seedArticle(code = "COD1", managesStock = 1): string {
  const id = "art-" + code;
  getDb()
    .prepare("INSERT OR REPLACE INTO articles (id,code,name,manages_stock,active) VALUES (?,?,?,?,1)")
    .run(id, code, "Art " + code, managesStock);
  return id;
}
