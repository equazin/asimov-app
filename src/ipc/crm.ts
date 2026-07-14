/**
 * Handlers IPC del módulo CRM.
 *
 * Oportunidades, actividades, tareas y pipeline — todo vinculado a clients.
 */
import { ipcMain } from "electron";
import { safeStr, type IpcDeps } from "./shared";
import {
  listPipelineStages,
  savePipelineStage,
  deletePipelineStage,
  listOpportunities,
  getOpportunity,
  saveOpportunity,
  deleteOpportunity,
  getOpportunityStageHistory,
  listActivities,
  listRecentActivities,
  saveActivity,
  deleteActivity,
  listTasks,
  listClientTasks,
  getTask,
  saveTask,
  completeTask,
  deleteTask,
  getClientCrmSummary,
  getPipelineSummary,
} from "../crm";

export function registerCrmIpc(_deps: IpcDeps): void {
  // ── Pipeline Stages ────────────────────────────────────────────────────
  ipcMain.handle("crm:pipeline:list", () => {
    try { return { ok: true, data: listPipelineStages() }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:pipeline:save", (_event, row: unknown) => {
    try { return { ok: true, data: savePipelineStage(row as Record<string, unknown>) }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:pipeline:delete", (_event, id: unknown) => {
    try { deletePipelineStage(safeStr(id)); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  // ── Opportunities ──────────────────────────────────────────────────────
  ipcMain.handle("crm:opportunities:list", (_event, search: unknown, status: unknown) => {
    try { return { ok: true, data: listOpportunities(safeStr(search), safeStr(status) || "open") }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:opportunities:get", (_event, id: unknown) => {
    try { return { ok: true, data: getOpportunity(safeStr(id)) }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:opportunities:save", (_event, row: unknown) => {
    try { return { ok: true, data: saveOpportunity(row as Record<string, unknown>) }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:opportunities:delete", (_event, id: unknown) => {
    try { deleteOpportunity(safeStr(id)); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:opportunities:history", (_event, id: unknown) => {
    try { return { ok: true, data: getOpportunityStageHistory(safeStr(id)) }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  // ── Activities ─────────────────────────────────────────────────────────
  ipcMain.handle("crm:activities:list", (_event, clientId: unknown) => {
    try { return { ok: true, data: listActivities(safeStr(clientId)) }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:activities:recent", (_event, limit: unknown) => {
    try { return { ok: true, data: listRecentActivities(Number(limit) || 50) }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:activities:save", (_event, row: unknown) => {
    try { return { ok: true, data: saveActivity(row as Record<string, unknown>) }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:activities:delete", (_event, id: unknown) => {
    try { deleteActivity(safeStr(id)); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  // ── Tasks ──────────────────────────────────────────────────────────────
  ipcMain.handle("crm:tasks:list", (_event, status: unknown, assignedTo: unknown) => {
    try { return { ok: true, data: listTasks(safeStr(status) || "pending", safeStr(assignedTo) || undefined) }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:tasks:client", (_event, clientId: unknown) => {
    try { return { ok: true, data: listClientTasks(safeStr(clientId)) }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:tasks:get", (_event, id: unknown) => {
    try { return { ok: true, data: getTask(safeStr(id)) }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:tasks:save", (_event, row: unknown) => {
    try { return { ok: true, data: saveTask(row as Record<string, unknown>) }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:tasks:complete", (_event, id: unknown) => {
    try { completeTask(safeStr(id)); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:tasks:delete", (_event, id: unknown) => {
    try { deleteTask(safeStr(id)); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  // ── Summary / Dashboard ────────────────────────────────────────────────
  ipcMain.handle("crm:client-summary", (_event, clientId: unknown) => {
    try { return { ok: true, data: getClientCrmSummary(safeStr(clientId)) }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  ipcMain.handle("crm:pipeline-summary", () => {
    try { return { ok: true, data: getPipelineSummary() }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });
}
