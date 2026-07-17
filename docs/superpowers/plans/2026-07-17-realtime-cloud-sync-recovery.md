# Realtime Cloud Sync Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make changes appear automatically on every open PC within a few seconds, drain large queues continuously, and replace opaque `sync_conflict` failures with recoverable, diagnosable errors.

**Architecture:** Keep the existing offline-first SQLite queue and NestJS/Postgres API. Add a debounced immediate push after local writes plus a three-second pull loop, publish applied-remote-change events from the main process to the shell, and repair the API contract so item failures include entity/error details without turning successful writes into conflicts because audit logging failed.

**Tech Stack:** Electron 33, TypeScript, better-sqlite3, NestJS 11, Prisma 6, Vitest.

## Global Constraints

- Preserve offline-first behavior: local writes must never wait for the network.
- Preserve compatibility with old API responses containing `conflicts: string[]`.
- Do not synchronize device secrets.
- Do not add dependencies or require a database migration.
- Refresh open UI views automatically after remote data is applied.

---

### Task 1: Repair and diagnose API push conflicts

**Files:**
- Modify: `v2/packages/api/src/modules/sync/sync.service.ts`
- Test: `v2/packages/api/src/modules/sync/sync.service.spec.ts`

**Interfaces:**
- Produces: `pushChanges(...): { processed: number; conflicts: string[]; conflictDetails: Array<{ id: string; entity: string; error: string }> }`

- [ ] Add a regression test asserting product payloads persist `ivaPct`.
- [ ] Add a regression test asserting an audit-log failure does not reject an already-applied entity mutation.
- [ ] Return sanitized per-change error details while retaining `conflicts` for old clients.
- [ ] Run `npm --prefix v2 test -- --run packages/api/src/modules/sync/sync.service.spec.ts` and expect PASS.

### Task 2: Make the desktop engine continuous and self-draining

**Files:**
- Modify: `src/sync.ts`
- Test: `test/sync.test.ts`

**Interfaces:**
- Produces: `onSyncApplied(listener): () => void` and `requestSync(delayMs?): void`.
- Emits: `{ pushed, pulled, errors, changedEntities }` after each meaningful cycle.

- [ ] Add failing tests for debounced immediate sync, automatic follow-up while eligible rows remain, and recovery of legacy `sync_conflict` rows.
- [ ] Trigger a non-blocking debounced cycle from `enqueueChange`.
- [ ] Change background polling from 30 seconds to 3 seconds.
- [ ] Re-run immediately after a successful 250-row batch while eligible queue rows remain.
- [ ] Reactivate legacy `sync_conflict` rows on startup/login and expose detailed server errors locally.
- [ ] Apply remote dependency entities before document snapshots and return their entity names.
- [ ] Run `npm test` and expect all desktop tests to pass.

### Task 3: Refresh open windows after remote changes

**Files:**
- Modify: `src/ipc-cloud.ts`
- Modify: `src/main.ts`
- Modify: `src/preload.ts`
- Modify: `src/shell.html`
- Test: `test/shell-cloud-recovery.test.ts`

**Interfaces:**
- Main to renderer channel: `sync:applied` with the sync-cycle event.
- Renderer API: `cloudSync.onApplied(callback)`.

- [ ] Add a UI contract test for the `sync:applied` listener and automatic `refreshCurrentView()` call.
- [ ] Pass a shell notification callback into cloud IPC registration.
- [ ] Forward meaningful sync events to the shell.
- [ ] Refresh the active view and sync badge immediately when remote rows arrive.
- [ ] Keep interval status polling as a fallback.

### Task 4: Verify, review, and release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Run API tests, desktop tests, desktop build, and API build.
- [ ] Review correctness, readability, architecture, security, and performance.
- [ ] Bump the desktop patch version.
- [ ] Commit only task files, tag, push `main`, and publish the installer release.
- [ ] Verify the public GitHub release assets and Render deployment source commit.

