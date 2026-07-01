/**
 * Auto-actualización (electron-updater).
 *
 * Sólo se activa en builds empaquetados y firmados. El canal de releases se
 * configura en electron-builder.yml (`publish`). Al iniciar, chequea updates
 * y los descarga/aplica en background, notificando al usuario.
 *
 * NOTA: requiere publicar releases (GitHub/S3) y firma de código para que
 * Windows no bloquee el instalador. Hasta configurar `publish`, este módulo
 * no hace nada dañino: loguea y sale si no hay feed.
 */
import { app, dialog } from "electron";
import { notifyUpdateAvailable } from "./tray";

type AU = typeof import("electron-updater").autoUpdater;
let _au: AU | null = null;

export function initAutoUpdater(): void {
  try {
    _au = require("electron-updater").autoUpdater;
  } catch {
    return;
  }

  _au!.autoDownload = true;
  _au!.autoInstallOnAppQuit = true;

  _au!.on("update-downloaded", (info: { version: string }) => {
    notifyUpdateAvailable(info.version);
    void dialog
      .showMessageBox({
        type: "info",
        buttons: ["Reiniciar ahora", "Más tarde"],
        defaultId: 0,
        title: "Actualización disponible",
        message: `Asimov ${info.version} está listo para instalarse.`,
        detail: "La nueva versión se aplicará al reiniciar la aplicación.",
      })
      .then((result) => {
        if (result.response === 0) _au!.quitAndInstall();
      });
  });

  _au!.on("error", (err: Error) => {
    console.error("[auto-update] error:", err?.message ?? err);
  });

  try {
    void _au!.checkForUpdates();
  } catch (err) {
    console.error("[auto-update] check failed:", err);
  }

  setInterval(() => {
    if (!app.isPackaged) return;
    void _au!.checkForUpdates().catch(() => {});
  }, 6 * 60 * 60 * 1000);
}

export async function checkForUpdateManual(): Promise<{ status: string; version?: string }> {
  if (!app.isPackaged) {
    return { status: "dev", version: app.getVersion() };
  }
  if (!_au) {
    return { status: "unavailable" };
  }
  try {
    const result = await _au.checkForUpdates();
    if (result?.updateInfo?.version && result.updateInfo.version !== app.getVersion()) {
      return { status: "available", version: result.updateInfo.version };
    }
    return { status: "up-to-date", version: app.getVersion() };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", version: msg };
  }
}
