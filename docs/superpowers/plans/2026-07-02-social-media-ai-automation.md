# Asimov Social — Plan de promoción automatizada con IA (Facebook + Instagram)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistema de promoción en Facebook e Instagram con publicaciones e
imágenes/videos generados con IA, publicación automatizada vía Meta Graph API,
y una identidad visual y "cara" de marca consistente derivada de `branding/BRAND.md`.
Todo con aprobación humana antes de publicar.

**Architecture:** Repo nuevo `asimov-social` con un pipeline en TypeScript.
La IA (Claude API) genera el copy siguiendo la voz de marca; las imágenes se
componen como **plantillas HTML brandeadas renderizadas con Playwright → PNG**
(brand compliance determinística, cero deriva de estilo); los videos se
componen programáticamente con **Remotion** (React → MP4) usando animaciones
del símbolo Asimov + voz TTS. El contenido generado entra como archivos en un
PR; **merge = aprobar y publicar** (GitHub Actions publica vía Graph API).
Los lanzamientos de `asimov-app` disparan posts de release automáticamente.

**Tech Stack:** TypeScript + Node 22, Claude API (`claude-sonnet-5` para copy,
`claude-haiku-4-5` para variantes A/B), Playwright (imágenes), Remotion + TTS
(ElevenLabs u OpenAI TTS) para video, Meta Graph API (Pages + Instagram
Content Publishing), GitHub Actions (cron + release webhook), `branding/` como
fuente de assets.

## Global Constraints

- `branding/BRAND.md` es ley: Ion Orange solo como acento, Space Grotesk /
  Inter / JetBrains Mono, sentence case, verbo primero, sin jerga corporativa.
- **Nada se publica sin aprobación humana** (merge del PR de contenido). El
  automatismo genera y programa; una persona aprueba.
- Todo contenido generado con IA se etiqueta como tal donde Meta lo requiera
  (política de medios manipulados / AI disclosure de Meta).
- La "cara" de la marca es el **Nodo** (personaje derivado del símbolo), no
  un avatar humano sintético: evita el valle inquietante, el riesgo de
  políticas de Meta sobre personas sintéticas, y es 100% consistente con la
  identidad estructura + nodo.
- Idioma: español rioplatense (voseo), igual que el producto.
- Secretos (tokens Meta, API keys) solo como GitHub Secrets, nunca en el repo.
- Presupuesto operativo objetivo: < USD 60/mes en APIs (sin pauta paga).

---

### Fase 0 — Cuentas y accesos (manual, sin código)

**Files:** ninguno (checklist operativo).

- [ ] **Step 1: Crear activos Meta**

  - Página de Facebook "Asimov ERP" administrada desde el Business Manager de
    Bartez Tecnología.
  - Cuenta de Instagram **Business** `@asimov.erp` (o `@asimoverp`) vinculada
    a la página.
  - App de Meta (tipo Business) con permisos `pages_manage_posts`,
    `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`,
    `read_insights`.

- [ ] **Step 2: Generar credenciales de larga duración**

  Token de usuario → token de página de larga duración → guardar como secrets:
  `META_PAGE_ID`, `META_IG_USER_ID`, `META_ACCESS_TOKEN`.

- [ ] **Step 3: Verificación de la app Meta**

  Completar Business Verification para sacar los permisos de "development
  mode" (requerido para publicar vía API en producción).

- [ ] **Step 4: Reservar identidad**

  Registrar el dominio elegido (ver plan de dominio: `asimoverp.com`) y usar
  el mismo handle en FB/IG para coherencia de marca.

### Fase 1 — Identidad y "cara" de la marca

**Files (repo `asimov-social`):**
- Create: `brand/character.md` — biblia del personaje **el Nodo**
- Create: `brand/templates/*.html` — plantillas de posts (feed, story, carrusel)
- Create: `brand/prompts/voice.md` — system prompt de voz de marca para Claude

**Interfaces:**
- Consumes: `branding/BRAND.md`, SVGs de `branding/` (símbolo, lockups).
- Produces: kit de identidad social reutilizable por los generadores.

- [ ] **Step 1: Definir el personaje "el Nodo"**

  El nodo naranja del logo se convierte en la cara de la marca: una esfera
  Ion Orange con personalidad (órbita, rebote, "mirada" minimalista), que
  presenta tips, celebra releases y señala datos. Documentar en
  `brand/character.md`: proporciones, qué puede y no puede hacer (misuse),
  estados (idle, celebrando, alerta), y tono al "hablar" (claro, directo,
  levemente nerd — guiños a Asimov/Fundación sin abusar).

- [ ] **Step 2: Plantillas HTML de posts**

  Basadas en el sistema del mockup (`mockups/asimov-web-responsive.html`):

  | Plantilla | Formato | Uso |
  |---|---|---|
  | `tip-card.html` | 1080×1350 (feed 4:5) | Tips de uso del ERP / atajos |
  | `feature-card.html` | 1080×1350 | Capacidad nativa destacada |
  | `release-card.html` | 1080×1350 | Anuncio de versión (changelog resumido) |
  | `metric-card.html` | 1080×1080 | Dato/estadística con JetBrains Mono |
  | `story.html` | 1080×1920 (9:16) | Stories y portada de Reels |
  | `carousel-*.html` | 1080×1350 ×N | Carruseles educativos (3–5 slides) |

  Cada plantilla recibe JSON (`{ title, body, cta, version, ... }`) y respeta
  BRAND.md por construcción (colores y fuentes hardcodeados en el CSS).

- [ ] **Step 3: System prompt de voz**

  `brand/prompts/voice.md`: destilar la sección 5 de BRAND.md + ejemplos
  buenos/malos. Reglas duras: verbo primero, sentence case, voseo, sin
  "empoderar/potenciar/soluciones integrales", máx. 2 hashtags, CTA concreto.

- [ ] **Step 4: Validación visual**

  Renderizar cada plantilla con datos de ejemplo (Playwright → PNG) y
  revisar contraste WCAG AA y clear space del logo. Guardar los PNG de
  referencia en `brand/reference/`.

### Fase 2 — Pipeline de generación y publicación (imágenes + copy)

**Files (repo `asimov-social`):**
- Create: `src/generate.ts` — genera lote de contenido (copy + render)
- Create: `src/publish.ts` — publica vía Graph API
- Create: `src/calendar.ts` — pilares y cadencia
- Create: `content/queue/YYYY-MM-DD-slug/` — post = carpeta (copy.json + media)
- Create: `.github/workflows/generate.yml`, `.github/workflows/publish.yml`

**Interfaces:**
- Consumes: plantillas de Fase 1, Claude API, Meta Graph API.
- Produces: PRs de contenido; posts publicados al mergear.

- [ ] **Step 1: Calendario editorial y pilares**

  `src/calendar.ts` define cadencia (arranque: 3 posts/semana + 2 stories) y
  rota pilares:

  | Pilar | % | Ejemplo |
  |---|---|---|
  | Producto | 30% | "Imprimí sin diálogos: impresión directa en Asimov" |
  | Educación pyme/ERP | 30% | "3 señales de que tu Excel ya no alcanza" |
  | Releases | 15% | Auto-post desde GitHub Releases |
  | Marca / el Nodo | 15% | Universo Asimov, behind the scenes |
  | Social proof | 10% | Casos de uso, testimonios (con aprobación del cliente) |

- [ ] **Step 2: Generador de copy**

  `src/generate.ts`: Claude API con `brand/prompts/voice.md` como system
  prompt. Por post produce: caption FB (más largo), caption IG (corto +
  hashtags), texto para la plantilla, y alt text (accesibilidad). Salida:
  `content/queue/<fecha>-<slug>/copy.json`.

- [ ] **Step 3: Render de imágenes**

  Inyectar el JSON en la plantilla HTML correspondiente y renderizar con
  Playwright a PNG en los tamaños de destino. Guardar junto al copy.

- [ ] **Step 4: Flujo de aprobación por PR**

  `generate.yml` (cron lunes 9:00 ART): genera la semana completa y abre un
  PR con preview de las imágenes en la descripción. Editar = corregir el
  JSON y regenerar. **Merge = aprobado.**

- [ ] **Step 5: Publicador**

  `src/publish.ts`:
  - IG: `POST /{ig-user-id}/media` (imagen o carrusel) → `media_publish`.
  - FB: `POST /{page-id}/photos` o `/feed`.
  - Programación: cada post lleva `publishAt`; `publish.yml` corre cada hora
    (cron) y publica lo vencido. Marca lo publicado con el ID remoto
    (`published.json`) para idempotencia.

- [ ] **Step 6: Post automático de releases**

  Workflow disparado por `release published` en `equazin/asimov-app`
  (`repository_dispatch`): toma el changelog del release, genera copy +
  `release-card.html` y abre PR de contenido. El anuncio de cada versión
  sale solo, horas después del release.

- [ ] **Step 7: Validación end-to-end**

  Publicar 2 posts de prueba en una página/cuenta de staging, verificar
  render, links y programación antes de apuntar a la cuenta real.

### Fase 3 — Videos automatizados (Reels)

**Files (repo `asimov-social`):**
- Create: `video/` — proyecto Remotion (composiciones React)
- Create: `src/render-video.ts` — orquesta guion → TTS → render
- Modify: `src/publish.ts` — soporte Reels (`media_type=REELS`)

**Interfaces:**
- Consumes: guiones de Claude, TTS, animaciones del Nodo.
- Produces: MP4 1080×1920, ≤ 60 s, con captions quemados.

- [ ] **Step 1: Composiciones Remotion**

  3 formatos iniciales:
  - **Tip en 30 segundos:** el Nodo presenta, texto animado kinetic-type,
    screencast simulado de la UI (reusar el mock CSS del mockup web).
  - **Release en 20 segundos:** changelog animado + nodo celebrando.
  - **Dato/insight:** número grande en JetBrains Mono + contexto.

  Todo con la paleta y motion sobrio (ease-out, sin efectos gratuitos).

- [ ] **Step 2: Guion + voz**

  Claude genera guion (máx. 80 palabras) y subtítulos con timing; TTS
  (ElevenLabs voz es-AR/neutral latino, o OpenAI TTS como fallback barato)
  genera la locución. Captions siempre quemados (el 80% de Reels se mira
  sin audio).

- [ ] **Step 3: Render y publicación**

  `render-video.ts` compone audio + composición → MP4 (H.264, ≤ 60 s).
  Publicar como Reel vía Graph API (upload resumible). Cadencia inicial:
  1 Reel/semana dentro del PR semanal.

- [ ] **Step 4: Validación**

  Verificar en dispositivos reales: legibilidad de captions, volumen
  normalizado (-14 LUFS), safe areas de IG (UI tapa bordes).

### Fase 4 — Métricas y optimización

**Files (repo `asimov-social`):**
- Create: `src/insights.ts` — lee Insights API
- Create: `.github/workflows/report.yml` — reporte mensual

- [ ] **Step 1: Recolección**

  `insights.ts`: reach, impressions, engagement, follows, clicks por post
  (Graph API Insights). Persistir en `data/insights/*.json`.

- [ ] **Step 2: Reporte mensual**

  Cron día 1: Claude resume el mes (qué pilar/formato rindió mejor) y abre
  un issue con el reporte + recomendaciones de ajuste de calendario.

- [ ] **Step 3: Loop de mejora**

  Ajustar pesos de pilares y horarios según datos. Los captions incluyen
  UTM (`?utm_source=instagram&utm_campaign=organic`) para medir tráfico al
  sitio/descargas.

---

## KPIs (primeros 90 días)

| Métrica | Objetivo |
|---|---|
| Cadencia sostenida | 3 posts + 1 Reel/semana, 0 semanas vacías |
| Seguidores IG | 500 |
| Engagement rate | > 3% |
| Clicks a descarga/sitio | 100/mes |
| Costo operativo API | < USD 60/mes |

## Costos estimados (mensual, sin pauta)

| Rubro | Estimado |
|---|---|
| Claude API (copy + guiones + reportes) | USD 5–15 |
| TTS (≈ 4 Reels/mes) | USD 5–22 (OpenAI TTS ≈ 5 / ElevenLabs Starter 22) |
| Remotion | Gratis (licencia gratuita para empresas ≤ 3 personas) |
| Meta Graph API / GitHub Actions | USD 0 |
| **Total** | **≈ USD 10–40** |

## Riesgos y mitigaciones

- **Políticas de Meta sobre contenido IA:** usar personaje de marca (no
  humanos sintéticos), marcar contenido generado donde aplique, revisar
  humanamente todo antes de publicar (el PR ya lo garantiza).
- **Deriva de marca por generación libre de imágenes:** mitigado por diseño —
  las imágenes salen de plantillas HTML determinísticas, la IA solo escribe
  texto. Si más adelante se suman fondos generados (Firefly/DALL·E), pasan
  por las mismas plantillas como capa de fondo.
- **Token de Meta expira / app en dev mode:** completar Business Verification
  (Fase 0.3) y alertar por workflow si el token vence en < 15 días.
- **Fatiga de formato:** el reporte mensual (Fase 4) fuerza revisión y
  rotación de formatos.
