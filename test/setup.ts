/**
 * Setup global de Vitest: mockea `electron` para que los módulos de negocio
 * (db.ts, secrets.ts, …) corran bajo Node puro. Cada archivo de test recibe su
 * propio directorio temporal (aislamiento entre archivos) y un `safeStorage`
 * simulado con un cifrado simétrico trivial para ejercitar el round-trip real.
 */
import { vi } from "vitest";

vi.mock("electron", () => {
  const os = require("node:os");
  const fs = require("node:fs");
  const path = require("node:path");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asimov-vitest-"));
  return {
    app: { getPath: () => tmpDir },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from("FAKE:" + s, "utf8"),
      decryptString: (b: Buffer) => Buffer.from(b).toString("utf8").replace(/^FAKE:/, ""),
    },
  };
});
