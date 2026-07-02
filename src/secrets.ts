/**
 * Cifrado de secretos en reposo (credenciales de integraciones) usando el
 * `safeStorage` de Electron, que respalda la clave en el llavero del sistema
 * operativo (DPAPI en Windows, Keychain en macOS, libsecret en Linux).
 *
 * Formato almacenado: `enc:v1:<base64>`. Los valores sin ese prefijo se tratan
 * como texto plano heredado (migración transparente: se leen tal cual y quedan
 * cifrados la próxima vez que se guardan). Si el SO no ofrece cifrado disponible,
 * se degrada a texto plano para no romper la app, pero nunca se pierde el valor.
 */
import { safeStorage } from "electron";

const ENC_PREFIX = "enc:v1:";

/** Cifra un secreto para guardarlo en disco. Cadena vacía → cadena vacía. */
export function encryptSecret(plain: string): string {
  const value = String(plain ?? "");
  if (!value) return "";
  try {
    if (!safeStorage.isEncryptionAvailable()) return value;
    return ENC_PREFIX + safeStorage.encryptString(value).toString("base64");
  } catch {
    // Ante cualquier fallo del backend de cifrado, no perder el dato.
    return value;
  }
}

/** Descifra un secreto leído de disco. Acepta valores heredados en texto plano. */
export function decryptSecret(stored: string): string {
  const value = String(stored ?? "");
  if (!value) return "";
  if (!value.startsWith(ENC_PREFIX)) return value; // texto plano heredado
  try {
    const buf = Buffer.from(value.slice(ENC_PREFIX.length), "base64");
    return safeStorage.decryptString(buf);
  } catch {
    return "";
  }
}

/** True si el valor ya está cifrado con este esquema. */
export function isEncrypted(stored: string): boolean {
  return String(stored ?? "").startsWith(ENC_PREFIX);
}
