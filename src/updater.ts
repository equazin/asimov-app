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

export function initAutoUpdater(): void {
  // Carga perezosa: electron-updater sólo tiene sentido empaquetado.
  let autoUpdater: typeof import("electron-updater").autoUpdater;
  try {
    autoUpdater = require("electron-updater").autoUpdater;
  } catch {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", (info) => {
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
        if (result.response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (err) => {
    // No interrumpir al usuario por fallos de update; sólo log.
    console.error("[auto-update] error:", err?.message ?? err);
  });

  try {
    void autoUpdater.checkForUpdates();
  } catch (err) {
    console.error("[auto-update] check failed:", err);
  }

  // Re-chequear cada 6 horas mientras la app esté abierta.
  setInterval(() => {
    if (!app.isPackaged) return;
    void autoUpdater.checkForUpdates().catch(() => {});
  }, 6 * 60 * 60 * 1000);
}
