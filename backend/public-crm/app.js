const state = {
  leads: [],
  selectedLead: null,
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
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
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
      <h3>${lead.name || lead.phone || lead.email || "Lead sin nombre"}</h3>
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
    return;
  }

  el.leadTitle.textContent = lead.name || lead.phone || lead.email || "Lead sin nombre";
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
}

async function loadMessages(conversationId) {
  const data = await fetchJson(`/api/crm/conversations/${conversationId}/messages`);
  renderMessages(data.messages || []);
}

async function selectLead(leadId) {
  state.selectedLead = state.leads.find((lead) => lead.id === leadId) || null;
  renderLeadList();
  renderLeadDetail();
  if (state.selectedLead?.conversation_id) {
    await loadMessages(state.selectedLead.conversation_id);
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

el.leadForm.addEventListener("submit", saveLead);
el.refreshBtn.addEventListener("click", loadLeads);

loadLeads().catch((error) => {
  el.leadList.innerHTML = `<div class="empty">Error cargando CRM: ${error.message}</div>`;
});
