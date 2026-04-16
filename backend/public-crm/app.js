const state = {
  leads: [],
  filteredLeads: [],
  selectedLead: null,
  selectedQuote: null,
  leadPage: 0,
  quoteItems: [],
  analytics: null,
};

const LEAD_PAGE_SIZE = 15;
const API_BASE = `${window.location.origin}/api/crm`;

const el = {
  refreshBtn: document.getElementById("refreshBtn"),
  dateFilter: document.getElementById("dateFilter"),
  sourceFilter: document.getElementById("sourceFilter"),
  leadTitle: document.getElementById("leadTitle"),
  leadChannel: document.getElementById("leadChannel"),
  leadMeta: document.getElementById("leadMeta"),
  analyticsRangeLabel: document.getElementById("analyticsRangeLabel"),
  analyticsLeadsGenerated: document.getElementById("analyticsLeadsGenerated"),
  analyticsPassedWhatsapp: document.getElementById("analyticsPassedWhatsapp"),
  analyticsQuotesSent: document.getElementById("analyticsQuotesSent"),
  analyticsQuotesAccepted: document.getElementById("analyticsQuotesAccepted"),
  analyticsResponseTime: document.getElementById("analyticsResponseTime"),
  analyticsAcceptanceRate: document.getElementById("analyticsAcceptanceRate"),
  analyticsChannelBreakdown: document.getElementById("analyticsChannelBreakdown"),
  analyticsSourceBreakdown: document.getElementById("analyticsSourceBreakdown"),
  leadTableBody: document.getElementById("leadTableBody"),
  leadMobileList: document.getElementById("leadMobileList"),
  leadTableInfo: document.getElementById("leadTableInfo"),
  leadPrevBtn: document.getElementById("leadPrevBtn"),
  leadNextBtn: document.getElementById("leadNextBtn"),
  leadPaginationInfo: document.getElementById("leadPaginationInfo"),
  messageList: document.getElementById("messageList"),
  leadForm: document.getElementById("leadForm"),
  saveBtn: document.getElementById("saveBtn"),
  leadSaveStatus: document.getElementById("leadSaveStatus"),
  leadName: document.getElementById("leadName"),
  leadEmail: document.getElementById("leadEmail"),
  leadPhone: document.getElementById("leadPhone"),
  leadCompanyName: document.getElementById("leadCompanyName"),
  leadInterestService: document.getElementById("leadInterestService"),
  leadBudgetRange: document.getElementById("leadBudgetRange"),
  leadMainGoal: document.getElementById("leadMainGoal"),
  leadCurrentSituation: document.getElementById("leadCurrentSituation"),
  leadPainPoints: document.getElementById("leadPainPoints"),
  leadPreferredContactChannel: document.getElementById("leadPreferredContactChannel"),
  crmStatus: document.getElementById("crmStatus"),
  quoteStatus: document.getElementById("quoteStatus"),
  assignedTo: document.getElementById("assignedTo"),
  nextAction: document.getElementById("nextAction"),
  followUpAt: document.getElementById("followUpAt"),
  internalNotes: document.getElementById("internalNotes"),
  quoteTitle: document.getElementById("quoteTitle"),
  quoteCurrency: document.getElementById("quoteCurrency"),
  quoteBillingType: document.getElementById("quoteBillingType"),
  quoteBillingLabel: document.getElementById("quoteBillingLabel"),
  quoteTaxRate: document.getElementById("quoteTaxRate"),
  quoteSummary: document.getElementById("quoteSummary"),
  quoteScope: document.getElementById("quoteScope"),
  quoteBody: document.getElementById("quoteBody"),
  quoteAssumptions: document.getElementById("quoteAssumptions"),
  quotePreviewBtn: document.getElementById("quotePreviewBtn"),
  quotePdfBtn: document.getElementById("quotePdfBtn"),
  quoteSendEmailBtn: document.getElementById("quoteSendEmailBtn"),
  quoteSendWhatsappBtn: document.getElementById("quoteSendWhatsappBtn"),
  quoteAutofillBtn: document.getElementById("quoteAutofillBtn"),
  quoteSaveBtn: document.getElementById("quoteSaveBtn"),
  quoteAddItemBtn: document.getElementById("quoteAddItemBtn"),
  quoteItemsList: document.getElementById("quoteItemsList"),
  quoteSubtotal: document.getElementById("quoteSubtotal"),
  quoteTax: document.getElementById("quoteTax"),
  quoteTotal: document.getElementById("quoteTotal"),
  quoteSaveStatus: document.getElementById("quoteSaveStatus"),
};

function fmtDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("es-ES");
}

function fmtMoney(value, currency = "EUR") {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount);
}

function getDateFilterLabel(value) {
  if (value === "today") return "Hoy";
  if (value === "7d") return "Ultimos 7 dias";
  if (value === "30d") return "Ultimos 30 dias";
  return "Todas";
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
    throw new Error(`La API no devolvio JSON en ${options.method || "GET"} ${url}. Respuesta: ${preview || `HTTP ${res.status}`}`);
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
  el.leadMobileList.innerHTML = "";

  if (!state.filteredLeads.length) {
    el.leadTableBody.innerHTML =
      '<tr><td colspan="8" class="empty">No hay leads para esos filtros.</td></tr>';
    el.leadMobileList.innerHTML = '<div class="empty">No hay leads para esos filtros.</div>';
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
      <td data-label="Nombre de lead"><button type="button" class="lead-name-btn">${getLeadDisplayName(lead)}</button></td>
      <td data-label="Servicio">${lead.interest_service || "-"}</td>
      <td data-label="Presupuesto">${lead.budget_range || "-"}</td>
      <td data-label="Canal">${lead.channel || "web"}</td>
      <td data-label="Telefono">${lead.phone || "-"}</td>
      <td data-label="Email">${lead.email || "-"}</td>
      <td data-label="Fecha">${fmtDate(lead.last_message?.created_at || lead.created_at)}</td>
      <td data-label="Status"><span class="status-pill">${lead.crm_status || "nuevo"}</span></td>
    `;
    row.addEventListener("click", () => selectLead(lead.id));
    row.querySelector(".lead-name-btn")?.addEventListener("click", (event) => {
      event.stopPropagation();
      selectLead(lead.id);
    });
    el.leadTableBody.appendChild(row);

    const mobileCard = document.createElement("details");
    mobileCard.className = `lead-mobile-card${state.selectedLead?.id === lead.id ? " active" : ""}`;
    if (state.selectedLead?.id === lead.id) {
      mobileCard.open = true;
    }
    mobileCard.innerHTML = `
      <summary>
        <div class="lead-mobile-summary">
          <div class="lead-mobile-main">
            <strong>${getLeadDisplayName(lead)}</strong>
            <span>${lead.interest_service || "Sin servicio"}</span>
          </div>
          <div class="lead-mobile-meta-top">
            <span class="status-pill">${lead.crm_status || "nuevo"}</span>
            <time>${fmtDate(lead.last_message?.created_at || lead.created_at)}</time>
          </div>
        </div>
      </summary>
      <div class="lead-mobile-details">
        <div><span>Canal</span><strong>${lead.channel || "web"}</strong></div>
        <div><span>Presupuesto</span><strong>${lead.budget_range || "-"}</strong></div>
        <div><span>Telefono</span><strong>${lead.phone || "-"}</strong></div>
        <div><span>Email</span><strong>${lead.email || "-"}</strong></div>
        <button type="button" class="lead-mobile-open-btn">Abrir lead</button>
      </div>
    `;
    mobileCard.addEventListener("toggle", () => {
      if (!mobileCard.open) return;
      el.leadMobileList
        .querySelectorAll(".lead-mobile-card")
        .forEach((card) => {
          if (card !== mobileCard) card.open = false;
        });
    });
    mobileCard.querySelector(".lead-mobile-open-btn")?.addEventListener("click", () => {
      selectLead(lead.id);
    });
    el.leadMobileList.appendChild(mobileCard);
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
    <div class="meta-box"><strong>Origen</strong>${lead.source_platform || "-"}</div>
    <div class="meta-box"><strong>Campaña</strong>${lead.source_campaign || "-"}</div>
  `;

  el.crmStatus.value = lead.crm_status || "nuevo";
  el.quoteStatus.value = lead.quote_status || "sin_presupuesto";
  el.leadName.value = lead.name || "";
  el.leadEmail.value = lead.email || "";
  el.leadPhone.value = lead.phone || "";
  el.leadCompanyName.value = lead.company_name || "";
  el.leadInterestService.value = lead.interest_service || "";
  el.leadBudgetRange.value = lead.budget_range || "";
  el.leadMainGoal.value = lead.main_goal || "";
  el.leadCurrentSituation.value = lead.current_situation || "";
  el.leadPainPoints.value = lead.pain_points || "";
  el.leadPreferredContactChannel.value = lead.preferred_contact_channel || "";
  el.assignedTo.value = lead.assigned_to || "";
  el.nextAction.value = lead.next_action || "";
  el.followUpAt.value = toDatetimeLocal(lead.follow_up_at);
  el.internalNotes.value = lead.internal_notes || "";
}

function renderBreakdown(target, rows = []) {
  if (!target) return;

  if (!rows.length) {
    target.innerHTML = '<div class="empty">Sin datos todavia.</div>';
    return;
  }

  target.innerHTML = rows
    .map(
      (row) => `
        <div class="analytics-breakdown-row">
          <span>${row.label || "-"}</span>
          <strong>${row.value ?? 0}</strong>
        </div>
      `
    )
    .join("");
}

function renderAnalytics() {
  const analytics = state.analytics;

  el.analyticsRangeLabel.textContent = getDateFilterLabel(el.dateFilter.value);

  if (!analytics) {
    el.analyticsLeadsGenerated.textContent = "-";
    el.analyticsPassedWhatsapp.textContent = "-";
    el.analyticsQuotesSent.textContent = "-";
    el.analyticsQuotesAccepted.textContent = "-";
    el.analyticsResponseTime.textContent = "-";
    el.analyticsAcceptanceRate.textContent = "-";
    renderBreakdown(el.analyticsChannelBreakdown, []);
    renderBreakdown(el.analyticsSourceBreakdown, []);
    return;
  }

  const totals = analytics.totals || {};
  el.analyticsLeadsGenerated.textContent = totals.leads_generated ?? 0;
  el.analyticsPassedWhatsapp.textContent = totals.passed_to_whatsapp ?? 0;
  el.analyticsQuotesSent.textContent = totals.quotes_sent ?? 0;
  el.analyticsQuotesAccepted.textContent = totals.quotes_accepted ?? 0;
  el.analyticsResponseTime.textContent = totals.average_response_label || "-";
  el.analyticsAcceptanceRate.textContent = `${totals.acceptance_rate ?? 0}%`;

  renderBreakdown(el.analyticsChannelBreakdown, analytics?.breakdowns?.channel || []);
  renderBreakdown(el.analyticsSourceBreakdown, analytics?.breakdowns?.source || []);
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
  state.quoteItems = Array.isArray(content.items) && content.items.length
    ? content.items.map((item) => ({
        concept: item?.concept || "",
        quantity: Number(item?.quantity || 1),
        unit_price: Number(item?.unit_price || 0),
      }))
    : [];

  el.quoteTitle.value = quote?.title || "";
  el.quoteCurrency.value = quote?.currency || "EUR";
  el.quoteBillingType.value = content.billing_type || "monthly";
  el.quoteBillingLabel.value = content.billing_label || "";
  el.quoteTaxRate.value = content.tax_rate ?? 21;
  el.quoteSummary.value = content.summary || "";
  el.quoteScope.value = content.scope || "";
  el.quoteBody.value = content.body || "";
  el.quoteAssumptions.value = content.assumptions || "";
  renderQuoteItems();
  updateQuoteTotals();
}

function setStatus(target, message = "", kind = "") {
  if (!target) return;
  target.textContent = message;
  target.className = `save-status${kind ? ` ${kind}` : ""}`;
}

async function getServiceFacts(serviceName) {
  if (!serviceName) return null;
  const encoded = encodeURIComponent(serviceName);
  const data = await fetchJson(`${API_BASE}/service-facts/${encoded}`);
  return data.facts || null;
}

async function loadLeads() {
  const data = await fetchJson(`${API_BASE}/leads`);
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

  try {
    await loadAnalytics();
  } catch (error) {
    console.warn("CRM analytics load failed", error);
    state.analytics = null;
    renderAnalytics();
  }
}

async function loadAnalytics() {
  const params = new URLSearchParams({
    channel: el.sourceFilter.value || "all",
    date_range: el.dateFilter.value || "all",
  });
  const data = await fetchJson(`${API_BASE}/analytics?${params.toString()}`);
  state.analytics = data.analytics || null;
  renderAnalytics();
}

async function loadMessages(conversationId) {
  const data = await fetchJson(`${API_BASE}/conversations/${conversationId}/messages`);
  renderMessages(data.messages || []);
}

async function loadQuote(leadId) {
  const data = await fetchJson(`${API_BASE}/leads/${leadId}/quote`);
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
      name: el.leadName.value,
      email: el.leadEmail.value,
      phone: el.leadPhone.value,
      company_name: el.leadCompanyName.value,
      interest_service: el.leadInterestService.value,
      budget_range: el.leadBudgetRange.value,
      main_goal: el.leadMainGoal.value,
      current_situation: el.leadCurrentSituation.value,
      pain_points: el.leadPainPoints.value,
      preferred_contact_channel: el.leadPreferredContactChannel.value,
      crm_status: el.crmStatus.value,
      quote_status: el.quoteStatus.value,
      assigned_to: el.assignedTo.value,
      next_action: el.nextAction.value,
      follow_up_at: el.followUpAt.value ? new Date(el.followUpAt.value).toISOString() : null,
      internal_notes: el.internalNotes.value,
    };

    const response = await fetchJson(`${API_BASE}/leads/${state.selectedLead.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response?.lead) {
      state.selectedLead = {
        ...state.selectedLead,
        ...response.lead,
        channel: state.selectedLead.channel,
        external_user_id: state.selectedLead.external_user_id,
        conversation_created_at: state.selectedLead.conversation_created_at,
        last_message: state.selectedLead.last_message,
      };
      state.leads = state.leads.map((lead) =>
        lead.id === state.selectedLead.id ? { ...lead, ...state.selectedLead } : lead
      );
      renderLeadTable();
      renderLeadDetail();
    }

    setStatus(el.leadSaveStatus, "Cambios guardados.", "ok");

    loadLeads().catch((error) => {
      console.warn("CRM reload after save failed", error);
      setStatus(el.leadSaveStatus, "Cambios guardados. La recarga automatica ha fallado, pero el lead esta actualizado.", "ok");
    });
  } catch (error) {
    setStatus(el.leadSaveStatus, `No se pudo guardar: ${error.message}`, "error");
  } finally {
    el.saveBtn.disabled = false;
    el.saveBtn.classList.remove("is-busy");
  }
}

function buildServiceItems(service, serviceFacts = null) {
  const normalizedService = String(service || "").toLowerCase();

  if (normalizedService.includes("google ads")) {
    return [
      { concept: "Auditoria y planteamiento inicial de Google Ads", quantity: 1, unit_price: 190 },
      { concept: "Configuracion y estructura de campañas", quantity: 1, unit_price: 210 },
      { concept: "Gestion mensual y optimizacion continua", quantity: 1, unit_price: 300 },
    ];
  }

  if (normalizedService.includes("seo")) {
    return [
      { concept: "Auditoria SEO inicial", quantity: 1, unit_price: 180 },
      { concept: "Plan de contenidos y palabras clave", quantity: 1, unit_price: 160 },
      { concept: "Optimizacion mensual SEO", quantity: 1, unit_price: 280 },
    ];
  }

  if (normalizedService.includes("meta ads") || normalizedService.includes("redes")) {
    return [
      { concept: "Auditoria inicial de campañas", quantity: 1, unit_price: 180 },
      { concept: "Preparacion creativa y estructura de campañas", quantity: 1, unit_price: 220 },
      { concept: "Gestion mensual y optimizacion", quantity: 1, unit_price: 300 },
    ];
  }

  const fallbackPrice = String(serviceFacts?.min_monthly_fee || serviceFacts?.min_project_fee || "")
    .match(/(\d+)/)?.[1];

  return [
    {
      concept: `Servicio base de ${service}`,
      quantity: 1,
      unit_price: fallbackPrice ? Number(fallbackPrice) : 300,
    },
  ];
}

function inferBillingType(service) {
  const normalizedService = String(service || "").toLowerCase();

  if (
    normalizedService.includes("google ads") ||
    normalizedService.includes("seo") ||
    normalizedService.includes("meta ads") ||
    normalizedService.includes("redes")
  ) {
    return "monthly";
  }

  if (
    normalizedService.includes("web") ||
    normalizedService.includes("dise") ||
    normalizedService.includes("consultor")
  ) {
    return "one_time";
  }

  return "custom";
}

function getBillingTypeLabel(value) {
  if (value === "monthly") return "Mensual";
  if (value === "one_time") return "Pago unico";
  if (value === "custom") return "Personalizado";
  return "Mensual";
}

function buildQuoteSuggestion(lead, serviceFacts = null) {
  const service = lead?.interest_service || "servicio de marketing";
  const business = lead?.business_activity || lead?.business_type || "tu proyecto";
  const goal = lead?.main_goal || "mejorar resultados";
  const items = buildServiceItems(service, serviceFacts);
  const billingType = inferBillingType(service);
  const billingLabel = getBillingTypeLabel(billingType);
  const includedBase = serviceFacts?.description
    ? serviceFacts.description
    : [
        "Analisis inicial del negocio y del punto de partida.",
        `Definicion de estrategia para ${service}.`,
        "Configuracion y optimizacion continua.",
        "Seguimiento de resultados y mejoras.",
      ].join(" ");

  return {
    title: `Propuesta ${service}`,
    summary: `${service} para ${business}`,
    tax_rate: 21,
    billing_type: billingType,
    billing_label: billingLabel,
    items,
    scope: includedBase,
    body: `Te compartimos una propuesta inicial de ${service} para ${business}, orientada a ${goal}. Puedes revisarla y ajustarla antes del envio definitivo al cliente.`,
    assumptions: "",
  };
}

async function autofillQuote() {
  if (!state.selectedLead) return;
  let serviceFacts = null;
  try {
    serviceFacts = await getServiceFacts(state.selectedLead.interest_service);
  } catch (_error) {
    serviceFacts = null;
  }

  const draft = buildQuoteSuggestion(state.selectedLead, serviceFacts);
  el.quoteTitle.value = draft.title;
  el.quoteBillingType.value = draft.billing_type;
  el.quoteBillingLabel.value = draft.billing_label;
  el.quoteTaxRate.value = draft.tax_rate;
  el.quoteSummary.value = draft.summary;
  el.quoteScope.value = draft.scope;
  el.quoteBody.value = draft.body;
  el.quoteAssumptions.value = draft.assumptions;
  state.quoteItems = draft.items.map((item) => ({ ...item }));
  renderQuoteItems();
  updateQuoteTotals();
}

function createEmptyQuoteItem() {
  return { concept: "", quantity: 1, unit_price: 0 };
}

function renderQuoteItems() {
  el.quoteItemsList.innerHTML = "";

  if (!state.quoteItems.length) {
    el.quoteItemsList.innerHTML = '<div class="empty">No hay partidas todavia.</div>';
    return;
  }

  state.quoteItems.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "quote-item";
    row.innerHTML = `
      <label>
        Concepto
        <input type="text" data-field="concept" data-index="${index}" value="${item.concept || ""}" />
      </label>
      <label>
        Cantidad
        <input type="number" min="0" step="1" data-field="quantity" data-index="${index}" value="${item.quantity || 1}" />
      </label>
      <label>
        Precio unitario
        <input type="number" min="0" step="0.01" data-field="unit_price" data-index="${index}" value="${item.unit_price || 0}" />
      </label>
      <button type="button" class="quote-item-remove" data-remove-index="${index}">Quitar</button>
    `;
    el.quoteItemsList.appendChild(row);
  });

  el.quoteItemsList.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", handleQuoteItemChange);
  });

  el.quoteItemsList.querySelectorAll("[data-remove-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-remove-index"));
      state.quoteItems.splice(index, 1);
      renderQuoteItems();
      updateQuoteTotals();
    });
  });
}

function handleQuoteItemChange(event) {
  const field = event.target.getAttribute("data-field");
  const index = Number(event.target.getAttribute("data-index"));
  if (!field || Number.isNaN(index) || !state.quoteItems[index]) return;

  if (field === "concept") {
    state.quoteItems[index][field] = event.target.value;
  } else {
    state.quoteItems[index][field] = Number(event.target.value || 0);
  }

  updateQuoteTotals();
}

function calculateQuoteTotals() {
  const subtotal = state.quoteItems.reduce((sum, item) => {
    const qty = Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0;
    const price = Number.isFinite(Number(item.unit_price)) ? Number(item.unit_price) : 0;
    return sum + qty * price;
  }, 0);

  const taxRate = Number.isFinite(Number(el.quoteTaxRate.value)) ? Number(el.quoteTaxRate.value) : 0;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  return { subtotal, tax, total, taxRate };
}

function updateQuoteTotals() {
  const { subtotal, tax, total } = calculateQuoteTotals();
  const currency = el.quoteCurrency.value || "EUR";
  el.quoteSubtotal.textContent = fmtMoney(subtotal, currency);
  el.quoteTax.textContent = fmtMoney(tax, currency);
  el.quoteTotal.textContent = fmtMoney(total, currency);
}

async function saveQuote() {
  if (!state.selectedLead) return;

  el.quoteSaveBtn.disabled = true;
  el.quoteSaveBtn.classList.add("is-busy");
  setStatus(el.quoteSaveStatus, "Guardando borrador...");

  try {
    const payload = {
      title: el.quoteTitle.value,
      subtotal: calculateQuoteTotals().subtotal,
      tax: calculateQuoteTotals().tax,
      total: calculateQuoteTotals().total,
      currency: el.quoteCurrency.value || "EUR",
      billing_type: el.quoteBillingType.value || "monthly",
      billing_label: el.quoteBillingLabel.value,
      summary: el.quoteSummary.value,
      scope: el.quoteScope.value,
      body: el.quoteBody.value,
      assumptions: el.quoteAssumptions.value,
      items: state.quoteItems,
      tax_rate: calculateQuoteTotals().taxRate,
      status: "draft",
    };

    const data = await fetchJson(`${API_BASE}/leads/${state.selectedLead.id}/quote`, {
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

async function sendQuote(via) {
  if (!state.selectedLead) return;

  const button =
    via === "email" ? el.quoteSendEmailBtn : el.quoteSendWhatsappBtn;
  const label = via === "email" ? "email" : "WhatsApp";

  button.disabled = true;
  button.classList.add("is-busy");
  setStatus(el.quoteSaveStatus, `Enviando por ${label}...`);

  try {
    const data = await fetchJson(`${API_BASE}/leads/${state.selectedLead.id}/quote/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ via }),
    });

    if (data?.quote) {
      renderQuote(data.quote);
      state.selectedLead = {
        ...state.selectedLead,
        quote_status: "sent",
      };
      state.leads = state.leads.map((lead) =>
        lead.id === state.selectedLead.id ? { ...lead, quote_status: "sent" } : lead
      );
      renderLeadTable();
      renderLeadDetail();
    }

    setStatus(el.quoteSaveStatus, `Propuesta enviada por ${label}.`, "ok");
  } catch (error) {
    setStatus(el.quoteSaveStatus, `No se pudo enviar por ${label}: ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.classList.remove("is-busy");
  }
}

el.saveBtn.addEventListener("click", saveLead);
el.refreshBtn.addEventListener("click", loadLeads);
el.dateFilter.addEventListener("change", () => {
  state.leadPage = 0;
  renderLeadTable();
  renderLeadDetail();
  loadAnalytics().catch((error) => {
    console.warn("CRM analytics reload failed", error);
  });
});
el.sourceFilter.addEventListener("change", () => {
  state.leadPage = 0;
  renderLeadTable();
  renderLeadDetail();
  loadAnalytics().catch((error) => {
    console.warn("CRM analytics reload failed", error);
  });
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
el.quotePreviewBtn.addEventListener("click", () => {
  if (!state.selectedLead?.id) return;
  window.open(`/crm/quotes/${state.selectedLead.id}/preview`, "_blank", "noopener,noreferrer");
});
el.quotePdfBtn.addEventListener("click", () => {
  if (!state.selectedLead?.id) return;
  window.open(`/crm/quotes/${state.selectedLead.id}/preview?print=1`, "_blank", "noopener,noreferrer");
});
el.quoteSendEmailBtn.addEventListener("click", () => sendQuote("email"));
el.quoteSendWhatsappBtn.addEventListener("click", () => sendQuote("whatsapp"));
el.quoteAddItemBtn.addEventListener("click", () => {
  state.quoteItems.push(createEmptyQuoteItem());
  renderQuoteItems();
  updateQuoteTotals();
});
el.quoteTaxRate.addEventListener("input", updateQuoteTotals);
el.quoteCurrency.addEventListener("input", updateQuoteTotals);
el.quoteBillingType.addEventListener("change", () => {
  const nextLabel = getBillingTypeLabel(el.quoteBillingType.value);
  if (!el.quoteBillingLabel.value.trim() || ["Mensual", "Pago unico", "Personalizado"].includes(el.quoteBillingLabel.value.trim())) {
    el.quoteBillingLabel.value = nextLabel;
  }
});

loadLeads().catch((error) => {
  el.leadTableBody.innerHTML = `<tr><td colspan="8" class="empty">Error cargando CRM: ${error.message}</td></tr>`;
});
