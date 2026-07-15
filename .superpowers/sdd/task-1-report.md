# Task 1 Report: UI de conexión a la nube en el shell

## Status
DONE

## What was implemented
- Added cloud connection status UI to the status bar (`#cloud-status-bar`) near the update/version area.
- Added the cloud login modal (`#cloud-login-modal`) at the end of `<body>`.
- Added minimal `.modal` / `.modal-content` CSS since the project did not define those classes.
- Implemented the JavaScript handlers (`refreshCloudStatus`, `openCloudLogin`, `closeCloudLogin`, `submitCloudLogin`, `doCloudLogout`) and wired event listeners as specified in the task brief.
- Exposed `openCloudLogin` and `closeCloudLogin` on `window` so the inline `onclick` in the modal works.
- Added defensive `if (!window.cloud) return;` guards so the UI does not throw if the preload bridge is unavailable.

## Verification
- `npm run build` succeeded (TypeScript compiled and assets copied to `dist/`).
- `npm run dev` was attempted but the Electron GUI could not be exercised in this headless environment (no display). The build is clean.

## Commits
- `77fe77e` feat(cloud): UI de login y estado de conexión en el shell

## Concerns
- The task brief states that `window.cloud` and `window.sync` are already exposed via `src/cloud-preload.ts`. However, `src/main.ts` only loads `preload.js` for the main shell window; `cloud-preload.js` is compiled by `tsc` but is not referenced as a preload script. As a result, `window.cloud` will be `undefined` at runtime unless `main.ts` (or `preload.ts`) is updated to expose it. The shell code guards against this, but the login/logout functionality will not work until the preload wiring is completed.

## Report file
`F:\Github\Asimov ERP\.superpowers\sdd\task-1-report.md`

---

# Fix: Use window.asimov.cloudSync for cloud UI in shell

## Status
DONE

## Problem
The original Task 1 implementation in `src/shell.html` used `window.cloud` and `window.sync`, but those APIs are not exposed in the main shell window. The main shell preload is `src/preload.js` (`src/preload.ts` source), which exposes cloud/sync APIs under `window.asimov.cloudSync`. As a result, the cloud status indicator and login/logout modal did not work.

## Changes made
1. **src/preload.ts** — Added `login` and `logout` methods to the `cloudSync` object so the shell UI can call them through the existing `window.asimov` bridge:
   - `login: (email: string, password: string) => ipcRenderer.invoke('cloud:login', { email, password })`
   - `logout: () => ipcRenderer.invoke('cloud:logout')`
   - The corresponding IPC handlers (`cloud:login` and `cloud:logout`) were already registered in `src/ipc-cloud.ts`.

2. **src/shell.html** — Updated the cloud connection UI to use `window.asimov.cloudSync`:
   - `refreshCloudStatus()` now awaits `waitForAsimov()` and calls `api.cloudSync.cloudStatus()` instead of `window.cloud.status()`.
   - `submitCloudLogin()` now calls `api.cloudSync.login(email, password)` instead of `window.cloud.login(email, password)`.
   - `doCloudLogout()` now calls `api.cloudSync.logout()` instead of `window.cloud.logout()`.
   - Removed the `if (!window.cloud) return;` guards because the code now retrieves the API through the proper bridge.
   - The sync badge continues to use `api.cloudSync.status()` as before (Task 2 will use this).

## Verification
- `npm run build` succeeded with no TypeScript errors and assets copied to `dist/`.
- Confirmed no remaining `window.cloud` references in `src/shell.html`.

## Commits
- `37c79a5` fix(cloud): use window.asimov.cloudSync for cloud UI in shell
