import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(join(process.cwd(), "src", "shell.html"), "utf8");

describe("modal de nota de comisión", () => {
  it("usa el modal oscuro del shell y una estructura accesible", () => {
    expect(html).toContain('id="commission-modal" class="asimov-modal-overlay"');
    expect(html).toContain('class="asimov-modal commission-modal"');
    expect(html).toContain('aria-labelledby="commission-title"');
    expect(html).toContain('id="commission-close"');
  });

  it("presenta el cálculo con etiquetas claras", () => {
    expect(html).toContain("Base comisionable");
    expect(html).toContain("Comisión a cobrar");
    expect(html).toContain("Cliente intermediario");
  });
});
