import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "src/new-quote.html"), "utf8");

describe("cliente opcional de la cotización", () => {
  it("permite escribir el nombre sin seleccionar un cliente registrado", () => {
    expect(html).toContain("<label>Cliente / Razón social</label>");
    expect(html).toContain("Escriba un nombre o busque con F4…");
    expect(html).not.toContain("Seleccione un cliente antes de guardar.");
    expect(html).not.toContain("Seleccione un cliente antes de imprimir.");
    expect(html).toContain("clienteNombre: quoteClientName()");
  });

  it("desvincula los datos fiscales si se edita manualmente un cliente seleccionado", () => {
    expect(html).toContain('getElementById("txtClienteNombre").addEventListener("input"');
    expect(html).toContain("clienteData = null");
    expect(html).toContain('getElementById("txtClienteCuit").value = ""');
    expect(html).toContain('getElementById("txtClienteIva").value = ""');
    expect(html).toContain('getElementById("txtEmail").value = ""');
  });

  it("usa Cliente ocasional si no se escribe ningún nombre", () => {
    expect(html).toContain('|| "Cliente ocasional"');
    expect(html).toContain("party: { name: quoteClientName()");
  });
});
