# Asimov

ERP de escritorio para Windows de [Bartez Tecnología](https://bartez.com.ar).
Aplicación **nativa y offline-first**: todas las pantallas son HTML local y los
datos viven en una base **SQLite** en el equipo. Cubre la gestión comercial
completa —ventas, compras, stock, tesorería, CRM y RMA— con impresión directa,
notificaciones nativas y actualización automática.

> **Arquitectura:** Asimov **no** carga ninguna web remota ni comparte base con
> otra versión. Todo el frontend se empaqueta con la app y la persistencia es
> local (`better-sqlite3`). El acceso está protegido por login con contraseñas
> hasheadas (scrypt) y las credenciales de integraciones se guardan cifradas.

## Instalación

Descargar el último instalador desde
[Releases](https://github.com/equazin/asimov-app/releases/latest) y ejecutar
**Asimov-Setup-x.x.x.exe**.

Al abrir por primera vez aparece la pantalla de **login**. En el primer arranque
se crea un usuario `admin` con una **contraseña aleatoria** (no hardcodeada):

- Se muestra en un diálogo modal una única vez.
- Se guarda en `%APPDATA%/asimov-app/CREDENCIALES-INICIALES.txt` (borralo cuando
  la anotes / la cambies).

> ⚠️ **Cambiá esa contraseña apenas ingreses** desde *Sistema → Usuarios y Roles*
> y borrá el archivo `CREDENCIALES-INICIALES.txt`.

La base de datos se crea automáticamente en `%APPDATA%/asimov-app/asimov.db`.

## Desarrollo

```bash
npm install
npm run dev      # compila TS y abre Electron (con DevTools)
```

> Módulos nativos: `better-sqlite3` se compila para el ABI de Electron al
> empaquetar. Si al correr en dev falla la carga del módulo, reconstruilo con
> `npx electron-builder install-app-deps`.

## Scripts

| Script | Qué hace |
|--------|----------|
| `npm run build` | Compila TypeScript (`src/` → `dist/`) y copia assets |
| `npm run dev` | Build + abre Electron con DevTools |
| `npm run start` | Build + abre Electron en modo normal |
| `npm test` | Corre la suite de tests (Vitest) |
| `npm run test:coverage` | Tests + reporte de cobertura (gate 80%) |
| `npm run smoke-test` | Lanza la app, verifica estabilidad y cierra |
| `npm run dist` | Genera el instalador NSIS (`.exe`) en `release/` |
| `npm run dist:dir` | Empaqueta sin instalador (carpeta, para pruebas) |
| `npm run release` | Build + publish a GitHub Releases |

## Estructura

```
src/
├── main.ts              Proceso principal: login, ventanas, formularios nativos
├── auth.ts              Autenticación (hash scrypt, login, seed de admin)
├── ipc.ts               Handlers IPC (DB, impresión, notificaciones, AIR)
├── db.ts                Capa SQLite (schema, helpers, upserts, KPIs)
├── documents.ts         Persistencia de documentos + movimientos de stock/caja
├── masters.ts           Alta de datos maestros (cliente/proveedor/artículo)
├── secrets.ts           Cifrado en reposo de credenciales (safeStorage)
├── air.ts               Integración con el catálogo de AIR S.R.L.
├── config.ts            Preferencias locales (electron-store)
├── tray.ts · menu.ts    Bandeja del sistema y menú nativo
├── updater.ts           Auto-actualización (electron-updater)
├── preload.ts           Puente seguro del shell (contextBridge)
├── login.html           Pantalla de ingreso
├── shell.html           Shell principal (SPA de listas por módulo)
├── product/client/supplier-selection.html   Selectores (pickers)
└── new-*.html           12 fichas nativas (pedido, factura, remito, recibo,
                         OC, recepción, factura de compra, orden de pago, …)
```

## Capacidades

- **Login con roles** (admin / user / readonly), contraseñas hasheadas con scrypt
- **Datos maestros**: clientes, proveedores, artículos, depósitos, listas de precios
- **Ventas**: pedidos, cotizaciones, facturas, remitos, recibos
- **Compras**: órdenes de compra, recepciones, facturas de compra, órdenes de pago
- **Stock**: los remitos y recepciones **mueven existencias** (`article_stock`,
  `stock_movements`), con alertas de stock mínimo
- **Tesorería**: recibos y órdenes de pago **mueven caja** (`cash_movements`,
  saldo de cuentas); cuentas corrientes de clientes y proveedores
- **CRM y RMA**: oportunidades, tickets, órdenes de trabajo, garantías
- **Reportes y export**: ventas/compras, top de artículos, diario, auditoría,
  export contable a CSV
- **Integración AIR S.R.L.**: sync de catálogo con token cacheado y credenciales
  cifradas
- Impresión nativa (directa/silenciosa) con fallback a `window.print()`
- Notificaciones nativas, tray icon con minimizar a bandeja
- Inicio automático con Windows y auto-actualización vía GitHub Releases
- Atajos F1–F9 y navegación por módulos GESES

## Seguridad

- **Autenticación**: contraseñas con **scrypt** (salt aleatorio, comparación de
  tiempo constante). El login gatea el arranque; el sistema solo se abre al
  autenticar. Roles con enforcement real en el proceso principal (no solo en UI).
- **Credenciales cifradas**: las claves de integraciones (ej. AIR) se guardan con
  el `safeStorage` de Electron, respaldado por el llavero del SO (DPAPI en
  Windows). Migración transparente de valores heredados en texto plano.
- **Aislamiento del renderer**: todas las ventanas usan `contextIsolation: true`
  + `sandbox` + `contextBridge`. Un eventual XSS en el renderer no puede tocar
  Node/Electron.

## Tests

Suite de unidad/integración con **Vitest** sobre la capa de lógica (DB en memoria,
`electron` mockeado). Cubre `db`, `documents`, `masters`, `auth` y `secrets` con
gate de cobertura al 80%.

```bash
npm test              # corre la suite
npm run test:coverage # con reporte de cobertura
```

Los módulos de integración con Electron se validan aparte: `smoke-test.js`
(arranque sin crashes) y `verify-shell-bridge.js` (puente `contextBridge` bajo
Electron real).

## Publicar una nueva versión

```bash
npm version patch   # o minor/major
git push --follow-tags
```

El workflow `release.yml` se activa con tags `v*`, compila en Windows y publica
el instalador como GitHub Release.

## Firma de código (pendiente)

Para evitar SmartScreen se necesita un certificado EV/OV. Agregar como GitHub
Secrets `WIN_CSC_LINK` (.pfx en base64) y `WIN_CSC_KEY_PASSWORD`, y descomentar
las líneas de firma en `electron-builder.yml` y `.github/workflows/release.yml`.

## Roadmap

El plan de trabajo con lo hecho y lo pendiente está en
[`docs/PLAN-DE-TRABAJO.md`](docs/PLAN-DE-TRABAJO.md).

---

**Asimov** by [Bartez Tecnología](https://bartez.com.ar)
