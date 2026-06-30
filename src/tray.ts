import { app, Menu, nativeImage, Notification, shell, Tray, type BrowserWindow } from "electron";
import * as path from "node:path";
import { getLaunchAtStartup, setLaunchAtStartup } from "./config";

let updateAvailable: string | null = null;
let tray: Tray | null = null;
let quitting = false;

interface TrayDeps {
  getMainWindow: () => BrowserWindow | null;
}

function iconPath(): string {
  return path.join(__dirname, "icon.png");
}

function createTrayIcon() {
  const icon = nativeImage.createFromPath(iconPath());
  if (!icon.isEmpty()) return icon.resize({ width: 18, height: 18 });
  return nativeImage.createEmpty();
}

function showWindow(window: BrowserWindow | null): void {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function applyLaunchAtStartup(enabled: boolean): void {
  if (process.platform !== "win32" && process.platform !== "darwin") return;
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
}

export function isQuitting(): boolean {
  return quitting;
}

export function syncLaunchAtStartup(): void {
  applyLaunchAtStartup(getLaunchAtStartup());
}

export function setLaunchAtStartupEnabled(enabled: boolean): void {
  setLaunchAtStartup(enabled);
  applyLaunchAtStartup(enabled);
  rebuildTrayMenu();
}

let depsRef: TrayDeps | null = null;

export function initTray(deps: TrayDeps): void {
  depsRef = deps;
  if (tray) {
    rebuildTrayMenu();
    return;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip("Asimov ERP");
  tray.on("click", () => showWindow(deps.getMainWindow()));
  rebuildTrayMenu();

  app.on("before-quit", () => {
    quitting = true;
  });
}

export function rebuildTrayMenu(): void {
  if (!tray || !depsRef) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Abrir Asimov",
      click: () => showWindow(depsRef?.getMainWindow() ?? null),
    },
    { type: "separator" },
    {
      label: "Soporte por WhatsApp",
      click: () => void shell.openExternal("https://wa.me/5493416684350"),
    },
    { type: "separator" },
    {
      label: "Abrir al iniciar Windows",
      type: "checkbox",
      checked: getLaunchAtStartup(),
      click: (item) => setLaunchAtStartupEnabled(item.checked),
    },
    { type: "separator" },
    ...(updateAvailable
      ? [{
          label: `Actualización ${updateAvailable} disponible`,
          click: () => {
            try {
              const { autoUpdater } = require("electron-updater");
              autoUpdater.quitAndInstall();
            } catch {}
          },
        }]
      : []),
    {
      label: "Salir",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]));
}

export function notifyUpdateAvailable(version: string): void {
  updateAvailable = version;
  rebuildTrayMenu();
  if (tray) tray.setToolTip(`Asimov - Actualización ${version} lista`);
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: "Asimov",
      body: `Versión ${version} lista para instalar. Reiniciá para actualizar.`,
    });
    notification.show();
  }
}
