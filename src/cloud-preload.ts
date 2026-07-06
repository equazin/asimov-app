/**
 * Preload bridge for cloud/sync APIs.
 * Exposes `window.cloud` and `window.sync` to the renderer process.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('cloud', {
  status: () => ipcRenderer.invoke('cloud:status'),
  login: (email: string, password: string) =>
    ipcRenderer.invoke('cloud:login', { email, password }),
  logout: () => ipcRenderer.invoke('cloud:logout'),
  test: () => ipcRenderer.invoke('cloud:test'),
  setUrl: (url: string) => ipcRenderer.invoke('cloud:set-url', url),
});

contextBridge.exposeInMainWorld('sync', {
  status: () => ipcRenderer.invoke('sync:status'),
  run: () => ipcRenderer.invoke('sync:run'),
  startAuto: () => ipcRenderer.invoke('sync:start-auto'),
  stopAuto: () => ipcRenderer.invoke('sync:stop-auto'),
  retryParked: () => ipcRenderer.invoke('sync:retry-parked'),
});
