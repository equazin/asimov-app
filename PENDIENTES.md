# Asimov ERP — Pendientes / Roadmap

> Qué falta hacer, ordenado por prioridad. Última actualización: 2026-07-08.
> Detalle de sub-temas en `v2/PLAN.md` y `docs/desktop-cloud-sync.md`.

## Estado general

| Producto | Estado |
|---|---|
| **App escritorio** (Electron) | **v4.8.0 en producción** (release + autoupdate). Login cloud, sync multi-PC, catálogo AIR con IVA por rubro, cotización del dólar automática, documentos entrelazados y esquemas/kits. |
| **Plataforma v2 SaaS** | API en Render + DB Neon + Panel en Vercel — **en vivo**. |
| **App móvil** (Expo) | Construida (Fase 4), sin publicar en stores. |

---

## 1. Sync multi-PC — completar cobertura 🟡

**Base ya en producción desde v4.4.0:** login cloud, badge de estado, cola de
sync offline-first, mappers y apply del pull para las entidades base.
Falta terminar la cobertura para que **todo** viaje entre PCs.

- [x] Login directo cloud (modelo A).
- [x] `api-client.ts` apunta a Render.
- [x] Pantalla "Conectar a la nube" en el login.
- [x] Aplicar `pull` en SQLite (clientes, proveedores, artículos con mapper).
- [x] Escrituras de clientes/proveedores/artículos encoladas.
- [x] Indicador de estado en el status bar.
- [x] Fix v4.4.4: fallback HTTP en catálogo AIR cuando el server devuelve 403.
- [x] v4.5.0: búsqueda con `+` multi-término, IVA desde catálogo AIR y debounce.
- [x] Reintento automático de la cola con **backoff exponencial** y reactivación
      al reconectar; fallos permanentes se aparcan y se pueden desaparcar (paso 1).
- [x] **Numeración de comprobantes multi-PC** — el server asigna rangos por tenant
      (`POST /sequences/reserve`, Hi/Lo) y el desktop los consume offline-first con
      fallback local y high-water mark (paso 3).
- [x] **Documentos** (facturas, remitos, órdenes de compra, etc.) — viajan como
      *envelope lossless* (cabecera + ítems + movimientos) vía `document_snapshot`
      (paso 4).
- [x] **Stock y caja** — los movimientos viajan como datos dentro del envelope del
      documento y se aplican sin re-ejecutar efectos (sin doble conteo) (paso 5).
- [x] **Propagación de borrados** de documentos (baja + reversa de efectos en la
      otra PC); soft-delete de maestros ya estaba.
- [ ] **Pendiente de release**: los cambios tocan `src/` → requiere **v4.6.0** con
      autoupdate. Además correr `prisma migrate deploy` en la API (migración
      `0002_synced_documents`).
- [ ] **Warehouses/cajas custom**: hoy los movimientos referencian los ids por
      defecto (`wh-default`/`ca-default`, iguales en toda PC). Si se crean depósitos
      o cajas propias, falta sincronizarlos como maestros.
- [x] **Entidades v4.8.0 local-only**: `exchange_rates`, `document_links` y
      `kit_components` ahora sí viajan (rama `feat/sync-fase-f`).
      Migración Prisma `0003_sync_fase_f` + mappers + `enqueueChange` en cada
      write site + `applyRemoteChange` en el pull. Pendiente merge y
      `prisma migrate deploy` en Neon (ver Fase F).

## 2. Fase 6.5 — Tests 🟡

- [x] Migración Prisma inicial (`prisma migrate deploy`).
- [x] Vitest en la API + suite de billing (9 tests).
- [ ] Tests de `registerTenant` / alta de empresa.
- [ ] Tests de documentos (cálculo de IVA/totales, numeración).
- [ ] E2E con Playwright del panel maestro (login, alta empresa, bloqueo).

## 3. Fase 6.6 — Billing real y lanzamiento 🟡

- [x] Deploy productivo (Render + Neon + Vercel).
- [x] Alta de empresas desde el panel maestro.
- [ ] Integración **real** de Mercado Pago / Stripe (hoy el checkout/webhooks son stubs;
      falta llamar a las APIs reales y validar firmas de webhook).
- [ ] Verificar el ciclo de morosidad automatizado en producción (cron diario).
- [ ] Migrar Render/Neon/Vercel a planes pagos si hace falta (el free de Render duerme
      el servicio a los 15 min → primera carga lenta).
- [ ] Dominios propios (API + panel) y HTTPS con dominio de marca.
- [ ] Beta cerrada → beta abierta → GA.

## 4. Panel maestro — completar funciones 🟢

- [ ] Revisar páginas internas que puedan tener datos incompletos por "shape" de la API
      (detalle de empresa, suscripciones) — ir alineando a medida que se usan.
- [ ] Edición/gestión de planes y límites desde el panel (hoy es solo lectura).
- [ ] Acciones sobre empresas (bloquear/reactivar/cancelar) — verificar que funcionen end-to-end.

## 5. App móvil 🟢

- [ ] Apuntar la API a Render y probar login + escáner contra datos reales.
- [ ] Build con EAS y publicación (Play Store / App Store) cuando se defina.

## 6. Higiene / técnico 🟢

- [x] AFIP/ARCA: integración real de facturación electrónica (WSAA/WSFE, estados fiscales, CAE y QR).
      **Plan de fases detallado en [AFIP-ARCA.md](AFIP-ARCA.md).**
- [ ] Investigar el origen de los archivos basura (`{,`, `{`, `,-`, etc.) que
      aparecen en el working tree (parecen errores de shell); ya están
      gitignorados los `*.db`, pero conviene entender de dónde salen.
- [x] Rotar / cambiar credenciales sembradas por defecto. El `admin` local usa
      contraseña aleatoria por `seedDefaultAdmin`; `SUPERADMIN_EMAIL`/
      `SUPERADMIN_PASSWORD` son ahora obligatorias (fail-fast en seed).

---

## 7. Usabilidad y navegabilidad — plan de fases 🟢

> Backlog surgido de la revisión de UX del 2026-07-08. Las 3 features grandes de
> ese día (dólar, entrelazados, kits) ya están en **v4.8.0**. Lo de abajo es lo que
> quedó del brainstorm, agrupado por fases de impacto/esfuerzo. Todo lo de las
> Fases A–D vive en `src/shell.html` sin tocar la arquitectura.

### Fase A — Tablas del shell (alto impacto, bajo esfuerzo) 🎯
Es el "día a día". Nada de esto existe hoy en el shell.
- [ ] **Ordenar por columna** (click en encabezado, asc/desc, indicador visual).
- [ ] **Filtros rápidos por estado** (chips arriba de cada tabla: Pendiente / Facturado / Anulado…).
- [ ] **Navegación por teclado en filas** (↑/↓ para moverse, Enter = acción principal, doble click).
- [ ] **Paginación o scroll virtual** (para cuando haya miles de facturas/artículos).

### Fase B — Búsqueda y navegación global
- [ ] **Ctrl+K / Command Palette** — buscar cualquier cliente/factura/artículo y ejecutar acciones ("nueva factura") desde un solo lugar. *La de mayor salto de fluidez.*
- [ ] **Ítems recientes** — últimos 10 documentos/entidades abiertos (sidebar o dashboard).
- [ ] **Colapsar secciones del sidebar** con estado persistido (+ modo compacto solo-íconos).
- [ ] **Favoritos / anclar vistas** por rol (el que factura no necesita ver RMA).

### Fase C — Trazabilidad visible y drill-down
Aprovecha la infra ya creada en v4.8.0 (`document_links` + `getLinksFor`).
- [ ] **Links clickeables entre entidades** en las tablas: factura → cliente, cliente → cta. cte., pedido → remito → factura.
- [ ] **Mostrar vínculos de documentos** (columna/panel "origen → derivados") — el backend ya los expone vía `db:doc-links:get`.
- [ ] **Panel de detalle lateral (drawer)** — click en fila abre detalle + acciones (imprimir/anular/duplicar) sin salir de la lista.

### Fase D — Flujos de documentos
- [ ] **Duplicar documento** ("nueva cotización igual a esta para otro cliente").
- [ ] **Conversión encadenada visible** — botón "Convertir a…" (cotización→pedido→remito→factura), reusando `document_links`.
- [ ] **Atajos visibles** — modal de ayuda "?" con la lista (los `Ctrl+Shift+X` de `menu.ts` ya existen pero nadie los descubre) + tooltips.

### Fase E — Apartados nuevos
- [ ] **Dashboard accionable** — no solo números: "5 facturas vencen esta semana", "3 artículos bajo mínimo", cada alerta clickeable a la vista filtrada.
- [ ] **Agenda / Vencimientos** — calendario de cheques, vencimientos de facturas de compra y seguimientos de CRM.
- [ ] **Notas / adjuntos** en documentos y clientes (PDF o nota interna).
- [ ] **Historial por entidad** — timeline cronológico de todas las operaciones de un cliente.
- [ ] **Notificaciones internas** (campanita: stock bajo, sync fallida, comprobante AFIP rechazado).

### Fase F — Deuda multi-PC de v4.8.0
- [x] Sincronizar `exchange_rates`, `document_links` y `kit_components` a la
      nube (rama `feat/sync-fase-f`). Falta:
  - `prisma migrate deploy` en Neon (`0003_sync_fase_f`)
  - Deploy de la API en Render
  - Release desktop v4.18.0 con autoupdate
  - Tests del `sync.service` para los 3 nuevos casos

---

## Referencias

- **Facturación electrónica AFIP/ARCA**: [AFIP-ARCA.md](AFIP-ARCA.md)
- Plan v2 detallado: [v2/PLAN.md](v2/PLAN.md)
- Sync multi-PC (diseño): [docs/desktop-cloud-sync.md](docs/desktop-cloud-sync.md)
- Infra cloud (URLs): API `https://asimov-api-lwci.onrender.com`, Panel `https://asimov-app.vercel.app`
