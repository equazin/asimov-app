# Asimov ERP — Pendientes / Roadmap

> Qué falta hacer, ordenado por prioridad. Última actualización: 2026-07-04.
> Detalle de sub-temas en `v2/PLAN.md` y `docs/desktop-cloud-sync.md`.

## Estado general

| Producto | Estado |
|---|---|
| **App escritorio** (Electron) | **v4.5.0 en producción** (release + autoupdate). Login cloud, sync multi-PC, catálogo AIR con IVA por rubro. |
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

- [ ] AFIP: integración real de facturación electrónica (hoy stub WSAA/WSFE).
- [ ] Investigar el origen de los archivos basura (`{,`, `{`, `,-`, etc.) que
      aparecen en el working tree (parecen errores de shell); ya están
      gitignorados los `*.db`, pero conviene entender de dónde salen.
- [ ] Rotar / cambiar credenciales sembradas por defecto (`admin/asimov`,
      `ventas@bartez.com.ar/3418`, `SUPERADMIN_PASSWORD`) antes de producción real.

---

## Referencias

- Plan v2 detallado: [v2/PLAN.md](v2/PLAN.md)
- Sync multi-PC (diseño): [docs/desktop-cloud-sync.md](docs/desktop-cloud-sync.md)
- Infra cloud (URLs): API `https://asimov-api-lwci.onrender.com`, Panel `https://asimov-app.vercel.app`
