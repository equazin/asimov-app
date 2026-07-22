import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Normaliza CRLF: en Windows con core.autocrlf el checkout usa \r\n y las
// comparaciones literales multi-línea fallarían aunque el código sea correcto.
const source = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8").replace(/\r\n/g, "\n");
const smoke = readFileSync(resolve(process.cwd(), "scripts/smoke-test.js"), "utf8").replace(/\r\n/g, "\n");

describe("errores durante el arranque", () => {
  it("muestra el error y cierra la aplicación en vez de dejar un proceso sin ventana", () => {
    expect(source).toContain('console.error("[startup] Asimov no pudo iniciar:", error)');
    expect(source).toContain('dialog.showErrorBox(\n      "Asimov no pudo iniciar"');
    expect(source).toContain("app.quit();");
  });

  it("el smoke test exige que la ventana de ingreso llegue a mostrarse", () => {
    expect(source).toContain('console.log("[startup] window-ready:login")');
    expect(smoke).toContain('stdout.includes("[startup] window-ready:login")');
    expect(smoke).toContain("la app quedó activa pero no mostró la ventana de ingreso");
  });
});
