function norm(v) {
  return String(v || "").trim();
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isQuestion(text) {
  const t = normalizeText(text);
  return (
    t.includes("?") ||
    /^(que|qué|como|cómo|cuanto|cuánto|cual|cuál|precio|precios|presupuesto|coste|costes|tarifa|tarifas)\b/i.test(
      String(text || "").trim()
    )
  );
}

function isNegative(text) {
  const t = normalizeText(text);
  return [
    "no",
    "nop",
    "nope",
    "no tengo",
    "no tengo empresa",
    "no empresa",
    "no tengo negocio",
  ].includes(t);
}

function isUnknown(text) {
  const t = normalizeText(text);
  return (
    t === "no lo se" ||
    t === "no lo sé" ||
    t === "ni idea" ||
    t === "depende" ||
    t === "aun no lo se" ||
    t === "aún no lo sé"
  );
}

function isLikelyValidName(value) {
  const raw = String(value || "").trim();
  const t = normalizeText(raw);

  if (!raw) return false;
  if (raw.length < 2 || raw.length > 40) return false;
  if (/\d/.test(raw)) return false;
  if (/[?@]/.test(raw)) return false;

  const blocked = [
    "quiero",
    "necesito",
    "google ads",
    "seo",
    "meta ads",
    "publicidad",
    "redes sociales",
    "diseno web",
    "diseño web",
    "consultoria",
    "consultoría",
    "precio",
    "presupuesto",
    "cuanto cuesta",
    "cuánto cuesta",
    "tienda online",
  ];

  if (blocked.some((x) => t.includes(x))) return false;

  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;

  const validWord = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü'-]+$/;
  return words.every((w) => validWord.test(w));
}

function detectService(text) {
  const t = normalizeText(text);

  if (t.includes("google ads") || t.includes("ads")) return "Google Ads";
  if (t.includes("seo")) return "SEO";
  if (t.includes("meta ads") || t.includes("facebook ads") || t.includes("instagram ads")) {
    return "Publicidad en Redes Sociales";
  }
  if (t.includes("redes sociales")) return "Publicidad en Redes Sociales";
  if (t.includes("diseno web") || t.includes("diseño web") || t.includes("pagina web") || t.includes("web")) {
    return "Diseño Web";
  }
  if (t.includes("consultoria") || t.includes("consultoría")) return "Consultoría Digital";

  return null;
}

function detectBudget(text) {
  const t = String(text || "").trim();

  const m1 = t.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(€|eur)\b/i);
  if (m1) {
    const n = Number(String(m1[1]).replace(/[.,](?=\d{3}\b)/g, ""));
    if (Number.isFinite(n) && n >= 10) return `${n} €`;
  }

  const m2 = t.match(/\b(\d{2,6})\b/);
  if (m2) {
    const n = Number(m2[1]);
    if (Number.isFinite(n) && n >= 10) return `${n} €`;
  }

  return null;
}

function detectUrgency(text) {
  const t = normalizeText(text);

  if (
    t.includes("urgente") ||
    t.includes("cuanto antes") ||
    t.includes("cuanto antes") ||
    t.includes("ya") ||
    t.includes("esta semana")
  ) {
    return "alta";
  }

  if (
    t.includes("este mes") ||
    t.includes("pronto") ||
    t.includes("en breve")
  ) {
    return "media";
  }

  if (
    t.includes("sin prisa") ||
    t.includes("mas adelante") ||
    t.includes("más adelante") ||
    t.includes("lo estoy valorando")
  ) {
    return "baja";
  }

  return null;
}

function detectEmail(text) {
  const m = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : null;
}

function detectPhone(text) {
  const digits = String(text || "").replace(/[^\d+]/g, "");
  if (digits.length >= 6) return digits;
  return null;
}

function detectCompanyType(text) {
  const t = normalizeText(text);

  if (isNegative(text)) return "proyecto personal";
  if (t.includes("autonom")) return "autonomo";
  if (t.includes("empresa")) return "empresa";
  if (t.includes("negocio")) return "negocio";
  if (t.includes("proyecto")) return "proyecto";
  if (t.includes("tienda online")) return "ecommerce";
  if (t.includes("clinica") || t.includes("clínica")) return "clinica";
  if (t.includes("despacho")) return "despacho";
  if (t.includes("agencia")) return "agencia";

  return null;
}

function detectBusinessActivity(text) {
  const raw = norm(text);
  const t = normalizeText(text);

  if (!raw) return null;
  if (isQuestion(text)) return null;
  if (isLikelyValidName(text)) return null;

  const patterns = [
    "tengo una",
    "tenemos una",
    "soy",
    "somos",
    "me dedico a",
    "nos dedicamos a",
    "vendo",
    "vendemos",
    "ofrezco",
    "ofrecemos",
  ];

  if (patterns.some((p) => t.includes(p))) return raw;
  if (t.includes("tienda online")) return raw;
  if (t.includes("ecommerce")) return raw;
  if (t.includes("clinica") || t.includes("clínica")) return raw;
  if (t.includes("abogado") || t.includes("bufete")) return raw;
  if (t.includes("dentista") || t.includes("clinica dental") || t.includes("clínica dental")) return raw;

  return null;
}

function detectMainGoal(text) {
  const raw = norm(text);
  const t = normalizeText(text);

  if (!raw) return null;
  if (isQuestion(text)) return null;

  const patterns = [
    "quiero",
    "necesito",
    "busco",
    "me gustaria",
    "me gustaría",
    "mi objetivo",
    "captar",
    "conseguir",
    "vender",
    "aumentar",
    "mejorar",
  ];

  if (patterns.some((p) => t.includes(p))) return raw;
  return null;
}

function hasValue(v, min = 2) {
  return norm(v).length >= min;
}

export function getNextStep(lead) {
  if (!isLikelyValidName(lead?.name)) return "ask_name";
  if (!hasValue(lead?.business_type)) return "ask_company_type";
  if (!hasValue(lead?.business_activity, 4)) return "ask_business_activity";
  if (!hasValue(lead?.interest_service)) return "ask_service";
  if (!hasValue(lead?.main_goal, 4)) return "ask_goal";
  if (!hasValue(lead?.budget_range)) return "ask_budget";
  if (!hasValue(lead?.urgency)) return "ask_urgency";
  if (!hasValue(lead?.email, 3) && !hasValue(lead?.phone, 6)) return "ask_contact";
  return "ready_for_ai";
}

export function getQuestionForStep(step, lead) {
  const safeName = isLikelyValidName(lead?.name) ? lead.name.trim() : null;

  switch (step) {
    case "ask_name":
      return "Antes de seguir, ¿cómo te llamas?";
    case "ask_company_type":
      return safeName
        ? `Encantado, ${safeName}. ¿Tienes una empresa, eres autónomo o es un proyecto que estás empezando?`
        : "¿Tienes una empresa, eres autónomo o es un proyecto que estás empezando?";
    case "ask_business_activity":
      return "Perfecto. ¿A qué te dedicas exactamente o cuál es vuestra actividad principal?";
    case "ask_service":
      return "Gracias. ¿Qué servicio te interesa ahora mismo: SEO, Google Ads, Redes Sociales, Diseño Web o Consultoría Digital?";
    case "ask_goal":
      return "Entendido. ¿Cuál sería tu objetivo principal ahora mismo?";
    case "ask_budget":
      return lead?.interest_service
        ? `Para ${lead.interest_service}, ¿con qué presupuesto aproximado te gustaría trabajar?`
        : "¿Con qué presupuesto aproximado te gustaría trabajar?";
    case "ask_urgency":
      return "Perfecto. ¿Qué prioridad tiene para ti? ¿Te gustaría empezar cuanto antes o lo estás valorando a medio plazo?";
    case "ask_contact":
      return "Genial. Para poder enviarte una propuesta orientativa o contactarte, ¿me dejas tu email o tu teléfono?";
    default:
      return null;
  }
}

export function resolveLeadFromUserReply({ lead, text }) {
  const patch = {};
  const currentStep = lead?.current_step || getNextStep(lead);

  const email = detectEmail(text);
  const phone = detectPhone(text);
  const service = detectService(text);
  const budget = detectBudget(text);
  const urgency = detectUrgency(text);
  const companyType = detectCompanyType(text);
  const activity = detectBusinessActivity(text);
  const goal = detectMainGoal(text);

  if (email) patch.email = email;
  if (phone) patch.phone = phone;
  if (service && !lead?.interest_service) patch.interest_service = service;
  if (budget && !lead?.budget_range) patch.budget_range = budget;
  if (urgency && !lead?.urgency) patch.urgency = urgency;

  switch (currentStep) {
    case "ask_name":
      if (isLikelyValidName(text)) patch.name = norm(text);
      break;

    case "ask_company_type":
      if (companyType) {
        patch.business_type = companyType;
      } else if (isUnknown(text)) {
        patch.business_type = "pendiente_definir";
      }
      break;

    case "ask_business_activity":
      if (activity) {
        patch.business_activity = activity;
      } else if (service && !lead?.interest_service) {
        patch.business_activity = "pendiente";
      } else if (isUnknown(text)) {
        patch.business_activity = "pendiente";
      }
      break;

    case "ask_service":
      if (service) {
        patch.interest_service = service;
      }
      break;

    case "ask_goal":
      if (goal) {
        patch.main_goal = goal;
      } else if (isUnknown(text)) {
        patch.main_goal = "pendiente_definir";
      }
      break;

    case "ask_budget":
      if (budget) {
        patch.budget_range = budget;
      } else if (isUnknown(text)) {
        patch.budget_range = "pendiente";
      }
      break;

    case "ask_urgency":
      if (urgency) {
        patch.urgency = urgency;
      } else if (isUnknown(text)) {
        patch.urgency = "pendiente";
      }
      break;

    case "ask_contact":
      if (email) patch.email = email;
      if (phone) patch.phone = phone;
      break;
  }

  const merged = { ...lead, ...patch };
  const nextStep = getNextStep(merged);

  return {
    patch,
    nextStep,
    question: nextStep === "ready_for_ai" ? null : getQuestionForStep(nextStep, merged),
  };
}