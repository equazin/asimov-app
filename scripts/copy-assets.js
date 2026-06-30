/**
 * Copia los assets que tsc no procesa (HTML del picker, íconos) a dist/.
 * Se corre tras `tsc` en el script de build.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");

fs.mkdirSync(distDir, { recursive: true });

const files = ["picker.html", "splash.html", "offline.html", "shell.html", "product-selection.html", "new-article.html", "client-selection.html", "new-client.html", "new-supplier.html", "new-sale-order.html", "new-quote.html", "new-invoice.html", "new-delivery-note.html", "new-receipt.html", "new-purchase-order.html", "new-goods-receipt.html", "new-purchase-invoice.html", "new-payment-order.html"];
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

const appIcon = path.join(root, "build", "icon.png");
const appIconOut = path.join(distDir, "icon.png");
if (fs.existsSync(appIcon)) {
  fs.copyFileSync(appIcon, appIconOut);
  console.log("[copy-assets] icon.png -> dist/");
}
