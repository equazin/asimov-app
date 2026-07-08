# Graph Report - Asimov ERP  (2026-07-08)

## Corpus Check
- 206 files · ~304,516 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1781 nodes · 3293 edges · 110 communities (79 shown, 31 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8973719f`
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
- AuthService
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
- health.controller.ts
- createMainWindow
- reports.service.ts
- customization.module.ts
- stock.module.ts
- suppliers.module.ts

## God Nodes (most connected - your core abstractions)
1. `dbRun()` - 62 edges
2. `RequestUser` - 59 edges
3. `CurrentUser` - 57 edges
4. `getDb()` - 50 edges
5. `PrismaService` - 47 edges
6. `registerIpcHandlers()` - 46 edges
7. `dbAll()` - 34 edges
8. `dbGet()` - 32 edges
9. `BillingService` - 19 edges
10. `compilerOptions` - 19 edges

## Surprising Connections (you probably didn't know these)
- `run()` --indirect_call--> `d()`  [INFERRED]
  scripts/verify-shell-bridge.js → src/comprobante-print.js
- `queueRow()` --calls--> `getDb()`  [EXTRACTED]
  test/sync.test.ts → src/db.ts
- `stockOf()` --calls--> `dbGet()`  [EXTRACTED]
  test/kits.test.ts → src/db.ts
- `count()` --calls--> `getDb()`  [EXTRACTED]
  test/document-sync.test.ts → src/db.ts
- `one()` --calls--> `getDb()`  [EXTRACTED]
  test/documents.test.ts → src/db.ts

## Import Cycles
- None detected.

## Communities (110 total, 31 thin omitted)

### Community 0 - "documents.ts"
Cohesion: 0.13
Nodes (41): formatDocNumber(), nextSequence(), DocumentSource, buildDocEnvelope(), AnnulEffect, ANNULLABLE, AnnulResult, applyCashDelta() (+33 more)

### Community 1 - "ipc.ts"
Cohesion: 0.13
Nodes (34): addBookmark(), BookmarkEntry, DEFAULTS, DesktopConfig, getBookmarks(), getPrintPreferences(), getShell(), getShellPreferences() (+26 more)

### Community 2 - "page.tsx"
Cohesion: 0.07
Nodes (58): actionOptions, actionVariant, AuditEntry, AuditPage(), DashboardLayout(), DashboardData, DashboardPage(), SubscriptionRow (+50 more)

### Community 3 - "sync.ts"
Cohesion: 0.06
Nodes (76): apiCreateDocument(), apiFetch(), apiGetClient(), apiGetClients(), apiGetDocuments(), apiGetProduct(), apiGetProducts(), apiGetStock() (+68 more)

### Community 4 - "main.ts"
Cohesion: 0.06
Nodes (44): APP_ICON_FILE, CLIENT_SELECTION_FILE, createClientSelectionWindow(), createLoginWindow(), createNewArticleWindowStandalone(), createNewClientWindowStandalone(), createNewDeliveryNoteWindowStandalone(), createNewGoodsReceiptWindowStandalone() (+36 more)

### Community 5 - "api.ts"
Cohesion: 0.08
Nodes (33): LoginScreen(), styles, Index(), RootLayout(), ClientRow, styles, DashboardKpis, DashboardScreen() (+25 more)

### Community 6 - "dependencies"
Cohesion: 0.04
Nodes (48): dependencies, @asimov/shared, bcryptjs, class-transformer, class-validator, helmet, @nestjs/common, @nestjs/config (+40 more)

### Community 7 - "BillingService"
Cohesion: 0.07
Nodes (21): Cron, BillingController, ApiBearerAuth, ApiTags, Body, Controller, Get, Param (+13 more)

### Community 8 - "Fases"
Cohesion: 0.04
Nodes (45): API v2 (`v2/packages/api/src/modules/sync/`), Asimov Desktop ↔ Nube — Sincronización multi-PC, Decisiones pendientes (definir antes de implementar), Desktop (`src/`), Estado actual (lo que YA existe), Impacto en releases, Lo que FALTA para cumplir el objetivo, Modelo conceptual (+37 more)

### Community 9 - "package.json"
Cohesion: 0.05
Nodes (40): author, email, name, dependencies, better-sqlite3, electron-store, electron-updater, description (+32 more)

### Community 10 - "scripts"
Cohesion: 0.06
Nodes (33): devDependencies, turbo, typescript, engines, node, name, private, scripts (+25 more)

### Community 11 - "ProductsController"
Cohesion: 0.11
Nodes (15): ProductsController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Delete, Get (+7 more)

### Community 12 - "PrismaService"
Cohesion: 0.13
Nodes (7): PlanLimitGuard, Injectable, PrismaService, Injectable, CreateDocumentDto, baseDto, SyncChange

### Community 13 - "afip.service.ts"
Cohesion: 0.16
Nodes (11): AFIP_IVA_CODES, AfipAlicIva, AfipAuthResult, AfipInvoiceData, afipIvaCode(), AfipService, buildIvaAlicuotas(), buildLoginTicketRequest() (+3 more)

### Community 14 - "TenantController"
Cohesion: 0.07
Nodes (25): Headers, HttpCode, AuthController, ApiOperation, ApiTags, Body, Controller, Post (+17 more)

### Community 15 - "dependencies"
Cohesion: 0.06
Nodes (30): dependencies, @asimov/shared, date-fns, expo, expo-camera, expo-local-authentication, expo-notifications, expo-router (+22 more)

### Community 16 - "CustomizationService"
Cohesion: 0.11
Nodes (13): CustomizationController, ApiBearerAuth, ApiTags, Body, Controller, Get, Param, Patch (+5 more)

### Community 17 - "package.json"
Cohesion: 0.07
Nodes (29): default, import, types, default, dependencies, zod, devDependencies, typescript (+21 more)

### Community 18 - "app.module.ts"
Cohesion: 0.10
Nodes (18): Global, AppModule, Module, PrismaModule, Module, bootstrap(), AfipModule, Module (+10 more)

### Community 19 - "AuthService"
Cohesion: 0.09
Nodes (48): AirLocalConfig, airPost(), AirProductNormalized, AirRateLimitError, airRequest(), AirSyncResult, asArray(), enqueueAirConfigCloudSync() (+40 more)

### Community 20 - "dependencies"
Cohesion: 0.07
Nodes (27): dependencies, @asimov/shared, clsx, date-fns, lucide-react, next, react, react-dom (+19 more)

### Community 21 - "ReportsController"
Cohesion: 0.16
Nodes (10): ReportsController, ApiBearerAuth, ApiTags, Controller, Get, Query, Res, Roles (+2 more)

### Community 22 - "StockController"
Cohesion: 0.12
Nodes (12): StockController, ApiBearerAuth, ApiTags, Body, Controller, Get, Param, Post (+4 more)

### Community 23 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 24 - "ClientsController"
Cohesion: 0.12
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
Cohesion: 0.15
Nodes (26): authenticate(), DEFAULT_ADMIN, ensureUser(), generateInitialPassword(), hashPassword(), seedDefaultAdmin(), setUserPassword(), verifyPassword() (+18 more)

### Community 30 - "SyncService"
Cohesion: 0.13
Nodes (10): SyncController, ApiBearerAuth, ApiTags, Body, Controller, Get, Post, Query (+2 more)

### Community 31 - "compilerOptions"
Cohesion: 0.09
Nodes (21): compilerOptions, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames, lib, module (+13 more)

### Community 32 - "comprobante-print.js"
Cohesion: 0.19
Nodes (18): { app, BrowserWindow, ipcMain }, DIST, path, run(), d(), emisorFiscal(), esc(), itemsTable() (+10 more)

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
Nodes (11): JwtAuthGuard, Injectable, RolesGuard, Injectable, TenantStatusGuard, Injectable, AuthModule, Module (+3 more)

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

### Community 94 - "getDb"
Cohesion: 0.25
Nodes (16): dbAll(), computeArsPrice(), DOLAR_CASAS, DolarRate, fetchDolarRates(), getLatestRates(), getRateHistory(), parseDolarResponse() (+8 more)

### Community 95 - "migration.sql"
Cohesion: 0.19
Nodes (25): "account_movements", "audit_logs", "cash_accounts", "cash_movements", "clients", "document_items", "documents", "feature_flags" (+17 more)

### Community 96 - "masters.ts"
Cohesion: 0.17
Nodes (23): DashboardKpis, getDashboardKpis(), getDb(), initDb(), upsertArticle(), upsertClient(), upsertSupplier(), ArticleForm (+15 more)

### Community 97 - "db.ts"
Cohesion: 0.23
Nodes (15): getLaunchAtStartup(), setLaunchAtStartup(), applyLaunchAtStartup(), createTrayIcon(), iconPath(), initTray(), notifyUpdateAvailable(), rebuildTrayMenu() (+7 more)

### Community 98 - "RequestUser"
Cohesion: 0.43
Nodes (3): CurrentUser, RequestUser, Roles()

### Community 101 - "kits.ts"
Cohesion: 0.27
Nodes (11): computeBuildableStock(), explodeKitComponents(), getKitComponents(), getKitInfo(), KitComponent, KitComponentInput, KitInfo, setKitComponents() (+3 more)

### Community 102 - "prisma.service.ts"
Cohesion: 0.22
Nodes (6): makeConfig(), makeJwt(), makeService(), validReg, TenantModule, Module

### Community 103 - "AfipController"
Cohesion: 0.21
Nodes (9): AfipController, ApiBearerAuth, ApiTags, Body, Controller, Get, Param, Post (+1 more)

### Community 104 - "health.controller.ts"
Cohesion: 0.22
Nodes (5): Public(), HealthController, Controller, Get, Public

### Community 105 - "createMainWindow"
Cohesion: 0.29
Nodes (7): getWindowBounds(), setWindowBounds(), completeLogin(), createMainWindow(), isDev(), persistBounds(), isQuitting()

### Community 106 - "reports.service.ts"
Cohesion: 0.40
Nodes (4): AccountReport, ReportPeriod, SalesReport, StockReport

## Knowledge Gaps
- **702 isolated node(s):** `name`, `productName`, `version`, `description`, `type` (+697 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RequestUser` connect `RequestUser` to `auth.module.ts`, `sequences.controller.ts`, `BillingService`, `AfipController`, `ProductsController`, `CustomizationService`, `ReportsController`, `StockController`, `ClientsController`, `DocumentsService`, `SuppliersController`, `SyncService`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `CurrentUser` connect `RequestUser` to `sequences.controller.ts`, `BillingService`, `AfipController`, `ProductsController`, `CustomizationService`, `ReportsController`, `StockController`, `ClientsController`, `DocumentsService`, `SuppliersController`, `SyncService`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `PrismaService` connect `PrismaService` to `BillingService`, `ProductsController`, `afip.service.ts`, `TenantController`, `CustomizationService`, `app.module.ts`, `ReportsController`, `StockController`, `ClientsController`, `DocumentsService`, `SuppliersController`, `SyncService`, `auth.module.ts`, `sequences.controller.ts`, `prisma.service.ts`, `health.controller.ts`, `reports.service.ts`, `customization.module.ts`, `stock.module.ts`, `suppliers.module.ts`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `name`, `productName`, `version` to the rest of the system?**
  _703 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `documents.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1331923890063425 - nodes in this community are weakly interconnected._
- **Should `ipc.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12857142857142856 - nodes in this community are weakly interconnected._
- **Should `page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06518987341772152 - nodes in this community are weakly interconnected._