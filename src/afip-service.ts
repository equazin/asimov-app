/**
 * Servicio de facturación electrónica AFIP/ARCA para el desktop.
 *
 * Arquitectura elegida: el desktop habla DIRECTO con AFIP (WSAA + WSFE); el
 * certificado y la clave privada del contribuyente se guardan cifrados en
 * `system_config` con `src/secrets.ts` (safeStorage del SO). No pasa por la nube.
 *
 * Config en system_config (claves `afip_*`):
 *   afip_enabled       "true"/"false"
 *   afip_cuit          CUIT del emisor (11 dígitos, sin guiones)
 *   afip_point_of_sale punto de venta (ej "3")
 *   afip_env           "homologacion" | "produccion"
 *   afip_cert          certificado PEM (cifrado)
 *   afip_key           clave privada PEM (cifrada)
 *   afip_ta            TA cacheado (JSON: token/sign/expiration)
 */
import { dbAll, dbGet, dbRun } from "./db";
import { encryptSecret, decryptSecret } from "./secrets";
import { signTRA, certNotAfter, isValidCertPem, isValidKeyPem } from "./afip/crypto";
import {
  WSAA_URLS, buildLoginTicketRequest, callLoginCms, isTaValid, type AfipTA,
} from "./afip/wsaa";
import {
  WSFE_URLS, buildUltimoAutorizadoEnvelope, parseUltimoAutorizado,
  buildFECAESolicitarEnvelope, parseFECAEResponse, callWsfe,
  buildFEDummyEnvelope, parseFEDummy, type FeCabecera, type FeComprobante,
} from "./afip/wsfe";
import {
  receptorDocType, isAfipUnavailable, resolveVoucherTypeCode,
  validateVoucherForClient, requiresAssociatedInvoice,
} from "./afip/domain";
import { PADRON_SERVICE, PADRON_URLS, buildGetPersonaEnvelope, callPadron, type PadronPersona } from "./afip/padron";
import { buildAfipQrUrl } from "./afip/qr";
import * as QRCode from "qrcode";

export type AfipEnv = "homologacion" | "produccion";

export interface AfipConfig {
  enabled: boolean;
  cuit: string;
  pointOfSale: number;
  env: AfipEnv;
  hasCert: boolean;
  hasKey: boolean;
  certExpires: string | null;
}

export interface CaeRequestInput {
  invoiceId: string;
  invoiceType: number;     // código AFIP (1 A, 6 B, 11 C, etc.)
  clientCuit?: string;
  concepto?: number;       // 1 productos (default), 2 servicios, 3 ambos
  date?: string;           // ISO; default hoy
  net: number;
  iva: number;
  total: number;
  items: Array<{ ivaRate: number; subtotal: number }>;
  /** Comprobante(s) asociado(s) — obligatorio para NC/ND (RG 4540). */
  cbtesAsoc?: Array<{ tipo: number; ptoVta: number; nro: number; cuit?: string }>;
}

export interface CaeSuccessDto {
  ok: true;
  cae: string;
  caeExpiration: string;   // yyyy-mm-dd
  number: string;          // ptovta-numero (formato AFIP 00003-00000043)
  invoiceNumber: number;
  observations: Array<{ code: string; msg: string }>;
  qrUrl: string;           // URL oficial del QR de AFIP
  qrDataUrl: string;       // imagen PNG del QR (data URL) para imprimir
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function readConfigMap(): Record<string, string> {
  const rows = dbAll<{ key: string; value: string }>(
    "SELECT key, value FROM system_config WHERE key LIKE 'afip_%'",
  );
  const cfg: Record<string, string> = {};
  for (const r of rows) cfg[r.key] = r.value;
  return cfg;
}

function setConfigValue(key: string, value: string, secret = false): void {
  dbRun(
    "INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)",
    [key, secret ? encryptSecret(value) : value],
  );
}

/** Estado de configuración de AFIP (sin exponer cert/clave). */
export function getAfipConfig(): AfipConfig {
  const cfg = readConfigMap();
  const certPem = cfg.afip_cert ? decryptSecret(cfg.afip_cert) : "";
  let certExpires: string | null = null;
  if (certPem) {
    try { certExpires = certNotAfter(certPem).toISOString(); } catch { certExpires = null; }
  }
  return {
    enabled: cfg.afip_enabled === "true" || cfg.afip_enabled === "1",
    cuit: cfg.afip_cuit ?? "",
    pointOfSale: parseInt(cfg.afip_point_of_sale ?? "1", 10) || 1,
    env: cfg.afip_env === "produccion" ? "produccion" : "homologacion",
    hasCert: !!cfg.afip_cert,
    hasKey: !!cfg.afip_key,
    certExpires,
  };
}

export interface SaveCredentialsInput {
  cuit: string;
  pointOfSale: number;
  env: AfipEnv;
  certPem?: string;   // si viene, reemplaza el guardado
  keyPem?: string;    // idem
  enabled?: boolean;
}

/** Guarda la configuración y (si vienen) el cert/clave cifrados. Invalida el TA. */
export function saveAfipCredentials(input: SaveCredentialsInput): { ok: true; certExpires: string | null } {
  const cuit = String(input.cuit ?? "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(cuit)) throw new Error("CUIT inválido: deben ser 11 dígitos.");

  if (input.certPem !== undefined && input.certPem !== "") {
    if (!isValidCertPem(input.certPem)) throw new Error("El certificado no es un PEM válido (.crt/.pem).");
    setConfigValue("afip_cert", input.certPem, true);
  }
  if (input.keyPem !== undefined && input.keyPem !== "") {
    if (!isValidKeyPem(input.keyPem)) throw new Error("La clave privada no es un PEM válido (.key).");
    setConfigValue("afip_key", input.keyPem, true);
  }
  setConfigValue("afip_cuit", cuit);
  setConfigValue("afip_point_of_sale", String(input.pointOfSale || 1));
  setConfigValue("afip_env", input.env === "produccion" ? "produccion" : "homologacion");
  setConfigValue("afip_enabled", input.enabled === false ? "false" : "true");
  // Cambió algo de la config → los TA cacheados (todos los servicios) ya no sirven.
  dbRun("DELETE FROM system_config WHERE key LIKE 'afip_ta%'");

  const cfg = getAfipConfig();
  return { ok: true, certExpires: cfg.certExpires };
}

// ---------------------------------------------------------------------------
// WSAA — TA con cache persistente en system_config
// ---------------------------------------------------------------------------

function requireCreds(): { cuit: string; certPem: string; keyPem: string; env: AfipEnv; pointOfSale: number } {
  const cfg = readConfigMap();
  const certPem = cfg.afip_cert ? decryptSecret(cfg.afip_cert) : "";
  const keyPem = cfg.afip_key ? decryptSecret(cfg.afip_key) : "";
  const cuit = cfg.afip_cuit ?? "";
  if (!certPem || !keyPem) throw new Error("Falta el certificado o la clave de AFIP. Cargalos en Configuración → AFIP.");
  if (!/^\d{11}$/.test(cuit)) throw new Error("Falta configurar el CUIT del emisor en Configuración → AFIP.");
  return {
    cuit, certPem, keyPem,
    env: cfg.afip_env === "produccion" ? "produccion" : "homologacion",
    pointOfSale: parseInt(cfg.afip_point_of_sale ?? "1", 10) || 1,
  };
}

// El TA es por servicio de AFIP ("wsfe", padrón, etc.). La clave histórica
// `afip_ta` se mantiene para wsfe; el resto usa `afip_ta_<servicio>`.
function taKey(service: string): string {
  return service === "wsfe" ? "afip_ta" : `afip_ta_${service}`;
}

function readCachedTa(service: string): AfipTA | null {
  const row = dbGet<{ value: string }>("SELECT value FROM system_config WHERE key = ?", [taKey(service)]);
  if (!row?.value) return null;
  try { return JSON.parse(decryptSecret(row.value)) as AfipTA; } catch { return null; }
}

function writeCachedTa(service: string, ta: AfipTA): void {
  setConfigValue(taKey(service), JSON.stringify(ta), true);
}

/** Devuelve un TA válido para el servicio: reusa el cacheado o autentica. */
export async function getValidTA(service = "wsfe"): Promise<AfipTA> {
  const cached = readCachedTa(service);
  if (isTaValid(cached)) return cached as AfipTA;

  const creds = requireCreds();
  const tra = buildLoginTicketRequest(service);
  const cms = signTRA(tra, creds.certPem, creds.keyPem);
  const url = creds.env === "produccion" ? WSAA_URLS.produccion : WSAA_URLS.homologacion;
  const ta = await callLoginCms(url, cms);
  writeCachedTa(service, ta);
  return ta;
}

// ---------------------------------------------------------------------------
// Padrón — constancia de inscripción (razón social + condición de IVA)
// ---------------------------------------------------------------------------

/**
 * Consulta el CUIT en el padrón de AFIP. Requiere tener habilitado el servicio
 * "ws_sr_constancia_inscripcion" para el certificado en el portal de AFIP.
 */
export async function consultarPadron(cuit: string): Promise<PadronPersona> {
  const digits = String(cuit ?? "").replace(/\D/g, "");
  if (digits.length !== 11) throw new Error("Ingresá un CUIT de 11 dígitos para consultar el padrón.");
  const creds = requireCreds();
  const ta = await getValidTA(PADRON_SERVICE);
  const url = creds.env === "produccion" ? PADRON_URLS.produccion : PADRON_URLS.homologacion;
  return callPadron(url, buildGetPersonaEnvelope(ta, creds.cuit, digits), digits);
}

/** Prueba de conexión: fuerza (o reusa) el TA y devuelve su expiración. */
export async function testAfipConnection(): Promise<{ ok: boolean; message: string; expiration?: string }> {
  try {
    const ta = await getValidTA();
    return { ok: true, message: "Conexión con AFIP correcta.", expiration: ta.expiration };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Diagnóstico del circuito (Fase 6 — homologación / puesta en producción)
// ---------------------------------------------------------------------------

export type DiagStatus = "ok" | "warn" | "error" | "skip";

export interface DiagStep {
  id: string;
  label: string;
  status: DiagStatus;
  detail: string;
}

export interface AfipDiagnostics {
  env: AfipEnv;
  ok: boolean;
  steps: DiagStep[];
}

/**
 * Recorre el circuito completo de facturación electrónica y reporta cada paso,
 * para validar homologación antes de pasar a producción (Fase 6). No emite
 * comprobantes: sólo verifica config, autenticación, salud de WSFE y numeración.
 */
export async function runAfipDiagnostics(): Promise<AfipDiagnostics> {
  const cfg = getAfipConfig();
  const steps: DiagStep[] = [];
  const add = (id: string, label: string, status: DiagStatus, detail: string): void => {
    steps.push({ id, label, status, detail });
  };

  // 1. Certificado y clave.
  if (!cfg.hasCert || !cfg.hasKey) {
    add("cert", "Certificado y clave", "error", "Falta cargar el certificado (.crt) y/o la clave (.key) en Configuración → AFIP.");
  } else if (cfg.certExpires && new Date(cfg.certExpires).getTime() < Date.now()) {
    add("cert", "Certificado y clave", "error", `El certificado venció el ${cfg.certExpires.slice(0, 10)}. Generá uno nuevo en el portal de AFIP.`);
  } else {
    const venceEn = cfg.certExpires
      ? ` (vence ${cfg.certExpires.slice(0, 10)})`
      : "";
    add("cert", "Certificado y clave", "ok", `Cargados${venceEn}.`);
  }

  // 2. CUIT y punto de venta.
  if (!/^\d{11}$/.test(cfg.cuit)) {
    add("config", "CUIT y punto de venta", "error", "El CUIT del emisor debe tener 11 dígitos.");
  } else {
    add("config", "CUIT y punto de venta", "ok", `CUIT ${cfg.cuit} · Pto. venta ${cfg.pointOfSale} · Ambiente ${cfg.env === "produccion" ? "PRODUCCIÓN" : "homologación"}.`);
  }

  // Si la config base falla, no tiene sentido ir a la red.
  const configOk = steps.every((s) => s.status !== "error");
  if (!configOk) {
    return { env: cfg.env, ok: false, steps };
  }

  const url = cfg.env === "produccion" ? WSFE_URLS.produccion : WSFE_URLS.homologacion;

  // 3. FEDummy — salud del servicio WSFE (no requiere autenticación).
  try {
    const dummy = parseFEDummy(await callWsfe(url, "FEDummy", buildFEDummyEnvelope()));
    add("fedummy", "Servicio WSFE (FEDummy)", dummy.ok ? "ok" : "warn",
      `AppServer ${dummy.appServer} · DbServer ${dummy.dbServer} · AuthServer ${dummy.authServer}.`);
  } catch (err) {
    add("fedummy", "Servicio WSFE (FEDummy)", "error", errMsg(err));
  }

  // 4. WSAA — autenticación (token/sign) contra el servicio wsfe.
  let authOk = false;
  try {
    const ta = await getValidTA();
    authOk = true;
    add("wsaa", "Autenticación WSAA", "ok", `Ticket de acceso válido hasta ${new Date(ta.expiration).toLocaleString("es-AR")}.`);
  } catch (err) {
    add("wsaa", "Autenticación WSAA", "error", errMsg(err));
  }

  // 5. Numeración — FECompUltimoAutorizado para Factura B del punto de venta.
  if (authOk) {
    try {
      const last = await getLastAuthorizedNumber(cfg.pointOfSale, 6);
      add("numeracion", "Numeración (último autorizado)", "ok",
        `Última Factura B autorizada en el pto. ${cfg.pointOfSale}: N° ${last}. La próxima será ${last + 1}.`);
    } catch (err) {
      add("numeracion", "Numeración (último autorizado)", "error", errMsg(err));
    }
  } else {
    add("numeracion", "Numeración (último autorizado)", "skip", "Se omite: primero hay que autenticar en WSAA.");
  }

  const ok = steps.every((s) => s.status === "ok" || s.status === "skip");
  return { env: cfg.env, ok, steps };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// WSFE — CAE
// ---------------------------------------------------------------------------

export async function getLastAuthorizedNumber(pointOfSale: number, invoiceType: number): Promise<number> {
  const creds = requireCreds();
  const ta = await getValidTA();
  const cab: FeCabecera = { cuit: creds.cuit, pointOfSale, invoiceType };
  const url = creds.env === "produccion" ? WSFE_URLS.produccion : WSFE_URLS.homologacion;
  return parseUltimoAutorizado(await callWsfe(url, "FECompUltimoAutorizado", buildUltimoAutorizadoEnvelope(ta, cab)));
}

/**
 * Solicita el CAE de una factura y, si AFIP la aprueba, escribe cae/venc/número
 * en la factura local. Lanza con el detalle de AFIP si la rechaza.
 */
export async function requestCae(input: CaeRequestInput): Promise<CaeSuccessDto> {
  const creds = requireCreds();
  const ta = await getValidTA();
  const url = creds.env === "produccion" ? WSFE_URLS.produccion : WSFE_URLS.homologacion;
  const cab: FeCabecera = { cuit: creds.cuit, pointOfSale: creds.pointOfSale, invoiceType: input.invoiceType };

  // Numeración: último autorizado por AFIP + 1 (fuente de verdad).
  const last = parseUltimoAutorizado(
    await callWsfe(url, "FECompUltimoAutorizado", buildUltimoAutorizadoEnvelope(ta, cab)),
  );
  const invoiceNumber = last + 1;

  const { docType, docNumber } = receptorDocType(input.clientCuit);
  const cbte: FeComprobante = {
    concepto: input.concepto ?? 1,
    docType,
    docNumber,
    invoiceNumber,
    date: input.date ? new Date(input.date) : new Date(),
    impNeto: input.net,
    impIva: input.iva,
    impTotal: input.total,
    items: input.items,
    cbtesAsoc: input.cbtesAsoc,
  };

  const result = parseFECAEResponse(await callWsfe(url, "FECAESolicitar", buildFECAESolicitarEnvelope(ta, cab, cbte)));
  if (!result.ok) {
    const detail = [...result.errors, ...result.observations].map((m) => `[${m.code}] ${m.msg}`).join("; ");
    throw new Error(`AFIP rechazó el comprobante: ${detail || "sin detalle"}`);
  }

  const number = `${String(creds.pointOfSale).padStart(5, "0")}-${String(result.invoiceNumber).padStart(8, "0")}`;
  dbRun(
    "UPDATE invoices SET cae = ?, cae_expiry = ?, number = ?, status = 'autorizada', point_of_sale = ? WHERE id = ?",
    [result.cae, result.caeExpiration, number, String(creds.pointOfSale).padStart(5, "0"), input.invoiceId],
  );

  // QR oficial de AFIP (RG 4892) para el comprobante impreso.
  const qrUrl = buildAfipQrUrl({
    fecha: (input.date ? new Date(input.date) : new Date()).toISOString().slice(0, 10),
    cuit: Number(creds.cuit),
    ptoVta: creds.pointOfSale,
    tipoCmp: input.invoiceType,
    nroCmp: result.invoiceNumber,
    importe: input.total,
    tipoDocRec: docType,
    nroDocRec: Number(docNumber) || 0,
    codAut: Number(result.cae),
  });
  let qrDataUrl = "";
  try { qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 180 }); } catch { /* sin QR si falla */ }

  return {
    ok: true,
    cae: result.cae,
    caeExpiration: result.caeExpiration,
    number,
    invoiceNumber: result.invoiceNumber,
    observations: result.observations,
    qrUrl,
    qrDataUrl,
  };
}

// ---------------------------------------------------------------------------
// Modo offline — facturas "pendiente de CAE" y reintento
// ---------------------------------------------------------------------------

/**
 * Arma el CaeRequestInput leyendo la factura, sus ítems y el cliente. Resuelve
 * el código AFIP según tipo + condición de IVA del cliente, valida la
 * coherencia (A/B/C) y, para NC/ND, busca la factura asociada en document_links.
 */
export function buildCaeInputFromInvoice(invoiceId: string): CaeRequestInput {
  const inv = dbGet<{ subtotal: number; iva_amount: number; total: number; tipo: string; client_id: string; date: string }>(
    "SELECT subtotal, iva_amount, total, tipo, client_id, date FROM invoices WHERE id = ?", [invoiceId],
  );
  if (!inv) throw new Error(`No existe la factura ${invoiceId}.`);
  const items = dbAll<{ iva_pct: number; subtotal: number }>(
    "SELECT iva_pct, subtotal FROM invoice_items WHERE invoice_id = ?", [invoiceId],
  );
  const client = inv.client_id
    ? dbGet<{ cuit: string; fiscal_type: string }>("SELECT cuit, fiscal_type FROM clients WHERE id = ?", [inv.client_id])
    : undefined;

  const tipo = String(inv.tipo || "B");
  const invalid = validateVoucherForClient(tipo, client?.fiscal_type, client?.cuit);
  if (invalid) throw new Error(invalid);

  return {
    invoiceId,
    invoiceType: resolveVoucherTypeCode(tipo, client?.fiscal_type),
    clientCuit: client?.cuit ?? "",
    date: inv.date || undefined,
    net: inv.subtotal,
    iva: inv.iva_amount,
    total: inv.total,
    items: items.map((it) => ({ ivaRate: Number(it.iva_pct) || 0, subtotal: Number(it.subtotal) || 0 })),
    cbtesAsoc: requiresAssociatedInvoice(tipo)
      ? [buildAssociatedVoucher(invoiceId, client?.fiscal_type)]
      : undefined,
  };
}

/**
 * Factura original asociada a una NC/ND (vía document_links invoice → invoice),
 * en el formato CbteAsoc de WSFE. Exige que exista y que ya tenga CAE.
 */
function buildAssociatedVoucher(invoiceId: string, clientFiscalType: string | undefined):
  { tipo: number; ptoVta: number; nro: number; cuit: string } {
  const orig = dbGet<{ tipo: string; number: string; point_of_sale: string; cae: string | null }>(
    `SELECT i.tipo, i.number, i.point_of_sale, i.cae
     FROM document_links l JOIN invoices i ON i.id = l.source_id
     WHERE l.target_type = 'invoice' AND l.target_id = ? AND l.source_type = 'invoice'
     ORDER BY l.created_at DESC LIMIT 1`,
    [invoiceId],
  );
  if (!orig) {
    throw new Error('La nota de crédito/débito debe estar asociada a la factura original: usá "Traer factura" en el formulario.');
  }
  if (!orig.cae) {
    throw new Error(`La factura asociada ${orig.number} no tiene CAE: autorizala en AFIP antes de emitir la nota de crédito/débito.`);
  }
  const nro = parseInt(String(orig.number).split("-").pop() ?? "", 10);
  if (!Number.isFinite(nro) || nro <= 0) {
    throw new Error(`No se pudo leer el número de la factura asociada ("${orig.number}").`);
  }
  const cfg = readConfigMap();
  return {
    tipo: resolveVoucherTypeCode(String(orig.tipo || "B"), clientFiscalType),
    ptoVta: parseInt(String(orig.point_of_sale), 10) || 1,
    nro,
    cuit: cfg.afip_cuit ?? "",
  };
}

/** Deja la factura en "pendiente de CAE" (sólo si aún no tiene CAE). */
export function markInvoicePendingCae(invoiceId: string): void {
  dbRun(
    "UPDATE invoices SET status = 'pendiente_cae' WHERE id = ? AND (cae IS NULL OR cae = '')",
    [invoiceId],
  );
}

/** Facturas que quedaron esperando CAE por falta de conexión. */
export function getPendingCaeInvoices(): Array<{ id: string; number: string; total: number }> {
  return dbAll<{ id: string; number: string; total: number }>(
    "SELECT id, number, total FROM invoices WHERE status = 'pendiente_cae' ORDER BY created_at",
  );
}

export interface RetryPendingResult {
  authorized: number;
  stillPending: number;
  rejected: Array<{ invoiceId: string; error: string }>;
}

/**
 * Reintenta pedir CAE para todas las facturas "pendiente_cae". Si AFIP sigue
 * inaccesible corta y deja el resto pendiente; los rechazos reales se informan
 * (la factura queda pendiente para que el operador la corrija o anule).
 */
export async function retryPendingCae(): Promise<RetryPendingResult> {
  const result: RetryPendingResult = { authorized: 0, stillPending: 0, rejected: [] };
  const pending = getPendingCaeInvoices();
  for (let i = 0; i < pending.length; i++) {
    try {
      await requestCae(buildCaeInputFromInvoice(pending[i].id));
      result.authorized++;
    } catch (err) {
      if (isAfipUnavailable(err)) {
        // Sin conexión: no tiene sentido seguir con las demás.
        result.stillPending = pending.length - i;
        break;
      }
      result.rejected.push({
        invoiceId: pending[i].id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}
