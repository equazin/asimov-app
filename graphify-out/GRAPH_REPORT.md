# Graph Report - Asimov ERP  (2026-07-08)

## Corpus Check
- 214 files · ~319,761 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1952 nodes · 3799 edges · 121 communities (93 shown, 28 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.59)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9c120a6d`
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
- kits.ts
- prisma.service.ts
- AfipController
- afip.test.ts
- document-links.test.ts
- config.ts
- customization.module.ts
- stock.module.ts
- Fases
- AFIP / ARCA — Facturación electrónica: estado y plan de fases
- Plan de fases
- 7. Usabilidad y navegabilidad — plan de fases 🟢
- libro-iva.ts
- Fase 6 — Billing, QA y Lanzamiento 🔧 EN PROGRESO
- PENDIENTES.md
- config.ts
- makeStandaloneForm
- tray.ts
- padron.ts

## God Nodes (most connected - your core abstractions)
1. `dbRun()` - 68 edges
2. `registerIpcHandlers()` - 60 edges
3. `RequestUser` - 60 edges
4. `CurrentUser` - 58 edges
5. `getDb()` - 50 edges
6. `PrismaService` - 47 edges
7. `dbAll()` - 41 edges
8. `dbGet()` - 36 edges
9. `BillingService` - 19 edges
10. `compilerOptions` - 19 edges

## Surprising Connections (you probably didn't know these)
- `requestCae()` --references--> `qrcode`  [EXTRACTED]
  src/afip-service.ts → package.json
- `run()` --indirect_call--> `d()`  [INFERRED]
  scripts/verify-shell-bridge.js → src/comprobante-print.js
- `count()` --calls--> `getDb()`  [EXTRACTED]
  test/document-sync.test.ts → src/db.ts
- `row()` --calls--> `getDb()`  [EXTRACTED]
  test/masters.test.ts → src/db.ts
- `queueRow()` --calls--> `getDb()`  [EXTRACTED]
  test/sync.test.ts → src/db.ts

## Import Cycles
- None detected.

## Communities (121 total, 28 thin omitted)

### Community 0 - "documents.ts"
Cohesion: 0.14
Nodes (44): formatDocNumber(), getDb(), nextSequence(), DocumentSource, annulDocument(), AnnulEffect, ANNULLABLE, AnnulResult (+36 more)

### Community 1 - "ipc.ts"
Cohesion: 0.11
Nodes (32): AfipQrData, buildAfipQrUrl(), AfipConfig, AfipDiagnostics, AfipEnv, CaeRequestInput, CaeSuccessDto, consultarPadron() (+24 more)

### Community 2 - "page.tsx"
Cohesion: 0.07
Nodes (58): actionOptions, actionVariant, AuditEntry, AuditPage(), DashboardLayout(), DashboardData, DashboardPage(), SubscriptionRow (+50 more)

### Community 3 - "sync.ts"
Cohesion: 0.07
Nodes (67): apiCreateDocument(), apiFetch(), apiGetClient(), apiGetClients(), apiGetDocuments(), apiGetProduct(), apiGetProducts(), apiGetStock() (+59 more)

### Community 4 - "main.ts"
Cohesion: 0.06
Nodes (38): getWindowBounds(), setWindowBounds(), APP_ICON_FILE, CLIENT_SELECTION_FILE, completeLogin(), createClientSelectionWindow(), createLoginWindow(), createMainWindow() (+30 more)

### Community 5 - "api.ts"
Cohesion: 0.16
Nodes (14): Index(), RootLayout(), apiFetch(), ApiUser, clearTokens(), initApi(), isAuthenticated(), login() (+6 more)

### Community 6 - "dependencies"
Cohesion: 0.09
Nodes (23): dependencies, @asimov/shared, bcryptjs, class-transformer, class-validator, fast-xml-parser, helmet, @nestjs/common (+15 more)

### Community 7 - "BillingService"
Cohesion: 0.07
Nodes (19): Cron, BillingController, ApiBearerAuth, ApiTags, Body, Controller, Get, Param (+11 more)

### Community 8 - "Fases"
Cohesion: 0.20
Nodes (10): API v2 (`v2/packages/api/src/modules/sync/`), Asimov Desktop ↔ Nube — Sincronización multi-PC, Decisiones pendientes (definir antes de implementar), Desktop (`src/`), Estado actual (lo que YA existe), Impacto en releases, Lo que FALTA para cumplir el objetivo, Modelo conceptual (+2 more)

### Community 9 - "package.json"
Cohesion: 0.04
Nodes (45): author, email, name, dependencies, better-sqlite3, electron-store, electron-updater, fast-xml-parser (+37 more)

### Community 10 - "scripts"
Cohesion: 0.06
Nodes (33): devDependencies, turbo, typescript, engines, node, name, private, scripts (+25 more)

### Community 11 - "ProductsController"
Cohesion: 0.10
Nodes (17): ProductsController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Delete, Get (+9 more)

### Community 12 - "PrismaService"
Cohesion: 0.08
Nodes (16): PlanLimitGuard, Injectable, TenantStatusGuard, Injectable, HealthController, Controller, Get, Public (+8 more)

### Community 13 - "afip.service.ts"
Cohesion: 0.07
Nodes (52): certNotAfter(), decryptSecret(), encryptSecret(), isEncrypted(), loadEncKey(), signTRA(), AFIP_IVA_CODES, AfipAlicIva (+44 more)

### Community 14 - "TenantController"
Cohesion: 0.05
Nodes (31): Headers, HttpCode, JwtAuthGuard, Injectable, RolesGuard, Injectable, AuthController, ApiOperation (+23 more)

### Community 15 - "dependencies"
Cohesion: 0.06
Nodes (30): dependencies, @asimov/shared, date-fns, expo, expo-camera, expo-local-authentication, expo-notifications, expo-router (+22 more)

### Community 16 - "CustomizationService"
Cohesion: 0.10
Nodes (15): CustomizationController, ApiBearerAuth, ApiTags, Body, Controller, Get, Param, Patch (+7 more)

### Community 17 - "package.json"
Cohesion: 0.07
Nodes (29): default, import, types, default, dependencies, zod, devDependencies, typescript (+21 more)

### Community 18 - "app.module.ts"
Cohesion: 0.12
Nodes (16): Global, AppModule, Module, PrismaModule, Module, bootstrap(), AfipModule, Module (+8 more)

### Community 19 - "wsfe.ts"
Cohesion: 0.18
Nodes (20): afipDate(), AfipMessage, buildFECAESolicitarEnvelope(), CaeRejected, CaeResult, CaeSuccess, collectErrors(), collectObservations() (+12 more)

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
Cohesion: 0.10
Nodes (17): ClientsController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Delete, Get (+9 more)

### Community 25 - "DocumentsService"
Cohesion: 0.12
Nodes (14): DocumentsController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get, Param (+6 more)

### Community 26 - "SuppliersController"
Cohesion: 0.10
Nodes (16): SuppliersController, ApiBearerAuth, ApiTags, Body, Controller, Delete, Get, Param (+8 more)

### Community 27 - "expo"
Cohesion: 0.08
Nodes (24): backgroundColor, foregroundImage, adaptiveIcon, package, permissions, expo, android, icon (+16 more)

### Community 28 - "Asimov ERP — Research de mercado y precios"
Cohesion: 0.09
Nodes (22): 1. Competidores — Argentina, 2. Competidores — España, 3. Contexto legal (argumento de venta), 4. Análisis de landings (qué tomamos de cada una), 5. Propuesta de planes Asimov (3 planes, por país), 6. FAQ definidas según el research, Argentina (ARS/mes + IVA), Asimov ERP — Research de mercado y precios (+14 more)

### Community 29 - "RequestUser"
Cohesion: 0.15
Nodes (30): isAfipUnavailable(), getPendingCaeInvoices(), markInvoicePendingCae(), retryPendingCae(), resetAirAuthCache(), SessionUser, getShellPreferences(), dbAll() (+22 more)

### Community 30 - "SyncService"
Cohesion: 0.10
Nodes (13): SyncController, ApiBearerAuth, ApiTags, Body, Controller, Get, Post, Query (+5 more)

### Community 31 - "compilerOptions"
Cohesion: 0.09
Nodes (21): compilerOptions, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames, lib, module (+13 more)

### Community 32 - "comprobante-print.js"
Cohesion: 0.18
Nodes (19): { app, BrowserWindow, ipcMain }, DIST, path, run(), caeBlock(), d(), emisorFiscal(), esc() (+11 more)

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
Cohesion: 0.09
Nodes (37): AirLocalConfig, airPost(), AirProductNormalized, AirRateLimitError, airRequest(), AirSyncResult, asArray(), enqueueAirConfigCloudSync() (+29 more)

### Community 38 - "sequences.controller.ts"
Cohesion: 0.14
Nodes (11): SequencesController, ApiBearerAuth, ApiTags, Body, Controller, Post, SequencesModule, Module (+3 more)

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
Cohesion: 0.15
Nodes (12): appIcon, appIconOut, bartezLogo, bartezLogoOut, brandIcon, brandIconOut, distDir, files (+4 more)

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
Cohesion: 0.33
Nodes (5): appPath, child, electronPath, path, { spawn }

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
Cohesion: 0.22
Nodes (20): getPrintPreferences(), setPreferredPrinter(), setSilentPrint(), registerGlobalShortcuts(), bookmarkMenuItems(), broadcast(), buildAppMenu(), chooseBackgroundImage() (+12 more)

### Community 94 - "getDb"
Cohesion: 0.25
Nodes (15): computeArsPrice(), DOLAR_CASAS, DolarRate, fetchDolarRates(), getLatestRates(), getRateHistory(), parseDolarResponse(), refreshDolarNow() (+7 more)

### Community 95 - "migration.sql"
Cohesion: 0.19
Nodes (25): "account_movements", "audit_logs", "cash_accounts", "cash_movements", "clients", "document_items", "documents", "feature_flags" (+17 more)

### Community 96 - "masters.ts"
Cohesion: 0.15
Nodes (22): DashboardKpis, getDashboardKpis(), initDb(), upsertArticle(), upsertClient(), upsertSupplier(), ArticleForm, ClientForm (+14 more)

### Community 97 - "db.ts"
Cohesion: 0.15
Nodes (13): scripts, build, db:deploy, db:generate, db:migrate, db:seed, db:studio, dev (+5 more)

### Community 98 - "RequestUser"
Cohesion: 0.13
Nodes (16): CurrentUser, Public(), RequestUser, Roles(), AfipController, ApiBearerAuth, ApiTags, Body (+8 more)

### Community 101 - "kits.ts"
Cohesion: 0.27
Nodes (11): computeBuildableStock(), explodeKitComponents(), getKitComponents(), getKitInfo(), KitComponent, KitComponentInput, KitInfo, setKitComponents() (+3 more)

### Community 102 - "prisma.service.ts"
Cohesion: 0.17
Nodes (12): devDependencies, @nestjs/cli, @nestjs/schematics, @nestjs/testing, prisma, tsx, @types/bcryptjs, @types/express (+4 more)

### Community 103 - "AfipController"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 104 - "afip.test.ts"
Cohesion: 0.19
Nodes (15): certNotAfter(), isValidCertPem(), isValidKeyPem(), signTRA(), AfipUnavailableError, saveAfipCredentials(), buildLoginCmsEnvelope(), buildLoginTicketRequest() (+7 more)

### Community 105 - "document-links.test.ts"
Cohesion: 0.21
Nodes (14): AFIP_IVA_CODES, AfipAlicIva, afipIvaCode(), buildIvaAlicuotas(), getInvoiceTypeCode(), normalizeIvaCondition(), requiresAssociatedInvoice(), resolveVoucherTypeCode() (+6 more)

### Community 106 - "config.ts"
Cohesion: 0.28
Nodes (11): dbRun(), applyDocEnvelope(), deleteDocLocal(), DOC_TABLES, DocTableMap, replaceRow(), reverseCash(), reverseStock() (+3 more)

### Community 107 - "customization.module.ts"
Cohesion: 0.42
Nodes (9): authenticate(), DEFAULT_ADMIN, ensureUser(), generateInitialPassword(), hashPassword(), seedDefaultAdmin(), setUserPassword(), verifyPassword() (+1 more)

### Community 108 - "stock.module.ts"
Cohesion: 0.22
Nodes (9): 1. Sync multi-PC — completar cobertura 🟡, 2. Fase 6.5 — Tests 🟡, 3. Fase 6.6 — Billing real y lanzamiento 🟡, 4. Panel maestro — completar funciones 🟢, 5. App móvil 🟢, 6. Higiene / técnico 🟢, Asimov ERP — Pendientes / Roadmap, Estado general (+1 more)

### Community 110 - "Fases"
Cohesion: 0.22
Nodes (9): Fase 0.1 — Monorepo + Shared Package ✅ COMPLETADA, Fase 0.2 — Esquema Prisma Multi-Tenant ✅ COMPLETADA, Fase 1.1 — API NestJS Core ✅ COMPLETADA, Fase 1.2 — Módulos ERP (CRUD) ✅ COMPLETADA, Fase 2 — Panel Maestro Admin (Next.js) ✅ COMPLETADA, Fase 3 — Migración Desktop Electron → API Client ✅ COMPLETADA, Fase 4 — App Móvil Android + iOS (Expo) ✅ COMPLETADA, Fase 5 — AFIP + Reportes + Personalización Avanzada ✅ COMPLETADA (+1 more)

### Community 111 - "AFIP / ARCA — Facturación electrónica: estado y plan de fases"
Cohesion: 0.29
Nodes (6): AFIP / ARCA — Facturación electrónica: estado y plan de fases, Estado actual, ✅ Fases 1–3 implementadas (2026-07-08), ❌ Lo que falta, Notas técnicas, Referencias

### Community 112 - "Plan de fases"
Cohesion: 0.29
Nodes (7): Fase 1 — WSAA real (autenticación) ✅ *hecha (commit 5417e43)*, Fase 2 — WSFE real (emisión de CAE) ✅ *hecha (commit 5417e43)*, Fase 3 — Integración en el desktop ✅ *hecha*, Fase 4 — Cobertura de comprobantes ✅ *hecha (percepciones pendientes)*, Fase 5 — Padrón y extras ✅ *hecha (CAEA diferido)*, Fase 6 — Homologación → Producción → ARCA 🟠 *tooling listo; falta el trámite en AFIP*, Plan de fases

### Community 113 - "7. Usabilidad y navegabilidad — plan de fases 🟢"
Cohesion: 0.29
Nodes (7): 7. Usabilidad y navegabilidad — plan de fases 🟢, Fase A — Tablas del shell (alto impacto, bajo esfuerzo) 🎯, Fase B — Búsqueda y navegación global, Fase C — Trazabilidad visible y drill-down, Fase D — Flujos de documentos, Fase E — Apartados nuevos, Fase F — Deuda multi-PC de v4.8.0

### Community 114 - "libro-iva.ts"
Cohesion: 0.32
Nodes (12): receptorDocType(), AlicuotaRecordInput, buildAlicuotaRecord(), buildCbteRecord(), buildLibroIvaVentas(), CbteRecordInput, fmtFecha(), fmtImporte() (+4 more)

### Community 115 - "Fase 6 — Billing, QA y Lanzamiento 🔧 EN PROGRESO"
Cohesion: 0.29
Nodes (7): 6.1 — Billing (Mercado Pago + Stripe) ✅ COMPLETADA, 6.2 — Ciclo de morosidad automatizado ✅ COMPLETADA, 6.3 — Build verde + tooling monorepo ✅ COMPLETADA, 6.4 — CI/CD ✅ SCAFFOLDEADO, 6.5 — Tests 🔧 EN PROGRESO, 6.6 — Lanzamiento 🔧 EN PROGRESO, Fase 6 — Billing, QA y Lanzamiento 🔧 EN PROGRESO

### Community 116 - "PENDIENTES.md"
Cohesion: 0.40
Nodes (3): Asimov ERP v2 — Plan de Trabajo SaaS Multi-Tenant, Resumen, Stack Tecnológico

### Community 117 - "config.ts"
Cohesion: 0.21
Nodes (13): addBookmark(), BookmarkEntry, DEFAULTS, DesktopConfig, getBookmarks(), getShell(), PrintPreferences, removeBookmark() (+5 more)

### Community 118 - "makeStandaloneForm"
Cohesion: 0.26
Nodes (14): createNewArticleWindowStandalone(), createNewClientWindowStandalone(), createNewDeliveryNoteWindowStandalone(), createNewGoodsReceiptWindowStandalone(), createNewInvoiceWindowStandalone(), createNewPaymentOrderWindowStandalone(), createNewPurchaseInvoiceWindowStandalone(), createNewPurchaseOrderWindowStandalone() (+6 more)

### Community 119 - "tray.ts"
Cohesion: 0.24
Nodes (14): getLaunchAtStartup(), setLaunchAtStartup(), applyLaunchAtStartup(), createTrayIcon(), iconPath(), initTray(), notifyUpdateAvailable(), rebuildTrayMenu() (+6 more)

### Community 120 - "padron.ts"
Cohesion: 0.26
Nodes (10): buildGetPersonaEnvelope(), callPadron(), collectImpuestos(), escapeXml(), findDeep(), PADRON_URLS, PadronPersona, parsePersonaResponse() (+2 more)

## Knowledge Gaps
- **734 isolated node(s):** `name`, `productName`, `version`, `description`, `type` (+729 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RequestUser` connect `RequestUser` to `sequences.controller.ts`, `BillingService`, `ProductsController`, `CustomizationService`, `ReportsController`, `StockController`, `ClientsController`, `DocumentsService`, `SuppliersController`, `SyncService`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `CurrentUser` connect `RequestUser` to `sequences.controller.ts`, `BillingService`, `ProductsController`, `CustomizationService`, `ReportsController`, `StockController`, `ClientsController`, `DocumentsService`, `SuppliersController`, `SyncService`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `PrismaService` connect `PrismaService` to `RequestUser`, `sequences.controller.ts`, `BillingService`, `ProductsController`, `afip.service.ts`, `TenantController`, `CustomizationService`, `app.module.ts`, `ReportsController`, `StockController`, `ClientsController`, `DocumentsService`, `SuppliersController`, `SyncService`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `name`, `productName`, `version` to the rest of the system?**
  _735 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `documents.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13876040703052728 - nodes in this community are weakly interconnected._
- **Should `ipc.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11229946524064172 - nodes in this community are weakly interconnected._
- **Should `page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06518987341772152 - nodes in this community are weakly interconnected._