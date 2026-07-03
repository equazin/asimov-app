# Asimov ERP v2 — Plan de Trabajo SaaS Multi-Tenant

## Resumen
Evolucionar Asimov ERP de app desktop Electron single-tenant a plataforma SaaS multi-tenant con API centralizada, panel de administración maestro, y app móvil.

---

## Fases

### Fase 0.1 — Monorepo + Shared Package ✅ COMPLETADA
- Turborepo con workspaces: `shared`, `api`, `admin`, `mobile`
- Tipos compartidos: Tenant, Auth, ERP, API
- Constantes: planes, límites, morosidad, IVA, provincias
- Validaciones Zod: login, registro, cliente, producto, documento

### Fase 0.2 — Esquema Prisma Multi-Tenant ✅ COMPLETADA
- 22 modelos Prisma con `tenantId` en todas las tablas de negocio
- Modelo unificado `Document` (11 tipos: quote, sale_order, invoice, etc.)
- Planes, suscripciones, pagos, feature flags
- Seed: 4 planes, tenant demo, usuario admin, secuencias

### Fase 1.1 — API NestJS Core ✅ COMPLETADA
- Bootstrap NestJS con Helmet, CORS, Swagger
- Auth JWT (access + refresh tokens) con Passport
- Guards globales: JwtAuth, Roles, TenantStatus, PlanLimit
- Decorators: @CurrentUser, @Public, @Roles

### Fase 1.2 — Módulos ERP (CRUD) ✅ COMPLETADA
- Clientes: CRUD paginado con búsqueda y soft delete
- Proveedores: CRUD con soft delete
- Productos: CRUD + lookup por código de barras + categorías
- Documentos: CRUD con cálculo automático de IVA/totales, numeración secuencial
- Stock: movimientos, alertas de stock bajo, consulta por depósito/producto
- Tenant: gestión maestro, dashboard KPIs (MRR, ARR, tenants)

### Fase 2 — Panel Maestro Admin (Next.js) ✅ COMPLETADA
- Next.js 15 + App Router + Tailwind CSS con colores Ink/Ion
- Login con JWT + Zustand store para auth
- Dashboard: KPIs (MRR, ARR, tenants activos, por vencer, distribución por plan)
- Gestión de tenants: listado con búsqueda/filtros, detalle con acciones (bloquear/desbloquear/cancelar)
- Detalle de tenant: info empresa, suscripción, historial de pagos, métricas
- Vista de suscripciones: tabla + visualización del ciclo de morosidad
- Auditoría: logs de actividad con filtros por acción
- Settings: planes/límites, ciclo morosidad, notificaciones
- Componentes UI: Button, Input, Select, Badge, Card, KpiCard, Sidebar, Shell
- API client: apiFetch, apiGet, apiPost, apiPatch, apiDelete
- 21 archivos creados en packages/admin/

### Fase 3 — Migración Desktop Electron → API Client ✅ COMPLETADA
- API client (api-client.ts): login/logout JWT, auto-refresh tokens, net.fetch
- Sync engine (sync.ts): offline-first con sync_queue + sync_state en SQLite
- Estrategia: write-local-first → enqueue → push → pull → apply
- IPC handlers cloud (ipc-cloud.ts): cloud:login/logout/status/test, sync:run/status
- Cloud preload bridge: window.cloud + window.sync para renderer
- Backend: SyncModule con pull (changes since timestamp) y push (batch apply)
- Conflict resolution: last-write-wins (server wins)
- Auto-sync timer: 30s interval cuando conectado

### Fase 4 — App Móvil Android + iOS (Expo) ⬚ PENDIENTE
- Expo (React Native) con navegación tab + stack
- Módulos: Dashboard, Ventas rápidas, Stock scanner (cámara), Clientes
- Push notifications (FCM/APNs)
- Biometría (huella/face) para login rápido
- Sync real-time con WebSockets

### Fase 5 — AFIP + Reportes + Personalización Avanzada ⬚ PENDIENTE
- Integración AFIP: factura electrónica, CAE/CAEA
- Reportes PDF: facturas, remitos, recibos con membrete personalizado
- Exportación Excel/CSV
- Dashboard analytics por tenant
- Templates de impresión personalizables (drag & drop)

### Fase 6 — Billing, QA y Lanzamiento ⬚ PENDIENTE
- Integración Mercado Pago (Argentina) + Stripe (internacional)
- Webhooks de pago → actualización automática de suscripción
- Ciclo completo de morosidad automatizado
- E2E tests con Playwright
- CI/CD: GitHub Actions → deploy API (Railway/Fly.io), Admin (Vercel), Mobile (EAS)
- Beta cerrada → beta abierta → GA

---

## Stack Tecnológico
| Componente | Tecnología |
|---|---|
| Monorepo | Turborepo |
| API | NestJS + Prisma + PostgreSQL |
| Admin Panel | Next.js 15 + shadcn/ui + Tailwind |
| Mobile | Expo (React Native) |
| Auth | JWT (access + refresh) + bcrypt |
| Validación | Zod (shared) |
| DB | PostgreSQL (multi-tenant por columna) |
| Storage | Cloudflare R2 (logos, attachments) |
| Billing | Mercado Pago + Stripe |
| CI/CD | GitHub Actions |
