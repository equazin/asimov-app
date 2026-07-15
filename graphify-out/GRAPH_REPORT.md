# Graph Report - Asimov ERP  (2026-07-15)

## Corpus Check
- 256 files · ~373,171 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2348 nodes · 4896 edges · 153 communities (117 shown, 36 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `13177207`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- documents.ts
- ipc.ts
- page.tsx
- sync.ts
- main.ts
- api.ts
- dependencies
- BillingService
- Fases
- package.json
- scripts
- ProductsController
- PrismaService
- afip.service.ts
- TenantController
- dependencies
- CustomizationService
- package.json
- app.module.ts
- wsfe.ts
- dependencies
- ReportsController
- StockController
- What You Must Do When Invoked
- ClientsController
- DocumentsService
- SuppliersController
- expo
- Asimov ERP — Research de mercado y precios
- RequestUser
- SyncService
- compilerOptions
- comprobante-print.js
- compilerOptions
- Asimov
- compilerOptions
- compilerOptions
- auth.module.ts
- sequences.controller.ts
- Asimov — Manual de marca
- Módulos del ERP (relevados del shell y los formularios nativos)
- erp.ts
- index.ts
- generate-icons.js
- copy-assets.js
- tenant.ts
- graphify reference: extra exports and benchmark
- preload.ts
- api.ts
- Global Constraints
- index.ts
- auth.ts
- tsconfig.json
- graphify reference: query, path, explain
- smoke-test.js
- nest-cli.json
- tsconfig.json
- apply-brand-theme.js
- vercel.json
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- layout.tsx
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- client-selection-preload.ts
- login-preload.ts
- new-article-preload.ts
- new-client-preload.ts
- new-delivery-note-preload.ts
- new-goods-receipt-preload.ts
- new-invoice-preload.ts
- new-payment-order-preload.ts
- new-purchase-invoice-preload.ts
- new-purchase-order-preload.ts
- new-quote-preload.ts
- new-receipt-preload.ts
- new-sale-order-preload.ts
- new-supplier-preload.ts
- product-selection-preload.ts
- supplier-selection-preload.ts
- seed.ts
- CLAUDE.md
- CLAUDE.md
- extraction-spec.md
- next.config.ts
- next-env.d.ts
- tailwind.config.ts
- menu.ts
- getDb
- migration.sql
- masters.ts
- db.ts
- RequestUser
- migration.sql
- migration.sql
- afip.test.ts
- prisma.service.ts
- AfipController
- domain.ts
- api-client.ts
- afip.test.ts
- dbAll
- stock.module.ts
- Fases
- AFIP / ARCA — Facturación electrónica: estado y plan de fases
- Plan de fases
- 7. Usabilidad y navegabilidad — plan de fases 🟢
- auth.module.ts
- Fase 6 — Billing, QA y Lanzamiento 🔧 EN PROGRESO
- PENDIENTES.md
- Global Constraints
- AuthService
- tray.ts
- padron.ts
- dbGet
- afip.ts
- ApiOperation
- auth.module.ts
- libro-iva.ts
- Global Constraints
- dbAll
- shell-invoice-fiscal-status.test.ts
- Global Constraints
- new-article-kit-ui.test.ts
- new-invoice-margin-kit-ui.test.ts
- ipc-cloud.ts
- auth.module.ts
- Pedidos y cotizaciones con kits, margen y dólar oficial Implementation Plan
- Global Constraints
- shell-cloud-recovery.test.ts
- dbRun
- auth.module.ts
- sync-bootstrap.ts
- Global Constraints
- AuthService
- dbAll
- AfipController
- new-quote-client-ui.test.ts
- openNativeForm
- sequences.controller.ts
- Global Constraints
- purchase-document-flow-ui.test.ts
- menu.ts
- AfipController
- migration.sql

## God Nodes (most connected - your core abstractions)
1. `dbRun()` - 98 edges
2. `dbGet()` - 79 edges
3. `dbAll()` - 77 edges
4. `RequestUser` - 60 edges
5. `getDb()` - 58 edges
6. `CurrentUser` - 58 edges
7. `PrismaService` - 48 edges
8. `registerIpcHandlers()` - 42 edges
9. `enqueueChange()` - 32 edges
10. `registerCrmIpc()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `registerAppIpc()` --references--> `url`  [EXTRACTED]
  src/ipc/app.ts → package.json
- `run()` --indirect_call--> `d()`  [INFERRED]
  scripts/verify-shell-bridge.js → src/comprobante-print.js
- `resetCrm()` --calls--> `getDb()`  [EXTRACTED]
  test/crm.test.ts → src/db.ts
- `seedClient()` --calls--> `getDb()`  [EXTRACTED]
  test/crm.test.ts → src/db.ts
- `row()` --calls--> `getDb()`  [EXTRACTED]
  test/masters.test.ts → src/db.ts

## Import Cycles
- None detected.

## Communities (153 total, 36 thin omitted)

### Community 0 - "documents.ts"
Cohesion: 0.13
Nodes (43): formatDocNumber(), nextSequence(), DocumentSource, AnnulEffect, ANNULLABLE, AnnulResult, applyCashDelta(), applyStockDelta() (+35 more)

### Community 1 - "ipc.ts"
Cohesion: 0.05
Nodes (84): apiAuthorizedFetch(), apiCreateDocument(), apiFetch(), apiGetClient(), apiGetClients(), apiGetDocuments(), apiGetProduct(), apiGetProducts() (+76 more)

### Community 2 - "page.tsx"
Cohesion: 0.07
Nodes (58): actionOptions, actionVariant, AuditEntry, AuditPage(), DashboardLayout(), DashboardData, DashboardPage(), SubscriptionRow (+50 more)

### Community 3 - "sync.ts"
Cohesion: 0.13
Nodes (42): Activity, ActivityType, ClientCrmSummary, completeTask(), CrmAccountListItem, CrmAccountWorkspace, deleteActivity(), deleteOpportunity() (+34 more)

### Community 4 - "main.ts"
Cohesion: 0.06
Nodes (39): getWindowBounds(), setWindowBounds(), APP_ICON_FILE, CLIENT_SELECTION_FILE, completeLogin(), createClientSelectionWindow(), createLoginWindow(), createMainWindow() (+31 more)

### Community 5 - "api.ts"
Cohesion: 0.16
Nodes (14): Index(), RootLayout(), apiFetch(), ApiUser, clearTokens(), initApi(), isAuthenticated(), login() (+6 more)

### Community 6 - "dependencies"
Cohesion: 0.09
Nodes (23): dependencies, @asimov/shared, bcryptjs, class-transformer, class-validator, fast-xml-parser, helmet, @nestjs/common (+15 more)

### Community 7 - "BillingService"
Cohesion: 0.07
Nodes (21): Cron, BillingController, ApiBearerAuth, ApiTags, Body, Controller, Get, Param (+13 more)

### Community 8 - "Fases"
Cohesion: 0.20
Nodes (10): API v2 (`v2/packages/api/src/modules/sync/`), Asimov Desktop ↔ Nube — Sincronización multi-PC, Decisiones pendientes (definir antes de implementar), Desktop (`src/`), Estado actual, Estado actual (lo que YA existe), Impacto en releases, Modelo conceptual (+2 more)

### Community 9 - "package.json"
Cohesion: 0.04
Nodes (46): author, email, name, dependencies, better-sqlite3, electron-store, electron-updater, fast-xml-parser (+38 more)

### Community 10 - "scripts"
Cohesion: 0.06
Nodes (33): devDependencies, turbo, typescript, engines, node, name, private, scripts (+25 more)

### Community 11 - "ProductsController"
Cohesion: 0.11
Nodes (15): ProductsController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Delete, Get (+7 more)

### Community 12 - "PrismaService"
Cohesion: 0.06
Nodes (18): JwtAuthGuard, Injectable, PlanLimitGuard, Injectable, RolesGuard, Injectable, TenantStatusGuard, Injectable (+10 more)

### Community 13 - "afip.service.ts"
Cohesion: 0.07
Nodes (52): certNotAfter(), decryptSecret(), encryptSecret(), isEncrypted(), loadEncKey(), signTRA(), AFIP_IVA_CODES, AfipAlicIva (+44 more)

### Community 14 - "TenantController"
Cohesion: 0.12
Nodes (38): registerWhatsappIpc(), authHeader(), getConversationRemote(), getMessagesRemote(), getWhatsappConfig(), isWhatsappEnabled(), listChatsRemote(), listConversationsRemote() (+30 more)

### Community 15 - "dependencies"
Cohesion: 0.06
Nodes (30): dependencies, @asimov/shared, date-fns, expo, expo-camera, expo-local-authentication, expo-notifications, expo-router (+22 more)

### Community 16 - "CustomizationService"
Cohesion: 0.10
Nodes (16): CurrentUser, CustomizationController, ApiBearerAuth, ApiTags, Body, Controller, Get, Param (+8 more)

### Community 17 - "package.json"
Cohesion: 0.07
Nodes (29): default, import, types, default, dependencies, zod, devDependencies, typescript (+21 more)

### Community 18 - "app.module.ts"
Cohesion: 0.19
Nodes (16): AFIP_IVA_CODES, AfipAlicIva, afipIvaCode(), buildIvaAlicuotas(), CONDICION_IVA_RECEPTOR, condicionIvaReceptorId(), getInvoiceTypeCode(), normalizeIvaCondition() (+8 more)

### Community 19 - "wsfe.ts"
Cohesion: 0.14
Nodes (26): qrcode, requestCae(), afipDate(), AfipMessage, buildFECAESolicitarEnvelope(), buildUltimoAutorizadoEnvelope(), CaeRejected, CaeResult (+18 more)

### Community 20 - "dependencies"
Cohesion: 0.07
Nodes (27): dependencies, @asimov/shared, clsx, date-fns, lucide-react, next, react, react-dom (+19 more)

### Community 21 - "ReportsController"
Cohesion: 0.11
Nodes (16): ReportsController, ApiBearerAuth, ApiTags, Controller, Get, Query, Res, Roles (+8 more)

### Community 22 - "StockController"
Cohesion: 0.12
Nodes (12): StockController, ApiBearerAuth, ApiTags, Body, Controller, Get, Param, Post (+4 more)

### Community 23 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 24 - "ClientsController"
Cohesion: 0.11
Nodes (15): ClientsController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Delete, Get (+7 more)

### Community 25 - "DocumentsService"
Cohesion: 0.12
Nodes (14): DocumentsController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get, Param (+6 more)

### Community 26 - "SuppliersController"
Cohesion: 0.11
Nodes (14): SuppliersController, ApiBearerAuth, ApiTags, Body, Controller, Delete, Get, Param (+6 more)

### Community 27 - "expo"
Cohesion: 0.08
Nodes (24): backgroundColor, foregroundImage, adaptiveIcon, package, permissions, expo, android, icon (+16 more)

### Community 28 - "Asimov ERP — Research de mercado y precios"
Cohesion: 0.09
Nodes (22): 1. Competidores — Argentina, 2. Competidores — España, 3. Contexto legal (argumento de venta), 4. Análisis de landings (qué tomamos de cada una), 5. Propuesta de planes Asimov (3 planes, por país), 6. FAQ definidas según el research, Argentina (ARS/mes + IVA), Asimov ERP — Research de mercado y precios (+14 more)

### Community 29 - "RequestUser"
Cohesion: 0.30
Nodes (15): isAfipUnavailable(), authorizeStoredInvoice(), buildStoredInvoiceQr(), CaeRequestInput, getAfipConfig(), getPendingCaeInvoices(), markInvoicePendingCae(), markInvoiceRejected() (+7 more)

### Community 31 - "compilerOptions"
Cohesion: 0.09
Nodes (21): compilerOptions, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames, lib, module (+13 more)

### Community 32 - "comprobante-print.js"
Cohesion: 0.15
Nodes (24): { app, BrowserWindow, ipcMain }, DIST, path, run(), band(), bandLeft(), bandRight(), caeBlock() (+16 more)

### Community 33 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, declaration, declarationMap, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib (+12 more)

### Community 34 - "Asimov"
Cohesion: 0.10
Nodes (18): Fase 0 — Persistencia de datos maestros + selectores ✅ (COMPLETADA), Fase 1 — Integridad transaccional (stock y caja) ✅ (COMPLETADA), Fase 2 — Seguridad y acceso ✅ (COMPLETADA — resto diferido/opcional), Fase 3 — Tests ✅ (COMPLETADA), Fase 4 — Deuda técnica y docs 🟡 (EN CURSO), Fase 5 — Fiscal y distribución 🟢, Plan de trabajo — Asimov, Asimov (+10 more)

### Community 35 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 36 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noImplicitReturns (+10 more)

### Community 37 - "auth.module.ts"
Cohesion: 0.18
Nodes (11): appIpc, copyAssets, dbIpc, ipc, main, optionalSource(), preload, shell (+3 more)

### Community 38 - "sequences.controller.ts"
Cohesion: 0.10
Nodes (20): Global, AppModule, Module, PrismaModule, Module, bootstrap(), AfipModule, Module (+12 more)

### Community 39 - "Asimov — Manual de marca"
Cohesion: 0.12
Nodes (16): 1. Idea rectora, 2. Logotipo, 3. Color, 4. Tipografía, 5. Voz, 6. Assets y dónde se usan, Asimov — Manual de marca, Clear space (zona de exclusión) (+8 more)

### Community 40 - "Módulos del ERP (relevados del shell y los formularios nativos)"
Cohesion: 0.12
Nodes (16): App de escritorio (diferencial fuerte), Asimov ERP — Análisis de producto, Compras, Contabilidad, CRM, Dashboard, Diferenciales para vender (vs. Xubio / Colppy / Contabilium / Holded), Facturación (Argentina: ARCA/ex AFIP) (+8 more)

### Community 41 - "erp.ts"
Cohesion: 0.12
Nodes (16): AccountMovement, AuditLogEntry, Client, Document, DocumentItem, DocumentStatus, DocumentType, FiscalType (+8 more)

### Community 42 - "index.ts"
Cohesion: 0.12
Nodes (16): ClientInput, clientSchema, CreateDocumentInput, createDocumentSchema, cuitSchema, documentItemSchema, emailSchema, LoginInput (+8 more)

### Community 43 - "generate-icons.js"
Cohesion: 0.17
Nodes (15): BRANDING, BUILD, fs, ICO_SIZES, ICON_MASTER, main(), path, PNG_OUT (+7 more)

### Community 44 - "copy-assets.js"
Cohesion: 0.13
Nodes (14): appIcon, appIconOut, bartezLogo, bartezLogoHi, bartezLogoHiOut, bartezLogoOut, brandIcon, brandIconOut (+6 more)

### Community 45 - "tenant.ts"
Cohesion: 0.20
Nodes (7): Plan, PlanTier, Subscription, SubscriptionStatus, Tenant, TenantStatus, TenantUsage

### Community 46 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 47 - "preload.ts"
Cohesion: 0.22
Nodes (7): api, AsimovApi, BookmarkEntry, NotifyPayload, PrintOptions, ShellBackground, ShellPreferences

### Community 48 - "api.ts"
Cohesion: 0.22
Nodes (8): ApiResponse, PaginationMeta, PaginationQuery, SyncChange, SyncConflict, SyncPullResponse, SyncPushRequest, SyncPushResponse

### Community 49 - "Global Constraints"
Cohesion: 0.25
Nodes (7): GESES Shell Phase 1 Implementation Plan, Global Constraints, Task 1: Shell Preferences And Bookmarks Store, Task 2: Native GESES Module Menu, Task 3: Preload Shell Injection, Task 4: IPC And Native Actions, Task 5: Validation

### Community 50 - "index.ts"
Cohesion: 0.25
Nodes (7): DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES, IVA_RATES, MOROSIDAD_TIMELINE, PLAN_LIMITS, PROVINCES_AR, RATE_LIMITS

### Community 51 - "auth.ts"
Cohesion: 0.25
Nodes (7): DeviceOrigin, JwtPayload, LoginRequest, LoginResponse, RegisterTenantRequest, User, UserRole

### Community 52 - "tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, strict, extends, include, @/*

### Community 53 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 54 - "smoke-test.js"
Cohesion: 0.22
Nodes (8): appPath, child, electronPath, fs, os, path, smokeUserData, { spawn }

### Community 55 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 56 - "tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, outDir, rootDir, extends, include

### Community 57 - "apply-brand-theme.js"
Cohesion: 0.40
Nodes (4): fs, path, SRC, TARGETS

### Community 58 - "vercel.json"
Cohesion: 0.40
Nodes (4): buildCommand, framework, installCommand, $schema

### Community 59 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 60 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 61 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 88 - "menu.ts"
Cohesion: 0.20
Nodes (21): addBookmark(), BookmarkEntry, DEFAULTS, DesktopConfig, getBookmarks(), getPrintPreferences(), getShell(), getShellPreferences() (+13 more)

### Community 94 - "getDb"
Cohesion: 0.20
Nodes (9): CRM Operativo Integrado Implementation Plan, File Structure, Global Constraints, Self-Review, Task 1: Contratos de cuentas CRM, Task 2: Expose the workspace through IPC, Task 3: Build the integrated CRM workspace, Task 4: Verify behavior and quality (+1 more)

### Community 95 - "migration.sql"
Cohesion: 0.19
Nodes (25): "account_movements", "audit_logs", "cash_accounts", "cash_movements", "clients", "document_items", "documents", "feature_flags" (+17 more)

### Community 96 - "masters.ts"
Cohesion: 0.42
Nodes (8): authenticate(), DEFAULT_ADMIN, ensureUser(), generateInitialPassword(), hashPassword(), seedDefaultAdmin(), setUserPassword(), verifyPassword()

### Community 97 - "db.ts"
Cohesion: 0.15
Nodes (13): scripts, build, db:deploy, db:generate, db:migrate, db:seed, db:studio, dev (+5 more)

### Community 98 - "RequestUser"
Cohesion: 0.26
Nodes (8): closeDb(), DashboardKpis, ensureCrmIndexes(), initDb(), migrateCrmSchema(), migrateCrmUnification(), migrateInvoiceNumberUniqueness(), seedAirConfig()

### Community 101 - "afip.test.ts"
Cohesion: 0.50
Nodes (3): "document_links", "exchange_rates", "kit_components"

### Community 102 - "prisma.service.ts"
Cohesion: 0.17
Nodes (12): devDependencies, @nestjs/cli, @nestjs/schematics, @nestjs/testing, prisma, tsx, @types/bcryptjs, @types/express (+4 more)

### Community 103 - "AfipController"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 105 - "api-client.ts"
Cohesion: 0.36
Nodes (10): dbRun(), applySourceLink(), revertSourcesOnAnnul(), statusForLink(), annulDocument(), reverseCashFor(), reverseStockFor(), seedBase() (+2 more)

### Community 106 - "afip.test.ts"
Cohesion: 0.18
Nodes (14): certNotAfter(), isValidCertPem(), isValidKeyPem(), signTRA(), AfipUnavailableError, AfipQrData, buildAfipQrUrl(), buildLoginCmsEnvelope() (+6 more)

### Community 107 - "dbAll"
Cohesion: 0.24
Nodes (15): computeArsPrice(), DOLAR_CASAS, DolarRate, fetchDolarRates(), getLatestRates(), parseDolarResponse(), refreshDolarNow(), repriceArticlesFromUsd() (+7 more)

### Community 108 - "stock.module.ts"
Cohesion: 0.22
Nodes (9): 1. Sync multi-PC — completar cobertura 🟡, 2. Fase 6.5 — Tests 🟡, 3. Fase 6.6 — Billing real y lanzamiento 🟡, 4. Panel maestro — completar funciones 🟢, 5. App móvil 🟢, 6. Higiene / técnico 🟢, Asimov ERP — Pendientes / Roadmap, Estado general (+1 more)

### Community 110 - "Fases"
Cohesion: 0.22
Nodes (9): Fase 0.1 — Monorepo + Shared Package ✅ COMPLETADA, Fase 0.2 — Esquema Prisma Multi-Tenant ✅ COMPLETADA, Fase 1.1 — API NestJS Core ✅ COMPLETADA, Fase 1.2 — Módulos ERP (CRUD) ✅ COMPLETADA, Fase 2 — Panel Maestro Admin (Next.js) ✅ COMPLETADA, Fase 3 — Migración Desktop Electron → API Client ✅ COMPLETADA, Fase 4 — App Móvil Android + iOS (Expo) ✅ COMPLETADA, Fase 5 — AFIP + Reportes + Personalización Avanzada ✅ COMPLETADA (+1 more)

### Community 111 - "AFIP / ARCA — Facturación electrónica: estado y plan de fases"
Cohesion: 0.25
Nodes (7): AFIP / ARCA — Facturación electrónica: estado y plan de fases, Estado actual, Estados fiscales y operación desde la lista (2026-07-14), ✅ Fases 1–3 implementadas (2026-07-08), ❌ Lo que falta, Notas técnicas, Referencias

### Community 112 - "Plan de fases"
Cohesion: 0.29
Nodes (7): Fase 1 — WSAA real (autenticación) ✅ *hecha (commit 5417e43)*, Fase 2 — WSFE real (emisión de CAE) ✅ *hecha (commit 5417e43)*, Fase 3 — Integración en el desktop ✅ *hecha*, Fase 4 — Cobertura de comprobantes ✅ *hecha (percepciones pendientes)*, Fase 5 — Padrón y extras ✅ *hecha (CAEA diferido)*, Fase 6 — Homologación → Producción → ARCA 🟠 *tooling listo; falta el trámite en AFIP*, Plan de fases

### Community 113 - "7. Usabilidad y navegabilidad — plan de fases 🟢"
Cohesion: 0.29
Nodes (7): 7. Usabilidad y navegabilidad — plan de fases 🟢, Fase A — Tablas del shell (alto impacto, bajo esfuerzo) 🎯, Fase B — Búsqueda y navegación global, Fase C — Trazabilidad visible y drill-down, Fase D — Flujos de documentos, Fase E — Apartados nuevos, Fase F — Deuda multi-PC de v4.8.0

### Community 114 - "auth.module.ts"
Cohesion: 0.18
Nodes (19): AirComponentRef, AirProductRow, refreshAirKitProxy(), refreshAllAirKitProxies(), resolveKitComponentArticle(), syncProxyStock(), dbGet(), upsertArticle() (+11 more)

### Community 115 - "Fase 6 — Billing, QA y Lanzamiento 🔧 EN PROGRESO"
Cohesion: 0.29
Nodes (7): 6.1 — Billing (Mercado Pago + Stripe) ✅ COMPLETADA, 6.2 — Ciclo de morosidad automatizado ✅ COMPLETADA, 6.3 — Build verde + tooling monorepo ✅ COMPLETADA, 6.4 — CI/CD ✅ SCAFFOLDEADO, 6.5 — Tests 🔧 EN PROGRESO, 6.6 — Lanzamiento 🔧 EN PROGRESO, Fase 6 — Billing, QA y Lanzamiento 🔧 EN PROGRESO

### Community 116 - "PENDIENTES.md"
Cohesion: 0.40
Nodes (3): Asimov ERP v2 — Plan de Trabajo SaaS Multi-Tenant, Resumen, Stack Tecnológico

### Community 117 - "Global Constraints"
Cohesion: 0.25
Nodes (7): Estados fiscales y autorización ARCA desde la lista — Implementation Plan, Global Constraints, Task 1: Modelo de estados y migración, Task 2: Transiciones fiscales centralizadas, Task 3: IPC y formulario nuevo, Task 4: Acciones y estados en la lista, Task 5: Verificación integral

### Community 118 - "AuthService"
Cohesion: 0.10
Nodes (20): Execution Handoff, File Map, Gaps, Global Constraints, Multi-PC / Nube — Implementation Plan, Placeholder scan, Self-Review, Spec coverage (+12 more)

### Community 119 - "tray.ts"
Cohesion: 0.23
Nodes (15): getLaunchAtStartup(), setLaunchAtStartup(), applyLaunchAtStartup(), createTrayIcon(), iconPath(), initTray(), notifyUpdateAvailable(), rebuildTrayMenu() (+7 more)

### Community 120 - "padron.ts"
Cohesion: 0.26
Nodes (10): buildGetPersonaEnvelope(), callPadron(), collectImpuestos(), escapeXml(), findDeep(), PADRON_URLS, PadronPersona, parsePersonaResponse() (+2 more)

### Community 121 - "dbGet"
Cohesion: 0.27
Nodes (11): computeBuildableStock(), explodeKitComponents(), getKitComponents(), getKitInfo(), KitComponent, KitComponentInput, KitInfo, setKitComponents() (+3 more)

### Community 123 - "ApiOperation"
Cohesion: 0.06
Nodes (29): Headers, HttpCode, AuthController, ApiOperation, ApiTags, Body, Controller, Post (+21 more)

### Community 124 - "auth.module.ts"
Cohesion: 0.15
Nodes (24): AfipConfig, AfipDiagnostics, AfipEnv, CaeSuccessDto, consultarPadron(), DiagStatus, DiagStep, errMsg() (+16 more)

### Community 125 - "libro-iva.ts"
Cohesion: 0.32
Nodes (12): receptorDocType(), AlicuotaRecordInput, buildAlicuotaRecord(), buildCbteRecord(), buildLibroIvaVentas(), CbteRecordInput, fmtFecha(), fmtImporte() (+4 more)

### Community 126 - "Global Constraints"
Cohesion: 0.33
Nodes (5): Cierre inferior para todos los comprobantes - Plan de implementación, Global Constraints, Task 1: Cubrir los cinco formatos con pruebas, Task 2: Unificar el resumen inferior, Task 3: Verificar impresión y publicar

### Community 127 - "dbAll"
Cohesion: 0.15
Nodes (22): getDb(), applyDocEnvelope(), buildDocEnvelope(), deleteDocLocal(), DOC_TABLES, DocTableMap, mergeInvoiceFiscalState(), replaceRow() (+14 more)

### Community 128 - "shell-invoice-fiscal-status.test.ts"
Cohesion: 0.33
Nodes (5): invoiceForm, main, preload, shell, shellPreload

### Community 129 - "Global Constraints"
Cohesion: 0.29
Nodes (6): Global Constraints, Margen global y facturación de kits - Plan de implementación, Task 1: Definir regresiones de UI y contrato del selector, Task 2: Implementar el costo real y la línea única del kit, Task 3: Mover el margen a Totales y recalcular en vivo, Task 4: Verificar la interfaz y publicar

### Community 131 - "new-invoice-margin-kit-ui.test.ts"
Cohesion: 0.50
Nodes (3): invoiceHtml, pickerSource, productSelectionHtml

### Community 133 - "auth.module.ts"
Cohesion: 0.13
Nodes (32): AirLocalConfig, airPost(), AirProductNormalized, AirRateLimitError, airRequest(), AirSyncResult, asArray(), extractJson() (+24 more)

### Community 134 - "Pedidos y cotizaciones con kits, margen y dólar oficial Implementation Plan"
Cohesion: 0.29
Nodes (6): Global Constraints, Pedidos y cotizaciones con kits, margen y dólar oficial Implementation Plan, Task 1: Persistencia y contratos monetarios, Task 2: Pedidos con dólar oficial y kits, Task 3: Cotizaciones con costo, margen, dólar oficial y kits, Task 4: Reimpresión, revisión y entrega

### Community 135 - "Global Constraints"
Cohesion: 0.22
Nodes (8): Cloud Recovery and New-PC Bootstrap Implementation Plan, Global Constraints, Task 1: Refresh-aware cloud transport, Task 2: Durable recovery, compaction, and bounded upload, Task 3: Lossless pull cursor, Task 4: Initial desktop backfill, Task 5: Integration configuration boundaries, Task 6: Verification, review, and release

### Community 137 - "dbRun"
Cohesion: 0.29
Nodes (6): Conversión USD y ajustes fiscales Implementation Plan, Global Constraints, Task 1: Conversión fiscal confiable, Task 2: Mostrar correctamente USD→ARS en el formulario, Task 3: Acciones de nota de crédito y débito asociadas, Task 4: Revisión y release

### Community 139 - "auth.module.ts"
Cohesion: 0.23
Nodes (6): Public(), RequestUser, Roles(), JwtPayload, JwtStrategy, Injectable

### Community 140 - "sync-bootstrap.ts"
Cohesion: 0.27
Nodes (14): BootstrapEnqueueResult, BootstrapState, count(), DeviceIntegrationStatus, DOCUMENT_TABLES, enqueueAirCatalog(), enqueueDocuments(), enqueueIntegrationSettings() (+6 more)

### Community 141 - "Global Constraints"
Cohesion: 0.33
Nodes (5): Consolidar ítems de factura Implementation Plan, Global Constraints, Task 1: Persistir la preferencia de impresión, Task 2: Imprimir y reimprimir el documento consolidado, Task 3: Revisar, verificar y publicar

### Community 142 - "AuthService"
Cohesion: 0.12
Nodes (62): accountById(), activityById(), applyPermissions(), bindRootEvents(), canWrite(), clientOptions(), closeParentDialog(), completeTask() (+54 more)

### Community 143 - "dbAll"
Cohesion: 0.16
Nodes (29): enqueueAirConfigCloudSync(), resetAirAuthCache(), SessionUser, dbAll(), getDashboardKpis(), DOC_TABLES, getLinksFor(), getSourceItems() (+21 more)

### Community 144 - "AfipController"
Cohesion: 0.23
Nodes (9): AfipController, ApiBearerAuth, ApiTags, Body, Controller, Get, Param, Post (+1 more)

### Community 146 - "openNativeForm"
Cohesion: 0.20
Nodes (17): createNewArticleWindowStandalone(), createNewClientWindowStandalone(), createNewDeliveryNoteWindowStandalone(), createNewGoodsReceiptWindowStandalone(), createNewInvoiceWindowStandalone(), createNewPaymentOrderWindowStandalone(), createNewPurchaseInvoiceWindowStandalone(), createNewPurchaseOrderWindowStandalone() (+9 more)

### Community 147 - "sequences.controller.ts"
Cohesion: 0.15
Nodes (11): SequencesController, ApiBearerAuth, ApiTags, Body, Controller, Post, SequencesModule, Module (+3 more)

### Community 148 - "Global Constraints"
Cohesion: 0.29
Nodes (6): Flujo de compras: remitos y facturas Implementation Plan, Global Constraints, Task 1: Vínculos y consultas del flujo de compras, Task 2: Selectores en factura y remito de compra, Task 3: Navegación y terminología de compras, Task 4: Revisión y entrega

### Community 150 - "menu.ts"
Cohesion: 0.28
Nodes (15): bookmarkMenuItems(), broadcast(), buildAppMenu(), chooseBackgroundImage(), currentPath(), currentTitle(), focusedContents(), focusedWindow() (+7 more)

### Community 153 - "AfipController"
Cohesion: 0.13
Nodes (11): SyncController, ApiBearerAuth, ApiTags, Body, Controller, Get, Post, Query (+3 more)

### Community 160 - "migration.sql"
Cohesion: 0.50
Nodes (3): "activities", "opportunities", "tasks"

## Knowledge Gaps
- **861 isolated node(s):** `name`, `productName`, `version`, `description`, `type` (+856 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `response()` connect `AuthService` to `ipc.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `dbGet()` connect `auth.module.ts` to `documents.ts`, `ipc.ts`, `sync.ts`, `main.ts`, `auth.module.ts`, `sync-bootstrap.ts`, `TenantController`, `dbAll`, `app.module.ts`, `openNativeForm`, `RequestUser`, `masters.ts`, `RequestUser`, `api-client.ts`, `afip.test.ts`, `dbAll`, `dbGet`, `auth.module.ts`, `dbAll`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `RequestUser` connect `auth.module.ts` to `AfipController`, `BillingService`, `ProductsController`, `AfipController`, `CustomizationService`, `sequences.controller.ts`, `ReportsController`, `StockController`, `ClientsController`, `DocumentsService`, `SuppliersController`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `name`, `productName`, `version` to the rest of the system?**
  _862 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `documents.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13429951690821257 - nodes in this community are weakly interconnected._
- **Should `ipc.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05087719298245614 - nodes in this community are weakly interconnected._
- **Should `page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06518987341772152 - nodes in this community are weakly interconnected._