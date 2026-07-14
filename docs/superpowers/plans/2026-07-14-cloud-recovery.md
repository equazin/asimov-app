# Cloud Recovery and New-PC Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cloud synchronization recover from expired sessions, expose real failures, transfer existing desktop data safely to a new PC, and restore non-secret integration settings without weakening ARCA or WhatsApp credential security.

**Architecture:** Keep SQLite as the offline working database and PostgreSQL as the tenant exchange point. All sync HTTP calls go through one refresh-aware authenticated transport; queued writes remain durable, are compacted and uploaded in bounded batches, and the pull cursor advances only after every applicable remote change succeeds. Initial pairing is directional: an empty installation downloads, while an installation with business data explicitly backfills its supported entities.

**Tech Stack:** Electron 33, TypeScript 5.7, better-sqlite3, NestJS/Prisma API, Vitest.

## Global Constraints

- Preserve offline-first writes: network and sync failures must never roll back a local business transaction.
- Never synchronize ARCA certificates/private keys or the WhatsApp bearer token through the general cloud configuration channel.
- Keep compatibility with existing `sync_queue`, `sync_state`, and `/api/v1/sync/*` contracts.
- Process large AIR catalogs in bounded batches and coalesce superseded pending rows.
- Do not include unrelated `graphify-out` changes in commits or releases.

---

### Task 1: Refresh-aware cloud transport

**Files:**
- Modify: `src/api-client.ts`
- Modify: `src/sync.ts`
- Test: `src/api-client.test.ts`

**Interfaces:**
- Produces: `apiAuthorizedFetch(path: string, init?: RequestInit): Promise<Response>` and `CloudSessionExpiredError`.
- Consumes: existing Electron store refresh token and `/auth/refresh` response.

- [ ] Add tests proving a 401 is retried once after refresh and failed refresh clears the session.
- [ ] Export a single authenticated fetch helper from `api-client.ts`.
- [ ] Route sync push and pull through that helper instead of reading a possibly expired token directly.
- [ ] Run `npm test -- --run` and confirm the new tests pass.

### Task 2: Durable recovery, compaction, and bounded upload

**Files:**
- Modify: `src/sync.ts`
- Modify: `src/ipc-cloud.ts`
- Test: `src/sync-queue.test.ts`

**Interfaces:**
- Produces: `recoverParkedChanges()`, `compactPendingChanges()`, and batch pushes capped at 250 changes.
- Consumes: `apiAuthorizedFetch` from Task 1.

- [ ] Add queue tests for duplicate AIR rows, parked 401 rows, and 250-row batching.
- [ ] Keep authentication failures pending without exhausting retry attempts.
- [ ] On successful cloud login, reactivate parked rows, compact superseded rows, and run sync immediately.
- [ ] Surface recovery counts and the latest sync error through `getSyncStatus()`.
- [ ] Run the focused queue tests and full desktop test suite.

### Task 3: Lossless pull cursor

**Files:**
- Modify: `src/sync.ts`
- Test: `src/sync-pull.test.ts`

**Interfaces:**
- Produces: pull behavior that advances `last_sync` only when all received changes are applied.
- Consumes: existing `applyRemoteChange` entity handlers.

- [ ] Add a test where a document snapshot fails because a dependency is missing.
- [ ] Record the failed entity/id and retain the previous cursor.
- [ ] Return applied and failed counts in sync status/results.
- [ ] Verify a later pull can apply the previously failed snapshot.

### Task 4: Initial desktop backfill

**Files:**
- Create: `src/sync-bootstrap.ts`
- Modify: `src/ipc-cloud.ts`
- Modify: `src/preload.ts`
- Modify: `src/shell.html`
- Test: `src/sync-bootstrap.test.ts`

**Interfaces:**
- Produces: `inspectBootstrapState()` and `enqueueLocalBootstrap()` for clients, suppliers, products, supported document snapshots, kit sets, AIR catalog, exchange rates, and document links.
- Consumes: `enqueueChange`, `buildDocEnvelope`, and existing SQLite tables.

- [ ] Test that an empty new PC performs pull-only initialization.
- [ ] Test that local rows are queued exactly once using the latest state.
- [ ] Add a visible cloud recovery dialog showing tenant, pending, parked, last error, and actions to download or combine/upload local data.
- [ ] Make the sync badge display parked/error/auth-required states instead of “Sincronizado”.
- [ ] Verify bootstrap against a temporary SQLite database.

### Task 5: Integration configuration boundaries

**Files:**
- Modify: `src/sync.ts`
- Modify: `src/air.ts`
- Modify: `src/whatsapp.ts`
- Modify: `src/afip-service.ts`
- Test: `src/integration-config-sync.test.ts`

**Interfaces:**
- Produces: provider-specific config application for AIR and WhatsApp with secret fields omitted.
- Consumes: cloud `integration_config` payloads.

- [ ] Remove AIR passwords from cloud payloads and preserve an already configured local password on pull.
- [ ] Apply WhatsApp URL, phone, enabled state, and poll interval while preserving the local token.
- [ ] Expose “credential required on this PC” diagnostics for AIR, WhatsApp, and ARCA.
- [ ] Verify no secret key is serialized into a sync payload.

### Task 6: Verification, review, and release

**Files:**
- Modify: `package.json`
- Modify: release metadata generated by the existing builder.

**Interfaces:**
- Produces: a tested desktop release with auto-update artifacts.

- [ ] Run TypeScript build, full desktop tests, API tests, and smoke tests.
- [ ] Review the diff for security, data-loss, concurrency, and compatibility regressions.
- [ ] Bump the patch version, commit only intended files, and push `main`.
- [ ] Publish the GitHub release with auto-update metadata and verify the release assets are reachable.

