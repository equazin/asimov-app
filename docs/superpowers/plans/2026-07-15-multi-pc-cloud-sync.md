# Multi-PC / Nube — Implementation Plan

> **For agentic workers:** REQUIRED SUB- SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar operativo el sistema multi-PC de Asimov ERP: conexión a la nube desde el shell, sincronización completa de documentos (incluyendo anulaciones), CRM, AIR/ARCA configuración de negocio, e indicador de estado de sync.

**Architecture:** Cada PC sigue operando local-first contra SQLite. Un sync engine periódico empuja cambios locales y descarga remotos contra un tenant compartido en la API v2 (NestJS + Postgres). Los documentos viajan como envelopes lossless. Las credenciales de terceros (AIR, ARCA, WhatsApp) permanecen locales; solo se sincroniza la configuración de negocio y los datos.

**Tech Stack:** Electron + TypeScript + better-sqlite3 (desktop); NestJS + Prisma + PostgreSQL (API v2); Vitest (tests).

## Global Constraints

- No se suben credenciales, claves privadas ni certificados a la nube (passwords, tokens, certificados ARCA).
- Los cambios deben ser testeables con Vitest.
- Cada task termina en un commit funcional.
- Respetar el estilo existente: snake_case en SQLite, camelCase en API/Prisma.
- Mantener backwards compatibility: no romper instalaciones sin nube.
- Actualizar `docs/desktop-cloud-sync.md` al final si el estado cambia.

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/shell.html` | Agregar UI de conexión cloud, indicador de sync, handlers de login/logout. |
| `src/documents.ts` | Corregir `annulDocument()` para encolar snapshot tras anular. |
| `src/masters.ts` | Agregar `tryEnqueue` con acción `delete` al desactivar maestros (si aplica). |
| `src/sync.ts` | Asegurar mapeo correcto de entidades CRM en `applyRemoteChange`. |
| `src/air.ts` | Encolar `integration_config` cuando cambia configuración AIR. |
| `src/whatsapp.ts` | Encolar `integration_config` cuando cambia configuración WhatsApp. |
| `src/afip-service.ts` | Encolar `integration_config` cuando cambia configuración ARCA. |
| `v2/packages/api/prisma/schema.prisma` | Agregar modelos `Opportunity`, `Activity`, `Task` (CRM). |
| `v2/packages/api/src/modules/sync/sync.service.ts` | Agregar push/pull/sanitize de CRM + ARCA config. |
| `test/sync.test.ts` | Tests de anulación sync, CRM remote, integration config. |
| `test/document-sync.test.ts` | Test de propagación de anulación. |
| `v2/packages/api/src/modules/sync/sync.service.spec.ts` | Tests backend de CRM sync. |

---

## Task 1: UI de conexión a la nube en el shell

**Files:**
- Modify: `src/shell.html` (barra superior / menú sistema)
- Test: manual (abrir app, conectar, ver estado)

**Interfaces:**
- Consumes: `window.cloud.status()`, `window.cloud.login(email, password)`, `window.cloud.logout()`, `window.cloud.test()`
- Produces: UI visual que refleje estado de conexión y permita login/logout.

- [ ] **Step 1: Agregar HTML del panel cloud en la barra superior**

En `src/shell.html`, agregar un contenedor en la barra de navegación (cerca de "Actualizar" / versión):

```html
<div id="cloud-status-bar" style="display:flex;align-items:center;gap:8px;font-size:12px;">
  <span id="cloud-dot" style="width:8px;height:8px;border-radius:50%;background:#999;"></span>
  <span id="cloud-text">Nube: desconectado</span>
  <button id="cloud-login-btn" class="btn btn-sm btn-outline">Conectar</button>
  <button id="cloud-logout-btn" class="btn btn-sm btn-outline" style="display:none;">Desconectar</button>
</div>
```

- [ ] **Step 2: Agregar modal de login cloud**

Agregar al final del `<body>` (antes del cierre):

```html
<div id="cloud-login-modal" class="modal" style="display:none;">
  <div class="modal-content" style="max-width:360px;">
    <h3>Conectar a la nube</h3>
    <p style="font-size:13px;color:#666;">Ingresá las credenciales de tu empresa en Asimov Cloud.</p>
    <label>Email</label>
    <input type="email" id="cloud-email" placeholder="empresa@ejemplo.com" />
    <label>Contraseña</label>
    <input type="password" id="cloud-password" placeholder="••••••" />
    <div id="cloud-login-error" style="color:#c00;font-size:13px;min-height:18px;"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
      <button class="btn btn-outline" onclick="closeCloudLogin()">Cancelar</button>
      <button class="btn btn-primary" id="cloud-submit-login">Conectar</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Agregar CSS mínimo para el modal (si no existe patrón similar)**

Si el proyecto ya tiene clase `.modal`, saltar este step. Si no, agregar en el `<style>` existente:

```css
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-content { background: #fff; padding: 20px; border-radius: 8px; width: 90%; }
.modal-content input { display: block; width: 100%; margin: 6px 0 12px; padding: 8px; }
```

- [ ] **Step 4: Implementar handlers JS en el shell**

Agregar en el `<script>` principal de `shell.html`:

```js
async function refreshCloudStatus() {
  const status = await window.cloud.status();
  const dot = document.getElementById('cloud-dot');
  const text = document.getElementById('cloud-text');
  const loginBtn = document.getElementById('cloud-login-btn');
  const logoutBtn = document.getElementById('cloud-logout-btn');
  if (status.connected) {
    dot.style.background = '#2ecc71';
    text.textContent = `Nube: ${status.user?.email ?? 'conectado'}`;
    loginBtn.style.display = 'none';
    logoutBtn.style.display = '';
  } else {
    dot.style.background = '#999';
    text.textContent = 'Nube: desconectado';
    loginBtn.style.display = '';
    logoutBtn.style.display = 'none';
  }
}

function openCloudLogin() {
  document.getElementById('cloud-login-modal').style.display = 'flex';
  document.getElementById('cloud-login-error').textContent = '';
}

function closeCloudLogin() {
  document.getElementById('cloud-login-modal').style.display = 'none';
}

async function submitCloudLogin() {
  const email = document.getElementById('cloud-email').value.trim();
  const password = document.getElementById('cloud-password').value;
  const errorEl = document.getElementById('cloud-login-error');
  errorEl.textContent = '';
  if (!email || !password) {
    errorEl.textContent = 'Ingresá email y contraseña.';
    return;
  }
  const res = await window.cloud.login(email, password);
  if (res.ok) {
    closeCloudLogin();
    await refreshCloudStatus();
    alert('Conectado a la nube. Se iniciará la sincronización.');
  } else {
    errorEl.textContent = res.error || 'No se pudo conectar.';
  }
}

async function doCloudLogout() {
  if (!confirm('¿Desconectar esta PC de la nube?')) return;
  await window.cloud.logout();
  await refreshCloudStatus();
}

// Wiring
document.getElementById('cloud-login-btn').addEventListener('click', openCloudLogin);
document.getElementById('cloud-logout-btn').addEventListener('click', doCloudLogout);
document.getElementById('cloud-submit-login').addEventListener('click', submitCloudLogin);
document.getElementById('cloud-login-modal').addEventListener('click', (e) => {
  if (e.target.id === 'cloud-login-modal') closeCloudLogin();
});

// Llamar al iniciar
refreshCloudStatus();
```

- [ ] **Step 5: Verificar manualmente**

Run: `npm run dev`
Expected: aparece "Nube: desconectado", el botón "Conectar" abre el modal, login contra credenciales válidas cambia a "conectado".

- [ ] **Step 6: Commit**

```bash
git add src/shell.html
git commit -m "feat(cloud): UI de login y estado de conexión en el shell"
```

---

## Task 2: Indicador de estado de sync en el shell

**Files:**
- Modify: `src/shell.html`
- Test: manual (forzar sync, ver contador)

**Interfaces:**
- Consumes: `window.sync.status()`
- Produces: badge con cambios pendientes / último sync / error.

- [ ] **Step 1: Agregar badge de sync junto al cloud status**

En el `cloud-status-bar` agregar:

```html
<span id="sync-badge" style="display:none;background:#f39c12;color:#fff;padding:2px 6px;border-radius:10px;font-size:11px;"></span>
```

- [ ] **Step 2: Implementar refresco periódico del estado de sync**

Agregar en el `<script>` principal:

```js
async function refreshSyncStatus() {
  const s = await window.sync.status();
  const badge = document.getElementById('sync-badge');
  if (!badge) return;
  if (s.syncing) {
    badge.style.display = '';
    badge.textContent = 'Sincronizando...';
    badge.style.background = '#3498db';
  } else if (!s.connected) {
    badge.style.display = '';
    badge.textContent = 'Sin nube';
    badge.style.background = '#999';
  } else if (s.pendingChanges > 0) {
    badge.style.display = '';
    badge.textContent = `${s.pendingChanges} pendientes`;
    badge.style.background = '#f39c12';
  } else if (s.lastError) {
    badge.style.display = '';
    badge.textContent = 'Error sync';
    badge.style.background = '#e74c3c';
    badge.title = s.lastError;
  } else {
    badge.style.display = 'none';
  }
}

setInterval(refreshSyncStatus, 10_000);
refreshSyncStatus();
```

- [ ] **Step 3: Verificar manualmente**

Run: `npm run dev`
Expected: el badge refleja conectado/desconectado/pendientes.

- [ ] **Step 4: Commit**

```bash
git add src/shell.html
git commit -m "feat(sync): indicador de estado de sync en el shell"
```

---

## Task 3: Propagar anulaciones de documentos a otras PCs

**Files:**
- Modify: `src/documents.ts`
- Test: `test/document-sync.test.ts`

**Interfaces:**
- Consumes: `enqueueDocSnapshot(type, id)`
- Produces: `annulDocument()` ahora encola el snapshot anulado.

- [ ] **Step 1: Escribir test de propagación de anulación**

Agregar en `test/document-sync.test.ts`:

```ts
import { enqueueDocSnapshot } from "../src/documents";
import { vi } from "vitest";

vi.mock("../src/api-client", () => ({
  isCloudConnected: () => true,
}));

describe("document-sync — anulación", () => {
  it("annulDocument encola el snapshot para propagar la anulación", () => {
    seedArticle("A1");
    const { id } = persistGoodsReceipt({
      proveedorNombre: "Prov",
      estado: "recibido",
      items: [{ codigo: "A1", descripcion: "Art", cantPedida: 3, cantRecibida: 3 }],
    });
    // Limpiar cola previa
    getDb().exec("DELETE FROM sync_queue");

    const result = annulDocument("goods-receipt", id);

    expect(result.ok).toBe(true);
    const rows = getDb().prepare("SELECT entity, action FROM sync_queue WHERE synced_at IS NULL").all() as Array<{ entity: string; action: string }>;
    expect(rows).toContainEqual({ entity: "document_snapshot", action: "update" });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm run rebuild:node && npx vitest run test/document-sync.test.ts`
Expected: FAIL porque `annulDocument` no encola.

- [ ] **Step 3: Modificar `annulDocument` para encolar snapshot**

En `src/documents.ts`, en `annulDocument`, después del `tx()` agregar:

```ts
  tx();
  enqueueDocSnapshot(cfg.refType, docId);
  return { ok: true };
```

Asegurarse de que `enqueueDocSnapshot` ya esté importado (lo está en la línea 26).

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run test/document-sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/documents.ts test/document-sync.test.ts
git commit -m "fix(sync): propagar anulaciones de documentos a la nube"
```

---

## Task 4: Sincronizar bajas de maestros

**Files:**
- Modify: `src/masters.ts`
- Test: `test/sync.test.ts`

**Interfaces:**
- Consumes: `upsertClient`, `upsertSupplier`, `upsertArticle`, `enqueueChange`
- Produces: helper `deactivateClient`, etc., encolan `delete`.

- [ ] **Step 1: Verificar si hay funciones de baja**

Buscar en `src/` funciones que borren/desactiven clientes/proveedores/artículos. Si no existen, crearlas en `src/masters.ts`.

- [ ] **Step 2: Implementar funciones de baja que encolen**

Agregar en `src/masters.ts`:

```ts
export function deactivateClient(id: string): void {
  const saved = upsertClient({ id, active: 0 });
  tryEnqueue("client", saved.id, "delete");
}

export function deactivateSupplier(id: string): void {
  const saved = upsertSupplier({ id, active: 0 });
  tryEnqueue("supplier", saved.id, "delete");
}

export function deactivateArticle(id: string): void {
  const saved = upsertArticle({ id, active: 0 });
  tryEnqueue("product", saved.id, "delete");
}
```

- [ ] **Step 3: Agregar test**

En `test/sync.test.ts`:

```ts
it("deactivateClient encola un delete para sync", () => {
  getDb().prepare("INSERT INTO clients (id, code, business_name) VALUES (?,?,?)").run("c-del", "C1", "Cliente");
  const { deactivateClient } = require("../src/masters");
  deactivateClient("c-del");
  const row = getDb().prepare("SELECT entity, action FROM sync_queue ORDER BY id DESC LIMIT 1").get() as { entity: string; action: string };
  expect(row).toMatchObject({ entity: "client", action: "delete" });
});
```

- [ ] **Step 4: Correr test**

Run: `npx vitest run test/sync.test.ts -t "deactivateClient"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/masters.ts test/sync.test.ts
git commit -m "feat(sync): sincronizar bajas de maestros"
```

---

## Task 5: Backend — agregar entidades CRM a Prisma

**Files:**
- Modify: `v2/packages/api/prisma/schema.prisma`
- Test: `npx prisma generate` sin errores

**Interfaces:**
- Produces: modelos `Opportunity`, `Activity`, `Task` relacionados con `Tenant`.

- [ ] **Step 1: Leer schema existente para ubicar relaciones**

Run: ya leído. Ubicar después de `KitComponent`.

- [ ] **Step 2: Agregar modelos CRM**

Agregar en `v2/packages/api/prisma/schema.prisma` dentro del bloque de `Tenant` (agregar a la lista de relaciones):

```prisma
  opportunities   Opportunity[]
  activities      Activity[]
  tasks           Task[]
```

Y al final del archivo (antes del cierre) agregar:

```prisma
model Opportunity {
  id          String   @id @default(uuid())
  tenantId    String
  clientId    String?
  name        String
  stage       String
  value       Decimal  @default(0) @db.Decimal(12, 2)
  probability Int      @default(0)
  expectedCloseDate DateTime?
  status      String   @default("open")
  active      Boolean  @default(true)
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([updatedAt])
  @@map("opportunities")
}

model Activity {
  id          String   @id @default(uuid())
  tenantId    String
  clientId    String?
  opportunityId String?
  type        String
  notes       String?
  date        DateTime @default(now())
  active      Boolean  @default(true)
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([updatedAt])
  @@map("activities")
}

model Task {
  id          String   @id @default(uuid())
  tenantId    String
  clientId    String?
  opportunityId String?
  title       String
  dueDate     DateTime?
  completed   Boolean  @default(false)
  active      Boolean  @default(true)
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([updatedAt])
  @@map("tasks")
}
```

- [ ] **Step 3: Generar cliente Prisma**

Run:
```bash
cd v2/packages/api
npx prisma generate
```
Expected: generación exitosa, sin errores.

- [ ] **Step 4: Crear migración**

Run:
```bash
cd v2/packages/api
npx prisma migrate dev --name add_crm_entities
```
Expected: migración creada y aplicada localmente (o guardada para deploy).

- [ ] **Step 5: Commit**

```bash
git add v2/packages/api/prisma/
git commit -m "feat(api): modelos Prisma para CRM (Opportunity, Activity, Task)"
```

---

## Task 6: Backend — sincronizar CRM en sync.service.ts

**Files:**
- Modify: `v2/packages/api/src/modules/sync/sync.service.ts`
- Test: `v2/packages/api/src/modules/sync/sync.service.spec.ts`

**Interfaces:**
- Consumes: modelos Prisma de CRM.
- Produces: `pullChanges` y `applyChange` soportan `crm_opportunity`, `crm_activity`, `crm_task`.

- [ ] **Step 1: Agregar queries en `pullChanges`**

En `pullChanges`, agregar a `Promise.all`:

```ts
      this.prisma.opportunity.findMany({ where: { tenantId, updatedAt: { gt: sinceDate } } }),
      this.prisma.activity.findMany({ where: { tenantId, updatedAt: { gt: sinceDate } } }),
      this.prisma.task.findMany({ where: { tenantId, updatedAt: { gt: sinceDate } } }),
```

Y asignar a variables `opportunities`, `activities`, `tasks`.

- [ ] **Step 2: Mapear CRM a cambios en `pullChanges`**

Después del bloque de `kitComponents`, agregar:

```ts
    for (const o of opportunities) {
      changes.push({
        entity: 'crm_opportunity',
        action: o.deletedAt ? 'delete' : 'update',
        id: o.id,
        data: o as unknown as Record<string, unknown>,
        updatedAt: o.updatedAt.toISOString(),
      });
    }

    for (const a of activities) {
      changes.push({
        entity: 'crm_activity',
        action: a.deletedAt ? 'delete' : 'update',
        id: a.id,
        data: a as unknown as Record<string, unknown>,
        updatedAt: a.updatedAt.toISOString(),
      });
    }

    for (const t of tasks) {
      changes.push({
        entity: 'crm_task',
        action: t.deletedAt ? 'delete' : 'update',
        id: t.id,
        data: t as unknown as Record<string, unknown>,
        updatedAt: t.updatedAt.toISOString(),
      });
    }
```

- [ ] **Step 3: Agregar casos en `applyChange`**

En `applyChange`, antes del `default`, agregar:

```ts
      case 'crm_opportunity': {
        const sanitized = this.sanitizeOpportunityData(data);
        if (action === 'delete') {
          await this.prisma.opportunity.updateMany({
            where: { id, tenantId },
            data: { deletedAt: new Date(), active: false },
          });
        } else {
          await this.prisma.opportunity.upsert({
            where: { id },
            create: { ...sanitized, id, tenantId },
            update: sanitized,
          });
        }
        break;
      }

      case 'crm_activity': {
        const sanitized = this.sanitizeActivityData(data);
        if (action === 'delete') {
          await this.prisma.activity.updateMany({
            where: { id, tenantId },
            data: { deletedAt: new Date(), active: false },
          });
        } else {
          await this.prisma.activity.upsert({
            where: { id },
            create: { ...sanitized, id, tenantId },
            update: sanitized,
          });
        }
        break;
      }

      case 'crm_task': {
        const sanitized = this.sanitizeTaskData(data);
        if (action === 'delete') {
          await this.prisma.task.updateMany({
            where: { id, tenantId },
            data: { deletedAt: new Date(), active: false },
          });
        } else {
          await this.prisma.task.upsert({
            where: { id },
            create: { ...sanitized, id, tenantId },
            update: sanitized,
          });
        }
        break;
      }
```

- [ ] **Step 4: Agregar métodos sanitize**

Al final de la clase, agregar:

```ts
  private sanitizeOpportunityData(data: Record<string, unknown>) {
    return {
      clientId: data.clientId ? String(data.clientId) : null,
      name: String(data.name ?? ''),
      stage: String(data.stage ?? 'prospecting'),
      value: Number(data.value ?? 0),
      probability: Number(data.probability ?? 0),
      expectedCloseDate: data.expectedCloseDate ? new Date(String(data.expectedCloseDate)) : null,
      status: String(data.status ?? 'open'),
      active: data.active === false || data.deletedAt ? false : true,
    };
  }

  private sanitizeActivityData(data: Record<string, unknown>) {
    return {
      clientId: data.clientId ? String(data.clientId) : null,
      opportunityId: data.opportunityId ? String(data.opportunityId) : null,
      type: String(data.type ?? 'note'),
      notes: data.notes ? String(data.notes) : null,
      date: data.date ? new Date(String(data.date)) : new Date(),
      active: data.active === false || data.deletedAt ? false : true,
    };
  }

  private sanitizeTaskData(data: Record<string, unknown>) {
    return {
      clientId: data.clientId ? String(data.clientId) : null,
      opportunityId: data.opportunityId ? String(data.opportunityId) : null,
      title: String(data.title ?? ''),
      dueDate: data.dueDate ? new Date(String(data.dueDate)) : null,
      completed: data.completed === true,
      active: data.active === false || data.deletedAt ? false : true,
    };
  }
```

- [ ] **Step 5: Agregar test backend**

En `v2/packages/api/src/modules/sync/sync.service.spec.ts`, agregar:

```ts
it('aplica oportunidad CRM desde desktop', async () => {
  const result = await service.pushChanges(tenantId, userId, [{
    entity: 'crm_opportunity',
    action: 'update',
    id: 'opp-1',
    data: { name: 'Venta grande', stage: 'negotiation', value: 10000, probability: 50 },
  }]);
  expect(result.processed).toBe(1);
  expect(result.conflicts).toHaveLength(0);

  const opp = await prisma.opportunity.findFirst({ where: { id: 'opp-1', tenantId } });
  expect(opp).not.toBeNull();
  expect(opp?.name).toBe('Venta grande');
});
```

Nota: adaptar `tenantId` y `userId` a los valores que usa el test existente.

- [ ] **Step 6: Correr tests del backend**

Run:
```bash
cd v2/packages/api
npm test
```
Expected: tests pasan.

- [ ] **Step 7: Commit**

```bash
git add v2/packages/api/src/modules/sync/
git commit -m "feat(api): sincronización de entidades CRM en sync service"
```

---

## Task 7: Desktop — asegurar mapeo de CRM remoto

**Files:**
- Modify: `src/sync.ts`
- Test: `test/sync.test.ts`

**Interfaces:**
- Consumes: cambios remotos `crm_opportunity`, `crm_activity`, `crm_task`.
- Produces: filas en `opportunities`, `crm_activities`, `crm_tasks`.

- [ ] **Step 1: Verificar mapeo actual**

En `src/sync.ts` ya existe el mapeo en `applyRemoteChange` (líneas 774-787). Verificar que las columnas coincidan con el schema SQLite.

- [ ] **Step 2: Agregar test de pull de CRM**

En `test/sync.test.ts`:

```ts
it("aplica oportunidades, actividades y tareas CRM remotas", async () => {
  getDb().exec("DELETE FROM sync_queue; DELETE FROM sync_state; DELETE FROM opportunities; DELETE FROM crm_activities; DELETE FROM crm_tasks;");
  authorizedFetchMock.mockImplementation(() => Promise.resolve({
    ok: true, status: 200, text: async () => "",
    json: async () => ({
      success: true,
      data: {
        changes: [
          { entity: "crm_opportunity", action: "update", id: "opp-1", updatedAt: "2026-07-14T10:00:00.000Z", data: { id: "opp-1", client_id: null, name: "Venta", stage: "prospecting", value: 5000, probability: 30, status: "open", active: 1 } },
          { entity: "crm_activity", action: "update", id: "act-1", updatedAt: "2026-07-14T10:00:01.000Z", data: { id: "act-1", client_id: null, opportunity_id: "opp-1", type: "call", notes: "Llamada", date: "2026-07-14T10:00:00.000Z", active: 1 } },
          { entity: "crm_task", action: "update", id: "task-1", updatedAt: "2026-07-14T10:00:02.000Z", data: { id: "task-1", client_id: null, opportunity_id: "opp-1", title: "Seguimiento", due_date: "2026-07-15T10:00:00.000Z", completed: 0, active: 1 } },
        ],
        serverTimestamp: "2026-07-14T10:01:00.000Z",
      },
    }),
  }));

  expect((await runSync()).errors).toBe(0);
  expect(getDb().prepare("SELECT name FROM opportunities WHERE id=?").get("opp-1")).toMatchObject({ name: "Venta" });
  expect(getDb().prepare("SELECT notes FROM crm_activities WHERE id=?").get("act-1")).toMatchObject({ notes: "Llamada" });
  expect(getDb().prepare("SELECT title FROM crm_tasks WHERE id=?").get("task-1")).toMatchObject({ title: "Seguimiento" });
});
```

- [ ] **Step 3: Correr test**

Run: `npx vitest run test/sync.test.ts -t "aplica oportunidades"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/sync.ts test/sync.test.ts
git commit -m "test(sync): validar aplicación de cambios CRM remotos"
```

---

## Task 8: Sincronizar estado habilitado de AIR / WhatsApp / ARCA

**Files:**
- Modify: `src/air.ts`, `src/whatsapp.ts`, `src/afip-service.ts`
- Test: `test/sync.test.ts`

**Interfaces:**
- Consumes: `enqueueChange('integration_config', ...)`
- Produces: cuando cambia cualquier config pública de estas integraciones, se encola para sync.

- [ ] **Step 1: Encolar config de AIR cuando cambia**

En `src/air.ts`, buscar funciones que actualizan `system_config` (ej. `saveAirConfig` o similar). Si no existe, crear una. Al final de cualquier función que persista config AIR, agregar:

```ts
import { enqueueChange } from "./sync";

function notifyAirConfigSync() {
  const cfg = getAirLocalConfig();
  try {
    enqueueChange('integration_config', 'air', 'update', {
      provider: 'air',
      config: {
        enabled: cfg.enabled,
        username: cfg.username,
        baseUrl: cfg.baseUrl,
        syncIntervalMinutes: cfg.syncIntervalMinutes,
        requiresPasswordOnDevice: true,
      },
    });
  } catch { /* best-effort */ }
}
```

Llamar `notifyAirConfigSync()` después de guardar la config.

- [ ] **Step 2: Encolar config de WhatsApp cuando cambia**

En `src/whatsapp.ts`, similar:

```ts
function notifyWhatsappConfigSync() {
  const cfg = getWhatsappConfig();
  try {
    enqueueChange('integration_config', 'whatsapp', 'update', {
      provider: 'whatsapp',
      config: {
        enabled: cfg.enabled,
        baseUrl: cfg.baseUrl,
        botPhone: cfg.botPhone,
        pollIntervalMinutes: cfg.pollIntervalMinutes,
        requiresTokenOnDevice: true,
      },
    });
  } catch { /* best-effort */ }
}
```

- [ ] **Step 3: Encolar config de ARCA cuando cambia**

En `src/afip-service.ts`, agregar:

```ts
import { enqueueChange } from "./sync";

export function notifyAfipConfigSync() {
  const cfg = getAfipConfig();
  try {
    enqueueChange('integration_config', 'afip', 'update', {
      provider: 'afip',
      config: {
        enabled: cfg.enabled,
        cuit: cfg.cuit,
        environment: cfg.environment,
        pointOfSale: cfg.pointOfSale,
        hasCert: cfg.hasCert,
        hasKey: cfg.hasKey,
        requiresCredentialsOnDevice: true,
      },
    });
  } catch { /* best-effort */ }
}
```

Llamar después de `saveAfipCredentials` o donde se actualice la config.

- [ ] **Step 4: Agregar test de no filtración de secretos**

En `test/sync.test.ts`:

```ts
it("la config de ARCA no filtra certificado ni clave privada", () => {
  getDb().exec("DELETE FROM sync_queue");
  const { notifyAfipConfigSync } = require("../src/afip-service");
  notifyAfipConfigSync();
  const payload = getDb().prepare("SELECT payload FROM sync_queue WHERE entity='integration_config' AND entity_id='afip'").get() as { payload: string };
  expect(payload).toBeDefined();
  expect(payload.payload).not.toContain("BEGIN RSA PRIVATE KEY");
  expect(payload.payload).not.toContain("BEGIN CERTIFICATE");
});
```

- [ ] **Step 5: Correr tests**

Run: `npx vitest run test/sync.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/air.ts src/whatsapp.ts src/afip-service.ts test/sync.test.ts
git commit -m "feat(sync): sincronizar configuración de AIR, WhatsApp y ARCA sin secretos"
```

---

## Task 9: Backend — soportar integration_config de ARCA

**Files:**
- Modify: `v2/packages/api/src/modules/sync/sync.service.ts`
- Test: `v2/packages/api/src/modules/sync/sync.service.spec.ts`

**Interfaces:**
- Consumes: `integration_config` con `provider: 'afip'`.
- Produces: upsert en `IntegrationConfig` con config sanitizada.

- [ ] **Step 1: Verificar que `integration_config` acepte provider 'afip'**

En `applyChange`, el caso `integration_config` ya usa `sanitized.provider`. Prisma tiene unique `tenantId_provider`. Agregar test.

- [ ] **Step 2: Agregar test backend**

```ts
it('aplica configuración ARCA sin certificados', async () => {
  const result = await service.pushChanges(tenantId, userId, [{
    entity: 'integration_config',
    action: 'update',
    id: 'afip',
    data: {
      provider: 'afip',
      config: { enabled: true, cuit: '30123456780', environment: 'prod', pointOfSale: 1, hasCert: true, hasKey: true, certificate: 'SECRET', privateKey: 'SECRET' },
    },
  }]);
  expect(result.processed).toBe(1);
  const cfg = await prisma.integrationConfig.findUnique({ where: { tenantId_provider: { tenantId, provider: 'afip' } } });
  const config = cfg?.config as Record<string, unknown>;
  expect(config.enabled).toBe(true);
  expect(config.certificate).toBeUndefined();
  expect(config.privateKey).toBeUndefined();
});
```

- [ ] **Step 3: Correr tests backend**

Run: `cd v2/packages/api && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add v2/packages/api/src/modules/sync/
git commit -m "feat(api): soportar integration_config de ARCA en sync"
```

---

## Task 10: Documentación y actualización de estado

**Files:**
- Modify: `docs/desktop-cloud-sync.md`

- [ ] **Step 1: Actualizar estado del documento**

Reemplazar la sección "Lo que FALTA" con el estado actual:

```markdown
## Estado actual

- [x] UI de conexión cloud en el desktop.
- [x] Indicador de estado de sync.
- [x] Propagación de anulaciones de documentos.
- [x] Sincronización de bajas de maestros.
- [x] Entidades CRM en sync (Opportunity, Activity, Task).
- [x] Configuración de AIR/WhatsApp/ARCA sincronizada (sin secretos).
- [ ] Documentos normalizados desde web/mobile en desktop (reservado para cuando el panel opere documentos).
```

- [ ] **Step 2: Commit**

```bash
git add docs/desktop-cloud-sync.md
git commit -m "docs: actualizar estado de sync multi-PC"
```

---

## Task 11: Release con autoupdate

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Bump de versión minor**

Run:
```bash
node -e "const pkg=require('./package.json'); const [major,minor,patch]=pkg.version.split('.'); pkg.version=major+'.'+(parseInt(minor)+1)+'.0'; require('fs').writeFileSync('package.json', JSON.stringify(pkg,null,2)+'\n')"
```

- [ ] **Step 2: Build y tests desktop**

Run:
```bash
npm run test
npm run build
```
Expected: todos los tests pasan.

- [ ] **Step 3: Commit y tag**

```bash
git add package.json package-lock.json
git commit -m "chore(release): v$(node -p "require('./package.json').version") multi-PC sync"
git tag v$(node -p "require('./package.json').version")
git push origin main --tags
```

- [ ] **Step 4: Publicar release**

Run:
```bash
npm run release
```
Expected: installer subido a `equazin/asimov-releases`.

---

## Self-Review

### Spec coverage
- UI cloud en desktop → Task 1.
- Indicador de sync → Task 2.
- Anulaciones sync → Task 3.
- Bajas de maestros → Task 4.
- CRM backend Prisma → Task 5.
- CRM backend sync → Task 6.
- CRM desktop pull → Task 7.
- AIR/ARCA config sync → Tasks 8-9.
- Documentación → Task 10.
- Release → Task 11.

### Placeholder scan
- No TBD/TODO.
- Código completo en cada step.
- Comandos exactos.

### Type consistency
- `crm_opportunity` / `crm_activity` / `crm_task` usados consistentemente en desktop y backend.
- `integration_config` con provider string consistente.

### Gaps
- No se sincronizan credenciales (a propósito, por seguridad).
- Documentos normalizados web→desktop quedan fuera del scope.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-15-multi-pc-cloud-sync.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session, batch execution with checkpoints for review.

**Which approach?**
