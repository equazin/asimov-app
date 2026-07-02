/**
 * Verificación de la autenticación (auth.js) contra una DB temporal aislada.
 *   node scripts/verify-auth.js
 */
const Module = require("node:module");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asimov-verify-"));
const fakeElectron = { app: { getPath: () => tmp } };
const origLoad = Module._load;
Module._load = function (request) {
  if (request === "electron") return fakeElectron;
  return origLoad.apply(this, arguments);
};

const { initDb, getDb } = require("../dist/db.js");
const auth = require("../dist/auth.js");

initDb();

const checks = [];
const check = (name, cond) => { checks.push({ name, ok: !!cond }); };

// ── Hash / verify ─────────────────────────────────────────────────────
const h = auth.hashPassword("secreto123");
check("hash tiene formato scrypt$salt$hash", /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/.test(h));
check("verify acepta la correcta", auth.verifyPassword("secreto123", h) === true);
check("verify rechaza la incorrecta", auth.verifyPassword("otra", h) === false);
check("dos hashes de la misma clave difieren (salt)", auth.hashPassword("x") !== auth.hashPassword("x"));
check("verify rechaza hash inválido", auth.verifyPassword("x", "no-es-hash") === false);

// ── Seed admin ────────────────────────────────────────────────────────
const seeded = auth.seedDefaultAdmin();
check("seedDefaultAdmin siembra en DB vacía", seeded === true);
check("seedDefaultAdmin es idempotente", auth.seedDefaultAdmin() === false);
const adminCount = getDb().prepare("SELECT COUNT(*) c FROM users").get().c;
check("hay exactamente 1 usuario tras seed", adminCount === 1);
check("el admin NO tiene la clave en texto plano",
  getDb().prepare("SELECT password_hash FROM users").get().password_hash.startsWith("scrypt$"));

// ── Authenticate ──────────────────────────────────────────────────────
check("login por nombre + clave correcta", !!auth.authenticate("admin", "asimov"));
check("login por email + clave correcta", !!auth.authenticate("admin@asimov.local", "asimov"));
check("login case-insensitive", !!auth.authenticate("ADMIN", "asimov"));
check("login rechaza clave incorrecta", auth.authenticate("admin", "mala") === null);
check("login rechaza usuario inexistente", auth.authenticate("nadie", "asimov") === null);
const u = auth.authenticate("admin", "asimov");
check("sesión incluye rol admin y no expone el hash", u.role === "admin" && u.password_hash === undefined);

// ── setUserPassword ───────────────────────────────────────────────────
auth.setUserPassword(u.id, "nueva-clave");
check("tras cambiar clave, la vieja ya no sirve", auth.authenticate("admin", "asimov") === null);
check("tras cambiar clave, la nueva sirve", !!auth.authenticate("admin", "nueva-clave"));

// ── Usuario inactivo no puede loguear ─────────────────────────────────
getDb().prepare("UPDATE users SET active = 0 WHERE name = 'admin'").run();
check("usuario inactivo no puede loguear", auth.authenticate("admin", "nueva-clave") === null);

let allOk = true;
for (const c of checks) { console.log((c.ok ? "  ok  " : " FAIL ") + c.name); if (!c.ok) allOk = false; }
console.log(allOk ? "VERIFY OK" : "VERIFY FAILED");
process.exit(allOk ? 0 : 1);
