/**
 * Handlers IPC de la bandeja de WhatsApp (bot Bartez).
 *
 * `wa:config:get` nunca devuelve el token real; solo el flag `hasToken` para
 * que la UI muestre "configurado / no configurado" sin exponer credenciales.
 */
import { ipcMain } from "electron";
import { dbAll } from "../db";
import {
  getWhatsappConfig,
  isWhatsappEnabled,
  listLocalChats,
  listLocalMessages,
  runWhatsappSync,
  sendMessage as sendWhatsappMessage,
  sendTemplate as sendWhatsappTemplate,
  testWhatsappConnection,
  startWhatsappPoll,
  stopWhatsappPoll,
} from "../whatsapp";
import { safeStr, type IpcDeps } from "./shared";

export function registerWhatsappIpc(_deps: IpcDeps): void {
  ipcMain.handle("wa:config:get", () => {
    // Nunca devolvemos el token: la UI sólo confirma si está seteado.
    const cfg = getWhatsappConfig();
    return {
      enabled: cfg.enabled,
      baseUrl: cfg.baseUrl,
      botPhone: cfg.botPhone,
      pollIntervalMinutes: cfg.pollIntervalMinutes,
      hasToken: cfg.token.length > 0,
    };
  });

  ipcMain.handle("wa:enabled", () => isWhatsappEnabled());

  ipcMain.handle("wa:chats:list", (_event, search: unknown) => listLocalChats(safeStr(search)));

  ipcMain.handle("wa:messages:list", (_event, chatId: unknown) => {
    const id = safeStr(chatId);
    if (!id) return [];
    return listLocalMessages(id);
  });

  ipcMain.handle("wa:messages:send", async (_event, raw: unknown) => {
    const r = (raw ?? {}) as { chatId?: unknown; body?: unknown };
    try {
      const msg = await sendWhatsappMessage(safeStr(r.chatId), safeStr(r.body, 4096));
      return { ok: true, message: msg };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("wa:messages:send-template", async (_event, raw: unknown) => {
    const r = (raw ?? {}) as {
      chatId?: unknown; template?: unknown; languageCode?: unknown;
      bodyParams?: unknown; preview?: unknown;
    };
    try {
      const params = Array.isArray(r.bodyParams)
        ? r.bodyParams.map((p) => safeStr(p, 1024))
        : [];
      const msg = await sendWhatsappTemplate(
        safeStr(r.chatId),
        safeStr(r.template, 512),
        safeStr(r.languageCode, 16) || "es_AR",
        params,
        safeStr(r.preview, 4096),
      );
      return { ok: true, message: msg };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("wa:sync:run", async () => {
    try {
      return await runWhatsappSync();
    } catch (err: unknown) {
      return { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("wa:sync:history", () =>
    dbAll(
      `SELECT id, started_at, finished_at, status, chats_synced, messages_synced, error_message
       FROM wa_sync_runs ORDER BY started_at DESC LIMIT 20`,
    ),
  );

  ipcMain.handle("wa:test-connection", async () => {
    try {
      return await testWhatsappConnection();
    } catch (err: unknown) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("wa:poll:start", () => { startWhatsappPoll(); return { ok: true }; });
  ipcMain.handle("wa:poll:stop", () => { stopWhatsappPoll(); return { ok: true }; });
}
