# Asimov Desktop ↔ Nube — Sincronización multi-PC

> Documento de requisitos y diseño de la conexión entre la app de escritorio
> (Electron, local-first) y la plataforma SaaS v2 (API NestJS + Postgres/Neon).
> **Estado: pendiente de implementar.** Última actualización: 2026-07-03.

## Objetivo

Que **una misma empresa (tenant) abierta en varias PCs comparta los mismos datos**:
si en la PC A se carga una factura o un cliente, en la PC B tiene que aparecer
(en tiempo casi real). Hoy cada instalación del desktop tiene su propia base
SQLite aislada; no están relacionadas.

Requisitos concretos:
- **Datos compartidos por empresa**: todas las PCs de una empresa ven lo mismo.
- **Multi-PC simultáneo**: varias sesiones abiertas a la vez, sin corromper datos.
- **Offline-first**: si se cae internet, la PC sigue operando local y sincroniza
  al reconectar (no se pierde trabajo).
- **Resolución de conflictos** clara cuando dos PCs editan lo mismo.

## Modelo conceptual

```
   PC A (SQLite local) ─┐
   PC B (SQLite local) ─┼──► API v2 (Render) ──► Postgres/Neon (tenant)
   PC C (SQLite local) ─┘        ▲  push/pull
   App móvil / Panel ───────────┘
```

- Cada PC trabaja **local-first** contra su SQLite (rápido, funciona offline).
- Un **sync engine** empuja los cambios locales (`push`) y trae los remotos
  (`pull`) contra el **mismo tenant** en la nube. Ese tenant es la fuente de verdad.
- La empresa en la nube (creada desde el panel maestro) es la que agrupa a todas
  las PCs: todas se loguean/sincronizan contra ese `tenantId`.

## Estado actual (lo que YA existe)

### Desktop (`src/`)
- `sync.ts`: motor de sync offline-first.
  - Tablas `sync_queue` (cola de cambios locales) y `sync_state` (`last_sync`).
  - `enqueueChange`, `getPendingChanges`, `runSync()` con timer cada **30s**.
  - Conflictos: **last-write-wins (server wins)**.
- `api-client.ts`: login JWT contra la API, guarda tokens, `net.fetch`.
  - ⚠️ URL por defecto: `http://localhost:3000/api/v1` (hay que apuntar a Render).
- `ipc-cloud.ts` + `cloud-preload.ts`: exponen `window.cloud` (login/logout/status/
  test/set-url) y `window.sync` (run/status/start-auto/stop-auto) al renderer.

### API v2 (`v2/packages/api/src/modules/sync/`)
- `GET /sync/pull?since=<timestamp>`: devuelve cambios del tenant desde esa fecha.
- `POST /sync/push`: aplica un batch de cambios (last-write-wins).
- Cubre entidades: clientes, productos, documentos, … (revisar cobertura completa).

## Lo que FALTA para cumplir el objetivo

- [ ] **UI de conexión cloud en el desktop**: pantalla "Conectar a la nube"
      (email + contraseña de la empresa) que llame a `window.cloud.login` y
      fije la URL de la API a Render. Hoy el plumbing existe pero no hay interfaz.
- [ ] **Apuntar la URL por defecto** de `api-client.ts` a
      `https://asimov-api-lwci.onrender.com/api/v1` (o configurable, con la de
      Render como default de producción).
- [ ] **Aplicar los cambios del `pull` en la base local** (verificar que `runSync`
      inserte/actualice las filas remotas en SQLite, no solo que las traiga).
- [ ] **Enganchar TODAS las escrituras del desktop a `enqueueChange`** (que cada
      alta/edición/baja se encole para push). Revisar cobertura por entidad.
- [ ] **Propagación de borrados** (soft-delete) en ambos sentidos.
- [ ] **Cobertura de entidades**: asegurar que pull/push cubran todo lo compartible
      (clientes, proveedores, productos, stock, documentos, cta. cte., caja…).
- [ ] **Numeración de comprobantes multi-PC**: evitar que dos PCs tomen el mismo
      número. Idealmente la numeración la asigna el server (o secuencias por tenant).
- [ ] **Feedback en la UI**: indicador de estado (conectado / sincronizando /
      offline / N cambios pendientes / último sync).

## Decisiones pendientes (definir antes de implementar)

1. **Modelo de login del desktop**:
   - (A) Login directo contra la nube (entrás con la empresa cloud, opera online).
   - (B) Local-first + botón "Conectar y sincronizar" (login local, sync aparte).
   - > Recomendado para multi-PC: **A**, para que el usuario y el `tenantId` salgan
     de la nube y todas las PCs queden atadas a la misma empresa. El offline se
     resuelve cacheando la sesión + la cola local.
2. **Tiempo real**: ¿alcanza con polling cada 30s, o hace falta menor latencia
   (polling más corto / WebSocket / SSE)? Empezar con polling, evaluar realtime luego.
3. **Conflictos**: hoy es last-write-wins (server wins). ¿Suficiente, o hace falta
   merge por campo / detección para el usuario en casos sensibles (stock, saldos)?
4. **Numeración**: mover la asignación de número de comprobante al server por tenant.
5. **Migración inicial**: cuando una empresa conecta una PC con datos locales
   preexistentes, ¿se suben esos datos a la nube (primer push masivo) o se baja lo
   de la nube? Definir el "primer emparejamiento".

## Impacto en releases

Todo esto toca `src/` del desktop → **requiere un release nuevo** (v4.3.0) con
autoupdate. Bundlear el alta de usuario cloud + la UI de conexión + los fixes de
sync en un solo release.

## Referencias de código

- Desktop sync: `src/sync.ts`, `src/api-client.ts`, `src/ipc-cloud.ts`, `src/cloud-preload.ts`
- API sync: `v2/packages/api/src/modules/sync/`
- Plan general v2: `v2/PLAN.md`
