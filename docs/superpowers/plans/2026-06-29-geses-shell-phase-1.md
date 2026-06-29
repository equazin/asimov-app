# GESES Shell Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Asimov Desktop from a simple ERP wrapper into an operator shell with GESES-style speed: module menu, multi-window work, persistent desktop preferences, status strip, and bookmarks.

**Architecture:** Keep the ERP web app remote and unchanged for Phase 1. Implement shell behavior in Electron main/preload using `electron-store` for persistence, native menus for module navigation, and safe DOM injection from preload for status/bookmark/background overlays.

**Tech Stack:** Electron 33, TypeScript strict CommonJS, electron-store, existing `bartezDesktop` preload bridge, existing BARTEZ `/admin` routes.

## Global Constraints

- Do not require the GESES ZIP for Phase 1; the roadmap describes the needed shell behavior.
- Preserve existing server picker, splash, offline screen, tray, deeplink, print, and notification behavior.
- Every new URL must stay under `/admin` to respect current navigation hardening.
- Persist local preferences in `electron-store`, not in the web backend.
- Validate with `npm run build`.

---

### Task 1: Shell Preferences And Bookmarks Store

**Files:**
- Modify: `src/config.ts`

**Interfaces:**
- Produces: `getShellPreferences()`, `setShellBackground()`, `getBookmarks()`, `addBookmark()`, `removeBookmark()`.
- Consumes: existing `electron-store` instance.

- [ ] **Step 1: Extend the persisted config**

Add `ShellBackground`, `BookmarkEntry`, and `shell` to `DesktopConfig`:

```ts
export interface ShellBackground {
  type: "default" | "color" | "image";
  value: string;
}

export interface BookmarkEntry {
  id: string;
  title: string;
  path: string;
  createdAt: number;
}

export interface ShellPreferences {
  background: ShellBackground;
  bookmarks: BookmarkEntry[];
}
```

- [ ] **Step 2: Add defaults**

Use:

```ts
shell: {
  background: { type: "default", value: "" },
  bookmarks: [],
}
```

- [ ] **Step 3: Add helpers**

Implement exact helpers:

```ts
export function getShellPreferences(): ShellPreferences;
export function setShellBackground(background: ShellBackground): ShellPreferences;
export function getBookmarks(): BookmarkEntry[];
export function addBookmark(input: { title: string; path: string }): BookmarkEntry[];
export function removeBookmark(id: string): BookmarkEntry[];
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: TypeScript passes.

### Task 2: Native GESES Module Menu

**Files:**
- Modify: `src/menu.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `openApp(pathname?: string)`, `openNewWindow(pathname?: string)`, bookmark helpers.
- Produces: menu entries for Inicio, Ventas, Compras, Stock, Facturacion, Tesoreria, Contabilidad, RMA, Config.

- [ ] **Step 1: Add module route groups**

Use real BARTEZ admin routes:

```ts
const MODULE_GROUPS = [
  { label: "Ventas", items: [["Pedidos", "/admin/orders"], ["Nuevo pedido", "/admin/orders/new"], ["Cotizaciones", "/admin/quotes"], ["Nueva cotizacion", "/admin/quotes/new"], ["Clientes", "/admin/clients"]] },
  { label: "Compras", items: [["Ordenes de compra", "/admin/purchase-orders"], ["Nueva orden de compra", "/admin/purchase-orders/new"], ["Proveedores", "/admin/suppliers"], ["Recepciones", "/admin/goods-receipts"]] },
  { label: "Stock", items: [["Stock", "/admin/stock"], ["Productos", "/admin/products"], ["Movimientos", "/admin/stock-movements"], ["Depositos", "/admin/warehouses"], ["Seriales", "/admin/serial-numbers"]] },
  { label: "Facturacion", items: [["Facturas", "/admin/invoices"], ["Nueva factura", "/admin/invoices/new"], ["Remitos", "/admin/delivery-notes"], ["Nuevo remito", "/admin/delivery-notes/new"], ["Recibos", "/admin/receipts"]] },
  { label: "Tesoreria", items: [["Cajas y bancos", "/admin/cash-accounts"], ["Cuentas clientes", "/admin/customer-accounts"], ["Cuentas proveedores", "/admin/supplier-accounts"]] },
  { label: "Contabilidad", items: [["Contabilidad", "/admin/accounting"], ["Export contable", "/admin/accounting-export"], ["Reportes", "/admin/reports"]] },
  { label: "RMA", items: [["Tickets", "/admin/tickets"], ["Ordenes de trabajo", "/admin/work-orders"], ["Garantias", "/admin/warranty-terms"]] },
  { label: "Config", items: [["Sistema", "/admin/sistema"], ["Usuarios y roles", "/admin/team"], ["Auditoria", "/admin/audit"], ["Alertas", "/admin/alerts"]] },
];
```

- [ ] **Step 2: Add accelerators**

Map:
`Ctrl+1=/admin`, `Ctrl+2=/admin/orders`, `Ctrl+3=/admin/stock`, `Ctrl+4=/admin/cash-accounts`.

- [ ] **Step 3: Add multi-window menu action**

Add `Ctrl+N` calling `deps.openNewWindow("/admin")`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: menu compiles.

### Task 3: Preload Shell Injection

**Files:**
- Modify: `src/preload.ts`
- Modify: `src/ipc.ts`

**Interfaces:**
- Consumes IPC: `shell:prefs:get`, `shell:bookmark:list`, `shell:bookmark:add`, `shell:bookmark:remove`, `shell:background:set`.
- Produces `window.bartezDesktop.shell` methods and injected DOM.

- [ ] **Step 1: Expose shell API**

Add:

```ts
shell: {
  getPreferences: () => ipcRenderer.invoke("shell:prefs:get"),
  setBackground: (background) => ipcRenderer.invoke("shell:background:set", background),
  listBookmarks: () => ipcRenderer.invoke("shell:bookmark:list"),
  addBookmark: (title, path) => ipcRenderer.invoke("shell:bookmark:add", { title, path }),
  removeBookmark: (id) => ipcRenderer.invoke("shell:bookmark:remove", id),
}
```

- [ ] **Step 2: Inject status bar**

Create a fixed bottom bar with server, version, online status, and local time. Add `padding-bottom: 28px` to `document.documentElement`.

- [ ] **Step 3: Inject bookmarks panel**

Create a right-side panel hidden by default, toggled by a custom event. Render stored bookmarks as buttons that navigate to their stored path.

- [ ] **Step 4: Inject background CSS**

Apply persisted background to `document.body` using color or image URL.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: TypeScript passes.

### Task 4: IPC And Native Actions

**Files:**
- Modify: `src/ipc.ts`
- Modify: `src/menu.ts`

**Interfaces:**
- Consumes config helpers from Task 1.
- Produces bookmark and background native actions.

- [ ] **Step 1: Add IPC handlers**

Implement `shell:prefs:get`, `shell:background:set`, `shell:bookmark:list`, `shell:bookmark:add`, `shell:bookmark:remove`.

- [ ] **Step 2: Add menu entries**

Add:
- `Favoritos > Mostrar/ocultar favoritos`
- `Favoritos > Agregar pantalla actual`
- `Apariencia > Fondo predeterminado`
- `Apariencia > Fondo verde oscuro`
- `Apariencia > Fondo crema`
- `Apariencia > Elegir imagen de fondo...`

- [ ] **Step 3: Rebuild menu after bookmark changes**

Call the existing `buildAppMenu()` path after adding/removing bookmarks.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: TypeScript passes.

### Task 5: Validation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes all Phase 1 shell features.
- Produces documented usage for operators.

- [ ] **Step 1: Update README capabilities**

Add shell menu, multi-window, bookmarks, operator status bar, and background customization.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Run smoke test if Electron can launch**

Run: `npm run smoke-test`
Expected: app launches and exits cleanly.
