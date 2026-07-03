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

### Fase 4 — App Móvil Android + iOS (Expo) ✅ COMPLETADA
- Expo SDK 52 + Expo Router (file-based routing) + TypeScript
- Auth: login con JWT, SecureStore para tokens, auto-refresh
- 5 tabs: Dashboard, Ventas, Escáner, Clientes, Más
- Dashboard: KPIs (clientes, productos, documentos, ventas mes), pull-to-refresh
- Ventas: listado de documentos con búsqueda, tipo/número/cliente/total
- Scanner: CameraView con barcode scanning (EAN13/EAN8/UPC/Code128/Code39), lookup de producto con stock
- Clientes: listado con búsqueda, avatar, CUIT, teléfono
- Más: perfil, stock, compras, reportes, sync, settings, logout
- Tema dark Ink/Ion consistente con admin panel
- Configurado para Android (com.asimov.erp) + iOS (camera permission)

### Fase 5 — AFIP + Reportes + Personalización Avanzada ✅ COMPLETADA
- AFIP Module: autenticación WSAA, solicitud CAE via WSFE, último número autorizado
  - Soporte para tipos de comprobante (A, B, C) según condición fiscal
  - Endpoints: POST /afip/cae, GET /afip/last-number, POST /afip/test-auth
- Reports Module: reportes de ventas (top clientes, top productos, totales diarios),
  stock (por categoría, por depósito, alertas), cuentas corrientes (saldos clientes/proveedores)
  - Exportación CSV: clientes, productos, documentos con filtros
  - Endpoints: GET /reports/sales, /reports/stock, /reports/accounts, /reports/export
- Customization Module: branding por tenant (logo, color, membrete, pie de página),
  templates de impresión HTML con interpolación de variables, render de documentos
  - Endpoints: GET/PATCH /customization/branding, CRUD /customization/templates,
    GET /customization/render/:documentId
- Template engine con variables: {{company.*}}, {{document.*}}, {{client.*}}, {{items}}

### Fase 6 — Billing, QA y Lanzamiento 🔧 EN PROGRESO

#### 6.1 — Billing (Mercado Pago + Stripe) ✅ COMPLETADA
- BillingModule registrado en app.module (antes quedó sin cablear)
- `createPaymentPreference`: elige gateway según país del tenant (AR → Mercado Pago, resto → Stripe)
- Checkout: crea `SubscriptionPayment` en estado `pending` y devuelve URL de pago
- Webhooks públicos: `/billing/webhook/mercadopago` y `/billing/webhook/stripe`
  - Mapeo de estados → `paid`/`failed`/`pending`
  - Pago aprobado → activa suscripción (nuevo período +1 mes) y reactiva tenant
- `GET /billing/history`: historial de pagos por suscripción
- Alineado a schema real: `paymentProvider`, `externalPaymentId` (antes usaba nombres inexistentes)

#### 6.2 — Ciclo de morosidad automatizado ✅ COMPLETADA
- `BillingScheduler` con `@nestjs/schedule` (cron diario 3 AM)
- `runMorosidadCheck`: recorre suscripciones vencidas y aplica timeline
  (grace_period → read_only → blocked) según `MOROSIDAD_TIMELINE`
- Endpoint manual `POST /billing/morosidad/check` (rol owner)

#### 6.3 — Build verde + tooling monorepo ✅ COMPLETADA
- Corregidos 37 errores de compilación preexistentes en toda la API (nunca se había buildeado)
  - customization: campos `type`/`html`/`tenantId` alineados al modelo + fix de template literal
  - reports: `ivaPct`/`ivaAmount` (antes `ivaRate`/`totalIva`)
  - sync: `entityType`/`newValues` en AuditLog
  - AFIP: limpieza de variables sin usar; imports muertos varios
- `tsconfig` API: `declaration: false` (es app, no librería) → elimina errores TS4053
- Schema: `PrintTemplate` ahora es multi-tenant (`tenantId` + relación + índice)
- `pnpm-workspace.yaml` + lockfile generado → monorepo instalable
- `pnpm turbo build` de API pasa con 0 errores

#### 6.4 — CI/CD ✅ SCAFFOLDEADO
- `.github/workflows/ci.yml`: lint+typecheck, api-tests (Postgres service), admin-build
- `.github/workflows/deploy.yml`: deploy API/Admin/Mobile gated por mensaje de commit
- Pendiente: descomentar/activar deploy real (Railway/Fly, Vercel, EAS) con secrets

#### 6.5 — Tests 🔧 EN PROGRESO
- ✅ Migración Prisma inicial (`prisma/migrations/0000_init`) + `migration_lock.toml`
  → `prisma migrate deploy` ya funciona en CI y en despliegue real
- ✅ Vitest configurado en la API (reemplaza Jest) + suite de billing
  - 9 tests: selección de gateway por país, webhooks MP/Stripe (paid/failed/no-op),
    ciclo de morosidad (warned/grace/read_only/blocked), reactivación de suscripción
- ✅ `.spec.ts` excluidos del `nest build`
- ⬚ Pendiente: tests de auth/registerTenant, documentos (IVA/totales), E2E Playwright (admin)

#### 6.6 — Lanzamiento 🔧 EN PROGRESO
- ✅ Cuenta principal `superadmin` + panel maestro protegido por rol
- ✅ API lista para PaaS: bind 0.0.0.0, `start:prod` corre `migrate deploy`,
  Prisma `binaryTargets` para Debian, CORS por env
- ✅ `Dockerfile` + `.dockerignore` para la API monorepo (Render/Railway/Fly)
- ✅ `render.yaml` (blueprint Render, plan free) + health endpoint público
- ✅ `vercel.json` del admin (build de shared antes que admin)
- ✅ Stack gratis: Neon (Postgres) + Render (API) + Vercel (admin)
- ⬚ Pendiente (requiere cuentas del usuario): crear DB Neon, deploy Render,
  proyecto Vercel, cargar secrets, correr seed, apuntar CORS/API_URL
- ⬚ Beta cerrada → beta abierta → GA

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
