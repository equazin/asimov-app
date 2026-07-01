/**
 * Genera los rasters de marca a partir de los SVG de /branding.
 *
 *   node scripts/generate-icons.js
 *
 * Produce:
 *   build/icon.png            (512, ícono de app: ventana, shell, tray)
 *   build/icon.ico            (16/24/32/48/64/128/256, instalador + ventana Win)
 *   branding/png/asimov-icon-*.png
 *   branding/png/asimov-symbol-*.png  (transparente)
 *   branding/png/asimov-symbol-reversed-*.png
 *
 * Requiere devDeps: sharp, png-to-ico.
 */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const pngToIcoMod = require("png-to-ico");
const pngToIco = pngToIcoMod.default || pngToIcoMod;

const ROOT = path.resolve(__dirname, "..");
const BRANDING = path.join(ROOT, "branding");
const PNG_OUT = path.join(BRANDING, "png");
const BUILD = path.join(ROOT, "build");

const ICON_MASTER = path.join(BRANDING, "asimov-icon-master.svg");
const SYMBOL = path.join(BRANDING, "asimov-symbol.svg");
const SYMBOL_REV = path.join(BRANDING, "asimov-symbol-reversed.svg");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const SYMBOL_SIZES = [512, 256, 128, 64, 48, 32, 16];

async function renderPng(svgPath, size, outPath) {
  const svg = fs.readFileSync(svgPath);
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
}

async function main() {
  fs.mkdirSync(PNG_OUT, { recursive: true });
  fs.mkdirSync(BUILD, { recursive: true });

  // 1) Ícono de app (squircle ink) → build/icon.png (512) + copias en branding/png
  await renderPng(ICON_MASTER, 512, path.join(BUILD, "icon.png"));
  for (const s of [512, 256, 128]) {
    await renderPng(ICON_MASTER, s, path.join(PNG_OUT, `asimov-icon-${s}.png`));
  }
  console.log("[icons] build/icon.png (512) ✓");

  // 2) build/icon.ico multi-size desde el ícono master
  const icoBuffers = [];
  for (const s of ICO_SIZES) {
    const svg = fs.readFileSync(ICON_MASTER);
    icoBuffers.push(
      await sharp(svg, { density: 384 }).resize(s, s).png().toBuffer()
    );
  }
  fs.writeFileSync(path.join(BUILD, "icon.ico"), await pngToIco(icoBuffers));
  console.log(`[icons] build/icon.ico (${ICO_SIZES.join("/")}) ✓`);

  // 3) Símbolo transparente (positivo + negativo) para web/docs/redes
  for (const s of SYMBOL_SIZES) {
    await renderPng(SYMBOL, s, path.join(PNG_OUT, `asimov-symbol-${s}.png`));
    await renderPng(SYMBOL_REV, s, path.join(PNG_OUT, `asimov-symbol-reversed-${s}.png`));
  }
  console.log(`[icons] branding/png/asimov-symbol-*.png (${SYMBOL_SIZES.join("/")}) ✓`);

  console.log("[icons] listo.");
}

main().catch((err) => {
  console.error("[icons] error:", err);
  process.exit(1);
});
