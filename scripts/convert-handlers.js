/**
 * Migración one-shot (hardening CSP): convierte handlers de evento inline
 * (onclick/oninput/onchange) en atributos data-* + un bloque de delegación al
 * final del <script> inline. Solo aplica a fichas cuyos handlers son llamadas a
 * funciones globales de nivel superior (sin args, salvo el patrón
 * `fn('literal', this.value)` de los onchange de importes).
 *
 * Uso:  node scripts/convert-handlers.js <archivo.html> [...]
 */
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "src");

const DELEGATION = `
  // [CSP] Delegación de eventos: reemplaza los handlers inline (onclick/oninput/
  // onchange), permitiendo CSP script-src 'self' sin 'unsafe-inline'.
  document.querySelectorAll('[data-onclick]').forEach(function (el) {
    var n = el.getAttribute('data-onclick');
    el.addEventListener('click', function () {
      if (n === 'close') { window.close(); }
      else if (typeof window[n] === 'function') { window[n](); }
    });
  });
  ['input', 'change'].forEach(function (evt) {
    document.querySelectorAll('[data-on' + evt + ']').forEach(function (el) {
      var parts = el.getAttribute('data-on' + evt).split(':');
      var n = parts[0], arg = parts[1];
      el.addEventListener(evt, function () {
        if (typeof window[n] !== 'function') return;
        if (arg !== undefined) { window[n](arg, el.value); } else { window[n](); }
      });
    });
  });
`;

for (const file of process.argv.slice(2)) {
  const p = path.join(SRC, file);
  let html = fs.readFileSync(p, "utf8");

  html = html
    .replace(/onclick="window\.close\(\)"/g, 'data-onclick="close"')
    .replace(/onclick="([a-zA-Z_$][\w$]*)\(\)"/g, 'data-onclick="$1"')
    .replace(/oninput="([a-zA-Z_$][\w$]*)\(\)"/g, 'data-oninput="$1"')
    .replace(/onchange="([a-zA-Z_$][\w$]*)\('([^']*)',\s*this\.value\)"/g, 'data-onchange="$1:$2"')
    .replace(/onchange="([a-zA-Z_$][\w$]*)\(\)"/g, 'data-onchange="$1"');

  // Inyectar la delegación una sola vez, antes del último </script>.
  if (!html.includes("[CSP] Delegación de eventos")) {
    const idx = html.lastIndexOf("</script>");
    html = html.slice(0, idx) + DELEGATION + "\n" + html.slice(idx);
  }

  fs.writeFileSync(p, html, "utf8");

  const remaining = (html.match(/\son(click|input|change|submit|keydown|keyup|mouseover|mouseout|focus|blur)=/g) || []).length;
  console.log(`${remaining === 0 ? "OK  " : "WARN"} ${file} — handlers inline restantes: ${remaining}`);
}
