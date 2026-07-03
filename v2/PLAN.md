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
