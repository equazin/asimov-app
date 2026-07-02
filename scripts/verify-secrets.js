/**
 * Verificación del cifrado de secretos (secrets.ts) contra un `safeStorage`
 * simulado. Corre bajo Node puro:  node scripts/verify-secrets.js
 */
const Module = require("node:module");
const os = require("node:os");

// safeStorage falso: cifrado simétrico trivial para ejercitar el round-trip.
const fakeSafe = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from("FAKE:" + s, "utf8"),
  decryptString: (b) => Buffer.from(b).toString("utf8").replace(/^FAKE:/, ""),
};
const fakeElectron = { safeStorage: fakeSafe, app: { getPath: () => os.tmpdir() } };
const origLoad = Module._load;
Module._load = function (request) {
  if (request === "electron") return fakeElectron;
  return origLoad.apply(this, arguments);
};

const { encryptSecret, decryptSecret, isEncrypted } = require("../dist/secrets.js");

const checks = [];
const check = (name, cond) => checks.push({ name, ok: !!cond });

const enc = encryptSecret("s3cr3t-air");
check("cifra con prefijo enc:v1: y no es texto plano", enc.startsWith("enc:v1:") && enc !== "s3cr3t-air");
check("descifra al valor original", decryptSecret(enc) === "s3cr3t-air");
check("texto plano heredado se lee tal cual (migración)", decryptSecret("clave-vieja-plana") === "clave-vieja-plana");
check("vacío ida y vuelta", encryptSecret("") === "" && decryptSecret("") === "");
check("isEncrypted distingue cifrado de plano", isEncrypted(enc) === true && isEncrypted("plano") === false);

// Sin cifrado disponible en el SO → degrada a texto plano sin perder el dato.
fakeSafe.isEncryptionAvailable = () => true; // restore just in case
const encNoBackend = (() => {
  fakeSafe.isEncryptionAvailable = () => false;
  const r = encryptSecret("sin-backend");
  fakeSafe.isEncryptionAvailable = () => true;
  return r;
})();
check("sin backend de cifrado degrada a texto plano (no pierde el dato)",
  encNoBackend === "sin-backend" && decryptSecret(encNoBackend) === "sin-backend");

let allOk = true;
for (const c of checks) { console.log((c.ok ? "  ok  " : " FAIL ") + c.name); if (!c.ok) allOk = false; }
console.log(allOk ? "VERIFY OK" : "VERIFY FAILED");
process.exit(allOk ? 0 : 1);
