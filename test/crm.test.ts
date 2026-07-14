import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { initTestDb } from "./helpers";
import { getDb, dbGet } from "../src/db";
import {
  listPipelineStages,
  savePipelineStage,
  listOpportunities,
  saveOpportunity,
  getOpportunity,
  deleteOpportunity,
  getOpportunityStageHistory,
  listActivities,
  saveActivity,
  deleteActivity,
  listTasks,
  saveTask,
  completeTask,
  deleteTask,
  listClientTasks,
  getClientCrmSummary,
  getPipelineSummary,
  listRecentActivities,
  listCrmAccounts,
  getCrmAccountWorkspace,
} from "../src/crm";

beforeAll(() => initTestDb());

function seedClient(id = "cli-1", name = "Cliente Test"): string {
  getDb().prepare(
    "INSERT OR REPLACE INTO clients (id, business_name, active) VALUES (?, ?, 1)"
  ).run(id, name);
  return id;
}

function resetCrm(): void {
  getDb().exec(`
    DELETE FROM crm_deal_stage_history;
    DELETE FROM crm_activities;
    DELETE FROM crm_tasks;
    DELETE FROM opportunities;
  `);
}

beforeEach(() => resetCrm());

describe("Pipeline Stages", () => {
  it("seed default stages on init", () => {
    const stages = listPipelineStages();
    expect(stages.length).toBeGreaterThanOrEqual(6);
    expect(stages[0].name).toBe("Lead");
    expect(stages.find(s => s.is_won === 1)?.name).toBe("Ganado");
    expect(stages.find(s => s.is_lost === 1)?.name).toBe("Perdido");
  });

  it("save custom stage", () => {
    const { id } = savePipelineStage({ name: "Demo", sort_order: 10, probability: 60, color: "#ff0000" });
    expect(id).toBeTruthy();
    const stages = listPipelineStages();
    expect(stages.find(s => s.name === "Demo")).toBeTruthy();
  });
});

describe("Opportunities", () => {
  it("create and list", () => {
    const clientId = seedClient();
    const { id } = saveOpportunity({ client_id: clientId, title: "Venta servidor", amount: 50000, stage: "prospecto" });
    expect(id).toBeTruthy();

    const list = listOpportunities("");
    expect(list.length).toBe(1);
    expect(list[0].title).toBe("Venta servidor");
    expect(list[0].client_name).toBe("Cliente Test");
  });

  it("get by id", () => {
    const clientId = seedClient();
    const { id } = saveOpportunity({ client_id: clientId, title: "Deal 1", amount: 10000 });
    const opp = getOpportunity(id);
    expect(opp?.title).toBe("Deal 1");
    expect(opp?.amount).toBe(10000);
  });

  it("update opportunity", () => {
    const clientId = seedClient();
    const { id } = saveOpportunity({ client_id: clientId, title: "Deal 1", amount: 10000, stage: "lead" });
    saveOpportunity({ id, client_id: clientId, title: "Deal 1 updated", amount: 15000, stage: "qualified" });
    const opp = getOpportunity(id);
    expect(opp?.title).toBe("Deal 1 updated");
    expect(opp?.amount).toBe(15000);
  });

  it("delete opportunity", () => {
    const clientId = seedClient();
    const { id } = saveOpportunity({ client_id: clientId, title: "To delete", amount: 1000 });
    deleteOpportunity(id);
    expect(getOpportunity(id)).toBeUndefined();
  });

  it("track stage history on change", () => {
    const clientId = seedClient();
    const { id } = saveOpportunity({ client_id: clientId, title: "Tracked", amount: 5000, stage: "lead" });
    saveOpportunity({ id, client_id: clientId, title: "Tracked", amount: 5000, stage: "qualified" });
    saveOpportunity({ id, client_id: clientId, title: "Tracked", amount: 5000, stage: "proposal" });

    const history = getOpportunityStageHistory(id);
    expect(history.length).toBe(2);
    const transitions = history.map(h => `${h.from_stage}→${h.to_stage}`).sort();
    expect(transitions).toContain("lead→qualified");
    expect(transitions).toContain("qualified→proposal");
  });

  it("mark as won via stage_id", () => {
    const clientId = seedClient();
    const { id } = saveOpportunity({ client_id: clientId, title: "Winner", amount: 20000, stage: "negotiation" });
    saveOpportunity({ id, client_id: clientId, title: "Winner", amount: 20000, stage: "won", stage_id: "stage-won" });
    const opp = getOpportunity(id);
    expect(opp?.status).toBe("won");
    expect(opp?.won_at).toBeTruthy();
  });

  it("mark as lost with reason", () => {
    const clientId = seedClient();
    const { id } = saveOpportunity({ client_id: clientId, title: "Loser", amount: 8000, stage: "proposal" });
    saveOpportunity({ id, client_id: clientId, title: "Loser", amount: 8000, stage: "lost", stage_id: "stage-lost", lost_reason: "Precio alto" });
    const opp = getOpportunity(id);
    expect(opp?.status).toBe("lost");
    expect(opp?.lost_reason).toBe("Precio alto");
  });

  it("filter by status", () => {
    const clientId = seedClient();
    saveOpportunity({ client_id: clientId, title: "Open deal", amount: 1000 });
    const { id: wonId } = saveOpportunity({ client_id: clientId, title: "Won deal", amount: 2000, stage: "won", stage_id: "stage-won" });

    const open = listOpportunities("", "open");
    expect(open.length).toBe(1);
    expect(open[0].title).toBe("Open deal");

    const won = listOpportunities("", "won");
    expect(won.length).toBe(1);
    expect(won[0].title).toBe("Won deal");
  });
});

describe("Activities", () => {
  it("create and list by client", () => {
    const clientId = seedClient();
    const { id } = saveActivity({ client_id: clientId, type: "call", subject: "Llamada inicial", body: "Se contactó al cliente" });
    expect(id).toBeTruthy();

    const list = listActivities(clientId);
    expect(list.length).toBe(1);
    expect(list[0].type).toBe("call");
    expect(list[0].client_name).toBe("Cliente Test");
  });

  it("list recent across clients", () => {
    seedClient("cli-1", "A");
    seedClient("cli-2", "B");
    saveActivity({ client_id: "cli-1", type: "note", subject: "Nota A" });
    saveActivity({ client_id: "cli-2", type: "email", subject: "Email B" });

    const recent = listRecentActivities(10);
    expect(recent.length).toBe(2);
  });

  it("delete activity", () => {
    const clientId = seedClient();
    const { id } = saveActivity({ client_id: clientId, type: "note", subject: "To delete" });
    deleteActivity(id);
    expect(listActivities(clientId).length).toBe(0);
  });

  it("update last_contact_at on call/email/meeting", () => {
    const clientId = seedClient();
    saveActivity({ client_id: clientId, type: "call", subject: "Llamada" });
    const client = dbGet<{ last_contact_at: string | null }>("SELECT last_contact_at FROM clients WHERE id = ?", [clientId]);
    expect(client?.last_contact_at).toBeTruthy();
  });
});

describe("Tasks", () => {
  it("create and list pending", () => {
    const clientId = seedClient();
    const { id } = saveTask({ client_id: clientId, title: "Seguir propuesta", due_date: "2026-08-01" });
    expect(id).toBeTruthy();

    const list = listTasks("pending");
    expect(list.length).toBe(1);
    expect(list[0].title).toBe("Seguir propuesta");
  });

  it("list client tasks", () => {
    seedClient("cli-1");
    seedClient("cli-2");
    saveTask({ client_id: "cli-1", title: "Task A", due_date: "2026-08-01" });
    saveTask({ client_id: "cli-2", title: "Task B", due_date: "2026-08-02" });

    const tasks = listClientTasks("cli-1");
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe("Task A");
  });

  it("complete task", () => {
    const clientId = seedClient();
    const { id } = saveTask({ client_id: clientId, title: "To complete", due_date: "2026-08-01" });
    completeTask(id);

    const pending = listTasks("pending");
    expect(pending.length).toBe(0);

    const completed = listTasks("completed");
    expect(completed.length).toBe(1);
    expect(completed[0].completed_at).toBeTruthy();
  });

  it("delete task", () => {
    const clientId = seedClient();
    const { id } = saveTask({ client_id: clientId, title: "To delete", due_date: "2026-08-01" });
    deleteTask(id);
    expect(listTasks("pending").length).toBe(0);
  });
});

describe("Client CRM Summary", () => {
  it("aggregate opportunities, activities, tasks", () => {
    const clientId = seedClient();
    saveOpportunity({ client_id: clientId, title: "Deal 1", amount: 10000, stage: "lead", probability: 10 });
    saveOpportunity({ client_id: clientId, title: "Deal 2", amount: 20000, stage: "qualified", probability: 25 });
    saveActivity({ client_id: clientId, type: "call", subject: "Llamada" });
    saveTask({ client_id: clientId, title: "Task 1", due_date: "2026-08-01" });

    const summary = getClientCrmSummary(clientId);
    expect(summary.opportunities.open).toBe(2);
    expect(summary.opportunities.totalValue).toBe(30000);
    expect(summary.activities.total).toBe(1);
    expect(summary.tasks.pending).toBe(1);
  });

  it("return zeros for client with no CRM data", () => {
    const clientId = seedClient("cli-empty");
    const summary = getClientCrmSummary(clientId);
    expect(summary.opportunities.open).toBe(0);
    expect(summary.activities.total).toBe(0);
    expect(summary.tasks.pending).toBe(0);
  });
});

describe("CRM Accounts", () => {
  it("lists accounts with pipeline and pending action totals", () => {
    const clientId = seedClient("cli-crm-account", "Cuenta Operativa");
    saveOpportunity({ client_id: clientId, title: "Renovación", amount: 1000 });
    saveTask({ client_id: clientId, title: "Llamar", due_date: "2026-07-13" });

    const account = listCrmAccounts("Operativa", "all").find(row => row.id === clientId);

    expect(account).toBeTruthy();
    expect(account?.open_opportunities).toBe(1);
    expect(account?.pipeline_value).toBe(1000);
    expect(account?.pending_tasks).toBe(1);
    expect(account?.overdue_tasks).toBe(1);
  });

  it("filters accounts by account status", () => {
    const clientId = seedClient("cli-crm-prospect", "Cuenta Prospecto");
    getDb().prepare("UPDATE clients SET account_status = 'prospect' WHERE id = ?").run(clientId);

    expect(listCrmAccounts("Prospecto", "prospect").map(row => row.id)).toContain(clientId);
    expect(listCrmAccounts("Prospecto", "active").map(row => row.id)).not.toContain(clientId);
  });

  it("returns the complete account workspace", () => {
    const clientId = seedClient("cli-crm-detail", "Cuenta Detalle");
    saveOpportunity({ client_id: clientId, title: "Proyecto", amount: 2500 });
    saveActivity({ client_id: clientId, type: "call", subject: "Contacto" });
    saveTask({ client_id: clientId, title: "Seguimiento", due_date: "2026-08-01" });

    const detail = getCrmAccountWorkspace(clientId);

    expect(detail?.account.business_name).toBe("Cuenta Detalle");
    expect(detail?.opportunities).toHaveLength(1);
    expect(detail?.activities).toHaveLength(1);
    expect(detail?.tasks).toHaveLength(1);
    expect(detail?.summary.opportunities.totalValue).toBe(2500);
  });

  it("lists opportunities from every status for the workspace", () => {
    const clientId = seedClient("cli-crm-all", "Cuenta Todos");
    saveOpportunity({ client_id: clientId, title: "Abierta", amount: 1000 });
    saveOpportunity({ client_id: clientId, title: "Ganada", amount: 2000, stage: "won", stage_id: "stage-won" });

    const all = listOpportunities("", "all").filter(row => row.client_id === clientId);

    expect(all.map(row => row.status).sort()).toEqual(["open", "won"]);
  });

  it("rejects CRM records without their required account fields", () => {
    expect(() => saveOpportunity({ title: "Sin cuenta" })).toThrow("Seleccioná una cuenta");
    expect(() => saveActivity({ type: "call", subject: "Sin cuenta" })).toThrow("Seleccioná una cuenta");
    expect(() => saveTask({ client_id: "cli-crm-detail", title: "Sin fecha" })).toThrow("fecha de vencimiento");
  });

  it("rejects an opportunity association from another account", () => {
    const firstClient = seedClient("cli-crm-link-a", "Cuenta A");
    const secondClient = seedClient("cli-crm-link-b", "Cuenta B");
    const { id: opportunityId } = saveOpportunity({ client_id: firstClient, title: "Proyecto A", amount: 500 });

    expect(() => saveTask({
      client_id: secondClient,
      opportunity_id: opportunityId,
      title: "Seguimiento incorrecto",
      due_date: "2026-08-01",
    })).toThrow("no pertenece a la cuenta");
  });
});

describe("Pipeline Summary", () => {
  it("aggregate by stage", () => {
    const clientId = seedClient();
    saveOpportunity({ client_id: clientId, title: "Deal 1", amount: 10000, stage: "lead", stage_id: "stage-lead", probability: 10 });
    saveOpportunity({ client_id: clientId, title: "Deal 2", amount: 20000, stage: "qualified", stage_id: "stage-qualified", probability: 25 });

    const summary = getPipelineSummary();
    expect(summary.totalOpen).toBe(2);
    expect(summary.totalValue).toBe(30000);
    expect(summary.stages.length).toBeGreaterThanOrEqual(4);
  });
});
