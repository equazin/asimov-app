/**
 * Utilidades compartidas por los handlers IPC modulares.
 *
 * `ipc.ts` histórico creció a 1170L con 123 handlers. La estrategia de refactor
 * es extraer los grupos autocontenidos (afip, air, wa, dolar, app/shell/print)
 * a este directorio, dejando `src/ipc.ts` como orquestador que sigue definiendo
 * los `db:*` (mayoría) hasta que se haga la partición por dominio ERP.
 */
import type { BrowserWindow } from "electron";
import type { SessionUser } from "../auth";
import { isCloudConnected } from "../api-client";
import { enqueueChange } from "../sync";
import type { ShellBackground } from "../config";

export interface IpcDeps {
  getMainWindow: () => BrowserWindow | null;
  getCurrentUser?: () => SessionUser | null;
}

/** Sanea strings de payloads IPC — trim + tope de longitud para no romper la DB. */
export function safeStr(v: unknown, max = 500): string {
  return String(v ?? "").slice(0, max).trim();
}

/**
 * Encola un cambio (create/update/delete) sólo si hay sesión cloud activa y hay
 * id válido. Absorbe cualquier error de la cola para no romper el flujo local
 * (offline-first).
 */
export function enqueueIfCloud(
  entity: string,
  id: string,
  action: "create" | "update" | "delete",
  payload?: Record<string, unknown>,
): void {
  if (!isCloudConnected() || !id) return;
  try {
    enqueueChange(entity, id, action, payload);
  } catch {
    // best-effort
  }
}

/** Respuesta estándar cuando un handler requiere admin y el usuario no lo es. */
export const DENY_ADMIN = {
  ok: false as const,
  error: "Solo un administrador puede realizar esta acción.",
} as const;

/** Fabrica el checker de rol admin usando el getter que expone el shell. */
export function makeIsAdmin(deps: IpcDeps): () => boolean {
  return () => ["admin", "owner", "superadmin"].includes(
    String(deps.getCurrentUser?.()?.role ?? "").toLowerCase(),
  );
}

/** Normaliza el payload de fondo del shell (color hex o path de imagen). */
export function normalizeShellBackground(raw: unknown): ShellBackground {
  const data = (raw ?? {}) as { type?: unknown; value?: unknown };
  const type = String(data.type ?? "default");
  const value = String(data.value ?? "").trim();
  if (type === "color" && /^#[0-9a-f]{6}$/i.test(value)) return { type: "color", value };
  if (type === "image" && value) return { type: "image", value };
  return { type: "default", value: "" };
}
