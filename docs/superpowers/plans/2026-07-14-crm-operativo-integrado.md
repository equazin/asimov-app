# CRM Operativo Integrado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el CRM existente en un espacio operativo donde se puedan administrar cuentas, oportunidades, actividades y tareas sin salir del flujo comercial del ERP.

**Architecture:** Mantener SQLite y los servicios CRM existentes como fuente de verdad, agregando dos consultas de lectura optimizadas para el listado y la ficha integral de cuentas. La interfaz se implementa como un módulo aislado de JavaScript y CSS cargado por `shell.html`, con un único espacio de trabajo por pestañas y modales accesibles; `shell.html` solo conserva el punto de montaje y la integración de navegación.

**Tech Stack:** Electron, TypeScript, SQLite/better-sqlite3, HTML, CSS y JavaScript sin dependencias nuevas, Vitest.

## Global Constraints

- Mantener la identidad visual oscura y las variables CSS existentes del ERP.
- Exponer cuentas, pipeline, oportunidades, actividades y tareas en un mismo espacio CRM.
- Permitir crear y editar cuentas y oportunidades; ganar, perder o mover oportunidades de etapa.
- Permitir registrar llamadas, reuniones, correos y notas; crear, completar y eliminar tareas.
- Mostrar próximas acciones, vencidas e historial por cliente.
- Incluir accesos directos para llamar, enviar correo, cotizar y crear pedido.
- No agregar dependencias ni modificar los archivos `graphify-out/**` ni el archivo no rastreado `0`.
- Conservar la política de permisos: los roles de solo lectura no pueden ejecutar mutaciones.
- Publicar la siguiente versión con autoupdate después de que build y pruebas queden en verde.

---

## File Structure

- `src/crm.ts`: contratos, consultas agregadas y validación del dominio CRM.
- `src/ipc/crm.ts`: adaptadores IPC `{ ok, data, error }` de cuentas y operaciones existentes.
- `src/preload.ts`: API segura disponible para el renderer.
- `src/crm-workspace.js`: estado, carga, render y acciones del espacio CRM.
- `src/crm-workspace.css`: disposición, jerarquía visual, estados y comportamiento responsivo.
- `src/shell.html`: montaje del workspace, navegación y carga de assets.
- `scripts/copy-assets.js`: copia de los dos assets CRM a `dist/`.
- `test/crm.test.ts`: comportamiento del dominio y agregaciones.
- `test/crm-workspace-ui.test.ts`: contrato estático de integración UI, IPC y assets.

### Task 1: Contratos de cuentas CRM

**Files:**
- Modify: `test/crm.test.ts`
- Modify: `src/crm.ts`

**Interfaces:**
- Produces: `listCrmAccounts(search: string, status?: string): CrmAccountListItem[]`.
- Produces: `getCrmAccountWorkspace(clientId: string): CrmAccountWorkspace | undefined`.
- Updates: `listOpportunities(search: string, status?: string)` accepts `"all"`.

- [ ] **Step 1: Write the failing tests**

```ts
it("lists accounts with pipeline and pending action totals", () => {
  const clientId = seedClient("cli-crm", "Cuenta Operativa");
  saveOpportunity({ client_id: clientId, title: "Renovación", amount: 1000 });
  saveTask({ client_id: clientId, title: "Llamar", due_date: "2026-07-13" });
  const [account] = listCrmAccounts("Operativa", "all");
  expect(account.open_opportunities).toBe(1);
  expect(account.pipeline_value).toBe(1000);
  expect(account.overdue_tasks).toBe(1);
});

it("returns the complete account workspace", () => {
  const clientId = seedClient("cli-detail", "Cuenta Detalle");
  saveActivity({ client_id: clientId, type: "call", subject: "Contacto" });
  const detail = getCrmAccountWorkspace(clientId);
  expect(detail?.account.business_name).toBe("Cuenta Detalle");
  expect(detail?.activities).toHaveLength(1);
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npx vitest run test/crm.test.ts`

Expected: FAIL because `listCrmAccounts` and `getCrmAccountWorkspace` do not exist.

- [ ] **Step 3: Implement the account queries and validation**

```ts
export interface CrmAccountWorkspace {
  account: Record<string, unknown>;
  summary: ClientCrmSummary;
  opportunities: Opportunity[];
  activities: Activity[];
  tasks: Task[];
}

export function getCrmAccountWorkspace(clientId: string): CrmAccountWorkspace | undefined {
  const account = dbGet<Record<string, unknown>>(
    "SELECT * FROM clients WHERE id = ? AND active = 1",
    [str(clientId)]
  );
  if (!account) return undefined;
  return {
    account,
    summary: getClientCrmSummary(clientId),
    opportunities: listClientOpportunities(clientId),
    activities: listActivities(clientId),
    tasks: listClientTasks(clientId),
  };
}
```

Add required-field validation before writes: client and title for opportunities, client and type for activities, and client, title and due date for tasks. Detect existing rows before activity/task upserts so cloud sync receives `create` or `update` correctly.

- [ ] **Step 4: Run the CRM domain tests**

Run: `npx vitest run test/crm.test.ts`

Expected: PASS.

### Task 2: Expose the workspace through IPC

**Files:**
- Modify: `src/ipc/crm.ts`
- Modify: `src/preload.ts`
- Create: `test/crm-workspace-ui.test.ts`

**Interfaces:**
- Consumes: `listCrmAccounts`, `getCrmAccountWorkspace`.
- Produces: `asimov().crm.accounts.list(search, status)` and `asimov().crm.accounts.get(id)`.

- [ ] **Step 1: Write the failing integration contract**

```ts
it("exposes CRM accounts through IPC and preload", () => {
  expect(ipcSource).toContain('ipcMain.handle("crm:accounts:list"');
  expect(ipcSource).toContain('ipcMain.handle("crm:accounts:get"');
  expect(preloadSource).toContain('ipcRenderer.invoke("crm:accounts:list"');
  expect(preloadSource).toContain('ipcRenderer.invoke("crm:accounts:get"');
});
```

- [ ] **Step 2: Run the contract test and confirm failure**

Run: `npx vitest run test/crm-workspace-ui.test.ts`

Expected: FAIL because the handlers are missing.

- [ ] **Step 3: Add safe IPC wrappers**

```ts
ipcMain.handle("crm:accounts:list", (_event, search, status) => {
  try { return { ok: true, data: listCrmAccounts(safeStr(search), safeStr(status) || "all") }; }
  catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle("crm:accounts:get", (_event, id) => {
  try { return { ok: true, data: getCrmAccountWorkspace(safeStr(id)) }; }
  catch (e) { return { ok: false, error: String(e) }; }
});
```

- [ ] **Step 4: Run the contract test**

Run: `npx vitest run test/crm-workspace-ui.test.ts`

Expected: PASS for IPC/preload assertions.

### Task 3: Build the integrated CRM workspace

**Files:**
- Create: `src/crm-workspace.js`
- Create: `src/crm-workspace.css`
- Modify: `src/shell.html`
- Modify: `scripts/copy-assets.js`
- Modify: `test/crm-workspace-ui.test.ts`

**Interfaces:**
- Consumes: `asimov().crm.accounts`, `pipeline`, `opportunities`, `activities`, `tasks`, and `asimov().db.clients.save/list`.
- Produces: `window.CrmWorkspace.load()`, `setSearch(value)`, `setTab(tab)` and `refresh()`.

- [ ] **Step 1: Extend the failing UI contract**

```ts
it("mounts the operational CRM assets and actions", () => {
  expect(shellSource).toContain('id="crm-workspace"');
  expect(shellSource).toContain('href="./crm-workspace.css"');
  expect(shellSource).toContain('src="./crm-workspace.js"');
  expect(workspaceSource).toContain('data-crm-action="new-opportunity"');
  expect(workspaceSource).toContain('data-crm-action="complete-task"');
  expect(copyAssetsSource).toContain('"crm-workspace.js"');
});
```

- [ ] **Step 2: Run and confirm the missing workspace failure**

Run: `npx vitest run test/crm-workspace-ui.test.ts`

Expected: FAIL because the assets and mount are absent.

- [ ] **Step 3: Implement state and rendering in the isolated module**

Use one state object containing `tab`, `search`, accounts, stages, opportunities, activities and tasks. Every IPC response must pass through an unwrapping helper that throws the provided error; no renderer may treat `{ ok, data }` as an array. Render these views:

- `Resumen`: KPIs, open pipeline, upcoming/overdue tasks and recent activity.
- `Cuentas`: searchable operational table with open, edit, opportunity, activity, task, call, email, quote and order actions.
- `Oportunidades`: stage columns with cards; double-click/edit and stage movement through the opportunity form.
- `Actividades`: chronological list with type, client, owner and notes.
- `Tareas`: pending/completed filters and complete, edit and delete actions.

Build modal forms using real `<label>` elements, native controls, visible focus, Escape/outside close and input preservation on errors. Use only existing ERP variables and labels in sentence case.

- [ ] **Step 4: Integrate the mount and copy assets**

Replace the generic `table-cuentas-crm` view with `#crm-workspace`. Special-case `cuentas-crm` in `navigate()` and `refreshCurrentView()` so it invokes the module instead of `renderTable`. Keep `/crm` and `/crm/cuentas` routes compatible. Add the CSS link and deferred script, and include both assets in the copy list.

- [ ] **Step 5: Run UI contract and build**

Run: `npx vitest run test/crm-workspace-ui.test.ts`

Run: `npm run build`

Expected: both PASS and the two CRM assets exist in `dist/`.

### Task 4: Verify behavior and quality

**Files:**
- Modify if needed: files from Tasks 1–3.

**Interfaces:**
- Consumes: the complete CRM workspace.
- Produces: a releasable build with no regression.

- [ ] **Step 1: Run focused tests**

Run: `npx vitest run test/crm.test.ts test/crm-workspace-ui.test.ts`

Expected: PASS.

- [ ] **Step 2: Run all tests and build**

Run: `npm test`

Run: `npm run build`

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run Electron smoke test**

Run: `npm run smoke-test`

Expected: the app process starts, opens the shell and exits successfully.

- [ ] **Step 4: Review the diff**

Inspect only the intended plan, CRM source, tests, asset copier and version files. Confirm there are no secrets, no writes to unrelated dirty files, no unsafe HTML interpolation and no renderer access outside the preload boundary.

### Task 5: Version, push and autoupdate release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: verified Task 4 build.
- Produces: tag and GitHub release `v4.22.4` with installer, blockmap and `latest.yml`.

- [ ] **Step 1: Bump the version**

Run: `npm version 4.22.4 --no-git-tag-version`

Expected: package manifests show `4.22.4`.

- [ ] **Step 2: Re-run build and focused regression tests**

Run: `npm run build`

Run: `npx vitest run test/crm.test.ts test/crm-workspace-ui.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit only intended files**

```powershell
git add docs/superpowers/plans/2026-07-14-crm-operativo-integrado.md src/crm.ts src/ipc/crm.ts src/preload.ts src/crm-workspace.js src/crm-workspace.css src/shell.html scripts/copy-assets.js test/crm.test.ts test/crm-workspace-ui.test.ts package.json package-lock.json
git commit -m "feat(crm): agregar espacio operativo integrado"
```

- [ ] **Step 4: Push, tag and publish**

Run: `git push origin main`

Run: `git tag v4.22.4 && git push origin v4.22.4`

Run: `npm run release`

Expected: GitHub release `v4.22.4` contains the `.exe`, `.blockmap` and `latest.yml` used by electron-updater.

## Self-Review

- Spec coverage: accounts, opportunities, pipeline, activities, tasks, overdue actions, history and commercial shortcuts each have an explicit backend or UI task.
- Placeholder scan: the plan contains no deferred implementation markers.
- Type consistency: account APIs return the same `{ ok, data }` envelope already used by the CRM preload; the renderer explicitly unwraps it before rendering.
