const state = {
  leads: [],
  selectedLead: null,
  selectedQuote: null,
  messages: [],
  messagePage: 0,
};

const el = {
  leadList: document.getElementById("leadList"),
  leadTitle: document.getElementById("leadTitle"),
  leadChannel: document.getElementById("leadChannel"),
  leadMeta: document.getElementById("leadMeta"),
  messageList: document.getElementById("messageList"),
  leadForm: document.getElementById("leadForm"),
  crmStatus: document.getElementById("crmStatus"),
  quoteStatus: document.getElementById("quoteStatus"),
  assignedTo: document.getElementById("assignedTo"),
  nextAction: document.getElementById("nextAction"),
  followUpAt: document.getElementById("followUpAt"),
  internalNotes: document.getElementById("internalNotes"),
  refreshBtn: document.getElementById("refreshBtn"),
  quoteTitle: document.getElementById("quoteTitle"),
  quoteTotal: document.getElementById("quoteTotal"),
  quoteSummary: document.getElementById("quoteSummary"),
  quoteScope: document.getElementById("quoteScope"),
  quoteBody: document.getElementById("quoteBody"),
  quoteAssumptions: document.getElementById("quoteAssumptions"),
  quoteAutofillBtn: document.getElementById("quoteAutofillBtn"),
  quoteSaveBtn: document.getElementById("quoteSaveBtn"),
  historyTableBody: document.getElementById("historyTableBody"),
  historyCount: document.getElementById("historyCount"),
  historyPrevBtn: document.getElementById("historyPrevBtn"),
  historyNextBtn: document.getElementById("historyNextBtn"),
};

const HISTORY_PAGE_SIZE = 15;

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
  const data = await res.json();
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
  const blocked = new Set([
    "hola",
    "buenas",
    "buenas tardes",
    "buenos dias",
    "buenos días",
    "lead sin nombre",
  ]);

  return blocked.has(normalized) || text.length > 30;
}

function getLeadDisplayName(lead) {
  if (lead?.name && !looksGenericName(lead.name)) {
    return lead.name;
  }
  if (lead?.phone) return lead.phone;
  if (lead?.email) return lead.email;
  return "Lead sin nombre";
}

function renderLeadList() {
  el.leadList.innerHTML = "";

  if (!state.leads.length) {
    el.leadList.innerHTML = '<div class="empty">No hay leads todavia.</div>';
    return;
  }

  for (const lead of state.leads) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `lead-item${state.selectedLead?.id === lead.id ? " active" : ""}`;
    item.innerHTML = `
      <h3>${getLeadDisplayName(lead)}</h3>
      <p>${lead.interest_service || "Sin servicio"} · ${lead.crm_status || "nuevo"}</p>
      <small>${lead.channel || "web"} · ${fmtDate(lead.last_message?.created_at || lead.created_at)}</small>
    `;
    item.addEventListener("click", () => selectLead(lead.id));
    el.leadList.appendChild(item);
  }
}

function renderLeadDetail() {
  const lead = state.selectedLead;

  if (!lead) {
    el.leadTitle.textContent = "Selecciona un lead";
    el.leadChannel.textContent = "-";
    el.leadMeta.innerHTML = "";
    el.messageList.innerHTML = '<div class="empty">Selecciona una conversacion.</div>';
    renderHistoryTable([]);
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

function renderHistoryTable(messages = state.messages) {
  state.messages = messages || [];

  if (!state.messages.length) {
    state.messagePage = 0;
    el.historyTableBody.innerHTML = '<tr><td colspan="3" class="empty">No hay mensajes en esta conversacion.</td></tr>';
    el.historyCount.textContent = "0 mensajes";
    el.historyPrevBtn.disabled = true;
    el.historyNextBtn.disabled = true;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(state.messages.length / HISTORY_PAGE_SIZE));
  if (state.messagePage > totalPages - 1) {
    state.messagePage = totalPages - 1;
  }

  const start = state.messagePage * HISTORY_PAGE_SIZE;
  const pageItems = state.messages.slice(start, start + HISTORY_PAGE_SIZE);

  el.historyTableBody.innerHTML = pageItems
    .map(
      (msg) => `
        <tr>
          <td>${fmtDate(msg.created_at)}</td>
          <td><span class="history-role">${msg.role || "-"}</span></td>
          <td>${msg.content || ""}</td>
        </tr>
      `
    )
    .join("");

  el.historyCount.textContent = `${state.messages.length} mensajes · Página ${state.messagePage + 1} de ${totalPages}`;
  el.historyPrevBtn.disabled = state.messagePage === 0;
  el.historyNextBtn.disabled = state.messagePage >= totalPages - 1;
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

  renderLeadList();
  renderLeadDetail();

  if (state.selectedLead?.conversation_id) {
    await loadMessages(state.selectedLead.conversation_id);
  }

  if (state.selectedLead?.id) {
    await loadQuote(state.selectedLead.id);
  }
}

async function loadMessages(conversationId) {
  const data = await fetchJson(`/api/crm/conversations/${conversationId}/messages`);
  state.messagePage = 0;
  renderMessages(data.messages || []);
  renderHistoryTable(data.messages || []);
}

async function loadQuote(leadId) {
  const data = await fetchJson(`/api/crm/leads/${leadId}/quote`);
  renderQuote(data.quote || null);
}

async function selectLead(leadId) {
  state.selectedLead = state.leads.find((lead) => lead.id === leadId) || null;
  renderLeadList();
  renderLeadDetail();

  if (state.selectedLead?.conversation_id) {
    await loadMessages(state.selectedLead.conversation_id);
  } else {
    renderMessages([]);
    renderHistoryTable([]);
  }

  if (state.selectedLead?.id) {
    await loadQuote(state.selectedLead.id);
  } else {
    renderQuote(null);
  }
}

async function saveLead(event) {
  event.preventDefault();
  if (!state.selectedLead) return;

  const payload = {
    crm_status: el.crmStatus.value,
    quote_status: el.quoteStatus.value,
    assigned_to: el.assignedTo.value,
    next_action: el.nextAction.value,
    follow_up_at: el.followUpAt.value ? new Date(el.followUpAt.value).toISOString() : null,
    internal_notes: el.internalNotes.value,
  };

  await fetchJson(`/api/crm/leads/${state.selectedLead.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  await loadLeads();
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
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  renderQuote(data.quote || null);
  await loadLeads();
}

el.leadForm.addEventListener("submit", saveLead);
el.refreshBtn.addEventListener("click", loadLeads);
el.quoteAutofillBtn.addEventListener("click", autofillQuote);
el.quoteSaveBtn.addEventListener("click", saveQuote);
el.historyPrevBtn.addEventListener("click", () => {
  if (state.messagePage <= 0) return;
  state.messagePage -= 1;
  renderHistoryTable();
});
el.historyNextBtn.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(state.messages.length / HISTORY_PAGE_SIZE));
  if (state.messagePage >= totalPages - 1) return;
  state.messagePage += 1;
  renderHistoryTable();
});

loadLeads().catch((error) => {
  el.leadList.innerHTML = `<div class="empty">Error cargando CRM: ${error.message}</div>`;
});
