/**
 * Cliente del bot de WhatsApp de Bartez (repo equazin/Bartez-Studio).
 *
 * Habla con el layer `/api/v1/conversations` (auth Bearer sobre `Authorization`)
 * que expone la app admin del CRM. El bot en sí es WhatsApp Cloud API oficial
 * de Meta; los webhooks caen sobre `/api/whatsapp/webhook`, se persisten en
 * los modelos Prisma `WaConversation` + `WaMessage`, y desde ahí `/api/v1`
 * los sirve a Asimov.
 *
 * Contrato v1 (ver Bartez-Studio/app/api/v1/conversations/*):
 *   GET  /api/v1/conversations?limit=N&page=N   → {ok, data:[Conv], meta:{total,page,limit,pages}}
 *   GET  /api/v1/conversations/{waId}           → {ok, data: Conv con messages:[]}
 *   POST /api/v1/conversations/{waId}/messages  {message:"…"} → {ok, data: WaMessage}
 *
 * `waId` es el número WhatsApp E.164 sin '+' (ej. "5493414123456"). Ese mismo
 * valor se usa como id local de la conversación en Asimov.
 *
 * Config cifrada en `system_config` con el mismo patrón que AIR: prefijo `wa_`,
 * token encriptado con Electron safeStorage (ver [[secrets.ts]]).
 */

import * as crypto from "node:crypto";
import { dbAll, dbGet, dbRun } from "./db";
import { decryptSecret } from "./secrets";
import { enqueueChange } from "./sync";

// ─── Configuración ──────────────────────────────────────────────────────────

const DEFAULT_POLL_MINUTES = 1;
const DEFAULT_TIMEOUT_MS = 15_000;

export interface WhatsappConfig {
  enabled: boolean;
  baseUrl: string;
  token: string;
  botPhone: string;
  pollIntervalMinutes: number;
}

/** Lee la configuración del bot desde `system_config` (claves con prefijo `wa_`). */
export function getWhatsappConfig(): WhatsappConfig {
  const rows = dbAll<{ key: string; value: string }>(
    "SELECT key, value FROM system_config WHERE key LIKE 'wa_%' ORDER BY key",
  );
  const cfg: Record<string, string> = {};
  for (const r of rows) cfg[r.key] = r.value;

  return {
    enabled: cfg.wa_enabled === "true" || cfg.wa_enabled === "1",
    baseUrl: (cfg.wa_base_url ?? "").trim().replace(/\/+$/, ""),
    token: decryptSecret(cfg.wa_token ?? ""),
    botPhone: (cfg.wa_bot_phone ?? "").trim(),
    pollIntervalMinutes: Math.max(1, parseInt(cfg.wa_poll_interval ?? String(DEFAULT_POLL_MINUTES), 10) || DEFAULT_POLL_MINUTES),
  };
}

export function isWhatsappEnabled(): boolean {
  return getWhatsappConfig().enabled;
}

export function enqueueWhatsappConfigCloudSync(): void {
  const cfg = getWhatsappConfig();
  enqueueChange("integration_config", "whatsapp", "update", {
    provider: "whatsapp",
    config: {
      enabled: cfg.enabled,
      baseUrl: cfg.baseUrl,
      botPhone: cfg.botPhone,
      pollIntervalMinutes: cfg.pollIntervalMinutes,
      requiresTokenOnDevice: true,
      // NUNCA el token — se sincroniza cifrado por su ruta habitual si existe.
    },
  });
}

// ─── HTTP client ────────────────────────────────────────────────────────────

interface WaHttpOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  timeoutMs?: number;
}

function authHeader(token: string): Record<string, string> {
  // Único lugar donde vive el esquema de auth; se ajusta cuando el bot lo diga.
  return { Authorization: `Bearer ${token}` };
}

async function waHttp<T>(opts: WaHttpOpts): Promise<T> {
  const cfg = getWhatsappConfig();
  if (!cfg.baseUrl) throw new Error("WhatsApp: falta baseUrl en la configuración.");
  if (!cfg.token) throw new Error("WhatsApp: falta token en la configuración.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(cfg.baseUrl + opts.path, {
      method: opts.method ?? "GET",
      headers: {
        ...authHeader(cfg.token),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`WhatsApp ${opts.method ?? "GET"} ${opts.path}: HTTP ${res.status} ${text.slice(0, 180)}`);
    }
    if (!text) return null as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`WhatsApp ${opts.path}: respuesta no-JSON: ${text.slice(0, 160)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

// ─── Contrato remoto — schema de Bartez-Studio Prisma ───────────────────────

/** WaConversation del CRM. `waId` es E.164 sin '+'. */
interface RemoteWaConversation {
  id: string;             // cuid interno del CRM
  waId: string;           // número WhatsApp E.164 sin '+' (el "id de negocio")
  profileName: string | null;
  category: string | null;
  status: string;         // "active" | "archived" | …
  updatedAt: string;
  messages?: RemoteWaMessage[]; // incluido por el server en list (último) y en detail (todos)
}

interface RemoteWaMessage {
  id: string;
  conversationId: string;
  waMessageId: string;
  direction: "inbound" | "outbound";
  type: string;           // "text" | "image" | "audio" | "document" | "video" | …
  body: string | null;
  category: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Envelope estándar del /api/v1 layer. */
interface V1Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  meta?: { total?: number; page?: number; limit?: number; pages?: number };
}

async function v1Get<T>(path: string): Promise<T> {
  const res = await waHttp<V1Envelope<T>>({ path });
  if (!res.ok || res.data === undefined) throw new Error(`Bartez-Studio ${path}: ${res.error ?? "respuesta sin data"}`);
  return res.data;
}

async function v1Post<T>(path: string, body: unknown): Promise<T> {
  const res = await waHttp<V1Envelope<T>>({ method: "POST", path, body });
  if (!res.ok || res.data === undefined) throw new Error(`Bartez-Studio POST ${path}: ${res.error ?? "respuesta sin data"}`);
  return res.data;
}

async function listConversationsRemote(): Promise<RemoteWaConversation[]> {
  // El endpoint devuelve la lista con el último mensaje incluido por conversación.
  return v1Get<RemoteWaConversation[]>("/api/v1/conversations?limit=100&page=1");
}

async function getConversationRemote(waId: string): Promise<RemoteWaConversation> {
  return v1Get<RemoteWaConversation>(`/api/v1/conversations/${encodeURIComponent(waId)}`);
}

async function sendMessageRemote(waId: string, message: string): Promise<RemoteWaMessage> {
  return v1Post<RemoteWaMessage>(
    `/api/v1/conversations/${encodeURIComponent(waId)}/messages`,
    { message },
  );
}

async function sendTemplateRemote(
  waId: string,
  template: string,
  languageCode: string,
  bodyParams: string[],
  preview: string,
): Promise<RemoteWaMessage> {
  return v1Post<RemoteWaMessage>(
    `/api/v1/conversations/${encodeURIComponent(waId)}/template`,
    { template, languageCode, bodyParams, preview },
  );
}

// ─── Mappers al schema local ────────────────────────────────────────────────

/** Preview corto del último mensaje para la lista (imagen/audio → placeholder). */
function messagePreview(m: RemoteWaMessage | undefined): string {
  if (!m) return "";
  if (m.body) return m.body.slice(0, 120);
  if (m.type && m.type !== "text") return `[${m.type}]`;
  return "";
}

function mapConversationForList(c: RemoteWaConversation): RemoteChat {
  const last = c.messages?.[0];
  return {
    id: c.waId,
    phone: c.waId,
    name: c.profileName,
    last_message: messagePreview(last),
    last_message_at: last?.createdAt ?? c.updatedAt,
    unread_count: 0, // el CRM no trackea unreads por ahora — se puede sumar más tarde
    archived: c.status === "archived",
  };
}

function mapMessage(m: RemoteWaMessage): RemoteMessage {
  const kind: RemoteMessage["media_kind"] =
    m.type === "image" || m.type === "audio" || m.type === "document" || m.type === "video"
      ? m.type
      : null;
  return {
    id: m.waMessageId,   // usamos el id upstream de Meta como clave (único global)
    chat_id: m.conversationId, // se sobrescribe abajo con waId (id local)
    direction: m.direction === "outbound" ? "out" : "in",
    body: m.body,
    media_url: null,     // WhatsApp Cloud API entrega media_id, se resuelve URL aparte si hace falta
    media_kind: kind,
    sent_at: m.createdAt,
    status: m.direction === "outbound"
      ? (m.metadata && (m.metadata as Record<string, unknown>).failed ? "failed" : "sent")
      : "received",
  };
}

// Shapes internos que consume el resto del módulo (idénticos a los originales).
interface RemoteChat {
  id: string;
  phone: string;
  name?: string | null;
  avatar_url?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count?: number;
  archived?: boolean;
}

interface RemoteMessage {
  id: string;
  chat_id: string;
  direction: "in" | "out";
  body?: string | null;
  media_url?: string | null;
  media_kind?: "image" | "audio" | "document" | "video" | null;
  sent_at: string;
  status?: string;
}

async function listChatsRemote(): Promise<RemoteChat[]> {
  const convs = await listConversationsRemote();
  return convs.map(mapConversationForList);
}

async function getMessagesRemote(chatId: string, _sinceIso: string | null): Promise<RemoteMessage[]> {
  // El endpoint devuelve la conversación completa con todos los mensajes.
  // El filtro `since` lo hacemos client-side hasta que el CRM lo soporte.
  const conv = await getConversationRemote(chatId);
  const msgs = (conv.messages ?? []).map(mapMessage);
  for (const m of msgs) m.chat_id = conv.waId; // normalizar a waId local
  return _sinceIso ? msgs.filter((m) => m.sent_at > _sinceIso) : msgs;
}

async function sendMessageOverBot(chatId: string, body: string): Promise<RemoteMessage> {
  const m = await sendMessageRemote(chatId, body);
  const mapped = mapMessage(m);
  mapped.chat_id = chatId;
  return mapped;
}

async function sendTemplateOverBot(
  chatId: string,
  template: string,
  languageCode: string,
  bodyParams: string[],
  preview: string,
): Promise<RemoteMessage> {
  const m = await sendTemplateRemote(chatId, template, languageCode, bodyParams, preview);
  const mapped = mapMessage(m);
  mapped.chat_id = chatId;
  return mapped;
}

// ─── Persistencia local ─────────────────────────────────────────────────────

export interface LocalChat {
  id: string;
  phone: string;
  name: string | null;
  client_id: string | null;
  avatar_url: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  archived: number;
  synced_at: string;
}

export interface LocalMessage {
  id: string;
  chat_id: string;
  direction: "in" | "out";
  body: string | null;
  media_url: string | null;
  media_kind: string | null;
  sent_at: string;
  status: string;
}

export function listLocalChats(search: string): LocalChat[] {
  const q = `%${search.trim()}%`;
  const hasSearch = search.trim().length > 0;
  return dbAll<LocalChat>(
    `SELECT id, phone, name, client_id, avatar_url, last_message, last_message_at,
            unread_count, archived, synced_at
     FROM wa_chats
     WHERE archived = 0 ${hasSearch ? "AND (phone LIKE ? OR name LIKE ? OR last_message LIKE ?)" : ""}
     ORDER BY last_message_at DESC NULLS LAST, name`,
    hasSearch ? [q, q, q] : [],
  );
}

export function listLocalMessages(chatId: string, limit = 200): LocalMessage[] {
  return dbAll<LocalMessage>(
    `SELECT id, chat_id, direction, body, media_url, media_kind, sent_at, status
     FROM wa_messages
     WHERE chat_id = ?
     ORDER BY sent_at ASC
     LIMIT ?`,
    [chatId, limit],
  );
}

function upsertChat(c: RemoteChat): void {
  dbRun(
    `INSERT INTO wa_chats (id, phone, name, avatar_url, last_message, last_message_at, unread_count, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       phone = excluded.phone,
       name = COALESCE(excluded.name, wa_chats.name),
       avatar_url = COALESCE(excluded.avatar_url, wa_chats.avatar_url),
       last_message = excluded.last_message,
       last_message_at = excluded.last_message_at,
       unread_count = excluded.unread_count,
       archived = excluded.archived,
       synced_at = datetime('now')`,
    [
      c.id, c.phone, c.name ?? null, c.avatar_url ?? null,
      c.last_message ?? null, c.last_message_at ?? null,
      c.unread_count ?? 0, c.archived ? 1 : 0,
    ],
  );
}

function upsertMessage(m: RemoteMessage, rawJson: string): void {
  dbRun(
    `INSERT INTO wa_messages (id, chat_id, direction, body, media_url, media_kind, sent_at, status, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       body = excluded.body,
       media_url = excluded.media_url,
       media_kind = excluded.media_kind,
       status = excluded.status,
       raw_json = excluded.raw_json`,
    [
      m.id, m.chat_id, m.direction, m.body ?? null,
      m.media_url ?? null, m.media_kind ?? null,
      m.sent_at, m.status ?? "received", rawJson,
    ],
  );
}

// ─── Sync ────────────────────────────────────────────────────────────────────

let syncing = false;

export interface WaSyncResult {
  runId: string;
  chatsSynced: number;
  messagesSynced: number;
  status: "ok" | "error";
  error?: string;
}

export async function runWhatsappSync(): Promise<WaSyncResult> {
  if (!isWhatsappEnabled()) throw new Error("WhatsApp: integración deshabilitada.");
  if (syncing) throw new Error("WhatsApp: ya hay un sync en curso.");
  syncing = true;

  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  dbRun(
    "INSERT INTO wa_sync_runs (id, started_at, status) VALUES (?, ?, 'running')",
    [runId, now],
  );

  let chatsSynced = 0;
  let messagesSynced = 0;

  try {
    const remoteChats = await listChatsRemote();
    for (const rc of remoteChats) {
      upsertChat(rc);
      chatsSynced++;

      // Traer sólo los mensajes nuevos desde el último local conocido.
      const lastLocal = dbGet<{ last: string | null }>(
        "SELECT MAX(sent_at) as last FROM wa_messages WHERE chat_id = ?",
        [rc.id],
      );
      const since = lastLocal?.last ?? null;
      const remoteMsgs = await getMessagesRemote(rc.id, since);
      for (const rm of remoteMsgs) {
        upsertMessage(rm, JSON.stringify(rm));
        messagesSynced++;
      }
    }

    dbRun(
      `UPDATE wa_sync_runs SET status='ok', finished_at=?, chats_synced=?, messages_synced=? WHERE id=?`,
      [new Date().toISOString(), chatsSynced, messagesSynced, runId],
    );
    return { runId, chatsSynced, messagesSynced, status: "ok" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    dbRun(
      `UPDATE wa_sync_runs SET status='error', finished_at=?, chats_synced=?, messages_synced=?, error_message=? WHERE id=?`,
      [new Date().toISOString(), chatsSynced, messagesSynced, message.slice(0, 1000), runId],
    );
    return { runId, chatsSynced, messagesSynced, status: "error", error: message };
  } finally {
    syncing = false;
  }
}

// ─── Envío de mensajes ──────────────────────────────────────────────────────

export async function sendMessage(chatId: string, body: string): Promise<LocalMessage | null> {
  if (!isWhatsappEnabled()) throw new Error("WhatsApp: integración deshabilitada.");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("El mensaje está vacío.");

  const remote = await sendMessageOverBot(chatId, trimmed);
  upsertMessage(remote, JSON.stringify(remote));

  // Actualizar preview del chat con el mensaje recién enviado.
  dbRun(
    `UPDATE wa_chats SET last_message = ?, last_message_at = ?, synced_at = datetime('now') WHERE id = ?`,
    [trimmed.slice(0, 120), remote.sent_at, chatId],
  );

  return dbGet<LocalMessage>(
    `SELECT id, chat_id, direction, body, media_url, media_kind, sent_at, status
     FROM wa_messages WHERE id = ?`,
    [remote.id],
  ) ?? null;
}

/**
 * Envía una plantilla aprobada de WhatsApp — para reabrir chats fuera de la
 * ventana de 24h, donde Meta no permite texto libre.
 */
export async function sendTemplate(
  chatId: string,
  template: string,
  languageCode: string,
  bodyParams: string[],
  preview: string,
): Promise<LocalMessage | null> {
  if (!isWhatsappEnabled()) throw new Error("WhatsApp: integración deshabilitada.");
  const name = template.trim();
  if (!name) throw new Error("Falta la plantilla.");

  const remote = await sendTemplateOverBot(chatId, name, languageCode, bodyParams, preview);
  upsertMessage(remote, JSON.stringify(remote));

  const previewText = (preview || `[plantilla: ${name}]`).slice(0, 120);
  dbRun(
    `UPDATE wa_chats SET last_message = ?, last_message_at = ?, synced_at = datetime('now') WHERE id = ?`,
    [previewText, remote.sent_at, chatId],
  );

  return dbGet<LocalMessage>(
    `SELECT id, chat_id, direction, body, media_url, media_kind, sent_at, status
     FROM wa_messages WHERE id = ?`,
    [remote.id],
  ) ?? null;
}

// ─── Test de conexión ───────────────────────────────────────────────────────

export async function testWhatsappConnection(): Promise<{ ok: boolean; message: string; chatCount?: number }> {
  try {
    const cfg = getWhatsappConfig();
    if (!cfg.baseUrl || !cfg.token) return { ok: false, message: "Faltan URL base y/o token." };
    const chats = await listChatsRemote();
    return { ok: true, message: `Conexión exitosa. ${chats.length} chats en la primera respuesta.`, chatCount: chats.length };
  } catch (err: unknown) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Timer de poll ──────────────────────────────────────────────────────────

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startWhatsappPoll(): void {
  stopWhatsappPoll();
  if (!isWhatsappEnabled()) return;
  const cfg = getWhatsappConfig();
  const ms = cfg.pollIntervalMinutes * 60_000;
  pollInterval = setInterval(() => {
    if (!isWhatsappEnabled()) return;
    runWhatsappSync().catch(() => {
      // Errores ya se persisten en wa_sync_runs.
    });
  }, ms);
}

export function stopWhatsappPoll(): void {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}
