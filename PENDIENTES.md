# Asimov ERP — Pendientes / Roadmap

> Qué falta hacer, ordenado por prioridad. Última actualización: 2026-07-03.
> Detalle de sub-temas en `v2/PLAN.md` y `docs/desktop-cloud-sync.md`.

## Estado general

| Producto | Estado |
|---|---|
| **App escritorio** (Electron) | v4.3.0 en producción (release + autoupdate). Local-first, 1 empresa por PC. |
| **Plataforma v2 SaaS** | API en Render + DB Neon + Panel en Vercel — **en vivo**. |
| **App móvil** (Expo) | Construida (Fase 4), sin publicar en stores. |

---

## 1. Conexión cloud del desktop + sync multi-PC 🔴 (prioridad alta)

**Objetivo:** que una misma empresa abierta en varias PCs comparta datos
sincronizados. Hoy cada PC tiene su SQLite aislada. Diseño completo en
[docs/desktop-cloud-sync.md](docs/desktop-cloud-sync.md).

- [ ] Definir modelo de login del desktop (login directo cloud vs local-first + sync).
- [ ] Apuntar `src/api-client.ts` a la API de Render (hoy default `localhost:3000`).
- [ ] UI "Conectar a la nube" en el desktop (email + contraseña de la empresa).
- [ ] Aplicar el `pull` en la base local (insertar/actualizar filas remotas en SQLite).
- [ ] Enganchar **todas** las escrituras del desktop a `enqueueChange` (cola de sync).
- [ ] Propagación de borrados (soft-delete) en ambos sentidos.
- [ ] Cobertura de entidades en pull/push (clientes, proveedores, productos, stock,
      documentos, cta. cte., caja).
- [ ] **Numeración de comprobantes multi-PC**: que la asigne el server por tenant
      (evitar que dos PCs tomen el mismo número).
- [ ] Indicador de estado de sync en la UI (conectado / sincronizando / offline / pendientes).
- [ ] Release v4.4.0 con todo lo anterior (toca `src/` → requiere release + autoupdate).

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
- [ ] Investigar el origen de los archivos basura (`{,`, `{`, etc.) que aparecen en el
      working tree (parecen errores de shell); ya están gitignorados los `*.db`.
- [ ] Rotar / cambiar credenciales sembradas por defecto (`admin/asimov`,
      `ventas@bartez.com.ar/3418`, `SUPERADMIN_PASSWORD`) antes de producción real.

---

## Referencias

- Plan v2 detallado: [v2/PLAN.md](v2/PLAN.md)
- Sync multi-PC (diseño): [docs/desktop-cloud-sync.md](docs/desktop-cloud-sync.md)
- Infra cloud (URLs): API `https://asimov-api-lwci.onrender.com`, Panel `https://asimov-app.vercel.app`
