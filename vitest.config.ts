import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      // Capa de lógica de negocio pura/persistencia. Los módulos de integración
      // con Electron (main, ipc, menu, tray, updater, preload) requieren runtime
      // Electron y se cubren con smoke-test + verify-shell-bridge, no con Vitest.
      include: ["src/documents.ts", "src/masters.ts", "src/secrets.ts", "src/auth.ts"],
      reporter: ["text", "text-summary"],
      // TODO(Fase 3): activar el gate 80% al completar la suite (faltan tests de
      // documents/auth/secrets). Hoy solo hay unit tests de masters y air.
      // thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
