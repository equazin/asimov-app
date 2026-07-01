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
  --bg:#14171D; --surface:#14171D; --panel:#232833; --card:#232833;
  --accent:#FF6A2B; --accent-hover:#e85e25; --accent-light:#3a2a1e;
  --accent-lt:#3a2a1e; --border:#343a43; --border-soft:#2c333d;
  --text:#f2f3f5; --text-muted:#9aa1ab; --muted:#9aa1ab;
  --input-bg:#171b22; --input-focus:#FF6A2B; --header-bg:#1b1f27;
  --tab-active:#14171D; --tab-inactive:#14171D; --danger:#e5544b;
  --radius:9px;
}
html,body{ background:#0f1117 !important; }
body{ color:var(--text) !important; }
.header{
  background:#1b1f27 !important;
  border-bottom:1px solid var(--border-soft) !important;
  box-shadow:none !important;
  min-height:46px;
  padding:10px 16px !important;
}
.header-icon{ font-size:15px !important; }
.header-title{ color:#fff !important; font-size:13px !important; font-weight:700 !important; letter-spacing:0 !important; }
.header-badges{ gap:8px !important; }
.header-badge{
  background:rgba(255,106,43,0.10) !important;
  border:1px solid rgba(255,106,43,0.80) !important;
  color:var(--accent) !important;
  border-radius:999px !important;
  padding:2px 10px !important;
  box-shadow:none !important;
}
.close-btn{
  background:#232833 !important;
  border:1px solid #59616d !important;
  color:#d9dde4 !important;
  border-radius:8px !important;
}
.close-btn:hover{ background:#2a303b !important; }
.tabs{
  background:#14171D !important;
  border-top:0 !important;
  border-bottom:1px solid var(--border-soft) !important;
  box-shadow:none !important;
}
.tab{
  color:var(--text-muted) !important;
  border-bottom:2px solid transparent !important;
  margin-bottom:0 !important;
  padding:10px 16px !important;
  font-size:12px !important;
  font-weight:600 !important;
}
.tab:hover{ background:#191d25 !important; color:#d7dae0 !important; }
.tab.active{
  background:#14171D !important;
  color:var(--accent) !important;
  border-bottom-color:var(--accent) !important;
}
.content{ background:#14171D !important; }
.tab-panel{ background:#14171D !important; padding:16px !important; }
.tab-panel.active{ gap:12px !important; }
.tab-panel.items-panel{ padding:0 !important; }
.section-title{
  display:flex !important;
  align-items:center !important;
  gap:9px !important;
  margin:0 !important;
  padding:15px 16px 4px !important;
  background:var(--card) !important;
  border:1px solid var(--border) !important;
  border-bottom:0 !important;
  border-radius:var(--radius) var(--radius) 0 0 !important;
  color:#f3f4f6 !important;
  font-size:13px !important;
  font-weight:700 !important;
  letter-spacing:0 !important;
  text-transform:none !important;
}
.section-title::before{
  content:"" !important;
  display:inline-block !important;
  width:6px !important;
  height:18px !important;
  border-radius:999px !important;
  background:var(--accent) !important;
  flex:0 0 auto !important;
}
.section-title + .form-grid{
  margin-top:-12px !important;
  padding:22px 16px 16px !important;
  background:var(--card) !important;
  border:1px solid var(--border) !important;
  border-top:0 !important;
  border-radius:0 0 var(--radius) var(--radius) !important;
}
.section-title + .mini-table,
.section-title + textarea,
.section-title + input,
.section-title + select{
  margin-top:-12px !important;
}
.form-grid{ gap:10px 12px !important; }
.form-group,.field{ gap:5px !important; min-width:0 !important; }
label,.field label,.form-group label{
  color:var(--text-muted) !important;
  font-size:10px !important;
  font-weight:800 !important;
  letter-spacing:0.04em !important;
}
input,select,textarea,.cell-input{
  background:var(--input-bg) !important;
  color:var(--text) !important;
  border:1px solid var(--border) !important;
  border-radius:7px !important;
  box-shadow:none !important;
}
input:not(.cell-input),select,textarea{ min-height:30px !important; padding:6px 9px !important; }
input[readonly],textarea[readonly]{ background:#171b22 !important; color:var(--text-muted) !important; }
input::placeholder,textarea::placeholder{ color:#6f7784 !important; opacity:1 !important; }
input:focus,select:focus,textarea:focus,.cell-input:focus{
  border-color:var(--accent) !important;
  box-shadow:0 0 0 2px rgba(255,106,43,0.18) !important;
  outline:none !important;
}
option{ background:#232833; color:var(--text); }
.picker-btn,.field-btn,.btn-primary,.btn-save,.btn-sm:not(.secondary){
  background:var(--accent) !important;
  color:#fff !important;
  border-color:var(--accent) !important;
}
.picker-btn:hover,.field-btn:hover,.btn-primary:hover,.btn-save:hover,.btn-sm:not(.secondary):hover{
  background:var(--accent-hover) !important;
  border-color:var(--accent-hover) !important;
}
.btn-default,.btn-cancel,.btn-print,.btn-sm.secondary,.add-row-btn{
  background:#232833 !important;
  color:var(--text) !important;
  border:1px solid var(--border) !important;
}
.btn-default:hover,.btn-cancel:hover,.btn-print:hover,.btn-sm.secondary:hover,.add-row-btn:hover{
  background:#2a303b !important;
}
.btn-exit{
  background:#232833 !important;
  color:var(--text-muted) !important;
  border:1px solid var(--border) !important;
}
.btn-exit:hover{ background:#2a303b !important; color:#fff !important; }
.footer{
  background:#1b1f27 !important;
  border-top:1px solid var(--border-soft) !important;
  padding:12px 16px !important;
}
.footer-btn{
  border-radius:8px !important;
  min-height:30px !important;
  padding:7px 16px !important;
  font-size:12px !important;
}
.table-wrap,.mini-table{
  background:#171b22 !important;
  border:1px solid var(--border) !important;
  border-radius:8px !important;
}
thead th,th{
  background:#232833 !important;
  color:var(--text-muted) !important;
  border-color:var(--border) !important;
}
tbody tr{ background:#171b22 !important; border-color:var(--border) !important; }
tbody tr:nth-child(even),tr:nth-child(even){ background:#1c2129 !important; }
tbody tr:hover{ background:#232833 !important; }
td{ border-color:var(--border) !important; }
.items-toolbar,.totals-panel{ background:#14171D !important; }
.totals-card{
  background:var(--card) !important;
  border-color:var(--border) !important;
  border-radius:var(--radius) !important;
}
.totals-row.subtotal{ background:#1c2129 !important; }
.kbd,kbd{
  background:rgba(255,255,255,0.16) !important;
  color:#fff !important;
  border-color:rgba(255,255,255,0.18) !important;
}
.del-row-btn:hover,.del-row:hover{ background:#3a2323 !important; }
@media (max-width:760px){
  .form-grid{ grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
  .form-group.span-2,.field.span-2{ grid-column:span 2 !important; }
  .form-group.span-3,.form-group.span-4,.field.span-3,.field.span-4{ grid-column:1 / -1 !important; }
}
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
