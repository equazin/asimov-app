(function () {
  "use strict";

  const state = {
    api: null,
    tab: "summary",
    search: "",
    accountStatus: "all",
    opportunityStatus: "all",
    taskStatus: "pending",
    accounts: [],
    accountOptions: [],
    stages: [],
    opportunities: [],
    activities: [],
    tasks: [],
    pipeline: { stages: [], totalOpen: 0, totalValue: 0, totalWeighted: 0 },
    loading: false,
    error: "",
    searchTimer: null,
  };

  const TABS = [
    { id: "summary", label: "Resumen" },
    { id: "accounts", label: "Cuentas" },
    { id: "opportunities", label: "Oportunidades" },
    { id: "activities", label: "Actividades" },
    { id: "tasks", label: "Tareas" },
  ];

  const ACTIVITY_LABELS = {
    note: "Nota",
    call: "Llamada",
    email: "Correo",
    meeting: "Reunión",
    task: "Tarea",
    other: "Otra",
  };

  function root() {
    return document.getElementById("crm-workspace");
  }

  function canWrite() {
    return !window.A || typeof window.A.canWrite !== "function" || window.A.canWrite();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function unwrapResponse(response, fallback) {
    if (!response || response.ok !== true) {
      throw new Error((response && response.error) || fallback || "No se pudo completar la operación.");
    }
    return response.data;
  }

  async function waitForApi() {
    if (state.api) return state.api;
    const started = Date.now();
    while (!window.asimov) {
      if (Date.now() - started > 5000) throw new Error("No se pudo conectar la pantalla CRM con la aplicación.");
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    state.api = window.asimov;
    return state.api;
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(value, withTime) {
    if (!value) return "—";
    const raw = String(value);
    let date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [year, month, day] = raw.split("-").map(Number);
      date = new Date(year, month - 1, day, 12, 0, 0);
    } else {
      const normalized = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
      date = new Date(normalized);
    }
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleString("es-AR", withTime
      ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function todayIso() {
    const date = new Date();
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function plusDaysIso(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function isOverdue(task) {
    return task.status === "pending" && String(task.due_date || "") < todayIso();
  }

  function stageSlug(stage) {
    const known = {
      "stage-lead": "lead",
      "stage-qualified": "qualified",
      "stage-proposal": "proposal",
      "stage-negotiation": "negotiation",
      "stage-won": "won",
      "stage-lost": "lost",
    };
    return known[stage.id] || String(stage.name || "prospecto")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function stageForOpportunity(opportunity) {
    return state.stages.find(stage => stage.id === opportunity.stage_id)
      || state.stages.find(stage => stageSlug(stage) === String(opportunity.stage || "").toLowerCase())
      || state.stages.find(stage => !stage.is_won && !stage.is_lost)
      || state.stages[0];
  }

  function accountById(id) {
    return state.accountOptions.find(account => account.id === id)
      || state.accounts.find(account => account.id === id);
  }

  function opportunityById(id) {
    return state.opportunities.find(opportunity => opportunity.id === id);
  }

  function taskById(id) {
    return state.tasks.find(task => task.id === id);
  }

  function activityById(id) {
    return state.activities.find(activity => activity.id === id);
  }

  function writeActions() {
    if (!canWrite()) return "";
    return `
      <button type="button" class="crm-button" data-crm-action="new-account">Nueva cuenta</button>
      <button type="button" class="crm-button" data-crm-action="new-opportunity">Nueva oportunidad</button>
      <button type="button" class="crm-button" data-crm-action="new-activity">Registrar actividad</button>
      <button type="button" class="crm-button crm-button-primary" data-crm-action="new-task">Nueva tarea</button>`;
  }

  function renderShell() {
    const element = root();
    if (!element) return;
    element.innerHTML = `
      <div class="crm-topbar">
        <div class="crm-title-block">
          <h1>CRM comercial</h1>
          <p>Cuentas, oportunidades y próximos pasos en un solo lugar.</p>
        </div>
        <div class="crm-actions">${writeActions()}</div>
      </div>
      <nav class="crm-tabs" aria-label="Secciones del CRM">
        ${TABS.map(tab => `
          <button type="button" class="crm-tab${state.tab === tab.id ? " is-active" : ""}"
            data-crm-tab="${tab.id}" aria-current="${state.tab === tab.id ? "page" : "false"}">${tab.label}</button>`).join("")}
      </nav>
      ${renderToolbar()}
      <main class="crm-content">${renderContent()}</main>`;
    bindRootEvents(element);
    updateStatusCount();
  }

  function renderToolbar() {
    const statusFilter = state.tab === "accounts"
      ? `<select class="crm-select" data-crm-filter="account-status" aria-label="Filtrar estado de cuenta">
          ${option("all", "Todos los estados", state.accountStatus)}
          ${option("active", "Activas", state.accountStatus)}
          ${option("prospect", "Prospectos", state.accountStatus)}
          ${option("inactive", "Inactivas", state.accountStatus)}
        </select>`
      : state.tab === "opportunities"
        ? `<select class="crm-select" data-crm-filter="opportunity-status" aria-label="Filtrar oportunidades">
            ${option("all", "Todas", state.opportunityStatus)}
            ${option("open", "Abiertas", state.opportunityStatus)}
            ${option("won", "Ganadas", state.opportunityStatus)}
            ${option("lost", "Perdidas", state.opportunityStatus)}
          </select>`
        : state.tab === "tasks"
          ? `<select class="crm-select" data-crm-filter="task-status" aria-label="Filtrar tareas">
              ${option("pending", "Pendientes", state.taskStatus)}
              ${option("overdue", "Vencidas", state.taskStatus)}
              ${option("completed", "Completadas", state.taskStatus)}
              ${option("all", "Todas", state.taskStatus)}
            </select>`
          : "";
    return `
      <div class="crm-toolbar">
        <input class="crm-search" type="search" value="${escapeAttribute(state.search)}"
          placeholder="Buscar cuenta, oportunidad o responsable…" aria-label="Buscar en el CRM" data-crm-search />
        ${statusFilter}
        <button type="button" class="crm-button" data-crm-action="refresh">Actualizar</button>
      </div>`;
  }

  function option(value, label, selected) {
    return `<option value="${escapeAttribute(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function renderContent() {
    if (state.loading) {
      return `<div class="crm-loading"><div class="crm-spinner" aria-hidden="true"></div><span>Cargando CRM…</span></div>`;
    }
    if (state.error) {
      return `<div class="crm-error"><strong>No se pudo cargar el CRM.</strong><span>${escapeHtml(state.error)}</span><button type="button" class="crm-button" data-crm-action="refresh">Reintentar</button></div>`;
    }
    if (state.tab === "accounts") return renderAccounts();
    if (state.tab === "opportunities") return renderOpportunities();
    if (state.tab === "activities") return renderActivities();
    if (state.tab === "tasks") return renderTasks();
    return renderSummary();
  }

  function renderSummary() {
    const pending = state.tasks.filter(task => task.status === "pending");
    const overdue = pending.filter(isOverdue);
    const recentTasks = pending.slice().sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))).slice(0, 8);
    const recentActivities = state.activities.slice(0, 8);
    return `
      <section class="crm-kpis" aria-label="Indicadores del CRM">
        ${kpi("Pipeline abierto", formatMoney(state.pipeline.totalValue), `${state.pipeline.totalOpen || 0} oportunidades`)}
        ${kpi("Valor ponderado", formatMoney(state.pipeline.totalWeighted), "Según probabilidad de cierre")}
        ${kpi("Cuentas activas", String(state.accounts.filter(account => account.account_status === "active").length), `${state.accounts.length} visibles`)}
        ${kpi("Tareas pendientes", String(pending.length), "Próximos pasos registrados")}
        ${kpi("Tareas vencidas", String(overdue.length), overdue.length ? "Requieren atención" : "Sin atrasos", overdue.length ? "is-warning" : "")}
      </section>
      <div class="crm-summary-grid">
        <section class="crm-panel">
          <header class="crm-panel-header"><h2>Pipeline comercial</h2><p>${formatMoney(state.pipeline.totalValue)}</p></header>
          <div class="crm-panel-body">${renderKanban("open", true)}</div>
        </section>
        <div class="crm-list">
          <section class="crm-panel">
            <header class="crm-panel-header"><h2>Próximas tareas</h2><p>${recentTasks.length}</p></header>
            <div class="crm-panel-body crm-list">${recentTasks.length ? recentTasks.map(renderTaskCard).join("") : emptyInline("No hay tareas pendientes.")}</div>
          </section>
          <section class="crm-panel">
            <header class="crm-panel-header"><h2>Actividad reciente</h2><p>${recentActivities.length}</p></header>
            <div class="crm-panel-body crm-list">${recentActivities.length ? recentActivities.map(renderActivityCard).join("") : emptyInline("Todavía no hay actividad registrada.")}</div>
          </section>
        </div>
      </div>`;
  }

  function kpi(label, value, note, modifier) {
    return `<article class="crm-kpi ${modifier || ""}"><div class="crm-kpi-label">${escapeHtml(label)}</div><div class="crm-kpi-value">${escapeHtml(value)}</div><div class="crm-kpi-note">${escapeHtml(note)}</div></article>`;
  }

  function emptyInline(message) {
    return `<div class="crm-muted">${escapeHtml(message)}</div>`;
  }

  function renderAccounts() {
    if (!state.accounts.length) return `<div class="crm-empty"><strong>No hay cuentas para mostrar.</strong><span>Probá otro filtro o creá una cuenta nueva.</span></div>`;
    return `
      <div class="crm-account-table-wrap">
        <table class="crm-table">
          <thead><tr>
            <th>Cuenta</th><th>Contacto</th><th>Estado</th><th class="is-number">Pipeline</th>
            <th class="is-number">Oportunidades</th><th class="is-number">Pendientes</th><th>Último contacto</th><th>Acciones</th>
          </tr></thead>
          <tbody>${state.accounts.map(account => `
            <tr class="crm-account-row" tabindex="0" data-crm-action="open-account" data-id="${escapeAttribute(account.id)}">
              <td><div class="crm-account-name">${escapeHtml(account.business_name)}</div><div class="crm-muted">${escapeHtml(account.industry || account.cuit || "Sin clasificación")}</div></td>
              <td><div>${escapeHtml(account.email || "—")}</div><div class="crm-muted">${escapeHtml(account.phone || "—")}</div></td>
              <td>${statusPill(account.account_status || "active")}</td>
              <td class="is-number">${escapeHtml(formatMoney(account.pipeline_value))}</td>
              <td class="is-number">${Number(account.open_opportunities || 0)}</td>
              <td class="is-number">${Number(account.pending_tasks || 0)}${Number(account.overdue_tasks || 0) ? ` · <span class="crm-status is-overdue">${Number(account.overdue_tasks)} vencidas</span>` : ""}</td>
              <td>${formatDate(account.last_activity_at || account.last_contact_at, true)}</td>
              <td><div class="crm-inline-actions">
                <button type="button" class="crm-button crm-button-quiet" data-crm-action="open-account" data-id="${escapeAttribute(account.id)}">Abrir</button>
                ${canWrite() ? `<button type="button" class="crm-button crm-button-quiet" data-crm-action="new-opportunity" data-client-id="${escapeAttribute(account.id)}">Oportunidad</button>` : ""}
              </div></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>`;
  }

  function statusPill(status) {
    const labels = { active: "Activa", prospect: "Prospecto", inactive: "Inactiva", open: "Abierta", won: "Ganada", lost: "Perdida" };
    return `<span class="crm-status is-${escapeAttribute(status)}">${escapeHtml(labels[status] || status || "—")}</span>`;
  }

  function renderOpportunities() {
    const filtered = state.opportunities.filter(opportunity => state.opportunityStatus === "all" || opportunity.status === state.opportunityStatus);
    if (!filtered.length) return `<div class="crm-empty"><strong>No hay oportunidades en este filtro.</strong><span>Creá una oportunidad o cambiá el estado seleccionado.</span></div>`;
    return renderKanban(state.opportunityStatus, false, filtered);
  }

  function renderKanban(status, compact, supplied) {
    const opportunities = supplied || state.opportunities.filter(opportunity => status === "all" || opportunity.status === status);
    const stages = state.stages.filter(stage => {
      if (status === "open") return !stage.is_won && !stage.is_lost;
      if (status === "won") return stage.is_won;
      if (status === "lost") return stage.is_lost;
      return true;
    });
    if (!stages.length) return emptyInline("No hay etapas configuradas.");
    return `<div class="crm-kanban${compact ? " is-compact" : ""}">${stages.map(stage => {
      const cards = opportunities.filter(opportunity => (stageForOpportunity(opportunity) || {}).id === stage.id);
      const total = cards.reduce((sum, opportunity) => sum + Number(opportunity.amount || 0), 0);
      return `<section class="crm-stage" style="--stage-color:${escapeAttribute(stage.color || "#3B8AD4")}">
        <header class="crm-stage-header">
          <div class="crm-stage-title">${escapeHtml(stage.name)}</div>
          <div class="crm-stage-count">${cards.length}</div>
          <div class="crm-stage-total">${escapeHtml(formatMoney(total))}</div>
        </header>
        <div class="crm-stage-list">${cards.length ? cards.map(renderOpportunityCard).join("") : emptyInline("Sin oportunidades.")}</div>
      </section>`;
    }).join("")}</div>`;
  }

  function renderOpportunityCard(opportunity) {
    const write = canWrite();
    return `<article class="crm-opportunity-card" tabindex="0" data-crm-action="edit-opportunity" data-id="${escapeAttribute(opportunity.id)}">
      <div class="crm-card-title">${escapeHtml(opportunity.title)}</div>
      <div class="crm-card-subtitle">${escapeHtml(opportunity.client_name || "Cuenta sin nombre")}</div>
      <div class="crm-card-meta"><strong>${escapeHtml(formatMoney(opportunity.amount))}</strong><span>${Number(opportunity.probability || 0)}%</span></div>
      <div class="crm-card-meta"><span>${escapeHtml(opportunity.assigned_to || "Sin responsable")}</span><span>${formatDate(opportunity.expected_close, false)}</span></div>
      ${write && opportunity.status === "open" ? `<div class="crm-card-actions">
        <button type="button" class="crm-button crm-button-quiet crm-button-success" data-crm-action="win-opportunity" data-id="${escapeAttribute(opportunity.id)}">Ganar</button>
        <button type="button" class="crm-button crm-button-quiet crm-button-danger" data-crm-action="lose-opportunity" data-id="${escapeAttribute(opportunity.id)}">Perder</button>
      </div>` : ""}
    </article>`;
  }

  function renderActivities() {
    const query = state.search.trim().toLowerCase();
    const activities = state.activities.filter(activity => !query || [activity.client_name, activity.subject, activity.body, activity.type]
      .some(value => String(value || "").toLowerCase().includes(query)));
    if (!activities.length) return `<div class="crm-empty"><strong>No hay actividades para mostrar.</strong><span>Registrá una llamada, reunión, correo o nota.</span></div>`;
    return `<div class="crm-list">${activities.map(renderActivityCard).join("")}</div>`;
  }

  function renderActivityCard(activity) {
    return `<article class="crm-activity-card">
      <div>
        <span class="crm-activity-type is-${escapeAttribute(activity.type)}">${escapeHtml(ACTIVITY_LABELS[activity.type] || activity.type)}</span>
        <div class="crm-card-title">${escapeHtml(activity.subject || "Actividad sin asunto")}</div>
        <div class="crm-card-subtitle">${escapeHtml(activity.client_name || "Cuenta")}${activity.body ? ` — ${escapeHtml(activity.body)}` : ""}</div>
        <div class="crm-card-meta"><span>${escapeHtml(activity.assigned_to || "Sin responsable")}</span><span>${formatDate(activity.created_at, true)}</span></div>
      </div>
      ${canWrite() ? `<div class="crm-inline-actions">
        <button type="button" class="crm-button crm-button-quiet" data-crm-action="edit-activity" data-id="${escapeAttribute(activity.id)}">Editar</button>
        <button type="button" class="crm-button crm-button-quiet crm-button-danger" data-crm-action="delete-activity" data-id="${escapeAttribute(activity.id)}">Eliminar</button>
      </div>` : ""}
    </article>`;
  }

  function renderTasks() {
    const query = state.search.trim().toLowerCase();
    const tasks = state.tasks.filter(task => {
      if (state.taskStatus === "pending" && task.status !== "pending") return false;
      if (state.taskStatus === "completed" && task.status !== "completed") return false;
      if (state.taskStatus === "overdue" && !isOverdue(task)) return false;
      return !query || [task.title, task.description, task.client_name, task.assigned_to]
        .some(value => String(value || "").toLowerCase().includes(query));
    });
    if (!tasks.length) return `<div class="crm-empty"><strong>No hay tareas en este filtro.</strong><span>Creá una tarea para definir el próximo paso.</span></div>`;
    return `<div class="crm-list">${tasks.map(renderTaskCard).join("")}</div>`;
  }

  function renderTaskCard(task) {
    const overdue = isOverdue(task);
    const completed = task.status === "completed";
    return `<article class="crm-task-card${overdue ? " is-overdue" : ""}${completed ? " is-completed" : ""}">
      <div>
        <div class="crm-card-title">${escapeHtml(task.title)}</div>
        <div class="crm-card-subtitle">${escapeHtml(task.client_name || "Cuenta")}${task.description ? ` — ${escapeHtml(task.description)}` : ""}</div>
        <div class="crm-card-meta"><span>${escapeHtml(task.assigned_to || "Sin responsable")} · ${escapeHtml(task.priority || "normal")}</span><span>${overdue ? "Venció " : "Vence "}${formatDate(task.due_date, false)}${task.due_time ? `, ${escapeHtml(task.due_time)}` : ""}</span></div>
      </div>
      ${canWrite() ? `<div class="crm-inline-actions">
        ${!completed ? `<button type="button" class="crm-button crm-button-quiet crm-button-success" data-crm-action="complete-task" data-id="${escapeAttribute(task.id)}">Completar</button>` : ""}
        <button type="button" class="crm-button crm-button-quiet" data-crm-action="edit-task" data-id="${escapeAttribute(task.id)}">Editar</button>
        <button type="button" class="crm-button crm-button-quiet crm-button-danger" data-crm-action="delete-task" data-id="${escapeAttribute(task.id)}">Eliminar</button>
      </div>` : ""}
    </article>`;
  }

  function bindRootEvents(element) {
    if (element.dataset.crmBound === "1") return;
    element.dataset.crmBound = "1";
    element.addEventListener("click", handleActionClick);
    element.addEventListener("keydown", event => {
      const actionable = event.target.closest("[data-crm-action]");
      if (!actionable || (event.key !== "Enter" && event.key !== " ")) return;
      if (event.target.tagName === "BUTTON") return;
      event.preventDefault();
      actionable.click();
    });
    element.addEventListener("input", event => {
      if (!event.target.matches("[data-crm-search]")) return;
      state.search = event.target.value;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => refresh(true), 280);
    });
    element.addEventListener("change", event => {
      const filter = event.target.dataset.crmFilter;
      if (!filter) return;
      if (filter === "account-status") state.accountStatus = event.target.value;
      if (filter === "opportunity-status") state.opportunityStatus = event.target.value;
      if (filter === "task-status") state.taskStatus = event.target.value;
      if (filter === "account-status") refresh(false);
      else renderShell();
    });
  }

  async function handleActionClick(event) {
    const button = event.target.closest("[data-crm-action]");
    if (!button) return;
    const action = button.dataset.crmAction;
    if (!action) return;
    if (button.tagName === "BUTTON") event.stopPropagation();
    try {
      if (action === "refresh") return refresh(false);
      if (action === "open-account") return openAccountDetail(button.dataset.id);
      if (action === "new-account") return openAccountForm(null, button);
      if (action === "edit-account") return openAccountForm(accountById(button.dataset.id), button);
      if (action === "new-opportunity") return openOpportunityForm(null, { client_id: button.dataset.clientId || "" }, button);
      if (action === "edit-opportunity") return openOpportunityForm(opportunityById(button.dataset.id), {}, button);
      if (action === "win-opportunity") return winOpportunity(button.dataset.id);
      if (action === "lose-opportunity") return openOpportunityForm(opportunityById(button.dataset.id), { stage_id: "stage-lost" }, button);
      if (action === "new-activity") return openActivityForm(null, { client_id: button.dataset.clientId || "" }, button);
      if (action === "edit-activity") return openActivityForm(activityById(button.dataset.id), {}, button);
      if (action === "delete-activity") return deleteActivity(button.dataset.id);
      if (action === "new-task") return openTaskForm(null, { client_id: button.dataset.clientId || "" }, button);
      if (action === "edit-task") return openTaskForm(taskById(button.dataset.id), {}, button);
      if (action === "complete-task") return completeTask(button.dataset.id);
      if (action === "delete-task") return deleteTask(button.dataset.id);
      if (action === "call-account") return openAccountLink(button.dataset.id, "phone");
      if (action === "email-account") return openAccountLink(button.dataset.id, "email");
      if (action === "web-account") return openAccountLink(button.dataset.id, "website");
      if (action === "quote-account") return openNativeCommercialForm("quote", button.dataset.id);
      if (action === "order-account") return openNativeCommercialForm("sale-order", button.dataset.id);
    } catch (error) {
      showToast(error.message || String(error), true);
    }
  }

  document.addEventListener("click", event => {
    if (!event.target.closest(".crm-modal-backdrop [data-crm-action]")) return;
    handleActionClick(event);
  });

  function closeParentDialog(trigger) {
    const backdrop = trigger && trigger.closest ? trigger.closest(".crm-modal-backdrop") : null;
    if (backdrop && typeof backdrop._crmClose === "function") backdrop._crmClose();
  }

  function openNativeCommercialForm(type, accountId) {
    if (!window.A || typeof window.A.openNativeForm !== "function") throw new Error("El formulario comercial no está disponible.");
    const account = accountById(accountId);
    if (!account) throw new Error("No se encontró la cuenta.");
    window.A.openNativeForm(type, {
      client: {
        id: account.id,
        codigo: account.code || account.id,
        razonSocial: account.business_name,
        cuit: account.cuit || "",
        condicionIva: account.fiscal_type || "",
        email: account.email || "",
        phone: account.phone || "",
        domicilio: account.address || "",
      },
    });
  }

  async function openAccountLink(id, field) {
    const account = accountById(id);
    if (!account) throw new Error("No se encontró la cuenta.");
    let target = "";
    if (field === "phone" && account.phone) target = `tel:${String(account.phone).replace(/[^+\d]/g, "")}`;
    if (field === "email" && account.email) target = `mailto:${String(account.email).trim()}`;
    if (field === "website" && account.website) {
      target = /^https?:\/\//i.test(account.website) ? account.website : `https://${account.website}`;
    }
    if (!target) throw new Error(`La cuenta no tiene ${field === "phone" ? "teléfono" : field === "email" ? "correo" : "sitio web"} cargado.`);
    const response = await state.api.openExternal(target);
    if (!response?.ok) throw new Error(response?.error || "No se pudo abrir el enlace.");
  }

  async function load() {
    return refresh(false);
  }

  async function refresh(preserveSearchFocus) {
    const element = root();
    if (!element) return;
    state.loading = true;
    state.error = "";
    renderShell();
    try {
      const api = await waitForApi();
      const [accounts, accountOptions, stages, opportunities, activities, pendingTasks, completedTasks, pipeline] = await Promise.all([
        api.crm.accounts.list(state.search, state.accountStatus),
        api.clients.list(""),
        api.crm.pipeline.list(),
        api.crm.opportunities.list(state.search, "all"),
        api.crm.activities.recent(100),
        api.crm.tasks.list("pending"),
        api.crm.tasks.list("completed"),
        api.crm.pipelineSummary(),
      ]);
      state.accounts = unwrapResponse(accounts, "No se pudieron cargar las cuentas.") || [];
      state.accountOptions = Array.isArray(accountOptions) ? accountOptions : [];
      state.stages = unwrapResponse(stages, "No se pudieron cargar las etapas.") || [];
      state.opportunities = unwrapResponse(opportunities, "No se pudieron cargar las oportunidades.") || [];
      state.activities = unwrapResponse(activities, "No se pudieron cargar las actividades.") || [];
      const pending = unwrapResponse(pendingTasks, "No se pudieron cargar las tareas.") || [];
      const completed = unwrapResponse(completedTasks, "No se pudieron cargar las tareas completadas.") || [];
      state.tasks = pending.concat(completed);
      state.pipeline = unwrapResponse(pipeline, "No se pudo cargar el pipeline.") || state.pipeline;
    } catch (error) {
      state.error = error.message || String(error);
    } finally {
      state.loading = false;
      renderShell();
      if (preserveSearchFocus) {
        const search = root()?.querySelector("[data-crm-search]");
        if (search) {
          search.focus();
          search.setSelectionRange(search.value.length, search.value.length);
        }
      }
    }
  }

  function setTab(tab) {
    if (!TABS.some(item => item.id === tab)) return;
    state.tab = tab;
    renderShell();
  }

  function setSearch(value) {
    state.search = String(value || "");
    refresh(true);
  }

  function applyPermissions() {
    if (root()) renderShell();
  }

  document.addEventListener("click", event => {
    const tab = event.target.closest("[data-crm-tab]");
    if (tab) setTab(tab.dataset.crmTab);
  });

  function updateStatusCount() {
    const statusCount = document.getElementById("status-count");
    if (!statusCount) return;
    const counts = {
      summary: `${state.pipeline.totalOpen || 0} oportunidades`,
      accounts: `${state.accounts.length} cuentas`,
      opportunities: `${state.opportunities.length} oportunidades`,
      activities: `${state.activities.length} actividades`,
      tasks: `${state.tasks.filter(task => task.status === "pending").length} tareas pendientes`,
    };
    statusCount.textContent = counts[state.tab] || "";
  }

  function clientOptions(selectedId) {
    return `<option value="">Seleccionar cuenta…</option>${state.accountOptions.map(account => option(account.id, account.business_name, selectedId)).join("")}`;
  }

  function opportunityOptions(selectedId, clientId) {
    const opportunities = state.opportunities.filter(opportunity => !clientId || opportunity.client_id === clientId);
    return `<option value="">Sin oportunidad asociada</option>${opportunities.map(opportunity => option(opportunity.id, opportunity.title, selectedId)).join("")}`;
  }

  function stageOptions(selectedId) {
    return state.stages.map(stage => option(stage.id, `${stage.name} — ${stage.probability}%`, selectedId)).join("");
  }

  function formField(field, value) {
    const required = field.required ? ` <span class="crm-required" aria-hidden="true">*</span>` : "";
    const common = `name="${escapeAttribute(field.key)}"${field.required ? " required" : ""}${field.disabled ? " disabled" : ""}`;
    let control = "";
    if (field.type === "select") {
      control = `<select ${common}>${field.options || ""}</select>`;
    } else if (field.type === "textarea") {
      control = `<textarea ${common} rows="${field.rows || 4}" placeholder="${escapeAttribute(field.placeholder || "")}">${escapeHtml(value || "")}</textarea>`;
    } else {
      control = `<input ${common} type="${escapeAttribute(field.type || "text")}" value="${escapeAttribute(value ?? "")}"
        ${field.min !== undefined ? `min="${escapeAttribute(field.min)}"` : ""} ${field.step ? `step="${escapeAttribute(field.step)}"` : ""}
        placeholder="${escapeAttribute(field.placeholder || "")}" />`;
    }
    return `<label class="crm-field${field.wide ? " is-wide" : ""}"><span>${escapeHtml(field.label)}${required}</span>${control}</label>`;
  }

  function openFormDialog(config) {
    const backdrop = document.createElement("div");
    backdrop.className = "crm-modal-backdrop";
    backdrop.innerHTML = `
      <section class="crm-modal${config.wide ? " is-wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="crm-dialog-title">
        <header class="crm-modal-header"><h2 id="crm-dialog-title">${escapeHtml(config.title)}</h2><button type="button" class="crm-close" aria-label="Cerrar">×</button></header>
        <form>
          <div class="crm-modal-body"><div class="crm-form-grid">
            ${config.fields.map(field => formField(field, config.values[field.key])).join("")}
            <div class="crm-form-error" role="alert"></div>
          </div></div>
          <footer class="crm-modal-footer"><button type="button" class="crm-button" data-dialog-cancel>Cancelar</button><button type="submit" class="crm-button crm-button-primary">${escapeHtml(config.submitLabel || "Guardar")}</button></footer>
        </form>
      </section>`;
    document.body.appendChild(backdrop);
    const form = backdrop.querySelector("form");
    const errorBox = backdrop.querySelector(".crm-form-error");
    const previousFocus = document.activeElement;
    const close = () => {
      document.removeEventListener("keydown", onKeydown);
      backdrop.remove();
      if (previousFocus && previousFocus.focus) previousFocus.focus();
    };
    const onKeydown = event => { if (event.key === "Escape") close(); };
    backdrop._crmClose = close;
    document.addEventListener("keydown", onKeydown);
    backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
    backdrop.querySelector(".crm-close").addEventListener("click", close);
    backdrop.querySelector("[data-dialog-cancel]").addEventListener("click", close);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      errorBox.classList.remove("is-visible");
      if (!form.reportValidity()) return;
      const submit = form.querySelector('button[type="submit"]');
      const data = Object.fromEntries(new FormData(form).entries());
      submit.disabled = true;
      submit.textContent = "Guardando…";
      try {
        await config.onSubmit(data);
        close();
      } catch (error) {
        errorBox.textContent = error.message || String(error);
        errorBox.classList.add("is-visible");
        submit.disabled = false;
        submit.textContent = config.submitLabel || "Guardar";
      }
    });
    const clientSelect = form.elements.namedItem("client_id");
    const opportunitySelect = form.elements.namedItem("opportunity_id");
    if (clientSelect && opportunitySelect) {
      clientSelect.addEventListener("change", () => {
        opportunitySelect.innerHTML = opportunityOptions("", clientSelect.value);
      });
    }
    setTimeout(() => backdrop.querySelector("input:not([disabled]), select:not([disabled]), textarea:not([disabled])")?.focus(), 20);
  }

  function openAccountForm(existing, trigger) {
    if (!canWrite()) return;
    closeParentDialog(trigger);
    const row = existing || {};
    openFormDialog({
      title: existing ? "Editar cuenta" : "Nueva cuenta",
      values: row,
      fields: [
        { key: "business_name", label: "Razón social o nombre", required: true, wide: true },
        { key: "code", label: "Código" },
        { key: "cuit", label: "CUIT" },
        { key: "email", label: "Correo", type: "email" },
        { key: "phone", label: "Teléfono", type: "tel" },
        { key: "industry", label: "Industria" },
        { key: "assigned_to", label: "Responsable" },
        { key: "website", label: "Sitio web" },
        { key: "lead_source", label: "Origen" },
        { key: "account_status", label: "Estado", type: "select", options: `${option("active", "Activa", row.account_status || "active")}${option("prospect", "Prospecto", row.account_status || "active")}${option("inactive", "Inactiva", row.account_status || "active")}` },
        { key: "fiscal_type", label: "Condición fiscal" },
        { key: "address", label: "Dirección", wide: true },
        { key: "city", label: "Ciudad" },
        { key: "province", label: "Provincia" },
        { key: "crm_notes", label: "Notas CRM", type: "textarea", rows: 4, wide: true },
      ],
      onSubmit: async data => {
        const response = await state.api.clients.save({ ...row, ...data, id: row.id || undefined, active: 1 });
        if (!response?.ok) throw new Error(response?.error || "No se pudo guardar la cuenta.");
        showToast(existing ? "Cuenta actualizada." : "Cuenta creada.");
        await refresh(false);
      },
    });
  }

  function openOpportunityForm(existing, overrides, trigger) {
    if (!canWrite()) return;
    closeParentDialog(trigger);
    const row = { ...(existing || {}), ...(overrides || {}) };
    const defaultStage = state.stages.find(stage => !stage.is_won && !stage.is_lost);
    const selectedStageId = row.stage_id || defaultStage?.id || "";
    openFormDialog({
      title: existing ? "Editar oportunidad" : "Nueva oportunidad",
      values: { ...row, stage_id: selectedStageId },
      fields: [
        { key: "client_id", label: "Cuenta", type: "select", required: true, options: clientOptions(row.client_id) },
        { key: "title", label: "Oportunidad", required: true },
        { key: "amount", label: "Importe", type: "number", min: 0, step: "0.01", required: true },
        { key: "stage_id", label: "Etapa", type: "select", required: true, options: stageOptions(selectedStageId) },
        { key: "expected_close", label: "Cierre estimado", type: "date" },
        { key: "assigned_to", label: "Responsable" },
        { key: "source", label: "Origen" },
        { key: "lost_reason", label: "Motivo de pérdida" },
        { key: "notes", label: "Notas", type: "textarea", rows: 4, wide: true },
      ],
      onSubmit: async data => {
        const stage = state.stages.find(item => item.id === data.stage_id);
        if (!stage) throw new Error("Seleccioná una etapa válida.");
        const payload = {
          ...row,
          ...data,
          id: row.id || undefined,
          amount: Number(data.amount || 0),
          stage: stageSlug(stage),
          probability: Number(stage.probability || 0),
        };
        const response = await state.api.crm.opportunities.save(payload);
        unwrapResponse(response, "No se pudo guardar la oportunidad.");
        showToast(existing ? "Oportunidad actualizada." : "Oportunidad creada.");
        await refresh(false);
      },
    });
  }

  function openActivityForm(existing, overrides, trigger) {
    if (!canWrite()) return;
    closeParentDialog(trigger);
    const row = { ...(existing || {}), ...(overrides || {}) };
    openFormDialog({
      title: existing ? "Editar actividad" : "Registrar actividad",
      values: row,
      fields: [
        { key: "client_id", label: "Cuenta", type: "select", required: true, options: clientOptions(row.client_id) },
        { key: "type", label: "Tipo", type: "select", required: true, options: Object.entries(ACTIVITY_LABELS).map(([value, label]) => option(value, label, row.type || "note")).join("") },
        { key: "subject", label: "Asunto", required: true, wide: true },
        { key: "opportunity_id", label: "Oportunidad asociada", type: "select", options: opportunityOptions(row.opportunity_id, row.client_id) },
        { key: "assigned_to", label: "Responsable" },
        { key: "due_date", label: "Próxima fecha", type: "date" },
        { key: "body", label: "Detalle", type: "textarea", rows: 5, wide: true },
      ],
      onSubmit: async data => {
        const response = await state.api.crm.activities.save({ ...row, ...data, id: row.id || undefined });
        unwrapResponse(response, "No se pudo guardar la actividad.");
        showToast(existing ? "Actividad actualizada." : "Actividad registrada.");
        await refresh(false);
      },
    });
  }

  function openTaskForm(existing, overrides, trigger) {
    if (!canWrite()) return;
    closeParentDialog(trigger);
    const row = { due_date: plusDaysIso(7), priority: "normal", status: "pending", ...(existing || {}), ...(overrides || {}) };
    openFormDialog({
      title: existing ? "Editar tarea" : "Nueva tarea",
      values: row,
      fields: [
        { key: "client_id", label: "Cuenta", type: "select", required: true, options: clientOptions(row.client_id) },
        { key: "title", label: "Tarea", required: true },
        { key: "due_date", label: "Fecha de vencimiento", type: "date", required: true },
        { key: "due_time", label: "Hora", type: "time" },
        { key: "priority", label: "Prioridad", type: "select", options: `${option("low", "Baja", row.priority)}${option("normal", "Normal", row.priority)}${option("high", "Alta", row.priority)}` },
        { key: "assigned_to", label: "Responsable" },
        { key: "opportunity_id", label: "Oportunidad asociada", type: "select", options: opportunityOptions(row.opportunity_id, row.client_id) },
        { key: "status", label: "Estado", type: "select", options: `${option("pending", "Pendiente", row.status)}${option("completed", "Completada", row.status)}` },
        { key: "description", label: "Detalle", type: "textarea", rows: 4, wide: true },
      ],
      onSubmit: async data => {
        const response = await state.api.crm.tasks.save({ ...row, ...data, id: row.id || undefined });
        unwrapResponse(response, "No se pudo guardar la tarea.");
        showToast(existing ? "Tarea actualizada." : "Tarea creada.");
        await refresh(false);
      },
    });
  }

  async function winOpportunity(id) {
    if (!canWrite()) return;
    const opportunity = opportunityById(id);
    const stage = state.stages.find(item => item.is_won);
    if (!opportunity || !stage) throw new Error("No se encontró la etapa ganada.");
    if (!window.confirm(`¿Marcar “${opportunity.title}” como ganada?`)) return;
    const response = await state.api.crm.opportunities.save({
      ...opportunity,
      stage_id: stage.id,
      stage: stageSlug(stage),
      probability: Number(stage.probability || 100),
    });
    unwrapResponse(response, "No se pudo ganar la oportunidad.");
    showToast("Oportunidad marcada como ganada.");
    await refresh(false);
  }

  async function completeTask(id) {
    if (!canWrite()) return;
    const response = await state.api.crm.tasks.complete(id);
    unwrapResponse(response, "No se pudo completar la tarea.");
    showToast("Tarea completada.");
    await refresh(false);
  }

  async function deleteTask(id) {
    if (!canWrite() || !window.confirm("¿Eliminar esta tarea?")) return;
    const response = await state.api.crm.tasks.delete(id);
    unwrapResponse(response, "No se pudo eliminar la tarea.");
    showToast("Tarea eliminada.");
    await refresh(false);
  }

  async function deleteActivity(id) {
    if (!canWrite() || !window.confirm("¿Eliminar esta actividad?")) return;
    const response = await state.api.crm.activities.delete(id);
    unwrapResponse(response, "No se pudo eliminar la actividad.");
    showToast("Actividad eliminada.");
    await refresh(false);
  }

  async function openAccountDetail(id) {
    const response = await state.api.crm.accounts.get(id);
    const detail = unwrapResponse(response, "No se pudo abrir la cuenta.");
    if (!detail) throw new Error("La cuenta ya no existe.");
    detail.opportunities.forEach(item => {
      if (!state.opportunities.some(existing => existing.id === item.id)) state.opportunities.push(item);
    });
    detail.activities.forEach(item => {
      if (!state.activities.some(existing => existing.id === item.id)) state.activities.push(item);
    });
    detail.tasks.forEach(item => {
      if (!state.tasks.some(existing => existing.id === item.id)) state.tasks.push(item);
    });
    const account = detail.account;
    const backdrop = document.createElement("div");
    backdrop.className = "crm-modal-backdrop";
    backdrop.innerHTML = `
      <section class="crm-modal is-wide" role="dialog" aria-modal="true" aria-labelledby="crm-account-title">
        <header class="crm-modal-header"><div><h2 id="crm-account-title">${escapeHtml(account.business_name)}</h2><div class="crm-muted">${escapeHtml(account.industry || account.cuit || "Cuenta comercial")}</div></div><button type="button" class="crm-close" aria-label="Cerrar">×</button></header>
        <div class="crm-modal-body">
          <div class="crm-actions">
            <button type="button" class="crm-button" data-crm-action="call-account" data-id="${escapeAttribute(account.id)}">Llamar</button>
            <button type="button" class="crm-button" data-crm-action="email-account" data-id="${escapeAttribute(account.id)}">Enviar correo</button>
            ${account.website ? `<button type="button" class="crm-button" data-crm-action="web-account" data-id="${escapeAttribute(account.id)}">Abrir sitio</button>` : ""}
            <button type="button" class="crm-button" data-crm-action="quote-account" data-id="${escapeAttribute(account.id)}">Cotizar</button>
            <button type="button" class="crm-button" data-crm-action="order-account" data-id="${escapeAttribute(account.id)}">Crear pedido</button>
            ${canWrite() ? `<button type="button" class="crm-button crm-button-primary" data-crm-action="edit-account" data-id="${escapeAttribute(account.id)}">Editar cuenta</button>` : ""}
          </div>
          <div class="crm-account-detail" style="margin-top:12px">
            <section class="crm-panel"><header class="crm-panel-header"><h2>Ficha de cuenta</h2>${statusPill(account.account_status)}</header><div class="crm-panel-body">
              <dl class="crm-contact-list">
                ${detailItem("CUIT", account.cuit)}${detailItem("Correo", account.email)}${detailItem("Teléfono", account.phone)}
                ${detailItem("Dirección", [account.address, account.city, account.province].filter(Boolean).join(", "))}
                ${detailItem("Responsable", account.assigned_to)}${detailItem("Origen", account.lead_source)}${detailItem("Notas", account.crm_notes)}
              </dl>
              ${canWrite() ? `<div class="crm-actions" style="margin-top:12px">
                <button type="button" class="crm-button crm-button-quiet" data-crm-action="new-opportunity" data-client-id="${escapeAttribute(account.id)}">Nueva oportunidad</button>
                <button type="button" class="crm-button crm-button-quiet" data-crm-action="new-activity" data-client-id="${escapeAttribute(account.id)}">Registrar actividad</button>
                <button type="button" class="crm-button crm-button-quiet" data-crm-action="new-task" data-client-id="${escapeAttribute(account.id)}">Nueva tarea</button>
              </div>` : ""}
            </div></section>
            <div class="crm-list">
              <section class="crm-panel"><header class="crm-panel-header"><h2>Resumen comercial</h2></header><div class="crm-panel-body crm-kpis" style="grid-template-columns:repeat(3,minmax(100px,1fr));margin:0">
                ${kpi("Pipeline", formatMoney(detail.summary.opportunities.totalValue), `${detail.summary.opportunities.open} abiertas`)}
                ${kpi("Ganadas", String(detail.summary.opportunities.won), `${detail.summary.opportunities.lost} perdidas`)}
                ${kpi("Pendientes", String(detail.summary.tasks.pending), `${detail.summary.tasks.overdue} vencidas`, detail.summary.tasks.overdue ? "is-warning" : "")}
              </div></section>
              <section class="crm-panel"><header class="crm-panel-header"><h2>Oportunidades</h2><p>${detail.opportunities.length}</p></header><div class="crm-panel-body crm-list">${detail.opportunities.length ? detail.opportunities.map(renderOpportunityCard).join("") : emptyInline("Sin oportunidades.")}</div></section>
              <section class="crm-panel"><header class="crm-panel-header"><h2>Historial de contacto</h2><p>${detail.activities.length}</p></header><div class="crm-panel-body crm-list">${detail.activities.length ? detail.activities.map(renderActivityCard).join("") : emptyInline("Sin actividad registrada.")}</div></section>
              <section class="crm-panel"><header class="crm-panel-header"><h2>Tareas</h2><p>${detail.tasks.length}</p></header><div class="crm-panel-body crm-list">${detail.tasks.length ? detail.tasks.map(renderTaskCard).join("") : emptyInline("Sin tareas registradas.")}</div></section>
            </div>
          </div>
        </div>
      </section>`;
    document.body.appendChild(backdrop);
    const previousFocus = document.activeElement;
    const close = () => {
      document.removeEventListener("keydown", onKeydown);
      backdrop.remove();
      previousFocus?.focus?.();
    };
    const onKeydown = event => { if (event.key === "Escape") close(); };
    backdrop._crmClose = close;
    document.addEventListener("keydown", onKeydown);
    backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
    backdrop.querySelector(".crm-close").addEventListener("click", close);
    setTimeout(() => backdrop.querySelector(".crm-close")?.focus(), 20);
  }

  function detailItem(label, value) {
    return `<div class="crm-contact-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "—")}</dd></div>`;
  }

  function showToast(message, isError) {
    document.querySelector(".crm-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = `crm-toast${isError ? " is-error" : ""}`;
    toast.textContent = message;
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
  }

  window.CrmWorkspace = {
    load,
    refresh: () => refresh(false),
    setSearch,
    setTab,
    applyPermissions,
  };
})();
