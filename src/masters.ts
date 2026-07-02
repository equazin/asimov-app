/**
 * Mapeo y persistencia de datos maestros creados desde los formularios nativos.
 *
 * Los formularios (new-client.html, new-supplier.html, new-article.html) emiten
 * payloads con nombres "de UI" (razonSocial, domicilio, telefono…). Acá se
 * traducen a los nombres de columna del schema y se guardan vía los upserts de
 * db.ts. Antes esto no ocurría: los formularios solo emitían un evento que el
 * main reenviaba a un picker, y el registro nunca se escribía en SQLite.
 */
import { upsertClient, upsertSupplier, upsertArticle } from "./db";

function str(v: unknown, max = 500): string {
  return String(v ?? "").slice(0, max).trim();
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// ─── Cliente ──────────────────────────────────────────────────────────────

export interface ClientForm {
  id?: string;
  codigo?: string;
  razonSocial?: string;
  cuit?: string;
  domicilio?: string;
  telefono?: string;
  email?: string;
  condicionIva?: string;
}

export function persistClientForm(form: ClientForm): { id: string } {
  return upsertClient({
    id: str(form.id),
    code: str(form.codigo) || null,
    business_name: str(form.razonSocial),
    cuit: str(form.cuit),
    fiscal_type: str(form.condicionIva) || "final",
    email: str(form.email),
    phone: str(form.telefono),
    address: str(form.domicilio),
    active: 1,
  });
}

// ─── Proveedor ──────────────────────────────────────────────────────────────

export interface SupplierForm {
  id?: string;
  codigo?: string;
  razonSocial?: string;
  cuit?: string;
  domicilio?: string;
  telefono?: string;
  email?: string;
}

export function persistSupplierForm(form: SupplierForm): { id: string } {
  return upsertSupplier({
    id: str(form.id),
    code: str(form.codigo) || null,
    business_name: str(form.razonSocial),
    cuit: str(form.cuit),
    email: str(form.email),
    phone: str(form.telefono),
    address: str(form.domicilio),
    active: 1,
  });
}

// ─── Artículo ──────────────────────────────────────────────────────────────

export interface ArticleForm {
  id?: string;
  codigo?: string;
  descripcion?: string;
  importe?: string | number;
  iva?: string | number;
  linea?: string;
  categoria?: string;
}

export function persistArticleForm(form: ArticleForm): { id: string } {
  return upsertArticle({
    id: str(form.id),
    code: str(form.codigo) || `ART-${Date.now()}`,
    name: str(form.descripcion),
    category: str(form.categoria),
    unit: "un",
    sale_price: num(form.importe),
    iva_pct: num(form.iva) || 21,
    active: 1,
  });
}
