import { describe, it, expect, vi } from "vitest";
import { safeStorage } from "electron";
import { encryptSecret, decryptSecret, isEncrypted } from "../src/secrets";

describe("secrets — cifrado en reposo", () => {
  it("round-trip: descifrar lo cifrado devuelve el original", () => {
    const enc = encryptSecret("mi-password-air");
    expect(enc).not.toBe("mi-password-air");
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(decryptSecret(enc)).toBe("mi-password-air");
  });

  it("cadena vacía → cadena vacía (no cifra)", () => {
    expect(encryptSecret("")).toBe("");
    expect(decryptSecret("")).toBe("");
  });

  it("valores heredados en texto plano se leen tal cual (migración transparente)", () => {
    expect(decryptSecret("clave-vieja-sin-cifrar")).toBe("clave-vieja-sin-cifrar");
    expect(isEncrypted("clave-vieja-sin-cifrar")).toBe(false);
  });

  it("isEncrypted detecta el prefijo del esquema", () => {
    expect(isEncrypted(encryptSecret("x"))).toBe(true);
    expect(isEncrypted("")).toBe(false);
  });

  it("si el backend de descifrado falla, devuelve cadena vacía (no rompe)", () => {
    const spy = vi.spyOn(safeStorage, "decryptString").mockImplementation(() => { throw new Error("bad cipher"); });
    expect(decryptSecret("enc:v1:AAAA")).toBe("");
    spy.mockRestore();
  });

  it("si el SO no ofrece cifrado, degrada a texto plano sin perder el valor", () => {
    const spy = vi.spyOn(safeStorage, "isEncryptionAvailable").mockReturnValue(false);
    expect(encryptSecret("clave")).toBe("clave");
    spy.mockRestore();
  });
});
