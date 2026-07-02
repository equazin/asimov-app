# Mockups de publicaciones sociales

Ejemplos de contenido para Facebook e Instagram según el plan
`docs/superpowers/plans/2026-07-02-social-media-ai-automation.md`.
Las imágenes salen de plantillas HTML brandeadas (BRAND.md hardcodeado en el
CSS) renderizadas con Chromium; el video se renderiza frame a frame desde una
plantilla HTML con timeline `seek(t)` y se codifica con ffmpeg (H.264,
1080×1920, apto Reels).

## Contenido

| Archivo | Qué es |
|---|---|
| `tip-card.html` | Plantilla de post de imagen (feed 4:5, 1080×1350) |
| `reel-multiventana.html` | Plantilla de Reel (9:16, 1080×1920) con timeline `window.seek(t)` |
| `example-post/` | Publicación de imagen lista: `copy.json` (captions FB/IG + alt text) + PNG |
| `example-reel/` | Publicación de video lista: `copy.json` (guion + captions) + MP4 |

## Regenerar

```bash
# imagen (Playwright)
page.goto('file://.../tip-card.html'); page.screenshot(...)

# video: 30 fps × 13 s → frames JPEG → ffmpeg
for i in 0..389: page.evaluate(t => window.seek(t), i/30); screenshot
ffmpeg -framerate 30 -i frames/f%04d.jpeg -c:v libx264 -pix_fmt yuv420p reel.mp4
```

El personaje naranja con órbita es **el Nodo**, la cara de la marca
(derivado del símbolo del logo — ver plan, Fase 1).
