import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "src/new-article.html"), "utf8");
const preload = readFileSync(resolve(process.cwd(), "src/new-article-preload.ts"), "utf8");

describe("selector de componentes del esquema", () => {
  it("consulta la misma fuente combinada que la vista de Stock", () => {
    expect(preload).toContain('ipcRenderer.invoke("db:stock:list", search)');
    expect(html).toContain('data-source="\' + escHtml(r.source || "local")');
  });

  it("permite agregar el primer resultado con Enter y muestra errores", () => {
    expect(html).toContain('txtBuscarComp.addEventListener("keydown"');
    expect(html).toContain('if (event.key !== "Enter") return');
    expect(html).toContain("firstResult.click()");
    expect(html).toContain("No se pudo consultar Stock. Reintentá en unos segundos.");
  });
});
