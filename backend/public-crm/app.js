const state = {
  currentUser: null,
  needsBootstrap: false,
  accounts: [],
  activeAccountId: null,
  adminOverview: [],
  leads: [],
  filteredLeads: [],
  selectedLead: null,
  selectedQuote: null,
  leadPage: 0,
  quoteItems: [],
  analytics: null,
  appConfig: null,
};

const LEAD_PAGE_SIZE = 15;
const API_BASE = `${window.location.origin}/api/crm`;
const ACCOUNT_STORAGE_KEY = "crmActiveAccountId";
const MESSAGE_TEMPLATE_ORDER = [
  "whatsapp_first_contact",
  "email_first_contact",
  "quote_whatsapp",
  "quote_email",
  "recovery_whatsapp",
  "recovery_email",
];
const AUTOMATION_FLOW_ORDER = ["lead_recovery", "quote_followup"];

const el = {
  crmPage: document.querySelector(".crm-page"),
  crmAuthShell: document.getElementById("crmAuthShell"),
  crmAuthTitle: document.getElementById("crmAuthTitle"),
  crmAuthCopy: document.getElementById("crmAuthCopy"),
  crmAuthStatus: document.getElementById("crmAuthStatus"),
  crmLoginForm: document.getElementById("crmLoginForm"),
  crmLoginEmail: document.getElementById("crmLoginEmail"),
  crmLoginPassword: document.getElementById("crmLoginPassword"),
  crmLoginBtn: document.getElementById("crmLoginBtn"),
  crmBootstrapForm: document.getElementById("crmBootstrapForm"),
  crmBootstrapName: document.getElementById("crmBootstrapName"),
  crmBootstrapEmail: document.getElementById("crmBootstrapEmail"),
  crmBootstrapPassword: document.getElementById("crmBootstrapPassword"),
  crmBootstrapBtn: document.getElementById("crmBootstrapBtn"),
  crmAuthSwitchBtn: document.getElementById("crmAuthSwitchBtn"),
  crmSidebar: document.querySelector(".crm-sidebar"),
  accountSelect: document.getElementById("accountSelect"),
  accountPlanBadge: document.getElementById("accountPlanBadge"),
  refreshBtn: document.getElementById("refreshBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  crmViewAdminBtn: document.getElementById("crmViewAdminBtn"),
  crmViewSalesBtn: document.getElementById("crmViewSalesBtn"),
  crmViewConfigBtn: document.getElementById("crmViewConfigBtn"),
  crmViewAdmin: document.getElementById("crmViewAdmin"),
  crmViewSales: document.getElementById("crmViewSales"),
  crmViewConfig: document.getElementById("crmViewConfig"),
  crmMobileControls: document.getElementById("crmMobileControls"),
  crmAnalyticsAccordion: document.getElementById("crmAnalyticsAccordion"),
  crmMobileBottomNav: document.getElementById("crmMobileBottomNav"),
  crmMobileConfigBtn: document.getElementById("crmMobileConfigBtn"),
  mobileDateFilter: document.getElementById("mobileDateFilter"),
  crmSidebarFilters: document.getElementById("crmSidebarFilters"),
  crmSidebarFlow: document.getElementById("crmSidebarFlow"),
  crmSalesLinks: [...document.querySelectorAll(".crm-sales-link")],
  crmBrandEyebrow: document.getElementById("crmBrandEyebrow"),
  crmBrandTitle: document.getElementById("crmBrandTitle"),
  crmSidebarLogo: document.getElementById("crmSidebarLogo"),
  crmSidebarTitle: document.getElementById("crmSidebarTitle"),
  configForm: document.getElementById("configForm"),
  configBackBtn: document.getElementById("configBackBtn"),
  configSaveBtn: document.getElementById("configSaveBtn"),
  configSaveStatus: document.getElementById("configSaveStatus"),
  configTabGeneral: document.getElementById("configTabGeneral"),
  configTabMessages: document.getElementById("configTabMessages"),
  configTabAutomations: document.getElementById("configTabAutomations"),
  configTabIntegrations: document.getElementById("configTabIntegrations"),
  configTabWebsite: document.getElementById("configTabWebsite"),
  configPanelGeneral: document.getElementById("configPanelGeneral"),
  configPanelMessages: document.getElementById("configPanelMessages"),
  configPanelAutomations: document.getElementById("configPanelAutomations"),
  configPanelIntegrations: document.getElementById("configPanelIntegrations"),
  configPanelWebsite: document.getElementById("configPanelWebsite"),
  configBrandName: document.getElementById("configBrandName"),
  configWebsiteUrl: document.getElementById("configWebsiteUrl"),
  configBootstrapUrl: document.getElementById("configBootstrapUrl"),
  configAnalyzeWebsiteBtn: document.getElementById("configAnalyzeWebsiteBtn"),
  configAnalyzeStatus: document.getElementById("configAnalyzeStatus"),
  configBootstrapSummary: document.getElementById("configBootstrapSummary"),
  configLogoFile: document.getElementById("configLogoFile"),
  configLogoPreview: document.getElementById("configLogoPreview"),
  configLogoClearBtn: document.getElementById("configLogoClearBtn"),
  configLogoUrl: document.getElementById("configLogoUrl"),
  configPublicWhatsappNumber: document.getElementById("configPublicWhatsappNumber"),
  configHumanWhatsappNumber: document.getElementById("configHumanWhatsappNumber"),
  configSupportEmail: document.getElementById("configSupportEmail"),
  configAgentTone: document.getElementById("configAgentTone"),
  configFinalCtaLabel: document.getElementById("configFinalCtaLabel"),
  configHandoffTargetChannel: document.getElementById("configHandoffTargetChannel"),
  configPrimaryColor: document.getElementById("configPrimaryColor"),
  configAccentColor: document.getElementById("configAccentColor"),
  configPromptAdditions: document.getElementById("configPromptAdditions"),
  configWhatsappProvider: document.getElementById("configWhatsappProvider"),
  configWhatsappStatusLabel: document.getElementById("configWhatsappStatusLabel"),
  configWhatsappPhoneNumberId: document.getElementById("configWhatsappPhoneNumberId"),
  configWhatsappBusinessAccountId: document.getElementById("configWhatsappBusinessAccountId"),
  configWhatsappStatusBadge: document.getElementById("configWhatsappStatusBadge"),
  configValidateWhatsappBtn: document.getElementById("configValidateWhatsappBtn"),
  configWhatsappValidationMessage: document.getElementById("configWhatsappValidationMessage"),
  configWhatsappLastValidated: document.getElementById("configWhatsappLastValidated"),
  configMetaLeadSource: document.getElementById("configMetaLeadSource"),
  configGoogleLeadSource: document.getElementById("configGoogleLeadSource"),
  configLeadSheetDocument: document.getElementById("configLeadSheetDocument"),
  configLeadSheetTabs: document.getElementById("configLeadSheetTabs"),
  configLeadWebhookUrl: document.getElementById("configLeadWebhookUrl"),
  configValidateLeadFormsBtn: document.getElementById("configValidateLeadFormsBtn"),
  configLeadFormsValidationMessage: document.getElementById("configLeadFormsValidationMessage"),
  configLeadFormsLastValidated: document.getElementById("configLeadFormsLastValidated"),
  configEmailProvider: document.getElementById("configEmailProvider"),
  configEmailFromAddress: document.getElementById("configEmailFromAddress"),
  configEmailReplyTo: document.getElementById("configEmailReplyTo"),
  configValidateEmailBtn: document.getElementById("configValidateEmailBtn"),
  configEmailValidationMessage: document.getElementById("configEmailValidationMessage"),
  configEmailLastValidated: document.getElementById("configEmailLastValidated"),
  configAutomationPlatform: document.getElementById("configAutomationPlatform"),
  configAutomationWorkspaceUrl: document.getElementById("configAutomationWorkspaceUrl"),
  configAutomationNotes: document.getElementById("configAutomationNotes"),
  configValidateAutomationsBtn: document.getElementById("configValidateAutomationsBtn"),
  configAutomationsValidationMessage: document.getElementById("configAutomationsValidationMessage"),
  configAutomationsLastValidated: document.getElementById("configAutomationsLastValidated"),
  configMessageTemplatesList: document.getElementById("configMessageTemplatesList"),
  configAutomationFlowsList: document.getElementById("configAutomationFlowsList"),
  configServicesList: document.getElementById("configServicesList"),
  configAddServiceBtn: document.getElementById("configAddServiceBtn"),
  adminOverviewGrid: document.getElementById("adminOverviewGrid"),
  adminCreateName: document.getElementById("adminCreateName"),
  adminCreateSlug: document.getElementById("adminCreateSlug"),
  adminCreatePlan: document.getElementById("adminCreatePlan"),
  adminCreateStatus: document.getElementById("adminCreateStatus"),
  adminCreateDefault: document.getElementById("adminCreateDefault"),
  adminCreateAdminEmail: document.getElementById("adminCreateAdminEmail"),
  adminCreateAdminPassword: document.getElementById("adminCreateAdminPassword"),
  adminCreateAdminDisplayName: document.getElementById("adminCreateAdminDisplayName"),
  adminCreateAccountBtn: document.getElementById("adminCreateAccountBtn"),
  adminAccountStatus: document.getElementById("adminAccountStatus"),
  dateFilter: document.getElementById("dateFilter"),
  sourceFilter: document.getElementById("sourceFilter"),
  serviceFilter: document.getElementById("serviceFilter"),
  leadTitle: document.getElementById("leadTitle"),
  leadChannel: document.getElementById("leadChannel"),
  leadMeta: document.getElementById("leadMeta"),
  analyticsRangeLabel: document.getElementById("analyticsRangeLabel"),
  analyticsLeadsGenerated: document.getElementById("analyticsLeadsGenerated"),
  analyticsPassedWhatsapp: document.getElementById("analyticsPassedWhatsapp"),
  analyticsWhatsappHint: document.getElementById("analyticsWhatsappHint"),
  analyticsQuotesSent: document.getElementById("analyticsQuotesSent"),
  analyticsQuotesAccepted: document.getElementById("analyticsQuotesAccepted"),
  analyticsResponseTime: document.getElementById("analyticsResponseTime"),
  analyticsAcceptanceRate: document.getElementById("analyticsAcceptanceRate"),
  analyticsChannelBreakdown: document.getElementById("analyticsChannelBreakdown"),
  analyticsSourceBreakdown: document.getElementById("analyticsSourceBreakdown"),
  analyticsServiceBreakdown: document.getElementById("analyticsServiceBreakdown"),
  analyticsTimeline: document.getElementById("analyticsTimeline"),
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

function setAuthMode(mode = "login") {
  const isBootstrap = mode === "bootstrap";
  state.needsBootstrap = isBootstrap;
  el.crmLoginForm?.classList.toggle("is-hidden", isBootstrap);
  el.crmBootstrapForm?.classList.toggle("is-hidden", !isBootstrap);
  el.crmAuthSwitchBtn?.classList.toggle("is-hidden", !isBootstrap);
  if (el.crmAuthTitle) {
    el.crmAuthTitle.textContent = isBootstrap ? "Crear super admin" : "Acceso CRM";
  }
  if (el.crmAuthCopy) {
    el.crmAuthCopy.textContent = isBootstrap
      ? "Este es el primer acceso. Crea la cuenta administradora principal del sistema."
      : "Entra como super admin o como administrador de una cuenta cliente.";
  }
}

function setAuthenticatedUi(isAuthenticated) {
  el.crmAuthShell?.classList.toggle("is-hidden", isAuthenticated);
  el.crmPage?.classList.toggle("is-hidden", !isAuthenticated);
}

function getDefaultViewForRole() {
  return state.currentUser?.role === "super_admin" ? "admin" : "sales";
}

function getStoredAccountId() {
  try {
    return window.localStorage.getItem(ACCOUNT_STORAGE_KEY) || "";
  } catch (_error) {
    return "";
  }
}

function setStoredAccountId(value) {
  try {
    if (value) {
      window.localStorage.setItem(ACCOUNT_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    }
  } catch (_error) {
    // noop
  }
}

function getRequestedAccountId() {
  const url = new URL(window.location.href);
  return (
    String(url.searchParams.get("account_id") || "").trim() ||
    String(url.searchParams.get("account") || "").trim() ||
    getStoredAccountId()
  );
}

function withAccountScope(url) {
  const accountId = String(state.activeAccountId || "").trim();
  if (!accountId) return url;

  const next = new URL(url, window.location.origin);
  if (next.pathname.startsWith("/api/") || next.pathname.startsWith("/crm/")) {
    next.searchParams.set("account_id", accountId);
  }
  return next.toString();
}

function prettyJson(value) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch (_error) {
    return "{}";
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeAssetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "./assets/tmedia-global-logo.png";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  return raw;
}

function applyBrandTheme(config = {}) {
  const brand = config?.brand || {};
  const primary = brand.primary_color || "#6d41f3";
  const accent = brand.accent_color || "#8d58ff";
  const logoUrl = normalizeAssetUrl(brand.logo_url);
  const brandName = brand.name || "TMedia Global";

  const root = document.documentElement;
  root.style.setProperty("--accent", primary);
  root.style.setProperty("--accent-dark", primary);
  root.style.setProperty("--accent-line", accent);
  root.style.setProperty("--sidebar-start", primary);
  root.style.setProperty("--sidebar-mid", accent);
  root.style.setProperty("--sidebar-end", primary);

  if (el.crmSidebarLogo) {
    el.crmSidebarLogo.src = logoUrl;
    el.crmSidebarLogo.alt = brandName;
  }
  if (el.crmSidebarTitle) {
    el.crmSidebarTitle.textContent = brandName;
  }
  if (el.crmBrandEyebrow) {
    el.crmBrandEyebrow.textContent = brandName;
  }
  if (el.crmBrandTitle) {
    el.crmBrandTitle.textContent = "CRM Comercial";
  }
  document.title = `CRM ${brandName}`;
}

function updateConfigLogoPreview(value) {
  const logoUrl = normalizeAssetUrl(value);
  if (el.configLogoPreview) {
    el.configLogoPreview.src = logoUrl;
    el.configLogoPreview.alt = state.appConfig?.brand?.name || "Logo de marca";
  }
}

function fmtShortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("es-ES", {
        dateStyle: "short",
        timeStyle: "short",
      });
}

function getValidationTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "connected") return "ok";
  if (normalized === "warning") return "warning";
  return "pending";
}

function renderIntegrationValidation(type, validation = {}, badgeText = "") {
  const tone = getValidationTone(validation?.status);
  const fallbackMessage = validation?.message || "Sin validar todavia";
  const lastValidated = validation?.last_validated_at
    ? `Ultima validacion: ${fmtShortDate(validation.last_validated_at)}`
    : "Ultima validacion: -";

  const map = {
    whatsapp: {
      badge: el.configWhatsappStatusBadge,
      message: el.configWhatsappValidationMessage,
      timestamp: el.configWhatsappLastValidated,
    },
    lead_forms: {
      badge: null,
      message: el.configLeadFormsValidationMessage,
      timestamp: el.configLeadFormsLastValidated,
    },
    email: {
      badge: null,
      message: el.configEmailValidationMessage,
      timestamp: el.configEmailLastValidated,
    },
    automations: {
      badge: null,
      message: el.configAutomationsValidationMessage,
      timestamp: el.configAutomationsLastValidated,
    },
  };

  const target = map[type];
  if (!target) return;

  if (target.badge) {
    target.badge.textContent = badgeText || validation?.status || "Pendiente";
    target.badge.dataset.tone = tone;
  }
  if (target.message) {
    target.message.textContent = fallbackMessage;
    target.message.dataset.tone = tone;
  }
  if (target.timestamp) {
    target.timestamp.textContent = lastValidated;
  }
}

function setMainView(viewName) {
  const isAdmin = viewName === "admin";
  const isConfig = viewName === "config";
  const isMobile = window.matchMedia("(max-width: 980px)").matches;
  const canSeeAdmin = state.currentUser?.role === "super_admin";
  const finalIsAdmin = isAdmin && canSeeAdmin;
  const isSales = !isConfig && !finalIsAdmin;

  el.crmViewAdminBtn?.classList.toggle("is-hidden", !canSeeAdmin);
  el.crmViewAdminBtn?.classList.toggle("is-active", finalIsAdmin);
  el.crmViewSalesBtn.classList.toggle("is-active", isSales);
  el.crmViewConfigBtn.classList.toggle("is-active", isConfig);
  el.crmViewAdmin.classList.toggle("is-active", finalIsAdmin);
  el.crmViewSales.classList.toggle("is-active", isSales);
  el.crmViewConfig.classList.toggle("is-active", isConfig);
  if (el.crmMobileBottomNav) {
    el.crmMobileBottomNav.classList.toggle("is-hidden", isConfig || isAdmin);
  }
  if (el.crmMobileControls) {
    el.crmMobileControls.classList.toggle("is-hidden", isMobile || isAdmin);
  }
  if (el.crmSidebar) {
    el.crmSidebar.classList.toggle("is-mobile-sales-hidden", isMobile && isSales);
  }
  if (el.crmSidebarFilters) {
    el.crmSidebarFilters.classList.toggle("is-hidden", isConfig || isAdmin);
  }
  if (el.crmSidebarFlow) {
    el.crmSidebarFlow.classList.toggle("is-hidden", isConfig || isAdmin);
  }
  for (const link of el.crmSalesLinks) {
    link.classList.toggle("is-hidden", isConfig || isAdmin);
  }
}

function syncMobileAdaptiveUi() {
  const isMobile = window.matchMedia("(max-width: 980px)").matches;

  if (el.crmMobileControls) {
    el.crmMobileControls.classList.toggle("is-hidden", isMobile);
  }
  if (el.crmSidebar) {
    el.crmSidebar.classList.toggle("is-mobile-sales-hidden", isMobile);
  }

  if (el.crmMobileControls) {
    if (isMobile) {
      if (!el.crmMobileControls.dataset.mobileReady) {
        el.crmMobileControls.open = false;
        el.crmMobileControls.dataset.mobileReady = "true";
      }
    } else {
      el.crmMobileControls.open = true;
      delete el.crmMobileControls.dataset.mobileReady;
    }
  }

  if (el.crmAnalyticsAccordion) {
    if (isMobile) {
      if (!el.crmAnalyticsAccordion.dataset.mobileReady) {
        el.crmAnalyticsAccordion.open = false;
        el.crmAnalyticsAccordion.dataset.mobileReady = "true";
      }
    } else {
      el.crmAnalyticsAccordion.open = true;
      delete el.crmAnalyticsAccordion.dataset.mobileReady;
    }
  }
}

function getDateFilterLabel(value) {
  if (value === "today") return "Hoy";
  if (value === "7d") return "Ultimos 7 dias";
  if (value === "30d") return "Ultimos 30 dias";
  return "Todas";
}

function reloadSalesData() {
  state.leadPage = 0;
  renderLeadTable();
  renderLeadDetail();
  loadAnalytics().catch((error) => {
    console.warn("CRM analytics reload failed", error);
  });
}

function handleDateFilterChange(nextValue) {
  const value = nextValue || "all";
  if (el.dateFilter) {
    el.dateFilter.value = value;
  }
  if (el.mobileDateFilter) {
    el.mobileDateFilter.value = value;
  }
  reloadSalesData();
}

function populateServiceFilter(leads = []) {
  if (!el.serviceFilter) return;

  const currentValue = el.serviceFilter.value || "all";
  const services = Array.from(
    new Set(
      (leads || [])
        .map((lead) => String(lead?.interest_service || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "es"));

  el.serviceFilter.innerHTML = [
    '<option value="all">Todos</option>',
    ...services.map(
      (service) =>
        `<option value="${escapeHtml(service)}">${escapeHtml(service)}</option>`
    ),
  ].join("");

  el.serviceFilter.value = services.includes(currentValue) ? currentValue : "all";
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function fetchJson(url, options = {}) {
  const scopedUrl = withAccountScope(url);
  const res = await fetch(scopedUrl, options);
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();

  if (!contentType.includes("application/json")) {
    const preview = raw.trim().slice(0, 120);
      throw new Error(`La API no devolvio JSON en ${options.method || "GET"} ${scopedUrl}. Respuesta: ${preview || `HTTP ${res.status}`}`);
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

async function fetchOptionalJson(url, options = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();
  let data = null;

  if (contentType.includes("application/json") && raw) {
    try {
      data = JSON.parse(raw);
    } catch (_error) {
      data = null;
    }
  }

  return { ok: res.ok, status: res.status, data };
}

function renderAccounts() {
  if (!el.accountSelect) return;

  const accounts = state.accounts || [];
  el.accountSelect.innerHTML = accounts
    .map(
      (account) =>
        `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`
    )
    .join("");

  if (state.activeAccountId) {
    el.accountSelect.value = state.activeAccountId;
  }

  const activeAccount =
    accounts.find((account) => String(account.id) === String(state.activeAccountId)) ||
    accounts[0] ||
    null;

  if (el.accountPlanBadge) {
    el.accountPlanBadge.textContent = activeAccount?.plan || "Internal";
  }

  if (el.accountSelect) {
    el.accountSelect.disabled = state.currentUser?.role !== "super_admin";
  }
}

function renderAdminOverview() {
  if (!el.adminOverviewGrid) return;

  const accounts = state.adminOverview || [];
  if (!accounts.length) {
    el.adminOverviewGrid.innerHTML = '<div class="empty">Todavia no hay cuentas registradas.</div>';
    return;
  }

  el.adminOverviewGrid.innerHTML = accounts
    .map((account) => {
      const isActive = String(account.id) === String(state.activeAccountId);
      const logoUrl = normalizeAssetUrl(account.brand_logo_url);
      return `
        <article class="admin-account-card ${isActive ? "is-active" : ""}">
          <div class="admin-account-head">
            <div class="admin-account-brand">
              <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(account.brand_name || account.name)}" />
              <div>
                <span>${escapeHtml(account.slug || account.id)}</span>
                <strong>${escapeHtml(account.brand_name || account.name)}</strong>
              </div>
            </div>
            <div class="admin-account-badges">
              <span class="pill">${escapeHtml(account.plan || "trial")}</span>
              <span class="pill">${escapeHtml(account.status || "active")}</span>
            </div>
          </div>
          <div class="admin-account-metrics">
            <div><span>Leads</span><strong>${Number(account?.totals?.leads || 0)}</strong></div>
            <div><span>Enviadas</span><strong>${Number(account?.totals?.quotes_sent || 0)}</strong></div>
            <div><span>Aceptadas</span><strong>${Number(account?.totals?.quotes_accepted || 0)}</strong></div>
          </div>
          <div class="admin-account-edit-grid">
            <label>
              Nombre
              <input type="text" data-account-field="name" data-account-id="${escapeHtml(account.id)}" value="${escapeHtml(account.name || "")}" />
            </label>
            <label>
              Slug
              <input type="text" data-account-field="slug" data-account-id="${escapeHtml(account.id)}" value="${escapeHtml(account.slug || "")}" />
            </label>
            <label>
              Plan
              <select data-account-field="plan" data-account-id="${escapeHtml(account.id)}">
                ${["starter", "growth", "pro", "trial", "internal"]
                  .map(
                    (option) =>
                      `<option value="${option}" ${String(account.plan) === option ? "selected" : ""}>${option}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <label>
              Estado
              <select data-account-field="status" data-account-id="${escapeHtml(account.id)}">
                ${["trial", "active", "paused", "archived"]
                  .map(
                    (option) =>
                      `<option value="${option}" ${String(account.status) === option ? "selected" : ""}>${option}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <label class="admin-checkbox">
              <input type="checkbox" data-account-field="is_default" data-account-id="${escapeHtml(account.id)}" ${
                account.is_default ? "checked" : ""
              } />
              <span>Cuenta por defecto</span>
            </label>
          </div>
          <div class="admin-account-footer">
            <small>Ultima actividad: ${fmtShortDate(account.last_activity_at)}</small>
            <div class="admin-account-actions">
              <button type="button" class="crm-secondary-btn" data-save-account="${escapeHtml(account.id)}">Guardar cuenta</button>
              <button type="button" class="crm-secondary-btn" data-open-account="${escapeHtml(account.id)}" data-open-view="config">Configurar</button>
              <button type="button" class="crm-primary-inline-btn" data-open-account="${escapeHtml(account.id)}" data-open-view="sales">Abrir CRM</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  el.adminOverviewGrid.querySelectorAll("[data-open-account]").forEach((button) => {
    button.addEventListener("click", async () => {
      const accountId = button.getAttribute("data-open-account");
      const view = button.getAttribute("data-open-view") || "sales";
      await handleAccountChange(accountId);
      setMainView(view);
    });
  });

  el.adminOverviewGrid.querySelectorAll("[data-save-account]").forEach((button) => {
    button.addEventListener("click", async () => {
      const accountId = button.getAttribute("data-save-account");
      const fields = [
        ...el.adminOverviewGrid.querySelectorAll(`[data-account-id="${accountId}"]`),
      ];
      const payload = {};
      for (const field of fields) {
        const key = field.getAttribute("data-account-field");
        if (!key) continue;
        payload[key] =
          field.type === "checkbox" ? field.checked : field.value;
      }

      button.disabled = true;
      button.classList.add("is-busy");
      setStatus(el.adminAccountStatus, "Guardando cuenta...");
      try {
        await fetchJson(`${window.location.origin}/api/admin/accounts/${accountId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await Promise.all([loadAccounts(), loadAdminOverview(), loadConfig(), loadLeads()]);
        setStatus(el.adminAccountStatus, "Cuenta actualizada.", "ok");
      } catch (error) {
        setStatus(el.adminAccountStatus, `No se pudo guardar: ${error.message}`, "error");
      } finally {
        button.disabled = false;
        button.classList.remove("is-busy");
      }
    });
  });
}

async function loadAccounts() {
  const requestedAccountId = getRequestedAccountId();
  const params = new URLSearchParams();
  if (requestedAccountId) {
    params.set("account_id", requestedAccountId);
  }

  const data = await fetchJson(
    `${window.location.origin}/api/crm/accounts${params.toString() ? `?${params.toString()}` : ""}`
  );

  state.accounts = data.accounts || [];
  state.activeAccountId =
    data.active_account?.id || state.accounts[0]?.id || requestedAccountId || "default";

  setStoredAccountId(state.activeAccountId);

  const url = new URL(window.location.href);
  url.searchParams.set("account_id", state.activeAccountId);
  window.history.replaceState({}, "", url);

  renderAccounts();
}

async function loadAdminOverview() {
  if (state.currentUser?.role !== "super_admin") {
    state.adminOverview = [];
    renderAdminOverview();
    return;
  }

  const data = await fetchJson(`${window.location.origin}/api/admin/overview`);
  state.adminOverview = data.accounts || [];
  renderAdminOverview();
}

async function checkBootstrapStatus() {
  const result = await fetchOptionalJson(`${window.location.origin}/api/auth/bootstrap-status`);
  return Boolean(result?.data?.needs_bootstrap);
}

async function hydrateCurrentUser() {
  const result = await fetchOptionalJson(`${window.location.origin}/api/auth/me`);
  if (!result.ok || !result.data?.user) {
    state.currentUser = null;
    return null;
  }

  state.currentUser = result.data.user;
  if (state.currentUser?.account?.id && state.currentUser.role !== "super_admin") {
    state.activeAccountId = state.currentUser.account.id;
    setStoredAccountId(state.activeAccountId);
  }
  return state.currentUser;
}

async function loginCrm(event) {
  event.preventDefault();
  el.crmLoginBtn.disabled = true;
  setStatus(el.crmAuthStatus, "Entrando...");

  try {
    const result = await fetchJson(`${window.location.origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: el.crmLoginEmail.value,
        password: el.crmLoginPassword.value,
      }),
    });

    state.currentUser = result.user || null;
    setAuthenticatedUi(true);
    await bootstrapCrm();
    setMainView(getDefaultViewForRole());
    setStatus(el.crmAuthStatus, "");
  } catch (error) {
    setStatus(el.crmAuthStatus, `No se pudo entrar: ${error.message}`, "error");
  } finally {
    el.crmLoginBtn.disabled = false;
  }
}

async function bootstrapAdmin(event) {
  event.preventDefault();
  el.crmBootstrapBtn.disabled = true;
  setStatus(el.crmAuthStatus, "Creando super admin...");

  try {
    const result = await fetchJson(`${window.location.origin}/api/auth/bootstrap-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: el.crmBootstrapName.value,
        email: el.crmBootstrapEmail.value,
        password: el.crmBootstrapPassword.value,
      }),
    });

    state.currentUser = result.user || null;
    setAuthenticatedUi(true);
    await bootstrapCrm();
    setMainView("admin");
    setStatus(el.crmAuthStatus, "");
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("ya existe")) {
      setAuthMode("login");
      setStatus(
        el.crmAuthStatus,
        "Ya existe un super admin. Entra con tus credenciales en la pantalla de login.",
        "error"
      );
      el.crmLoginEmail.value = el.crmBootstrapEmail.value || "";
      return;
    }
    setStatus(el.crmAuthStatus, `No se pudo crear el admin: ${error.message}`, "error");
  } finally {
    el.crmBootstrapBtn.disabled = false;
  }
}

async function createAdminAccount() {
  const payload = {
    name: el.adminCreateName.value,
    slug: el.adminCreateSlug.value,
    plan: el.adminCreatePlan.value,
    status: el.adminCreateStatus.value,
    is_default: el.adminCreateDefault.checked,
    admin_email: el.adminCreateAdminEmail.value,
    admin_password: el.adminCreateAdminPassword.value,
    admin_display_name: el.adminCreateAdminDisplayName.value,
  };

  el.adminCreateAccountBtn.disabled = true;
  el.adminCreateAccountBtn.classList.add("is-busy");
  setStatus(el.adminAccountStatus, "Creando cuenta...");

  try {
    const data = await fetchJson(`${window.location.origin}/api/admin/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    el.adminCreateName.value = "";
    el.adminCreateSlug.value = "";
    el.adminCreatePlan.value = "starter";
    el.adminCreateStatus.value = "trial";
    el.adminCreateDefault.checked = false;
    el.adminCreateAdminEmail.value = "";
    el.adminCreateAdminPassword.value = "";
    el.adminCreateAdminDisplayName.value = "";

    await Promise.all([loadAccounts(), loadAdminOverview()]);
    if (data?.account?.id) {
      await handleAccountChange(data.account.id);
      setMainView("config");
    }
    setStatus(el.adminAccountStatus, "Cuenta creada correctamente.", "ok");
  } catch (error) {
    setStatus(el.adminAccountStatus, `No se pudo crear: ${error.message}`, "error");
  } finally {
    el.adminCreateAccountBtn.disabled = false;
    el.adminCreateAccountBtn.classList.remove("is-busy");
  }
}

async function handleAccountChange(nextAccountId) {
  state.activeAccountId = String(nextAccountId || "").trim();
  setStoredAccountId(state.activeAccountId);

  const url = new URL(window.location.href);
  if (state.activeAccountId) {
    url.searchParams.set("account_id", state.activeAccountId);
  } else {
    url.searchParams.delete("account_id");
  }
  window.history.replaceState({}, "", url);

  renderAccounts();
  await Promise.all([loadLeads(), loadConfig(), loadAdminOverview()]);
}

async function logoutCrm() {
  try {
    await fetchJson(`${window.location.origin}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch (_error) {
    // noop
  }

  state.currentUser = null;
  state.accounts = [];
  state.activeAccountId = null;
  state.adminOverview = [];
  state.leads = [];
  state.filteredLeads = [];
  state.selectedLead = null;
  state.selectedQuote = null;
  state.analytics = null;
  state.appConfig = null;
  setStoredAccountId("");
  setAuthenticatedUi(false);
  const needsBootstrap = await checkBootstrapStatus();
  setAuthMode(needsBootstrap ? "bootstrap" : "login");
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

function createServiceEditorItem(name = "", facts = {}) {
  const item = document.createElement("article");
  item.className = "service-item";
  item.innerHTML = `
    <div class="service-item-head">
      <strong>Servicio</strong>
      <button type="button" class="service-remove-btn">Quitar</button>
    </div>
    <div class="service-item-grid">
      <label>
        Nombre
        <input type="text" data-field="name" value="${escapeHtml(name)}" />
      </label>
      <label>
        URL
        <input type="url" data-field="url" value="${escapeHtml(facts?.url || "")}" />
      </label>
      <label>
        Tarifa mensual orientativa
        <input type="text" data-field="min_monthly_fee" value="${escapeHtml(facts?.min_monthly_fee || "")}" />
      </label>
      <label>
        Tarifa de proyecto orientativa
        <input type="text" data-field="min_project_fee" value="${escapeHtml(facts?.min_project_fee || "")}" />
      </label>
      <label class="quote-grid-full">
        Descripcion
        <textarea rows="4" data-field="description">${escapeHtml(facts?.description || "")}</textarea>
      </label>
      <label class="quote-grid-full">
        Notas comerciales
        <textarea rows="4" data-field="notes">${escapeHtml(facts?.notes || "")}</textarea>
      </label>
    </div>
  `;

  item
    .querySelector(".service-remove-btn")
    .addEventListener("click", () => item.remove());

  return item;
}

function renderServiceEditor(services = {}) {
  el.configServicesList.innerHTML = "";
  const entries = Object.entries(services || {});

  if (!entries.length) {
    el.configServicesList.appendChild(createServiceEditorItem());
    return;
  }

  for (const [name, facts] of entries) {
    el.configServicesList.appendChild(createServiceEditorItem(name, facts));
  }
}

function collectServiceConfig() {
  const items = [...el.configServicesList.querySelectorAll(".service-item")];
  const services = {};

  for (const item of items) {
    const getValue = (field) =>
      String(item.querySelector(`[data-field="${field}"]`)?.value || "").trim();

    const name = getValue("name");
    if (!name) continue;

    services[name] = {
      url: getValue("url"),
      min_monthly_fee: getValue("min_monthly_fee"),
      min_project_fee: getValue("min_project_fee"),
      description: getValue("description"),
      notes: getValue("notes"),
    };
  }

  return services;
}

function getTemplateOptionsMarkup(selected = "") {
  const templates = state.appConfig?.message_templates || {};
  return MESSAGE_TEMPLATE_ORDER.map((key) => {
    const template = templates[key] || {};
    const label = template.label || key;
    return `<option value="${escapeHtml(key)}"${selected === key ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function createMessageTemplateCard(key, template = {}) {
  const card = document.createElement("article");
  card.className = "message-template-card";
  card.dataset.templateKey = key;

  const channel = template.channel || "email";
  const isEmail = channel === "email";
  const preview = String(template.body || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  card.innerHTML = `
    <div class="message-template-head">
      <div class="message-template-head-copy">
        <span>${escapeHtml(channel)}</span>
        <strong>${escapeHtml(template.label || key)}</strong>
        <p>${escapeHtml(preview || "Configura una plantilla breve, clara y orientada a conversion.")}</p>
      </div>
      <em>${escapeHtml(key)}</em>
    </div>
    <div class="message-template-fields">
      <label>
        Etiqueta interna
        <input type="text" data-field="label" value="${escapeHtml(template.label || "")}" />
      </label>
      <label>
        Canal
        <select data-field="channel">
          <option value="whatsapp"${channel === "whatsapp" ? " selected" : ""}>whatsapp</option>
          <option value="email"${isEmail ? " selected" : ""}>email</option>
        </select>
      </label>
      <label class="quote-grid-full${isEmail ? "" : " is-hidden"}" data-role="subject">
        Asunto
        <input type="text" data-field="subject" value="${escapeHtml(template.subject || "")}" />
      </label>
      <label class="quote-grid-full">
        Cuerpo del mensaje
        <textarea rows="5" data-field="body">${escapeHtml(template.body || "")}</textarea>
      </label>
    </div>
  `;

  const channelSelect = card.querySelector('[data-field="channel"]');
  const subjectRow = card.querySelector('[data-role="subject"]');
  channelSelect?.addEventListener("change", () => {
    subjectRow?.classList.toggle("is-hidden", channelSelect.value !== "email");
  });

  return card;
}

function renderMessageTemplates(templates = {}) {
  if (!el.configMessageTemplatesList) return;
  el.configMessageTemplatesList.innerHTML = "";

  for (const key of MESSAGE_TEMPLATE_ORDER) {
    el.configMessageTemplatesList.appendChild(
      createMessageTemplateCard(key, templates?.[key] || {})
    );
  }
}

function collectMessageTemplates() {
  const cards = [...(el.configMessageTemplatesList?.querySelectorAll(".message-template-card") || [])];
  const templates = {};

  for (const card of cards) {
    const key = card.dataset.templateKey;
    if (!key) continue;
    const getValue = (field) =>
      String(card.querySelector(`[data-field="${field}"]`)?.value || "").trim();

    templates[key] = {
      label: getValue("label"),
      channel: getValue("channel") || "email",
      subject: getValue("subject"),
      body: getValue("body"),
    };
  }

  return templates;
}

function createAutomationStepItem(step = {}) {
  const item = document.createElement("div");
  item.className = "automation-step-item";
  const delayValue = step.delay_value || "24";
  const delayUnit = step.delay_unit || "hours";
  const channel = step.channel || "whatsapp";
  const templateKey = step.template_key || "";
  const active = step.active !== false;

  item.innerHTML = `
    <div class="automation-step-head">
      <strong>Paso automatico</strong>
      <button type="button" class="service-remove-btn automation-step-remove">Quitar</button>
    </div>
    <div class="automation-step-grid">
      <label>
        Espera
        <input type="number" min="0" step="1" data-field="delay_value" value="${escapeHtml(delayValue)}" />
      </label>
      <label>
        Unidad
        <select data-field="delay_unit">
          <option value="minutes"${delayUnit === "minutes" ? " selected" : ""}>minutos</option>
          <option value="hours"${delayUnit === "hours" ? " selected" : ""}>horas</option>
          <option value="days"${delayUnit === "days" ? " selected" : ""}>dias</option>
        </select>
      </label>
      <label>
        Canal
        <select data-field="channel">
          <option value="whatsapp"${channel === "whatsapp" ? " selected" : ""}>whatsapp</option>
          <option value="email"${channel === "email" ? " selected" : ""}>email</option>
        </select>
      </label>
      <label>
        Plantilla
        <select data-field="template_key">${getTemplateOptionsMarkup(templateKey)}</select>
      </label>
      <label class="automation-step-toggle">
        <input type="checkbox" data-field="active"${active ? " checked" : ""} />
        <span>Paso activo</span>
      </label>
    </div>
  `;

  item
    .querySelector(".automation-step-remove")
    ?.addEventListener("click", () => item.remove());

  return item;
}

function createAutomationFlowCard(key, flow = {}) {
  const card = document.createElement("article");
  card.className = "automation-flow-card";
  card.dataset.flowKey = key;
  const steps = Array.isArray(flow.steps) && flow.steps.length ? flow.steps : [];

  card.innerHTML = `
    <div class="automation-flow-head">
      <div class="automation-flow-head-copy">
        <span>Flujo</span>
        <strong>${escapeHtml(flow.label || key)}</strong>
        <p>${escapeHtml(flow.description || "Secuencia automatica para mover la oportunidad sin depender de seguimiento manual.")}</p>
      </div>
      <div class="automation-flow-head-meta">
        <em>${steps.length} paso${steps.length === 1 ? "" : "s"}</em>
        <label class="automation-flow-toggle">
          <input type="checkbox" data-field="enabled"${flow.enabled !== false ? " checked" : ""} />
          <span>Activo</span>
        </label>
      </div>
    </div>
    <div class="automation-flow-fields">
      <label>
        Nombre visible
        <input type="text" data-field="label" value="${escapeHtml(flow.label || "")}" />
      </label>
      <label class="quote-grid-full">
        Descripcion
        <textarea rows="3" data-field="description">${escapeHtml(flow.description || "")}</textarea>
      </label>
    </div>
    <div class="automation-flow-steps-head">
      <strong>Pasos</strong>
      <button type="button" class="crm-secondary-btn automation-add-step-btn">Añadir paso</button>
    </div>
    <div class="automation-steps-list"></div>
  `;

  const stepsList = card.querySelector(".automation-steps-list");
  for (const step of steps) {
    stepsList?.appendChild(createAutomationStepItem(step));
  }

  card
    .querySelector(".automation-add-step-btn")
    ?.addEventListener("click", () => {
      stepsList?.appendChild(createAutomationStepItem());
    });

  return card;
}

function renderAutomationFlows(flows = {}) {
  if (!el.configAutomationFlowsList) return;
  el.configAutomationFlowsList.innerHTML = "";

  for (const key of AUTOMATION_FLOW_ORDER) {
    el.configAutomationFlowsList.appendChild(
      createAutomationFlowCard(key, flows?.[key] || {})
    );
  }
}

function collectAutomationFlows() {
  const cards = [...(el.configAutomationFlowsList?.querySelectorAll(".automation-flow-card") || [])];
  const flows = {};

  for (const card of cards) {
    const key = card.dataset.flowKey;
    if (!key) continue;

    const getValue = (field) =>
      String(card.querySelector(`[data-field="${field}"]`)?.value || "").trim();

    const steps = [...card.querySelectorAll(".automation-step-item")].map((item) => {
      const value = (field) =>
        String(item.querySelector(`[data-field="${field}"]`)?.value || "").trim();

      return {
        delay_value: value("delay_value"),
        delay_unit: value("delay_unit"),
        channel: value("channel"),
        template_key: value("template_key"),
        active: Boolean(item.querySelector('[data-field="active"]')?.checked),
      };
    }).filter((step) => step.template_key);

    flows[key] = {
      label: getValue("label"),
      description: getValue("description"),
      enabled: Boolean(card.querySelector('[data-field="enabled"]')?.checked),
      steps,
    };
  }

  return flows;
}

function applyLeadFilters() {
  const source = el.sourceFilter.value;
  const dateRange = el.dateFilter.value;
  const service = String(el.serviceFilter?.value || "all").trim();
  const now = Date.now();

  state.filteredLeads = state.leads.filter((lead) => {
    const channelOk = source === "all" || (lead.channel || "web") === source;
    const serviceOk =
      service === "all" ||
      String(lead?.interest_service || "").trim() === service;

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

    return channelOk && serviceOk && dateOk;
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

function renderServicePerformance(rows = []) {
  if (!el.analyticsServiceBreakdown) return;

  if (!rows.length) {
    el.analyticsServiceBreakdown.innerHTML =
      '<div class="empty">Sin datos por servicio todavia.</div>';
    return;
  }

  el.analyticsServiceBreakdown.innerHTML = rows
    .map(
      (row) => `
        <article class="analytics-service-card">
          <div class="analytics-service-head">
            <strong>${row.label || "-"}</strong>
            <span>${row.acceptance_rate ?? 0}% aceptacion</span>
          </div>
          <div class="analytics-service-metrics">
            <div><span>Leads</span><strong>${row.leads ?? 0}</strong></div>
            <div><span>Enviadas</span><strong>${row.quotes_sent ?? 0}</strong></div>
            <div><span>Aceptadas</span><strong>${row.quotes_accepted ?? 0}</strong></div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderTimeline(rows = []) {
  if (!el.analyticsTimeline) return;

  if (!rows.length) {
    el.analyticsTimeline.innerHTML = '<div class="empty">Sin datos diarios todavia.</div>';
    return;
  }

  const maxValue = Math.max(
    ...rows.flatMap((row) => [row.leads || 0, row.quotes_sent || 0, row.quotes_accepted || 0]),
    1
  );

  el.analyticsTimeline.innerHTML = rows
    .map((row) => {
      const leadPct = Math.max(8, Math.round(((row.leads || 0) / maxValue) * 100));
      const sentPct = Math.max(8, Math.round(((row.quotes_sent || 0) / maxValue) * 100));
      const acceptedPct = Math.max(8, Math.round(((row.quotes_accepted || 0) / maxValue) * 100));

      return `
        <article class="timeline-row">
          <div class="timeline-date">${row.date}</div>
          <div class="timeline-metrics">
            <div class="timeline-bar-group">
              <span>Leads</span>
              <div class="timeline-bar"><i style="width:${leadPct}%"></i></div>
              <strong>${row.leads || 0}</strong>
            </div>
            <div class="timeline-bar-group">
              <span>Enviadas</span>
              <div class="timeline-bar secondary"><i style="width:${sentPct}%"></i></div>
              <strong>${row.quotes_sent || 0}</strong>
            </div>
            <div class="timeline-bar-group">
              <span>Aceptadas</span>
              <div class="timeline-bar success"><i style="width:${acceptedPct}%"></i></div>
              <strong>${row.quotes_accepted || 0}</strong>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAnalytics() {
  const analytics = state.analytics;

  el.analyticsRangeLabel.textContent = getDateFilterLabel(el.dateFilter.value);

  if (!analytics) {
    el.analyticsLeadsGenerated.textContent = "-";
    el.analyticsPassedWhatsapp.textContent = "-";
    el.analyticsWhatsappHint.textContent = "-";
    el.analyticsQuotesSent.textContent = "-";
    el.analyticsQuotesAccepted.textContent = "-";
    el.analyticsResponseTime.textContent = "-";
    el.analyticsAcceptanceRate.textContent = "-";
    renderBreakdown(el.analyticsChannelBreakdown, []);
    renderBreakdown(el.analyticsSourceBreakdown, []);
    renderServicePerformance([]);
    renderTimeline([]);
    return;
  }

  const totals = analytics.totals || {};
  el.analyticsLeadsGenerated.textContent = totals.leads_generated ?? 0;
  el.analyticsPassedWhatsapp.textContent = totals.passed_to_whatsapp ?? 0;
  el.analyticsWhatsappHint.textContent = `${totals.whatsapp_handoff_real ?? 0} reales · ${totals.whatsapp_preference ?? 0} por preferencia`;
  el.analyticsQuotesSent.textContent = totals.quotes_sent ?? 0;
  el.analyticsQuotesAccepted.textContent = totals.quotes_accepted ?? 0;
  el.analyticsResponseTime.textContent = totals.average_response_label || "-";
  el.analyticsAcceptanceRate.textContent = `${totals.acceptance_rate ?? 0}%`;

  renderBreakdown(el.analyticsChannelBreakdown, analytics?.breakdowns?.channel || []);
  renderBreakdown(el.analyticsSourceBreakdown, analytics?.breakdowns?.source || []);
  renderServicePerformance(analytics?.breakdowns?.service || []);
  renderTimeline(analytics?.timeline || []);
}

function renderConfig() {
  const config = state.appConfig || {};
  applyBrandTheme(config);

  el.configBrandName.value = config?.brand?.name || "";
  el.configWebsiteUrl.value = config?.brand?.website_url || "";
  el.configBootstrapUrl.value = config?.brand?.website_url || "";
  el.configLogoUrl.value = config?.brand?.logo_url || "";
  if (el.configLogoFile) {
    el.configLogoFile.value = "";
  }
  updateConfigLogoPreview(config?.brand?.logo_url || "");
  el.configPrimaryColor.value = config?.brand?.primary_color || "";
  el.configAccentColor.value = config?.brand?.accent_color || "";
  el.configPublicWhatsappNumber.value =
    config?.contact?.public_whatsapp_number || "";
  el.configHumanWhatsappNumber.value =
    config?.contact?.human_agent_whatsapp_number || "";
  el.configSupportEmail.value = config?.contact?.support_email || "";
  el.configAgentTone.value = config?.agent?.tone || "";
  el.configFinalCtaLabel.value = config?.agent?.final_cta_label || "";
  el.configHandoffTargetChannel.value =
    config?.agent?.handoff_target_channel || "whatsapp";
  el.configPromptAdditions.value = config?.agent?.prompt_additions || "";
  el.configWhatsappProvider.value =
    config?.integrations?.whatsapp?.provider || "meta_cloud";
  el.configWhatsappStatusLabel.value =
    config?.integrations?.whatsapp?.status_label || "";
  el.configWhatsappPhoneNumberId.value =
    config?.integrations?.whatsapp?.phone_number_id || "";
  el.configWhatsappBusinessAccountId.value =
    config?.integrations?.whatsapp?.business_account_id || "";
  el.configMetaLeadSource.value =
    config?.integrations?.lead_forms?.meta_source || "google_sheets";
  el.configGoogleLeadSource.value =
    config?.integrations?.lead_forms?.google_source || "webhook_n8n";
  el.configLeadSheetDocument.value =
    config?.integrations?.lead_forms?.sheet_document || "";
  el.configLeadSheetTabs.value =
    config?.integrations?.lead_forms?.sheet_tabs || "";
  el.configLeadWebhookUrl.value =
    config?.integrations?.lead_forms?.webhook_url || "";
  el.configEmailProvider.value =
    config?.integrations?.email?.provider || "smtp";
  el.configEmailFromAddress.value =
    config?.integrations?.email?.from_email || "";
  el.configEmailReplyTo.value =
    config?.integrations?.email?.reply_to_email || "";
  el.configAutomationPlatform.value =
    config?.integrations?.automations?.platform || "n8n";
  el.configAutomationWorkspaceUrl.value =
    config?.integrations?.automations?.workspace_url || "";
  el.configAutomationNotes.value =
    config?.integrations?.automations?.notes || "";
  if (el.configWhatsappStatusBadge) {
    el.configWhatsappStatusBadge.textContent =
      config?.integrations?.whatsapp?.status_label || "Pendiente";
  }
  renderIntegrationValidation(
    "whatsapp",
    config?.integrations?.whatsapp?.validation || {},
    config?.integrations?.whatsapp?.status_label || "Pendiente"
  );
  renderIntegrationValidation(
    "lead_forms",
    config?.integrations?.lead_forms?.validation || {}
  );
  renderIntegrationValidation(
    "email",
    config?.integrations?.email?.validation || {}
  );
  renderIntegrationValidation(
    "automations",
    config?.integrations?.automations?.validation || {}
  );
  renderMessageTemplates(config?.message_templates || {});
  renderAutomationFlows(config?.automation_flows || {});
  renderServiceEditor(config?.services || {});
  if (!el.configBootstrapSummary.value.trim()) {
    el.configBootstrapSummary.value = "";
  }
}

function setConfigTab(tabName) {
  const isGeneral = tabName === "general";
  const isMessages = tabName === "messages";
  const isAutomations = tabName === "automations";
  const isIntegrations = tabName === "integrations";
  const isWebsite = tabName === "website";
  el.configTabGeneral.classList.toggle("is-active", isGeneral);
  el.configTabMessages.classList.toggle("is-active", isMessages);
  el.configTabAutomations.classList.toggle("is-active", isAutomations);
  el.configTabIntegrations.classList.toggle("is-active", isIntegrations);
  el.configTabWebsite.classList.toggle("is-active", isWebsite);
  el.configPanelGeneral.classList.toggle("is-active", isGeneral);
  el.configPanelMessages.classList.toggle("is-active", isMessages);
  el.configPanelAutomations.classList.toggle("is-active", isAutomations);
  el.configPanelIntegrations.classList.toggle("is-active", isIntegrations);
  el.configPanelWebsite.classList.toggle("is-active", isWebsite);
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
  populateServiceFilter(state.leads);

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

async function loadConfig() {
  const data = await fetchJson(`${API_BASE}/config`);
  state.appConfig = data.config || null;
  if (data.account?.id) {
    state.activeAccountId = data.account.id;
  }
  renderConfig();
}

async function loadAnalytics() {
  const params = new URLSearchParams({
    channel: el.sourceFilter.value || "all",
    date_range: el.dateFilter.value || "all",
    service: el.serviceFilter?.value || "all",
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

async function saveConfig() {
  el.configSaveBtn.disabled = true;
  el.configSaveBtn.classList.add("is-busy");
  setStatus(el.configSaveStatus, "Guardando configuracion...");

  try {
    const services = collectServiceConfig();
    const message_templates = collectMessageTemplates();
    const automation_flows = collectAutomationFlows();

    const payload = {
      brand: {
        name: el.configBrandName.value,
        website_url: el.configWebsiteUrl.value,
        logo_url: el.configLogoUrl.value,
        primary_color: el.configPrimaryColor.value,
        accent_color: el.configAccentColor.value,
      },
      contact: {
        public_whatsapp_number: el.configPublicWhatsappNumber.value,
        human_agent_whatsapp_number: el.configHumanWhatsappNumber.value,
        support_email: el.configSupportEmail.value,
      },
      agent: {
        tone: el.configAgentTone.value,
        final_cta_label: el.configFinalCtaLabel.value,
        handoff_target_channel: el.configHandoffTargetChannel.value,
        prompt_additions: el.configPromptAdditions.value,
      },
      integrations: {
        whatsapp: {
          provider: el.configWhatsappProvider.value,
          status_label: el.configWhatsappStatusLabel.value,
          phone_number_id: el.configWhatsappPhoneNumberId.value,
          business_account_id: el.configWhatsappBusinessAccountId.value,
          validation: state.appConfig?.integrations?.whatsapp?.validation || {},
        },
        lead_forms: {
          meta_source: el.configMetaLeadSource.value,
          google_source: el.configGoogleLeadSource.value,
          sheet_document: el.configLeadSheetDocument.value,
          sheet_tabs: el.configLeadSheetTabs.value,
          webhook_url: el.configLeadWebhookUrl.value,
          validation: state.appConfig?.integrations?.lead_forms?.validation || {},
        },
        email: {
          provider: el.configEmailProvider.value,
          from_email: el.configEmailFromAddress.value,
          reply_to_email: el.configEmailReplyTo.value,
          validation: state.appConfig?.integrations?.email?.validation || {},
        },
        automations: {
          platform: el.configAutomationPlatform.value,
          workspace_url: el.configAutomationWorkspaceUrl.value,
          notes: el.configAutomationNotes.value,
          validation: state.appConfig?.integrations?.automations?.validation || {},
        },
      },
      message_templates,
      automation_flows,
      services,
    };

    const data = await fetchJson(`${API_BASE}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    state.appConfig = data.config || null;
    renderConfig();
    setStatus(el.configSaveStatus, "Configuracion guardada.", "ok");
  } catch (error) {
    setStatus(el.configSaveStatus, `No se pudo guardar: ${error.message}`, "error");
  } finally {
    el.configSaveBtn.disabled = false;
    el.configSaveBtn.classList.remove("is-busy");
  }
}

async function uploadLogoAsset(file) {
  const encoded = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });

  const data = await fetchJson(`${API_BASE}/assets/logo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_name: file.name || "logo",
      content_type: file.type || "image/png",
      data_url: encoded,
      brand_name: el.configBrandName.value || state.appConfig?.brand?.name || "Marca",
    }),
  });

  return data?.asset?.public_url || "";
}

async function analyzeWebsiteConfig() {
  const websiteUrl = (el.configBootstrapUrl.value || "").trim();
  if (!websiteUrl) {
    setStatus(el.configAnalyzeStatus, "Introduce una web para analizar.", "error");
    return;
  }

  el.configAnalyzeWebsiteBtn.disabled = true;
  el.configAnalyzeWebsiteBtn.classList.add("is-busy");
  setStatus(el.configAnalyzeStatus, "Analizando web...");

  try {
    const data = await fetchJson(`${API_BASE}/config/bootstrap-site`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ website_url: websiteUrl }),
    });

    const suggested = data.suggested_config || {};
    state.appConfig = suggested;
    renderConfig();

    const snapshot = data.snapshot || {};
    el.configBootstrapSummary.value = [
      `URL final: ${snapshot.final_url || snapshot.url || websiteUrl}`,
      `Marca sugerida: ${suggested?.brand?.name || "-"}`,
      `Title: ${snapshot.title || "-"}`,
      `H1: ${snapshot.h1 || "-"}`,
      `Resumen: ${snapshot.summary || "-"}`,
      `Prioridad: ${(snapshot.priorities || [])[0] || "-"}`,
    ].join("\n");

    setStatus(
      el.configAnalyzeStatus,
      "Analisis completado. Revisa la pestaña General y guarda si te encaja.",
      "ok"
    );
    setConfigTab("general");
  } catch (error) {
    setStatus(el.configAnalyzeStatus, `No se pudo analizar: ${error.message}`, "error");
  } finally {
    el.configAnalyzeWebsiteBtn.disabled = false;
    el.configAnalyzeWebsiteBtn.classList.remove("is-busy");
  }
}

async function validateIntegration(type, button) {
  if (!type) return;
  button.disabled = true;
  button.classList.add("is-busy");
  setStatus(el.configSaveStatus, `Comprobando ${type}...`);

  try {
    const data = await fetchJson(`${API_BASE}/integrations/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });

    state.appConfig = data.config || state.appConfig;
    renderConfig();
    setStatus(el.configSaveStatus, `Integracion ${type} validada.`, "ok");
  } catch (error) {
    setStatus(el.configSaveStatus, `No se pudo validar ${type}: ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.classList.remove("is-busy");
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
el.accountSelect?.addEventListener("change", () =>
  handleAccountChange(el.accountSelect.value).catch((error) => {
    console.error(error);
  })
);
el.configSaveBtn.addEventListener("click", saveConfig);
el.configAddServiceBtn.addEventListener("click", () => {
  el.configServicesList.appendChild(createServiceEditorItem());
});
el.configLogoFile.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setStatus(el.configSaveStatus, "El logo debe ser una imagen valida.", "error");
    event.target.value = "";
    return;
  }

  el.configLogoFile.disabled = true;
  setStatus(el.configSaveStatus, "Subiendo logo...");

  try {
    const uploadedUrl = await uploadLogoAsset(file);
    if (!uploadedUrl) {
      throw new Error("No se pudo obtener la URL publica del logo.");
    }

    el.configLogoUrl.value = uploadedUrl;
    updateConfigLogoPreview(uploadedUrl);
    setStatus(el.configSaveStatus, "Logo subido. Guarda la configuracion para aplicarlo.", "ok");
  } catch (error) {
    setStatus(el.configSaveStatus, error.message, "error");
    event.target.value = "";
  } finally {
    el.configLogoFile.disabled = false;
  }
});
el.configLogoClearBtn.addEventListener("click", () => {
  el.configLogoUrl.value = "";
  if (el.configLogoFile) {
    el.configLogoFile.value = "";
  }
  updateConfigLogoPreview("");
  setStatus(el.configSaveStatus, "Logo eliminado de la configuracion actual.", "ok");
});
el.crmViewSalesBtn.addEventListener("click", () => setMainView("sales"));
el.crmViewAdminBtn?.addEventListener("click", () => setMainView("admin"));
el.crmViewConfigBtn.addEventListener("click", () => setMainView("config"));
el.adminCreateAccountBtn?.addEventListener("click", createAdminAccount);
el.logoutBtn?.addEventListener("click", logoutCrm);
el.configBackBtn?.addEventListener("click", () => setMainView("sales"));
el.crmLoginForm?.addEventListener("submit", loginCrm);
el.crmBootstrapForm?.addEventListener("submit", bootstrapAdmin);
el.crmAuthSwitchBtn?.addEventListener("click", () => {
  setAuthMode("login");
  setStatus(el.crmAuthStatus, "");
  el.crmLoginEmail.value = el.crmBootstrapEmail.value || "";
});
el.crmSalesLinks.forEach((link) =>
  link.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 980px)").matches && el.crmMobileControls) {
      el.crmMobileControls.open = false;
    }
  })
);
el.configAnalyzeWebsiteBtn.addEventListener("click", analyzeWebsiteConfig);
el.configValidateWhatsappBtn?.addEventListener("click", () =>
  validateIntegration("whatsapp", el.configValidateWhatsappBtn)
);
el.configValidateLeadFormsBtn?.addEventListener("click", () =>
  validateIntegration("lead_forms", el.configValidateLeadFormsBtn)
);
el.configValidateEmailBtn?.addEventListener("click", () =>
  validateIntegration("email", el.configValidateEmailBtn)
);
el.configValidateAutomationsBtn?.addEventListener("click", () =>
  validateIntegration("automations", el.configValidateAutomationsBtn)
);
el.configTabGeneral.addEventListener("click", () => setConfigTab("general"));
el.configTabMessages?.addEventListener("click", () => setConfigTab("messages"));
el.configTabAutomations?.addEventListener("click", () => setConfigTab("automations"));
el.configTabIntegrations.addEventListener("click", () => setConfigTab("integrations"));
el.configTabWebsite.addEventListener("click", () => setConfigTab("website"));
el.dateFilter.addEventListener("change", () => handleDateFilterChange(el.dateFilter.value));
el.mobileDateFilter?.addEventListener("change", () =>
  handleDateFilterChange(el.mobileDateFilter.value)
);
el.sourceFilter.addEventListener("change", () => {
  reloadSalesData();
});
el.serviceFilter.addEventListener("change", () => {
  reloadSalesData();
});
el.crmMobileConfigBtn?.addEventListener("click", () => setMainView("config"));
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
  window.open(withAccountScope(`/crm/quotes/${state.selectedLead.id}/preview`), "_blank", "noopener,noreferrer");
});
el.quotePdfBtn.addEventListener("click", () => {
  if (!state.selectedLead?.id) return;
  window.open(withAccountScope(`/crm/quotes/${state.selectedLead.id}/preview?print=1`), "_blank", "noopener,noreferrer");
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
window.addEventListener("resize", syncMobileAdaptiveUi);

async function bootstrapCrm() {
  await loadAccounts();
  await Promise.all([loadLeads(), loadConfig(), loadAdminOverview()]);
}

async function startCrm() {
  if (el.mobileDateFilter && el.dateFilter) {
    el.mobileDateFilter.value = el.dateFilter.value;
  }
  syncMobileAdaptiveUi();

  const user = await hydrateCurrentUser();
  if (user) {
    setAuthenticatedUi(true);
    await bootstrapCrm();
    setMainView(getDefaultViewForRole());
    return;
  }

  setAuthenticatedUi(false);
  const needsBootstrap = await checkBootstrapStatus();
  setAuthMode(needsBootstrap ? "bootstrap" : "login");
}

startCrm().catch((error) => {
  setAuthenticatedUi(false);
  setStatus(el.crmAuthStatus, `No se pudo iniciar el CRM: ${error.message}`, "error");
  el.leadTableBody.innerHTML = `<tr><td colspan="8" class="empty">Error cargando CRM: ${error.message}</td></tr>`;
});
