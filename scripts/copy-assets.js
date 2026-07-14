/**
 * Copia los assets que tsc no procesa (HTML de las ventanas, íconos) a dist/.
 * Se corre tras `tsc` en el script de build.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");

fs.mkdirSync(distDir, { recursive: true });

const files = ["login.html", "shell.html", "product-selection.html", "new-article.html", "client-selection.html", "supplier-selection.html", "new-client.html", "new-supplier.html", "new-sale-order.html", "new-quote.html", "new-invoice.html", "new-delivery-note.html", "new-receipt.html", "new-purchase-order.html", "new-goods-receipt.html", "new-purchase-invoice.html", "new-payment-order.html"];
for (const file of files) {
  const from = path.join(srcDir, file);
  const to = path.join(distDir, file);
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, to);
    console.log(`[copy-assets] ${file} → dist/`);
  }
}

const brandIcon = path.join(root, "build", "bartez-isologo.png");
const brandIconOut = path.join(distDir, "bartez-isologo.png");
if (fs.existsSync(brandIcon)) {
  fs.copyFileSync(brandIcon, brandIconOut);
  console.log("[copy-assets] bartez-isologo.png -> dist/");
}

// Assets compartidos de impresión de comprobantes (CSS + renderer JS).
for (const asset of ["comprobante-print.css", "comprobante-print.js", "crm-workspace.css", "crm-workspace.js"]) {
  const from = path.join(srcDir, asset);
  const to = path.join(distDir, asset);
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, to);
    console.log(`[copy-assets] ${asset} → dist/`);
  }
}

const bartezLogo = path.join(root, "build", "bartez-logo.png");
const bartezLogoOut = path.join(distDir, "bartez-logo.png");
if (fs.existsSync(bartezLogo)) {
  fs.copyFileSync(bartezLogo, bartezLogoOut);
  console.log("[copy-assets] bartez-logo.png -> dist/");
}

// Logo horizontal en alta resolución (2000x500, RGBA) para el membrete impreso.
const bartezLogoHi = path.join(root, "build", "bartez-logo-negro.png");
const bartezLogoHiOut = path.join(distDir, "bartez-logo-negro.png");
if (fs.existsSync(bartezLogoHi)) {
  fs.copyFileSync(bartezLogoHi, bartezLogoHiOut);
  console.log("[copy-assets] bartez-logo-negro.png -> dist/");
}

const appIcon = path.join(root, "build", "icon.png");
const appIconOut = path.join(distDir, "icon.png");
if (fs.existsSync(appIcon)) {
  fs.copyFileSync(appIcon, appIconOut);
  console.log("[copy-assets] icon.png -> dist/");
}
