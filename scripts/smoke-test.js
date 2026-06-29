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
const path = require("node:path");

const TIMEOUT_MS = 15000;
const SETTLE_MS = 5000;

const electronPath = require("electron");
const appPath = path.join(__dirname, "..");

console.log("[smoke-test] Lanzando Electron...");
console.log(`  electron: ${electronPath}`);
console.log(`  app: ${appPath}`);

const child = spawn(String(electronPath), [appPath], {
  env: { ...process.env, BARTEZ_DEV: "1", ELECTRON_NO_ATTACH_CONSOLE: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

let stdout = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});

let exited = false;
child.on("exit", (code, signal) => {
  exited = true;
  if (code !== null && code !== 0) {
    console.error(`[smoke-test] FALLO: la app salió con código ${code}`);
    if (stderr) console.error("[smoke-test] stderr:", stderr.slice(0, 2000));
    process.exit(1);
  }
  if (signal) {
    console.error(`[smoke-test] FALLO: la app fue terminada por señal ${signal}`);
    process.exit(1);
  }
});

// Esperar a que se estabilice, luego matar limpiamente
setTimeout(() => {
  if (exited) return;
  console.log(`[smoke-test] App estable después de ${SETTLE_MS}ms. Cerrando...`);
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
  if (!exited) exited = true;
  if (stderr.toLowerCase().includes("error") || stderr.toLowerCase().includes("crash")) {
    console.warn("[smoke-test] Advertencia: stderr contiene errores:");
    console.warn(stderr.slice(0, 1000));
  }
  console.log("[smoke-test] OK: la app arrancó y cerró sin crashes.");
  process.exit(0);
});
