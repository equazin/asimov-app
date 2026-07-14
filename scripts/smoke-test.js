/**
 * Smoke test: verifica que la app Electron arranca sin crashear.
 *
 * Uso: node scripts/smoke-test.js
 *
 * - Lanza la app en modo dev
 * - Espera a que el proceso principal se estabilice (5s)
 * - Verifica que no haya crashes (exit code 0 del proceso)
 * - Sale con código 0 (ok) o 1 (fallo)
 *
 * Pensado para correr en CI o en una VM limpia antes de publicar.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TIMEOUT_MS = 15000;
const SETTLE_MS = 5000;

const electronPath = require("electron");
const appPath = path.join(__dirname, "..");
// Aísla el lock de instancia y la base de prueba de cualquier Asimov instalado
// que el operador tenga abierto mientras se valida una versión nueva.
const smokeUserData = fs.mkdtempSync(path.join(os.tmpdir(), "asimov-smoke-"));

console.log("[smoke-test] Lanzando Electron...");
console.log(`  electron: ${electronPath}`);
console.log(`  app: ${appPath}`);

const child = spawn(String(electronPath), [`--user-data-dir=${smokeUserData}`, appPath], {
  env: { ...process.env, BARTEZ_DEV: "1", ASIMOV_SMOKE_TEST: "1", ELECTRON_NO_ATTACH_CONSOLE: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

let stdout = "";
let windowReady = false;
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
  if (stdout.includes("[startup] window-ready:login")) windowReady = true;
});

let exited = false;
let requestedShutdown = false;
let failure = "";
child.on("exit", (code, signal) => {
  exited = true;
  if (code !== null && code !== 0) {
    console.error(`[smoke-test] FALLO: la app salió con código ${code}`);
    if (stderr) console.error("[smoke-test] stderr:", stderr.slice(0, 2000));
    process.exit(1);
  }
  if (code === 0 && !requestedShutdown) {
    failure = "la app se cerró antes de completar la verificación de la ventana";
  }
  if (signal && !requestedShutdown) {
    console.error(`[smoke-test] FALLO: la app fue terminada por señal ${signal}`);
    process.exit(1);
  }
});

// Esperar a que se estabilice, luego matar limpiamente
setTimeout(() => {
  if (exited) return;
  if (!windowReady) {
    failure = "la app quedó activa pero no mostró la ventana de ingreso";
    console.error(`[smoke-test] FALLO: ${failure}`);
    if (stderr) console.error("[smoke-test] stderr:", stderr.slice(0, 2000));
    requestedShutdown = true;
    child.kill("SIGTERM");
    return;
  }
  console.log(`[smoke-test] App estable después de ${SETTLE_MS}ms. Cerrando...`);
  requestedShutdown = true;
  child.kill("SIGTERM");
  setTimeout(() => {
    if (!exited) {
      console.log("[smoke-test] Forzando cierre...");
      child.kill("SIGKILL");
    }
  }, 3000);
}, SETTLE_MS);

// Timeout global
setTimeout(() => {
  if (!exited) {
    console.error(`[smoke-test] TIMEOUT: la app no respondió en ${TIMEOUT_MS}ms`);
    child.kill("SIGKILL");
    process.exit(1);
  }
}, TIMEOUT_MS);

child.on("close", () => {
  try { fs.rmSync(smokeUserData, { recursive: true, force: true }); } catch { /* best-effort */ }
  if (!exited) exited = true;
  if (failure) {
    console.error(`[smoke-test] FALLO: ${failure}`);
    process.exit(1);
  }
  if (stderr.toLowerCase().includes("error") || stderr.toLowerCase().includes("crash")) {
    console.warn("[smoke-test] Advertencia: stderr contiene errores:");
    console.warn(stderr.slice(0, 1000));
  }
  console.log("[smoke-test] OK: la app arrancó y cerró sin crashes.");
  process.exit(0);
});
