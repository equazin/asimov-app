/**
 * Aplica el tema de marca Asimov (Ink + Ion Orange) a todas las ventanas de
 * formulario, unificándolas. Inyecta un bloque de override al final del primer
 * <style> de cada archivo (idempotente: reemplaza si ya existe el marcador).
 *
 *   node scripts/apply-brand-theme.js
 */
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.resolve(__dirname, "..", "src");

const TARGETS = [
  "new-article.html", "new-client.html", "new-supplier.html",
  "new-sale-order.html", "new-quote.html", "new-invoice.html",
  "new-delivery-note.html", "new-receipt.html", "new-purchase-order.html",
  "new-goods-receipt.html", "new-purchase-invoice.html", "new-payment-order.html",
  "client-selection.html", "product-selection.html",
];

const START = "/* ASIMOV-THEME-START */";
const END = "/* ASIMOV-THEME-END */";

const OVERRIDE = `${START}
:root{
  color-scheme: dark;
  --bg:#14171D; --panel:#232833; --accent:#FF6A2B; --accent-light:#3a2a1e;
  --accent-lt:#3a2a1e; --border:#343a43; --text:#e6e8ea; --text-muted:#9aa1ab;
  --input-bg:#20242b; --input-focus:#FF6A2B; --header-bg:#1b1f27;
  --tab-active:#232833; --tab-inactive:#1b1f27; --danger:#e5544b;
}
body{ background:#14171D !important; color:var(--text) !important; }
.header{ background:linear-gradient(135deg,#1b1f27,#232833) !important; }
.tabs{ border-bottom-color:var(--accent) !important; }
.tab:hover{ background:#20242b !important; }
.tab.active{ background:#232833 !important; color:var(--accent) !important; border-bottom-color:#232833 !important; }
input,select,textarea,.cell-input{ background:var(--input-bg) !important; color:var(--text) !important; border-color:var(--border) !important; }
input[readonly],textarea[readonly]{ background:#1b1f27 !important; color:var(--text-muted) !important; }
input:focus,select:focus,textarea:focus,.cell-input:focus{ border-color:var(--accent) !important; }
option{ background:#232833; color:var(--text); }
tr:nth-child(even){ background:#1e222a !important; }
td{ border-color:var(--border) !important; }
th{ color:#fff !important; }
.btn-default,.btn-cancel,.btn-print{ background:#232833 !important; color:var(--text) !important; border-color:var(--border) !important; }
.btn-default:hover,.btn-cancel:hover,.btn-print:hover,.add-row-btn:hover{ background:#2a2f37 !important; }
.btn-primary:hover{ background:#e05a1f !important; }
.del-row-btn:hover,.del-row:hover{ background:#3a2323 !important; }
::-webkit-scrollbar{ width:10px; height:10px; }
::-webkit-scrollbar-thumb{ background:#343a43; border-radius:5px; }
::-webkit-scrollbar-track{ background:#14171D; }
${END}`;

let changed = 0;
for (const file of TARGETS) {
  const p = path.join(SRC, file);
  if (!fs.existsSync(p)) { console.warn("[theme] falta:", file); continue; }
  let html = fs.readFileSync(p, "utf8");

  if (html.includes(START)) {
    const re = new RegExp(START.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "[\\s\\S]*?" + END.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"), "m");
    html = html.replace(re, OVERRIDE);
  } else {
    const idx = html.indexOf("</style>");
    if (idx === -1) { console.warn("[theme] sin <style>:", file); continue; }
    html = html.slice(0, idx) + "\n" + OVERRIDE + "\n  " + html.slice(idx);
  }
  fs.writeFileSync(p, html, "utf8");
  changed++;
  console.log("[theme] ✓", file);
}
console.log(`[theme] listo — ${changed}/${TARGETS.length} archivos.`);
