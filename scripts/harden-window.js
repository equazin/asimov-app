/**
 * Migración one-shot (Fase 4 / hardening CSP): para una ventana HTML sin
 * handlers inline, externaliza su único bloque <script> inline a un .js hermano
 * e inyecta una CSP estricta (script-src 'self'). Solo aplica a páginas que YA
 * usan addEventListener (0 handlers inline); no convierte onclick.
 *
 * Uso:  node scripts/harden-window.js <archivo.html> [<archivo2.html> ...]
 */
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "src");
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'self';" />`;

for (const file of process.argv.slice(2)) {
  const htmlPath = path.join(SRC, file);
  let html = fs.readFileSync(htmlPath, "utf8");
  const base = file.replace(/\.html$/, "");

  // 1) Extraer el único <script> inline (sin src).
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (inline.length !== 1) {
    console.log(`SKIP ${file} (esperaba 1 <script> inline, hay ${inline.length})`);
    continue;
  }
  const code = inline[0][1].replace(/^\n/, "").replace(/\s+$/, "") + "\n";
  fs.writeFileSync(path.join(SRC, `${base}.js`), code, "utf8");
  html = html.replace(inline[0][0], `<script src="${base}.js"></script>`);

  // 2) Inyectar CSP si no existe, tras el <meta charset>.
  if (!/Content-Security-Policy/.test(html)) {
    html = html.replace(/(<meta charset="[^"]*"\s*\/?>)/i, `$1\n  ${CSP}`);
  }

  fs.writeFileSync(htmlPath, html, "utf8");
  console.log(`OK   ${file} → ${base}.js + CSP`);
}
