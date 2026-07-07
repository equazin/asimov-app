import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, verifyPassword, authenticate, seedDefaultAdmin, setUserPassword } from "../src/auth";
import { getDb } from "../src/db";
import { initTestDb } from "./helpers";

beforeEach(() => initTestDb());

describe("auth — hashing con scrypt", () => {
  it("produce el formato scrypt$salt$hash", () => {
    expect(hashPassword("secreto123")).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  });

  it("verifica la contraseña correcta y rechaza la incorrecta", () => {
    const h = hashPassword("secreto123");
    expect(verifyPassword("secreto123", h)).toBe(true);
    expect(verifyPassword("otra", h)).toBe(false);
  });

  it("usa salt aleatorio (dos hashes de la misma clave difieren)", () => {
    expect(hashPassword("x")).not.toBe(hashPassword("x"));
  });

  it("rechaza un hash con formato inválido", () => {
    expect(verifyPassword("x", "no-es-hash")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });
});

describe("auth — seed de admin", () => {
  it("siembra un admin en DB vacía (devolviendo su clave) y es idempotente", () => {
    const pass = seedDefaultAdmin();
    expect(typeof pass).toBe("string");
    expect((pass as string).length).toBeGreaterThan(8);
    expect(seedDefaultAdmin()).toBeNull(); // ya había usuarios → no siembra
    expect(getDb().prepare("SELECT COUNT(*) c FROM users").get()).toMatchObject({ c: 1 });
  });

  it("genera una clave aleatoria distinta en cada instalación", () => {
    const p1 = seedDefaultAdmin();
    initTestDb(); // limpia usuarios
    const p2 = seedDefaultAdmin();
    expect(p1).not.toBe(p2);
  });

  it("el admin sembrado no guarda la clave en texto plano", () => {
    const pass = seedDefaultAdmin() as string;
    const hash = (getDb().prepare("SELECT password_hash FROM users").get() as any).password_hash;
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain(pass);
  });
});

describe("auth — authenticate", () => {
  let adminPass: string;
  beforeEach(() => { adminPass = seedDefaultAdmin() as string; });

  it("acepta login por nombre, por email y case-insensitive", () => {
    expect(authenticate("admin", adminPass)).toBeTruthy();
    expect(authenticate("admin@asimov.local", adminPass)).toBeTruthy();
    expect(authenticate("ADMIN", adminPass)).toBeTruthy();
  });

  it("rechaza clave incorrecta y usuario inexistente", () => {
    expect(authenticate("admin", "mala")).toBeNull();
    expect(authenticate("nadie", adminPass)).toBeNull();
    expect(authenticate("", "")).toBeNull();
  });

  it("la sesión trae el rol y no expone el hash", () => {
    const u = authenticate("admin", adminPass)!;
    expect(u.role).toBe("admin");
    expect((u as any).password_hash).toBeUndefined();
  });

  it("un usuario inactivo no puede loguear", () => {
    getDb().prepare("UPDATE users SET active = 0 WHERE name = 'admin'").run();
    expect(authenticate("admin", adminPass)).toBeNull();
  });
});

describe("auth — setUserPassword", () => {
  it("cambia la clave: la vieja deja de servir y la nueva funciona", () => {
    const pass = seedDefaultAdmin() as string;
    const u = authenticate("admin", pass)!;
    setUserPassword(u.id, "nueva-clave");
    expect(authenticate("admin", pass)).toBeNull();
    expect(authenticate("admin", "nueva-clave")).toBeTruthy();
  });
});
