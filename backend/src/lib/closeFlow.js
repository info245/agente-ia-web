function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function hasName(lead) {
  return String(lead?.name || "").trim().length >= 2;
}

function hasPhone(lead) {
  return String(lead?.phone || "").replace(/\D/g, "").length >= 6;
}

function hasContact(lead) {
  return (
    String(lead?.email || "").trim().length >= 5 ||
    hasPhone(lead)
  );
}

function hasService(lead) {
  return String(lead?.interest_service || "").trim().length >= 2;
}

function hasMainGoal(lead) {
  return String(lead?.main_goal || "").trim().length >= 3;
}

function hasBusinessActivity(lead) {
  return String(lead?.business_activity || "").trim().length >= 3;
}

export const CLOSE_FLOW_STEPS = new Set([
  "close_ask_name",
  "close_ask_channel",
  "close_ask_phone",
  "close_ask_email",
  "close_ready",
]);

export function isCloseFlowStep(step) {
  return CLOSE_FLOW_STEPS.has(String(step || "").trim());
}

export function prefersWhatsAppChannel(text = "") {
  const t = normalizeText(text);
  return (
    /\bwhatsapp\b/.test(t) ||
    /\bwasap\b/.test(t) ||
    /\bwhats\b/.test(t) ||
    /\bpor whatsapp\b/.test(t) ||
    /\bmejor por whatsapp\b/.test(t)
  );
}

export function prefersEmailChannel(text = "") {
  const t = normalizeText(text);
  return (
    /\bemail\b/.test(t) ||
    /\bcorreo\b/.test(t) ||
    /\bmail\b/.test(t) ||
    /\bpor email\b/.test(t) ||
    /\bpor correo\b/.test(t)
  );
}

export function getExplicitPreferredChannel(text = "") {
  if (prefersWhatsAppChannel(text)) return "whatsapp";
  if (prefersEmailChannel(text)) return "email";
  return null;
}

export function detectStrongCommercialIntent(text = "") {
  const t = normalizeText(text);
  return (
    t.includes("precio") ||
    t.includes("presupuesto") ||
    t.includes("cuanto cuesta") ||
    t.includes("cuánto cuesta") ||
    t.includes("trabajar contigo") ||
    t.includes("trabajar con vosotros") ||
    t.includes("empezar") ||
    t.includes("llamada") ||
    t.includes("contactar") ||
    t.includes("whatsapp")
  );
}

export function isShortAffirmativeResponse(text = "") {
  const t = normalizeText(text);
  return (
    t === "si" ||
    t === "sí" ||
    t === "si por favor" ||
    t === "sí por favor" ||
    t === "vale" ||
    t === "ok" ||
    t === "perfecto" ||
    t === "genial"
  );
}

function shouldUseCommercialCloseFlow({
  lead = {},
  text = "",
  channel = "web",
  analysisReady = false,
  isGreeting = false,
} = {}) {
  if (channel !== "web") return false;
  if (isCloseFlowStep(lead?.current_step)) return true;
  if (isGreeting) return false;

  const explicitChannel = getExplicitPreferredChannel(text);
  const hasCommercialContext =
    hasService(lead) || hasMainGoal(lead) || hasBusinessActivity(lead);
  const hasExplicitCloseIntent =
    detectStrongCommercialIntent(text) ||
    !!explicitChannel ||
    hasContact(lead);

  if (hasExplicitCloseIntent) return true;
  if (isShortAffirmativeResponse(text) && (analysisReady || hasCommercialContext)) {
    return true;
  }

  return false;
}

export function getCommercialCloseStep({
  lead = {},
  text = "",
  channel = "web",
  analysisReady = false,
  isGreeting = false,
} = {}) {
  if (
    !shouldUseCommercialCloseFlow({
      lead,
      text,
      channel,
      analysisReady,
      isGreeting,
    })
  ) {
    return null;
  }

  if (!hasName(lead)) return "close_ask_name";

  const preferredChannel = normalizeText(lead?.preferred_contact_channel || "");
  if (!preferredChannel) return "close_ask_channel";
  if (preferredChannel.includes("whatsapp") && !hasPhone(lead)) {
    return "close_ask_phone";
  }
  if (preferredChannel.includes("email") && !String(lead?.email || "").trim()) {
    return "close_ask_email";
  }

  return "close_ready";
}
