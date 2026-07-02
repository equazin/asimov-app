import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, verifyPassword, authenticate, seedDefaultAdmin, setUserPassword, DEFAULT_ADMIN } from "../src/auth";
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
  it("siembra un admin en DB vacía y es idempotente", () => {
    expect(seedDefaultAdmin()).toBe(true);
    expect(seedDefaultAdmin()).toBe(false);
    expect(getDb().prepare("SELECT COUNT(*) c FROM users").get()).toMatchObject({ c: 1 });
  });

  it("el admin sembrado no guarda la clave en texto plano", () => {
    seedDefaultAdmin();
    const hash = (getDb().prepare("SELECT password_hash FROM users").get() as any).password_hash;
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain(DEFAULT_ADMIN.password);
  });
});

describe("auth — authenticate", () => {
  beforeEach(() => seedDefaultAdmin());

  it("acepta login por nombre, por email y case-insensitive", () => {
    expect(authenticate("admin", "asimov")).toBeTruthy();
    expect(authenticate("admin@asimov.local", "asimov")).toBeTruthy();
    expect(authenticate("ADMIN", "asimov")).toBeTruthy();
  });

  it("rechaza clave incorrecta y usuario inexistente", () => {
    expect(authenticate("admin", "mala")).toBeNull();
    expect(authenticate("nadie", "asimov")).toBeNull();
    expect(authenticate("", "")).toBeNull();
  });

  it("la sesión trae el rol y no expone el hash", () => {
    const u = authenticate("admin", "asimov")!;
    expect(u.role).toBe("admin");
    expect((u as any).password_hash).toBeUndefined();
  });

  it("un usuario inactivo no puede loguear", () => {
    getDb().prepare("UPDATE users SET active = 0 WHERE name = 'admin'").run();
    expect(authenticate("admin", "asimov")).toBeNull();
  });
});

describe("auth — setUserPassword", () => {
  it("cambia la clave: la vieja deja de servir y la nueva funciona", () => {
    seedDefaultAdmin();
    const u = authenticate("admin", "asimov")!;
    setUserPassword(u.id, "nueva-clave");
    expect(authenticate("admin", "asimov")).toBeNull();
    expect(authenticate("admin", "nueva-clave")).toBeTruthy();
  });
});
