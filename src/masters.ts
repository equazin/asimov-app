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
import { enqueueChange } from "./sync";
import { isCloudConnected } from "./api-client";
import { setKitComponents } from "./kits";

function str(v: unknown, max = 500): string {
  return String(v ?? "").slice(0, max).trim();
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Encola un cambio para push a la nube. Nunca lanza (offline-first): si algo
 * falla en la cola, el guardado local ya se hizo y no queremos abortar.
 * `payload` va en el shape que espera la API v2 (camelCase, nombres del server).
 */
function tryEnqueue(entity: string, id: string, action: "create" | "update" | "delete", payload?: Record<string, unknown>) {
  if (!isCloudConnected()) return;
  try {
    enqueueChange(entity, id, action, payload);
  } catch {
    // best-effort: si la cola falla no rompemos el flujo del usuario
  }
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
  const isNew = !str(form.id);
  const saved = upsertClient({
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
  tryEnqueue("client", saved.id, isNew ? "create" : "update", {
    code: str(form.codigo) || null,
    name: str(form.razonSocial),
    taxId: str(form.cuit) || null,
    ivaCondition: str(form.condicionIva) || null,
    email: str(form.email) || null,
    phone: str(form.telefono) || null,
    address: str(form.domicilio) || null,
  });
  return saved;
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
  const isNew = !str(form.id);
  const saved = upsertSupplier({
    id: str(form.id),
    code: str(form.codigo) || null,
    business_name: str(form.razonSocial),
    cuit: str(form.cuit),
    email: str(form.email),
    phone: str(form.telefono),
    address: str(form.domicilio),
    active: 1,
  });
  tryEnqueue("supplier", saved.id, isNew ? "create" : "update", {
    code: str(form.codigo) || null,
    name: str(form.razonSocial),
    taxId: str(form.cuit) || null,
    email: str(form.email) || null,
    phone: str(form.telefono) || null,
    address: str(form.domicilio) || null,
  });
  return saved;
}

// ─── Artículo ──────────────────────────────────────────────────────────────

export interface ArticleForm {
  id?: string;
  codigo?: string;
  descripcion?: string;
  importe?: string | number;
  precio_usd?: string | number;
  iva?: string | number;
  linea?: string;
  categoria?: string;
  /** Componentes del esquema/kit: si viene con elementos, el artículo es un kit. */
  esquema?: Array<{ articleId?: string; qty?: number | string }>;
}

export function persistArticleForm(form: ArticleForm): { id: string } {
  const isNew = !str(form.id);
  const code = str(form.codigo) || `ART-${Date.now()}`;
  const saved = upsertArticle({
    id: str(form.id),
    code,
    name: str(form.descripcion),
    category: str(form.categoria),
    unit: "un",
    sale_price: num(form.importe),
    price_usd: num(form.precio_usd),
    iva_pct: num(form.iva) || 21,
    active: 1,
  });
  // Esquema/kit: si el form trae componentes, se definen (o redefinen) acá.
  if (Array.isArray(form.esquema)) {
    const components = form.esquema
      .map((c) => ({ articleId: str(c?.articleId), qty: num(c?.qty) }))
      .filter((c) => c.articleId && c.qty > 0);
    if (components.length > 0) setKitComponents(saved.id, components);
  }
  tryEnqueue("product", saved.id, isNew ? "create" : "update", {
    code,
    name: str(form.descripcion),
    category: str(form.categoria) || null,
    unit: "un",
    price: num(form.importe),
    ivaRate: num(form.iva) || 21,
  });
  return saved;
}
