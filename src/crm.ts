/**
 * Módulo CRM de Asimov ERP.
 *
 * Unificado con la tabla `clients`: las oportunidades, actividades y tareas
 * se vinculan directamente a clientes del ERP. Incluye pipeline de ventas
 * con etapas configurables, historial de cambios y forecasting.
 */
import { dbAll, dbGet, dbRun } from "./db";
import { randomUUID } from "node:crypto";
import { enqueueChange } from "./sync";
import { isCloudConnected } from "./api-client";

function str(v: unknown, max = 500): string {
  return String(v ?? "").slice(0, max).trim();
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function enqueueCrmSync(entity: string, id: string, action: "create" | "update" | "delete", payload?: Record<string, unknown>): void {
  if (!isCloudConnected() || !id) return;
  try { enqueueChange(entity, id, action, payload); } catch {}
}

// ─── Pipeline Stages ────────────────────────────────────────────────────────

export interface PipelineStage {
  id: string;
  name: string;
  sort_order: number;
  probability: number;
  color: string;
  is_won: number;
  is_lost: number;
  active: number;
}

export function listPipelineStages(): PipelineStage[] {
  return dbAll<PipelineStage>(
    "SELECT * FROM crm_pipeline_stages WHERE active = 1 ORDER BY sort_order"
  );
}

export function savePipelineStage(row: Record<string, unknown>): { id: string } {
  const id = str(row.id) || randomUUID();
  dbRun(
    `INSERT OR REPLACE INTO crm_pipeline_stages (id, name, sort_order, probability, color, is_won, is_lost, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, str(row.name), num(row.sort_order), num(row.probability), str(row.color) || "#6b7280", row.is_won ? 1 : 0, row.is_lost ? 1 : 0, row.active ?? 1]
  );
  return { id };
}

export function deletePipelineStage(id: string): void {
  dbRun("UPDATE crm_pipeline_stages SET active = 0 WHERE id = ?", [str(id)]);
}

// ─── Opportunities ──────────────────────────────────────────────────────────

export interface Opportunity {
  id: string;
  client_id: string | null;
  client_name: string | null;
  title: string;
  amount: number;
  stage: string;
  stage_id: string | null;
  probability: number;
  expected_close: string | null;
  assigned_to: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function listOpportunities(search: string, status = "open"): Opportunity[] {
  const q = `%${str(search)}%`;
  return dbAll<Opportunity>(
    `SELECT o.*, c.business_name as client_name
     FROM opportunities o
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.status = ? AND (o.title LIKE ? OR c.business_name LIKE ?)
     ORDER BY o.updated_at DESC LIMIT 500`,
    [status, q, q]
  );
}

export function getOpportunity(id: string): Opportunity | undefined {
  return dbGet<Opportunity>(
    `SELECT o.*, c.business_name as client_name
     FROM opportunities o
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.id = ?`,
    [str(id)]
  );
}

export function saveOpportunity(row: Record<string, unknown>): { id: string } {
  const id = str(row.id) || randomUUID();
  const stageId = str(row.stage_id) || null;
  const stage = str(row.stage) || "prospecto";

  // Si cambió la etapa, registrar en historial
  const existing = dbGet<{ stage: string; status: string }>(
    "SELECT stage, status FROM opportunities WHERE id = ?", [id]
  );

  const now = new Date().toISOString();
  const isWon = stageId ? isStageWon(stageId) : false;
  const isLost = stageId ? isStageLost(stageId) : false;

  dbRun(
    `INSERT INTO opportunities (id, client_id, title, amount, stage, stage_id, probability, expected_close, assigned_to, source, status, notes, won_at, lost_at, lost_reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       client_id=excluded.client_id, title=excluded.title, amount=excluded.amount,
       stage=excluded.stage, stage_id=excluded.stage_id, probability=excluded.probability,
       expected_close=excluded.expected_close, assigned_to=excluded.assigned_to,
       source=excluded.source, status=excluded.status, notes=excluded.notes,
       won_at=excluded.won_at, lost_at=excluded.lost_at, lost_reason=excluded.lost_reason,
       updated_at=datetime('now')`,
    [
      id, str(row.client_id) || null, str(row.title), num(row.amount),
      stage, stageId, num(row.probability) || getStageProbability(stageId),
      str(row.expected_close) || null, str(row.assigned_to) || null,
      str(row.source) || null,
      isWon ? "won" : isLost ? "lost" : str(row.status) || "open",
      str(row.notes, 5000) || null,
      isWon ? now : null,
      isLost ? now : null,
      isLost ? str(row.lost_reason) || null : null,
    ]
  );

  // Registrar cambio de etapa en historial
  if (existing && existing.stage !== stage) {
    dbRun(
      `INSERT INTO crm_deal_stage_history (id, opportunity_id, from_stage, to_stage, changed_by, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), id, existing.stage, stage, str(row.changed_by) || null, str(row.stage_change_note) || null]
    );
  }

  enqueueCrmSync("crm_opportunity", id, existing ? "update" : "create", row);
  return { id };
}

export function deleteOpportunity(id: string): void {
  dbRun("DELETE FROM opportunities WHERE id = ?", [str(id)]);
}

export function getOpportunityStageHistory(opportunityId: string): Array<{
  id: string;
  from_stage: string | null;
  to_stage: string;
  changed_by: string | null;
  changed_at: string;
  notes: string | null;
}> {
  return dbAll(
    "SELECT * FROM crm_deal_stage_history WHERE opportunity_id = ? ORDER BY changed_at DESC",
    [str(opportunityId)]
  );
}

function isStageWon(stageId: string | null): boolean {
  if (!stageId) return false;
  const row = dbGet<{ is_won: number }>("SELECT is_won FROM crm_pipeline_stages WHERE id = ?", [stageId]);
  return row?.is_won === 1;
}

function isStageLost(stageId: string | null): boolean {
  if (!stageId) return false;
  const row = dbGet<{ is_lost: number }>("SELECT is_lost FROM crm_pipeline_stages WHERE id = ?", [stageId]);
  return row?.is_lost === 1;
}

function getStageProbability(stageId: string | null): number {
  if (!stageId) return 0;
  const row = dbGet<{ probability: number }>("SELECT probability FROM crm_pipeline_stages WHERE id = ?", [stageId]);
  return row?.probability ?? 0;
}

// ─── Activities ─────────────────────────────────────────────────────────────

export type ActivityType = "note" | "call" | "email" | "meeting" | "task" | "other";

export interface Activity {
  id: string;
  client_id: string;
  client_name: string | null;
  type: ActivityType;
  subject: string | null;
  body: string | null;
  due_date: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  opportunity_id: string | null;
  created_at: string;
  updated_at: string;
}

export function listActivities(clientId: string): Activity[] {
  return dbAll<Activity>(
    `SELECT a.*, c.business_name as client_name
     FROM crm_activities a
     LEFT JOIN clients c ON c.id = a.client_id
     WHERE a.client_id = ?
     ORDER BY a.created_at DESC LIMIT 200`,
    [str(clientId)]
  );
}

export function listRecentActivities(limit = 50): Activity[] {
  return dbAll<Activity>(
    `SELECT a.*, c.business_name as client_name
     FROM crm_activities a
     LEFT JOIN clients c ON c.id = a.client_id
     ORDER BY a.created_at DESC LIMIT ?`,
    [limit]
  );
}

export function saveActivity(row: Record<string, unknown>): { id: string } {
  const id = str(row.id) || randomUUID();
  dbRun(
    `INSERT OR REPLACE INTO crm_activities (id, client_id, type, subject, body, due_date, completed_at, assigned_to, opportunity_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
       COALESCE((SELECT created_at FROM crm_activities WHERE id=?), datetime('now')),
       datetime('now'))`,
    [
      id, str(row.client_id), str(row.type) || "note",
      str(row.subject), str(row.body, 10000) || null,
      str(row.due_date) || null, str(row.completed_at) || null,
      str(row.assigned_to) || null, str(row.opportunity_id) || null,
      id
    ]
  );

  // Actualizar last_contact_at del cliente si es una actividad completada
  if (row.completed_at || ["call", "email", "meeting"].includes(str(row.type))) {
    dbRun(
      "UPDATE clients SET last_contact_at = datetime('now') WHERE id = ?",
      [str(row.client_id)]
    );
  }

  enqueueCrmSync("crm_activity", id, "create", row);
  return { id };
}

export function deleteActivity(id: string): void {
  dbRun("DELETE FROM crm_activities WHERE id = ?", [str(id)]);
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  client_id: string | null;
  client_name: string | null;
  opportunity_id: string | null;
  title: string;
  description: string | null;
  due_date: string;
  due_time: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  completed_at: string | null;
  reminder_at: string | null;
  created_at: string;
  updated_at: string;
}

export function listTasks(status = "pending", assignedTo?: string): Task[] {
  const params: unknown[] = [status];
  let where = "t.status = ?";
  if (assignedTo) {
    where += " AND t.assigned_to = ?";
    params.push(assignedTo);
  }
  return dbAll<Task>(
    `SELECT t.*, c.business_name as client_name
     FROM crm_tasks t
     LEFT JOIN clients c ON c.id = t.client_id
     WHERE ${where}
     ORDER BY t.due_date ASC, t.due_time ASC LIMIT 200`,
    params
  );
}

export function listClientTasks(clientId: string): Task[] {
  return dbAll<Task>(
    `SELECT t.*, c.business_name as client_name
     FROM crm_tasks t
     LEFT JOIN clients c ON c.id = t.client_id
     WHERE t.client_id = ?
     ORDER BY t.due_date ASC, t.due_time ASC LIMIT 100`,
    [str(clientId)]
  );
}

export function getTask(id: string): Task | undefined {
  return dbGet<Task>(
    `SELECT t.*, c.business_name as client_name
     FROM crm_tasks t
     LEFT JOIN clients c ON c.id = t.client_id
     WHERE t.id = ?`,
    [str(id)]
  );
}

export function saveTask(row: Record<string, unknown>): { id: string } {
  const id = str(row.id) || randomUUID();
  const isCompleted = str(row.status) === "completed";
  dbRun(
    `INSERT OR REPLACE INTO crm_tasks (id, client_id, opportunity_id, title, description, due_date, due_time, priority, status, assigned_to, completed_at, reminder_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
       COALESCE((SELECT created_at FROM crm_tasks WHERE id=?), datetime('now')),
       datetime('now'))`,
    [
      id, str(row.client_id) || null, str(row.opportunity_id) || null,
      str(row.title), str(row.description, 5000) || null,
      str(row.due_date), str(row.due_time) || null,
      str(row.priority) || "normal", str(row.status) || "pending",
      str(row.assigned_to) || null,
      isCompleted ? new Date().toISOString() : null,
      str(row.reminder_at) || null,
      id
    ]
  );
  enqueueCrmSync("crm_task", id, "create", row);
  return { id };
}

export function completeTask(id: string): void {
  dbRun(
    "UPDATE crm_tasks SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    [str(id)]
  );
}

export function deleteTask(id: string): void {
  dbRun("DELETE FROM crm_tasks WHERE id = ?", [str(id)]);
}

// ─── Client CRM Summary ─────────────────────────────────────────────────────

export interface ClientCrmSummary {
  clientId: string;
  opportunities: { open: number; won: number; lost: number; totalValue: number; weightedValue: number };
  activities: { total: number; lastContact: string | null };
  tasks: { pending: number; overdue: number };
}

export function getClientCrmSummary(clientId: string): ClientCrmSummary {
  const id = str(clientId);

  const opps = dbGet<{
    open: number; won: number; lost: number; totalValue: number; weightedValue: number;
  }>(`
    SELECT
      COUNT(CASE WHEN status = 'open' THEN 1 END) as open,
      COUNT(CASE WHEN status = 'won' THEN 1 END) as won,
      COUNT(CASE WHEN status = 'lost' THEN 1 END) as lost,
      COALESCE(SUM(CASE WHEN status = 'open' THEN amount ELSE 0 END), 0) as totalValue,
      COALESCE(SUM(CASE WHEN status = 'open' THEN amount * probability / 100 ELSE 0 END), 0) as weightedValue
    FROM opportunities WHERE client_id = ?
  `, [id]) ?? { open: 0, won: 0, lost: 0, totalValue: 0, weightedValue: 0 };

  const acts = dbGet<{ total: number; lastContact: string | null }>(`
    SELECT COUNT(*) as total, MAX(created_at) as lastContact
    FROM crm_activities WHERE client_id = ?
  `, [id]) ?? { total: 0, lastContact: null };

  const tasks = dbGet<{ pending: number; overdue: number }>(`
    SELECT
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
      COUNT(CASE WHEN status = 'pending' AND due_date < date('now') THEN 1 END) as overdue
    FROM crm_tasks WHERE client_id = ?
  `, [id]) ?? { pending: 0, overdue: 0 };

  return {
    clientId: id,
    opportunities: { open: opps.open, won: opps.won, lost: opps.lost, totalValue: opps.totalValue, weightedValue: opps.weightedValue },
    activities: { total: acts.total, lastContact: acts.lastContact },
    tasks: { pending: tasks.pending, overdue: tasks.overdue },
  };
}

// ─── Pipeline Summary (for dashboard/kanban) ────────────────────────────────

export interface PipelineSummary {
  stages: Array<{
    id: string;
    name: string;
    color: string;
    count: number;
    totalAmount: number;
    weightedAmount: number;
  }>;
  totalOpen: number;
  totalValue: number;
  totalWeighted: number;
}

export function getPipelineSummary(): PipelineSummary {
  const stages = dbAll<{
    id: string; name: string; color: string; count: number; totalAmount: number; weightedAmount: number;
  }>(`
    SELECT ps.id, ps.name, ps.color,
      COUNT(o.id) as count,
      COALESCE(SUM(o.amount), 0) as totalAmount,
      COALESCE(SUM(o.amount * o.probability / 100), 0) as weightedAmount
    FROM crm_pipeline_stages ps
    LEFT JOIN opportunities o ON o.stage_id = ps.id AND o.status = 'open'
    WHERE ps.active = 1 AND ps.is_won = 0 AND ps.is_lost = 0
    GROUP BY ps.id
    ORDER BY ps.sort_order
  `);

  const totalOpen = stages.reduce((s, st) => s + st.count, 0);
  const totalValue = stages.reduce((s, st) => s + st.totalAmount, 0);
  const totalWeighted = stages.reduce((s, st) => s + st.weightedAmount, 0);

  return { stages, totalOpen, totalValue, totalWeighted };
}
