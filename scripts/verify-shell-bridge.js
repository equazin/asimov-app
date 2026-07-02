/**
 * Verifica que el shell principal funciona con contextIsolation:true + sandbox +
 * contextBridge. Arranca Electron real y carga dist/shell.html con dist/preload.js
 * (sin la DB nativa, para aislar la prueba del puente). Comprueba:
 *   - que window.asimov quedó expuesto por el puente,
 *   - que sus métodos existen y son invocables a través del puente,
 *   - que el preload no rompió al exponer la API.
 *
 * Uso:  npx electron scripts/verify-shell-bridge.js
 */
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

const DIST = path.join(__dirname, "..", "dist");

// Stubs mínimos de los handlers que el preload/shell invocan al cargar, para no
// depender de better-sqlite3 ni del resto del backend.
ipcMain.handle("app:version", () => "test-9.9.9");
ipcMain.handle("shell:prefs:get", () => ({ background: { type: "default", value: "" }, bookmarks: [] }));
ipcMain.handle("db:kpis", () => ({}));
ipcMain.handle("auth:current", () => ({ id: "t", name: "Test", email: "", role: "admin" }));

async function run() {
  const bridgeErrors = [];
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(DIST, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.on("console-message", (_e, level, message) => {
    // Solo nos importan errores que delaten fallo del puente/preload.
    if (level >= 3 && /asimov|contextBridge|preload|is not a function|is not defined|Cannot read/i.test(message)) {
      bridgeErrors.push(message);
    }
  });
  win.webContents.on("render-process-gone", (_e, d) => bridgeErrors.push("render-process-gone: " + JSON.stringify(d)));

  await win.loadFile(path.join(DIST, "shell.html"));
  await new Promise((r) => setTimeout(r, 1500));

  const bridge = await win.webContents.executeJavaScript(`(function(){
    var a = window.asimov;
    return {
      type: typeof a,
      isDesktop: !!(a && a.isDesktop),
      hasAppVersion: !!(a && typeof a.appVersion === 'function'),
      hasAnnul: !!(a && typeof a.annulDocument === 'function'),
      hasShell: !!(a && a.shell && typeof a.shell.getPreferences === 'function'),
      hasAuth: !!(a && a.auth && typeof a.auth.current === 'function'),
      hasFormSaved: !!(a && typeof a.onFormSaved === 'function'),
    };
  })()`);

  let version = "";
  let prefsOk = false;
  try {
    version = await win.webContents.executeJavaScript("window.asimov.appVersion()");
    const prefs = await win.webContents.executeJavaScript("window.asimov.shell.getPreferences()");
    prefsOk = !!prefs && typeof prefs === "object" && !!prefs.background;
  } catch (e) {
    bridgeErrors.push("invoke a través del puente falló: " + (e && e.message));
  }

  const checks = [
    ["window.asimov expuesto por contextBridge", bridge.type === "object"],
    ["isDesktop === true a través del puente", bridge.isDesktop === true],
    ["método appVersion disponible", bridge.hasAppVersion === true],
    ["método annulDocument disponible (Fase 1)", bridge.hasAnnul === true],
    ["sub-API shell.getPreferences disponible", bridge.hasShell === true],
    ["sub-API auth.current disponible", bridge.hasAuth === true],
    ["callback onFormSaved disponible", bridge.hasFormSaved === true],
    ["appVersion() resuelve string vía IPC", version === "test-9.9.9"],
    ["shell.getPreferences() resuelve objeto vía IPC", prefsOk === true],
    ["sin errores de puente/preload en el renderer", bridgeErrors.length === 0],
  ];

  let allOk = true;
  for (const [name, ok] of checks) { console.log((ok ? "  ok  " : " FAIL ") + name); if (!ok) allOk = false; }
  if (bridgeErrors.length) console.log("  errores:\n   - " + bridgeErrors.join("\n   - "));
  console.log(allOk ? "VERIFY OK" : "VERIFY FAILED");

  win.destroy();
  app.exit(allOk ? 0 : 1);
}

app.whenReady().then(run).catch((e) => {
  console.error("verify-shell-bridge error:", e);
  app.exit(1);
});
