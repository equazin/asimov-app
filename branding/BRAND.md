# Asimov — Manual de marca

> La base inteligente de tu negocio.

Sistema de identidad de **Asimov**, la app de escritorio del ERP de Bartez Tecnología.
Este documento es la fuente de verdad: si algo en el producto contradice esto, gana esto.

---

## 1. Idea rectora

**Foundation intelligence.** El nombre viene de Isaac Asimov — robótica, leyes y la saga
*Fundación*. Para un ERP eso es la narrativa perfecta: **una base sólida y estable (la
fundación contable y operativa de la empresa) con inteligencia orbitando encima (la
automatización que trabaja sobre esa base).**

Todo el sistema visual deriva de esa dualidad: **estructura + nodo**.

- **Personalidad:** confiable · técnico · ordenado · moderno · sin vueltas.
- **Posicionamiento:** no es "otro software de gestión"; es el sistema sobre el que
  corre la empresa.

---

## 2. Logotipo

### Símbolo
Una **"A" construida como estructura** (dos pilares + un dintel) coronada por un **nodo
naranja en órbita**. Leído rápido es una letra; leído despacio, una base con inteligencia
encima.

### Variantes (archivos en esta carpeta)
| Archivo | Uso |
|---|---|
| `asimov-logo-primary.svg` | Lockup horizontal, fondo claro. Uso principal. |
| `asimov-logo-reversed.svg` | Lockup horizontal, fondo oscuro. |
| `asimov-symbol.svg` | Solo símbolo (positivo), fondo claro. |
| `asimov-symbol-reversed.svg` | Solo símbolo, fondo oscuro. |
| `asimov-symbol-mono.svg` | Monocromo 1 tinta (grabado, fax, sello). |
| `asimov-icon-master.svg` | Ícono de app (squircle ink). Fuente del `.ico`/PNG. |

### Clear space (zona de exclusión)
Mantené un margen libre igual al **diámetro del nodo** en los cuatro lados. Escala con el
logo — nunca un valor fijo en px.

### Tamaño mínimo
- **Digital:** símbolo 16 px (tray/favicon). Lockup completo: 96 px de ancho.
- **Impreso:** símbolo 6 mm. Lockup: 25 mm de ancho.
- A tamaños chicos el símbolo **simplifica**: se suelta la órbita y queda silueta + nodo.

### Misuse (no se hace)
- No recolorear el nodo (siempre Ion Orange) ni los trazos fuera de las variantes.
- No estirar, inclinar, rotar ni cambiar proporciones.
- No aplicar sombras, degradés, contornos ni efectos.
- No poner el logo naranja sobre fondos naranjas o cyan (bajo contraste).
- No reordenar ni separar los elementos del lockup.

---

## 3. Color

### Paleta principal
| Rol | Nombre | HEX | RGB |
|---|---|---|---|
| Ancla | Ink | `#14171D` | 20, 23, 29 |
| Superficie | Graphite | `#232833` | 35, 40, 51 |
| **Firma** | **Ion Orange** | `#FF6A2B` | 255, 106, 43 |
| Soporte | Signal Cyan | `#2FD4BE` | 47, 212, 190 |
| Fondo claro | Cloud | `#F4F5F3` | 244, 245, 243 |

### Neutros
| Stop | HEX |
|---|---|
| 900 | `#14171D` |
| 700 | `#2B303B` |
| 500 | `#5B6270` |
| 300 | `#A8ADB7` |
| 100 | `#E4E6E4` |
| 0 | `#FFFFFF` |

### Semánticos
| Estado | HEX |
|---|---|
| Success | `#2FB47A` |
| Warning | `#F5A524` |
| Danger | `#E5484D` |
| Info | `#3B82F6` |

### Reglas de color
- **Ion Orange es la firma:** un solo significado (energía/acción/nodo). No lo diluyas
  usándolo de fondo grande; es acento.
- **Signal Cyan** existe para darle rango al producto de datos (gráficos, KPIs, estados
  positivos) — sin él todo termina naranja sobre gris.
- **Texto sobre color:** usá el tono más oscuro de la misma familia (p. ej. `#5A1E06`
  sobre naranja), nunca negro puro.
- **Contraste (WCAG AA):** cuerpo ≥ 4.5:1, texto grande / UI ≥ 3:1.

---

## 4. Tipografía

| Rol | Familia | Uso |
|---|---|---|
| Marca / títulos | **Space Grotesk** (500/700) | Wordmark, encabezados, números destacados. |
| Interfaz / cuerpo | **Inter** (400/500/600) | UI, tablas, texto. Legible a 12 px. |
| Números / códigos | **JetBrains Mono** (400/500) | SKU, importes, IDs. |

- Todas gratuitas (Google Fonts).
- Sentence case siempre. Dos pesos por contexto: regular + medium/bold.

---

## 5. Voz

- **Tagline:** *La base inteligente de tu negocio.*
- **Alternativas:** *Ordená hoy. Escalá mañana.* · *El sistema que piensa tu empresa.*
- **Tono:** claro, directo, sin jerga corporativa. Decí qué hace, no qué "empodera".
  Verbo primero ("Crear pedido", no "Creación de pedidos").

---

## 6. Assets y dónde se usan

| Asset generado | Ubicación | Consumido por |
|---|---|---|
| `build/icon.png` (512) | app | ventana, shell, tray |
| `build/icon.ico` (16–256) | app | instalador NSIS, ícono de ventana Windows |
| `branding/png/asimov-symbol-*.png` | export | web, docs, redes |

Regenerar rasters: `node scripts/generate-icons.js` (usa `sharp` + `png-to-ico`).

---

*Referencias de método: Frontify (logo usage), HubSpot/Canva (estructura), Evil Martians
(favicon/ICO), WCAG 2.x (contraste). Metodología completa en la skill `brand-identity`.*
