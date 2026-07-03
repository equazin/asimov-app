/**
 * Harness de validación de CSP bajo Electron real, UNA página por proceso
 * (crear varias ventanas seguidas es inestable en entornos headless).
 *
 * Para la página indicada:
 *   - la carga con su preload (solo contextBridge, sin DB nativa),
 *   - captura violaciones de Content-Security-Policy (vía console-message),
 *   - cuenta atributos de evento inline en el DOM (onclick, …), que es lo que
 *     `script-src` sin 'unsafe-inline' bloquearía.
 *
 * Uso:  npx electron scripts/verify-csp.js <archivo.html> <preload.js>
 * Salida: línea "RESULT <html> csp=<n> inline=<n>" y exit 0 si ambos son 0.
 */
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu");

const DIST = path.join(__dirname, "..", "dist");
const html = process.argv[2];
const preload = process.argv[3];

const stub = (ch, val) => ipcMain.handle(ch, () => val);
stub("app:version", "test-9.9.9");
stub("auth:current", { id: "u1", name: "admin", email: "a@b.c", role: "admin" });
stub("shell:prefs:get", { background: { type: "default", value: "" }, bookmarks: [] });
stub("db:kpis", {});
["db:clients:list", "db:suppliers:list", "db:articles:list", "air:enabled"].forEach((ch) => stub(ch, []));

app.whenReady().then(async () => {
  const violations = [];
  const opts = { show: false, webPreferences: { contextIsolation: true, sandbox: false, nodeIntegration: false } };
  if (preload) opts.webPreferences.preload = path.join(DIST, preload);
  const win = new BrowserWindow(opts);
  win.webContents.on("console-message", (_e, _lvl, message) => {
    if (/Content Security Policy|Refused to (execute|apply|load|run)/i.test(message)) {
      violations.push(message.split("\n")[0].slice(0, 140));
    }
  });

  let inline = -1;
  try {
    await win.loadFile(path.join(DIST, html));
    await new Promise((r) => setTimeout(r, 400));
    inline = await win.webContents.executeJavaScript(
      `document.querySelectorAll('[onclick],[oninput],[onchange],[onsubmit],[onkeydown],[onkeyup],[onmouseover],[onmouseout],[onfocus],[onblur]').length`,
    );
  } catch (err) {
    console.log(`RESULT ${html} ERROR ${err && err.message}`);
    return app.exit(1);
  }

  console.log(`RESULT ${html} csp=${violations.length} inline=${inline}`);
  violations.slice(0, 4).forEach((v) => console.log(`   · ${v}`));
  app.exit(violations.length === 0 && inline === 0 ? 0 : 2);
});
