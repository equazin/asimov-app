/**
 * Autenticación local de Asimov.
 *
 * Hash de contraseñas con scrypt (incluido en Node, sin dependencias nuevas).
 * Formato almacenado: `scrypt$<saltHex>$<hashHex>`. La verificación usa
 * comparación de tiempo constante. Antes no había auth: cualquiera que abría la
 * app veía toda la información financiera, y `password_hash` nunca se escribía.
 */
import { dbGet, dbRun } from "./db";
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";

const SCRYPT_KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  let actual: Buffer;
  try {
    actual = scryptSync(plain, salt, expected.length);
  } catch {
    return false;
  }
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** Autentica por nombre o email (case-insensitive). Devuelve el usuario o null. */
export function authenticate(identifier: string, password: string): SessionUser | null {
  const id = String(identifier ?? "").trim();
  const pass = String(password ?? "");
  if (!id || !pass) return null;

  const row = dbGet<{ id: string; name: string; email: string; role: string; password_hash: string }>(
    `SELECT id, name, email, role, password_hash
       FROM users
      WHERE active = 1 AND (lower(email) = lower(?) OR lower(name) = lower(?))
      LIMIT 1`,
    [id, id],
  );
  if (!row || !verifyPassword(pass, row.password_hash)) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export const DEFAULT_ADMIN = { name: "admin", email: "admin@asimov.local" } as const;

/** Genera una contraseña inicial aleatoria y legible (≈72 bits). */
export function generateInitialPassword(): string {
  return randomBytes(9).toString("base64url");
}

/**
 * Crea un admin por defecto si la tabla de usuarios está vacía, con una
 * contraseña ALEATORIA (no hardcodeada). Devuelve la contraseña en texto plano
 * para que el llamador la muestre una única vez al operador, o null si ya había
 * usuarios (no siembra).
 */
export function seedDefaultAdmin(): string | null {
  const count = dbGet<{ c: number }>("SELECT COUNT(*) c FROM users")?.c ?? 0;
  if (count > 0) return null;
  const password = generateInitialPassword();
  dbRun(
    "INSERT INTO users (id, name, email, role, password_hash, active) VALUES (?,?,?,?,?,1)",
    [randomUUID(), DEFAULT_ADMIN.name, DEFAULT_ADMIN.email, "admin", hashPassword(password)],
  );
  return password;
}

/** Actualiza la contraseña de un usuario existente. */
export function setUserPassword(userId: string, plain: string): void {
  dbRun("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(plain), String(userId)]);
}

/**
 * Asegura que un usuario exista (create-if-missing por email, case-insensitive).
 * No sobrescribe la contraseña si el usuario ya está: permite cambiarla desde la app.
 * Devuelve true si lo creó.
 */
export function ensureUser(user: { name: string; email: string; password: string; role?: string }): boolean {
  const existing = dbGet<{ id: string }>(
    "SELECT id FROM users WHERE lower(email) = lower(?)",
    [user.email],
  );
  if (existing) return false;
  dbRun(
    "INSERT INTO users (id, name, email, role, password_hash, active) VALUES (?,?,?,?,?,1)",
    [randomUUID(), user.name, user.email, user.role ?? "user", hashPassword(user.password)],
  );
  return true;
}
