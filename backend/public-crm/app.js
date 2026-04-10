const state = {
  leads: [],
  filteredLeads: [],
  selectedLead: null,
  selectedQuote: null,
  leadPage: 0,
};

const LEAD_PAGE_SIZE = 15;

const el = {
  refreshBtn: document.getElementById("refreshBtn"),
  dateFilter: document.getElementById("dateFilter"),
  sourceFilter: document.getElementById("sourceFilter"),
  leadTitle: document.getElementById("leadTitle"),
  leadChannel: document.getElementById("leadChannel"),
  leadMeta: document.getElementById("leadMeta"),
  leadTableBody: document.getElementById("leadTableBody"),
  leadTableInfo: document.getElementById("leadTableInfo"),
  leadPrevBtn: document.getElementById("leadPrevBtn"),
  leadNextBtn: document.getElementById("leadNextBtn"),
  leadPaginationInfo: document.getElementById("leadPaginationInfo"),
  messageList: document.getElementById("messageList"),
  leadForm: document.getElementById("leadForm"),
  saveBtn: document.getElementById("saveBtn"),
  leadSaveStatus: document.getElementById("leadSaveStatus"),
  crmStatus: document.getElementById("crmStatus"),
  quoteStatus: document.getElementById("quoteStatus"),
  assignedTo: document.getElementById("assignedTo"),
  nextAction: document.getElementById("nextAction"),
  followUpAt: document.getElementById("followUpAt"),
  internalNotes: document.getElementById("internalNotes"),
  quoteTitle: document.getElementById("quoteTitle"),
  quoteTotal: document.getElementById("quoteTotal"),
  quoteSummary: document.getElementById("quoteSummary"),
  quoteScope: document.getElementById("quoteScope"),
  quoteBody: document.getElementById("quoteBody"),
  quoteAssumptions: document.getElementById("quoteAssumptions"),
  quoteAutofillBtn: document.getElementById("quoteAutofillBtn"),
  quoteSaveBtn: document.getElementById("quoteSaveBtn"),
  quoteSaveStatus: document.getElementById("quoteSaveStatus"),
};

function fmtDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("es-ES");
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();

  if (!contentType.includes("application/json")) {
    const preview = raw.trim().slice(0, 120);
    throw new Error(`La API no devolvio JSON. Respuesta: ${preview || `HTTP ${res.status}`}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_error) {
    throw new Error("La API devolvio un JSON invalido");
  }

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

function looksGenericName(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  if (/\d{6,}/.test(text)) return true;

  const normalized = text.toLowerCase();
  return [
    "hola",
    "buenas",
    "buenas tardes",
    "buenos dias",
    "buenos días",
    "lead sin nombre",
  ].includes(normalized) || text.length > 30;
}

function getLeadDisplayName(lead) {
  if (lead?.name && !looksGenericName(lead.name)) return lead.name;
  if (lead?.phone) return lead.phone;
  if (lead?.email) return lead.email;
  return "Lead sin nombre";
}

function applyLeadFilters() {
  const source = el.sourceFilter.value;
  const dateRange = el.dateFilter.value;
  const now = Date.now();

  state.filteredLeads = state.leads.filter((lead) => {
    const channelOk = source === "all" || (lead.channel || "web") === source;

    let dateOk = true;
    if (dateRange !== "all") {
      const value = lead.last_message?.created_at || lead.created_at;
      const time = new Date(value).getTime();
      if (Number.isNaN(time)) {
        dateOk = false;
      } else if (dateRange === "today") {
        const today = new Date();
        const sample = new Date(time);
        dateOk =
          today.getFullYear() === sample.getFullYear() &&
          today.getMonth() === sample.getMonth() &&
          today.getDate() === sample.getDate();
      } else if (dateRange === "7d") {
        dateOk = now - time <= 7 * 24 * 60 * 60 * 1000;
      } else if (dateRange === "30d") {
        dateOk = now - time <= 30 * 24 * 60 * 60 * 1000;
      }
    }

    return channelOk && dateOk;
  });

  if (!state.filteredLeads.find((lead) => lead.id === state.selectedLead?.id)) {
    state.selectedLead = state.filteredLeads[0] || null;
  }

  const totalPages = Math.max(1, Math.ceil(state.filteredLeads.length / LEAD_PAGE_SIZE));
  if (state.leadPage > totalPages - 1) {
    state.leadPage = totalPages - 1;
  }
}

function renderLeadTable() {
  applyLeadFilters();
  el.leadTableBody.innerHTML = "";

  if (!state.filteredLeads.length) {
    el.leadTableBody.innerHTML =
      '<tr><td colspan="8" class="empty">No hay leads para esos filtros.</td></tr>';
    el.leadTableInfo.textContent = "0 resultados";
    el.leadPaginationInfo.textContent = "Pagina 1 de 1";
    el.leadPrevBtn.disabled = true;
    el.leadNextBtn.disabled = true;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(state.filteredLeads.length / LEAD_PAGE_SIZE));
  const start = state.leadPage * LEAD_PAGE_SIZE;
  const pageItems = state.filteredLeads.slice(start, start + LEAD_PAGE_SIZE);

  for (const lead of pageItems) {
    const row = document.createElement("tr");
    row.className = `lead-row${state.selectedLead?.id === lead.id ? " active" : ""}`;
    row.innerHTML = `
      <td><button type="button" class="lead-name-btn">${getLeadDisplayName(lead)}</button></td>
      <td>${lead.interest_service || "-"}</td>
      <td>${lead.budget_range || "-"}</td>
      <td>${lead.channel || "web"}</td>
      <td>${lead.phone || "-"}</td>
      <td>${lead.email || "-"}</td>
      <td>${fmtDate(lead.last_message?.created_at || lead.created_at)}</td>
      <td><span class="status-pill">${lead.crm_status || "nuevo"}</span></td>
    `;
    row.addEventListener("click", () => selectLead(lead.id));
    row.querySelector(".lead-name-btn")?.addEventListener("click", (event) => {
      event.stopPropagation();
      selectLead(lead.id);
    });
    el.leadTableBody.appendChild(row);
  }

  el.leadTableInfo.textContent = `${state.filteredLeads.length} resultados`;
  el.leadPaginationInfo.textContent = `Pagina ${state.leadPage + 1} de ${totalPages}`;
  el.leadPrevBtn.disabled = state.leadPage === 0;
  el.leadNextBtn.disabled = state.leadPage >= totalPages - 1;
}

function renderLeadDetail() {
  const lead = state.selectedLead;

  if (!lead) {
    el.leadTitle.textContent = "Selecciona un lead";
    el.leadChannel.textContent = "-";
    el.leadMeta.innerHTML = "";
    el.messageList.innerHTML = '<div class="empty">Selecciona una conversacion.</div>';
    renderQuote(null);
    return;
  }

  el.leadTitle.textContent = getLeadDisplayName(lead);
  el.leadChannel.textContent = lead.channel || "web";
  el.leadMeta.innerHTML = `
    <div class="meta-box"><strong>Servicio</strong>${lead.interest_service || "-"}</div>
    <div class="meta-box"><strong>Presupuesto</strong>${lead.budget_range || "-"}</div>
    <div class="meta-box"><strong>Urgencia</strong>${lead.urgency || "-"}</div>
    <div class="meta-box"><strong>Email</strong>${lead.email || "-"}</div>
    <div class="meta-box"><strong>Telefono</strong>${lead.phone || "-"}</div>
    <div class="meta-box"><strong>Actividad</strong>${lead.business_activity || "-"}</div>
  `;

  el.crmStatus.value = lead.crm_status || "nuevo";
  el.quoteStatus.value = lead.quote_status || "sin_presupuesto";
  el.assignedTo.value = lead.assigned_to || "";
  el.nextAction.value = lead.next_action || "";
  el.followUpAt.value = toDatetimeLocal(lead.follow_up_at);
  el.internalNotes.value = lead.internal_notes || "";
}

function renderMessages(messages = []) {
  el.messageList.innerHTML = "";

  if (!messages.length) {
    el.messageList.innerHTML = '<div class="empty">No hay mensajes en esta conversacion.</div>';
    return;
  }

  for (const msg of messages) {
    const item = document.createElement("div");
    item.className = `message-item ${msg.role}`;
    item.innerHTML = `
      <strong>${msg.role}</strong>
      <div>${msg.content}</div>
      <time>${fmtDate(msg.created_at)}</time>
    `;
    el.messageList.appendChild(item);
  }
}

function renderQuote(quote) {
  state.selectedQuote = quote || null;
  const content = quote?.content_json || {};
  el.quoteTitle.value = quote?.title || "";
  el.quoteTotal.value = quote?.total ?? "";
  el.quoteSummary.value = content.summary || "";
  el.quoteScope.value = content.scope || "";
  el.quoteBody.value = content.body || "";
  el.quoteAssumptions.value = content.assumptions || "";
}

function setStatus(target, message = "", kind = "") {
  if (!target) return;
  target.textContent = message;
  target.className = `save-status${kind ? ` ${kind}` : ""}`;
}

async function loadLeads() {
  const data = await fetchJson("/api/crm/leads");
  state.leads = data.leads || [];

  if (!state.selectedLead && state.leads.length) {
    state.selectedLead = state.leads[0];
  } else if (state.selectedLead) {
    state.selectedLead =
      state.leads.find((lead) => lead.id === state.selectedLead.id) || state.leads[0] || null;
  }

  renderLeadTable();
  renderLeadDetail();

  if (state.selectedLead?.conversation_id) {
    await loadMessages(state.selectedLead.conversation_id);
  } else {
    renderMessages([]);
  }

  if (state.selectedLead?.id) {
    await loadQuote(state.selectedLead.id);
  } else {
    renderQuote(null);
  }
}

async function loadMessages(conversationId) {
  const data = await fetchJson(`/api/crm/conversations/${conversationId}/messages`);
  renderMessages(data.messages || []);
}

async function loadQuote(leadId) {
  const data = await fetchJson(`/api/crm/leads/${leadId}/quote`);
  renderQuote(data.quote || null);
}

async function selectLead(leadId) {
  state.selectedLead = state.leads.find((lead) => lead.id === leadId) || null;
  renderLeadTable();
  renderLeadDetail();

  if (state.selectedLead?.conversation_id) {
    await loadMessages(state.selectedLead.conversation_id);
  } else {
    renderMessages([]);
  }

  if (state.selectedLead?.id) {
    await loadQuote(state.selectedLead.id);
  } else {
    renderQuote(null);
  }
}

async function saveLead() {
  if (!state.selectedLead) return;

  el.saveBtn.disabled = true;
  el.saveBtn.classList.add("is-busy");
  setStatus(el.leadSaveStatus, "Guardando...");

  try {
    const payload = {
      crm_status: el.crmStatus.value,
      quote_status: el.quoteStatus.value,
      assigned_to: el.assignedTo.value,
      next_action: el.nextAction.value,
      follow_up_at: el.followUpAt.value ? new Date(el.followUpAt.value).toISOString() : null,
      internal_notes: el.internalNotes.value,
    };

    await fetchJson(`/api/crm/leads/${state.selectedLead.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    await loadLeads();
    setStatus(el.leadSaveStatus, "Cambios guardados.", "ok");
  } catch (error) {
    setStatus(el.leadSaveStatus, `No se pudo guardar: ${error.message}`, "error");
  } finally {
    el.saveBtn.disabled = false;
    el.saveBtn.classList.remove("is-busy");
  }
}

function buildQuoteSuggestion(lead) {
  const service = lead?.interest_service || "servicio de marketing";
  const business = lead?.business_activity || lead?.business_type || "tu proyecto";
  const goal = lead?.main_goal || "mejorar resultados";
  const budget = lead?.budget_range || "por definir";

  return {
    title: `Propuesta ${service}`,
    summary: `${service} para ${business}`,
    scope: [
      "Analisis inicial del negocio y del punto de partida.",
      `Definicion de estrategia para ${service}.`,
      "Configuracion y optimizacion continua.",
      "Seguimiento de resultados y mejoras.",
    ].join("\n"),
    body: `Hemos preparado una propuesta de ${service} para ${business}, orientada a ${goal}. El trabajo incluiria una fase inicial de analisis, puesta en marcha y seguimiento continuo para alinear la estrategia con tus objetivos.`,
    assumptions: `Presupuesto orientativo detectado: ${budget}. Este borrador se puede ajustar antes de enviarlo.`,
  };
}

function autofillQuote() {
  if (!state.selectedLead) return;
  const draft = buildQuoteSuggestion(state.selectedLead);
  el.quoteTitle.value = draft.title;
  el.quoteSummary.value = draft.summary;
  el.quoteScope.value = draft.scope;
  el.quoteBody.value = draft.body;
  el.quoteAssumptions.value = draft.assumptions;
}

async function saveQuote() {
  if (!state.selectedLead) return;

  el.quoteSaveBtn.disabled = true;
  el.quoteSaveBtn.classList.add("is-busy");
  setStatus(el.quoteSaveStatus, "Guardando borrador...");

  try {
    const payload = {
      title: el.quoteTitle.value,
      total: el.quoteTotal.value,
      summary: el.quoteSummary.value,
      scope: el.quoteScope.value,
      body: el.quoteBody.value,
      assumptions: el.quoteAssumptions.value,
      status: "draft",
      currency: "EUR",
    };

    const data = await fetchJson(`/api/crm/leads/${state.selectedLead.id}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    renderQuote(data.quote || null);
    setStatus(el.quoteSaveStatus, "Borrador guardado.", "ok");
  } catch (error) {
    setStatus(el.quoteSaveStatus, `No se pudo guardar: ${error.message}`, "error");
  } finally {
    el.quoteSaveBtn.disabled = false;
    el.quoteSaveBtn.classList.remove("is-busy");
  }
}

el.saveBtn.addEventListener("click", saveLead);
el.refreshBtn.addEventListener("click", loadLeads);
el.dateFilter.addEventListener("change", () => {
  state.leadPage = 0;
  renderLeadTable();
  renderLeadDetail();
});
el.sourceFilter.addEventListener("change", () => {
  state.leadPage = 0;
  renderLeadTable();
  renderLeadDetail();
});
el.leadPrevBtn.addEventListener("click", () => {
  if (state.leadPage <= 0) return;
  state.leadPage -= 1;
  renderLeadTable();
});
el.leadNextBtn.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(state.filteredLeads.length / LEAD_PAGE_SIZE));
  if (state.leadPage >= totalPages - 1) return;
  state.leadPage += 1;
  renderLeadTable();
});
el.quoteAutofillBtn.addEventListener("click", autofillQuote);
el.quoteSaveBtn.addEventListener("click", saveQuote);

loadLeads().catch((error) => {
  el.leadTableBody.innerHTML = `<tr><td colspan="8" class="empty">Error cargando CRM: ${error.message}</td></tr>`;
});
