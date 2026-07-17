import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(join(process.cwd(), "src", "new-client.html"), "utf8");

describe("alta de clientes — CUIT opcional", () => {
  it("no marca el CUIT como obligatorio y lo comunica en el formulario", () => {
    expect(html).toContain('C.U.I.T. <span class="optional-label">Opcional</span>');
    expect(html).toContain('placeholder="XX-XXXXXXXX-X (opcional)"');
    expect(html).not.toContain('<label class="required-star">C.U.I.T.</label>');
  });
});
