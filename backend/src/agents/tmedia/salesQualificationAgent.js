import { extractLeadDataFromText, looksLikeValidName } from "../../lib/leadExtractor.js";
import {
  QUALIFICATION_FIELDS,
  compactString,
} from "../core/agentResponseSchema.js";
import { isGreetingOnly } from "../../lib/conversationIntent.js";

function normalizeService(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "unknown") return null;
  return raw || null;
}

function inferAccountService(appConfig = null) {
  const offers = configuredOffers(appConfig);
  const brandName = String(appConfig?.brand?.name || "").trim();
  return offers.find((offer) => offer.toLowerCase() === brandName.toLowerCase()) || null;
}

function configuredOffers(appConfig = null) {
  const offersSource = Object.keys(appConfig?.offers || {}).length
    ? appConfig.offers
    : appConfig?.services || {};
  return Object.keys(offersSource || {}).filter(Boolean);
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isBudgetPurposeQuestion(value = "") {
  const t = normalizeText(value);
  return (
    /^(para que|por que|porque|y eso para que|para que lo quereis|para que lo necesitas)\b/.test(t) ||
    ((t.includes("inversion") || t.includes("presupuesto")) &&
      (t.includes("para que") || t.includes("por que") || t.includes("porque")))
  );
}

function isClarificationQuestion(value = "") {
  const t = normalizeText(value);
  return /^(perdon|perdona|disculpa|como|no entiendo|que quieres decir|a que te refieres)\??$/.test(t);
}

function isAskingBusinessContextStep(step = "") {
  const normalized = String(step || "").trim();
  return normalized === "ask_business_type" || normalized === "ask_business_context";
}

function isUsefulBusinessContextAnswer(value = "") {
  const raw = cleanText(value);
  const normalized = normalizeText(raw);
  if (!raw || raw.length < 4) return false;
  if (isGreetingOnly(raw) || isClarificationQuestion(raw)) return false;
  if (looksLikeEmail(raw) || looksLikePhone(raw)) return false;
  if (/^(si|no|ok|vale|gracias|perfecto|por whatsapp|email|correo)$/i.test(normalized)) return false;
  if (/\b(objetivo|quiero|necesito|busco|presupuesto|precio|cuanto cuesta)\b/.test(normalized)) return false;
  return true;
}

function latestAssistantText(messages = []) {
  const latest = [...(messages || [])]
    .reverse()
    .find((message) => message?.role === "assistant");
  return cleanText(latest?.content || latest?.text || "");
}

function lastAssistantAskedBudget(messages = []) {
  const text = normalizeText(latestAssistantText(messages));
  return text.includes("presupuesto") || text.includes("inversion");
}

function lastAssistantAskedBusinessType(messages = []) {
  const text = normalizeText(latestAssistantText(messages));
  return text.includes("tipo de negocio") || text.includes("negocio o proyecto");
}

function recentUserMessages(messages = [], limit = 6) {
  return [...(messages || [])]
    .reverse()
    .filter((message) => message?.role === "user")
    .slice(0, limit)
    .map((message) => cleanText(message?.content || message?.text || ""))
    .filter(Boolean);
}

function inferGoalFromRecentMessages(messages = [], currentMessage = "", existingLead = null) {
  const candidates = [currentMessage, ...recentUserMessages(messages, 8)];
  for (const candidate of candidates) {
    const extracted = extractLeadDataFromText(candidate, existingLead || {});
    if (extracted?.main_goal) return extracted.main_goal;
  }
  return null;
}

function inferBusinessContextFromRecentMessages(messages = [], currentMessage = "", existingLead = null) {
  const candidates = [currentMessage, ...recentUserMessages(messages, 8)];
  for (const candidate of candidates) {
    const extracted = extractLeadDataFromText(candidate, existingLead || {});
    if (extracted?.business_activity) return extracted.business_activity;
    if (extracted?.current_situation) return extracted.current_situation;
    if (extracted?.pain_points) return extracted.pain_points;
    const t = normalizeText(candidate);
    if (/\b(local|provincial|granada|loja|antequera|zona|zonas|colindantes|municipio|provincia)\b/.test(t)) {
      return cleanText(candidate);
    }
  }
  return null;
}

function hasUserAlreadyAnsweredComplaint(value = "") {
  const t = normalizeText(value);
  return (
    /\b(ya\s+(se\s+lo\s+)?(he|hemos)\s+(comentado|dicho|explicado)|ya\s+lo\s+he\s+explicado|ya\s+esta\s+todo|lo\s+he\s+explicado\s+todo)\b/.test(t) ||
    /\b(no\s+sois\s+de\s+fiar|no\s+me\s+da\s+confianza|no\s+confio|me\s+esta\s+dando\s+a\s+pensar)\b/.test(t)
  );
}

function buildAlreadyAnsweredReply(lead = {}, appConfig = null) {
  const brandName = String(appConfig?.brand?.name || "el equipo").trim();
  const facts = [
    lead?.interest_service ? `servicio: ${lead.interest_service}` : null,
    lead?.main_goal ? `objetivo: ${lead.main_goal}` : null,
    lead?.business_activity || lead?.current_situation
      ? `contexto: ${lead.business_activity || lead.current_situation}`
      : null,
    lead?.company_name ? `empresa/proyecto: ${lead.company_name}` : null,
  ].filter(Boolean);
  const summary = facts.length ? `Tengo anotado ${facts.join("; ")}.` : "Tienes razon: ya me has dado contexto suficiente.";
  return `${summary} Perdona por repetir la pregunta. Con lo que has contado, lo correcto es que ${brandName} lo revise y te responda con una orientacion concreta, sin prometer resultados que no se puedan demostrar.`;
}

export function buildBudgetPurposeReply() {
  return "Buena pregunta. Cuando pregunto por inversion o presupuesto no es para venderte algo a ciegas: es para ajustar el alcance y no proponerte una solucion sobredimensionada. No es obligatorio dar una cifra; podemos seguir sin presupuesto y orientarte primero por objetivo, contexto y necesidades.";
}

function buildGreetingReply(appConfig = null) {
  const configured = String(appConfig?.agent?.initial_message || "").trim();
  if (configured) return configured;
  return "Hola. Cuentame que quieres conseguir o que necesitas revisar y te oriento paso a paso.";
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanText(value));
}

function looksLikePhone(value) {
  const digits = cleanText(value).replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

function safeName(value) {
  const name = cleanText(value);
  if (!name || name.length < 3) return null;
  if (looksLikeEmail(name) || looksLikePhone(name)) return null;
  return looksLikeValidName(name) ? name : null;
}

function safeEmail(value) {
  const email = cleanText(value).toLowerCase();
  return looksLikeEmail(email) ? email : null;
}

function safePhone(value) {
  const digits = cleanText(value).replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function safeCompanyName(value) {
  const company = cleanText(value);
  const normalized = normalizeText(company);
  if (!company || company.length < 2 || company.length > 80) return null;
  if (looksLikeEmail(company) || looksLikePhone(company)) return null;
  if (/^(prefiero|quiero|necesito|busco|me llamo|mi nombre|soy |hola|gracias|ok|vale)\b/.test(normalized)) {
    return null;
  }
  if (normalized.includes("email") || normalized.includes("whatsapp") || normalized.includes("telefono")) {
    return null;
  }
  return company;
}

function buildLeadPatch(fields = {}) {
  const patch = {};
  const name = safeName(fields.name);
  const email = safeEmail(fields.email);
  const phone = safePhone(fields.phone);
  const companyName = safeCompanyName(fields.company_name);
  if (name) patch.name = name;
  if (email) patch.email = email;
  if (phone) patch.phone = phone;
  if (fields.service) patch.interest_service = normalizeService(fields.service);
  if (fields.budget_range) patch.budget_range = fields.budget_range;
  if (fields.urgency) patch.urgency = fields.urgency;
  if (fields.business_type) patch.business_type = fields.business_type;
  if (fields.business_activity) patch.business_activity = fields.business_activity;
  if (companyName) patch.company_name = companyName;
  if (fields.objective) patch.main_goal = fields.objective;
  if (fields.preferred_contact_channel) patch.preferred_contact_channel = fields.preferred_contact_channel;
  else if (fields.source_channel) patch.preferred_contact_channel = fields.source_channel === "whatsapp" ? "whatsapp" : null;
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value));
}

function normalizeForMatch(value = "") {
  return normalizeText(value);
}

function serviceMentionedInMessage(service = "", message = "") {
  const serviceKey = normalizeForMatch(service);
  const text = normalizeForMatch(message);
  if (!serviceKey || !text) return false;
  if (serviceKey === "seo") return /\bseo\b|posicionamiento|organico|salir en google/.test(text);
  if (serviceKey.includes("google ads")) return /\bgoogle ads\b|\bsem\b|anuncios en google/.test(text);
  if (serviceKey.includes("redes")) return /redes sociales|meta ads|facebook ads|instagram ads/.test(text);
  if (serviceKey.includes("diseno") || serviceKey.includes("dise")) return /diseno web|diseño web|pagina web|página web|web corporativa/.test(text);
  return text.includes(serviceKey);
}

function safeServiceFromFields({ parsedService, fallbackService, routerService, message, appConfig }) {
  const brandService = inferAccountService(appConfig);
  if (brandService) return brandService;

  const candidates = [fallbackService, routerService, parsedService].filter(Boolean);
  return candidates.find((service) => serviceMentionedInMessage(service, message)) || null;
}

function getCaptureFields(appConfig = null) {
  return appConfig?.lead_capture?.fields || {};
}

function shouldCapture(appConfig = null, field) {
  return getCaptureFields(appConfig)?.[field] === true;
}

function shouldCaptureAnyContact(appConfig = null) {
  return shouldCapture(appConfig, "email") || shouldCapture(appConfig, "phone");
}

function hasContact(lead = {}) {
  return Boolean(lead?.email || lead?.phone);
}

function hasBusinessContext(lead = {}) {
  return Boolean(lead?.business_activity || lead?.current_situation || lead?.pain_points);
}

function getCustomCaptureFields(appConfig = null) {
  const coreFields = new Set([
    "name",
    "company_name",
    "business_type",
    "business_activity",
    "interest_service",
    "main_goal",
    "budget_range",
    "urgency",
    "preferred_contact_channel",
    "email",
    "phone",
  ]);
  return Array.isArray(appConfig?.lead_capture?.custom_fields)
    ? appConfig.lead_capture.custom_fields.filter((field) => !coreFields.has(field?.key))
    : [];
}

function getMissingRequiredCustomField(lead = {}, appConfig = null) {
  const customFields = lead?.custom_fields && typeof lead.custom_fields === "object"
    ? lead.custom_fields
    : {};
  return getCustomCaptureFields(appConfig).find((field) => {
    if (field?.required !== true || !field?.key) return false;
    const value = customFields[field.key];
    return value === null || value === undefined || String(value).trim() === "";
  }) || null;
}

function getActiveCustomField(lead = {}, appConfig = null) {
  const step = String(lead?.current_step || "");
  if (!step.startsWith("custom:")) return null;
  const key = step.slice("custom:".length);
  return getCustomCaptureFields(appConfig).find((field) => field?.key === key) || null;
}

function customFieldPrompt(field = {}) {
  return String(field?.prompt || field?.label || "Me das este dato?").trim();
}

function getNextQuestionState(lead = {}, patch = {}, sourceChannel = "web", appConfig = null) {
  const merged = { ...(lead || {}), ...(patch || {}) };
  if (lead?.custom_fields || patch?.custom_fields) {
    merged.custom_fields = {
      ...(lead?.custom_fields || {}),
      ...(patch?.custom_fields || {}),
    };
  }
  const offers = configuredOffers(appConfig);
  if (lead?.current_step === "completed") {
    return {
      step: "completed",
      question: Object.keys(patch || {}).length
        ? "Perfecto, actualizo ese dato en tu solicitud."
        : "Perfecto, lo anado al contexto de tu solicitud.",
    };
  }
  if (shouldCapture(appConfig, "main_goal") && !merged.main_goal) {
    return { step: "ask_main_goal", question: "Cual es el objetivo principal que quieres conseguir?" };
  }
  if (shouldCapture(appConfig, "business_type") && !merged.business_type && !merged.business_activity) {
    return { step: "ask_business_type", question: "Que tipo de negocio o proyecto tienes?" };
  }
  if (shouldCapture(appConfig, "business_activity") && !merged.business_activity && !hasBusinessContext(merged)) {
    return {
      step: "ask_business_activity",
      question:
        "Vale, para orientarte como lo haria una persona del equipo: cuentame un poco a que te dedicas exactamente y como estas captando clientes ahora.",
    };
  }
  if (shouldCapture(appConfig, "interest_service") && !merged.interest_service) {
    return {
      step: "ask_interest_service",
      question: offers.length
        ? `Para captar clientes, que canal quieres valorar primero: ${offers.slice(0, 5).join(", ")}?`
        : "Que necesitas conseguir o resolver ahora mismo?",
    };
  }
  if (shouldCapture(appConfig, "urgency") && !merged.urgency) {
    return { step: "ask_urgency", question: "Te corre prisa ponerlo en marcha o es algo para mas adelante?" };
  }
  if (shouldCapture(appConfig, "budget_range") && !merged.budget_range) {
    return { step: "ask_budget", question: "Quieres empezar con la beta gratuita o tienes alguna inversion prevista mas adelante?" };
  }
  if (shouldCapture(appConfig, "company_name") && !merged.company_name) {
    return { step: "ask_company_name", question: "Como se llama tu empresa o proyecto?" };
  }
  if (shouldCapture(appConfig, "name") && !merged.name) {
    return { step: "ask_name", question: "A nombre de quien dejamos la solicitud?" };
  }
  if (shouldCapture(appConfig, "preferred_contact_channel") && !merged.preferred_contact_channel) {
    return {
      step: "ask_preferred_contact_channel",
      question:
        "Genial, con ese contexto ya se puede pasar a una persona. Prefieres continuar por WhatsApp o por email?",
    };
  }
  if (shouldCaptureAnyContact(appConfig) && !hasContact(merged)) {
    if (shouldCapture(appConfig, "email") && shouldCapture(appConfig, "phone")) {
      return { step: "ask_contact", question: "Para que podamos revisarlo y responderte bien, me dejas un email o telefono de contacto?" };
    }
    if (shouldCapture(appConfig, "email")) return { step: "ask_email", question: "Me dejas un email de contacto?" };
    return { step: "ask_phone", question: "Me dejas un telefono o WhatsApp de contacto?" };
  }
  const missingCustom = getMissingRequiredCustomField(merged, appConfig);
  if (missingCustom) return { step: `custom:${missingCustom.key}`, question: customFieldPrompt(missingCustom) };
  return { step: "ready", question: "Gracias. Con esto ya puedo preparar el siguiente paso." };
}

function pickNextQuestion(lead = {}, patch = {}, sourceChannel = "web", appConfig = null) {
  return getNextQuestionState(lead, patch, sourceChannel, appConfig).question;
}

export async function runSalesQualificationAgent(context = {}) {
  const extracted = extractLeadDataFromText(context.message, context.lead || {});
  const activeStep = String(context.lead?.current_step || "").trim();
  const businessContextAnswer =
    (isAskingBusinessContextStep(activeStep) || lastAssistantAskedBusinessType(context.messages)) &&
    isUsefulBusinessContextAnswer(context.message)
      ? cleanText(context.message)
      : null;
  const inferredGoal = extracted.main_goal ||
    context.lead?.main_goal ||
    inferGoalFromRecentMessages(context.messages, context.message, context.lead || {});
  const inferredBusinessContext = extracted.business_activity ||
    businessContextAnswer ||
    context.lead?.business_activity ||
    context.lead?.current_situation ||
    inferBusinessContextFromRecentMessages(context.messages, context.message, context.lead || {});
  const fallbackFields = {
    ...QUALIFICATION_FIELDS,
    name: extracted.name || null,
    email: extracted.email || null,
    phone: extracted.phone || (context.sourceChannel === "whatsapp" ? context.externalUserId : null),
    service: safeServiceFromFields({
      parsedService: null,
      fallbackService: extracted.interest_service,
      routerService: context.routerResult?.service,
      message: context.message,
      appConfig: context.appConfig,
    }),
    budget_range: extracted.budget_range || null,
    urgency: extracted.urgency || null,
    business_type: extracted.business_type || null,
    business_activity: inferredBusinessContext || null,
    company_name: extracted.company_name || null,
    objective: inferredGoal || null,
    preferred_contact_channel: extracted.preferred_contact_channel || null,
    source_channel: context.sourceChannel || "web",
  };

  if (hasUserAlreadyAnsweredComplaint(context.message)) {
    const lead_patch = buildLeadPatch(fallbackFields);
    const mergedLead = { ...(context.lead || {}), ...lead_patch };
    return {
      fields: fallbackFields,
      lead_patch: {
        ...lead_patch,
        current_step: "qualifying",
        last_question: "already_answered_acknowledged",
      },
      assistant_message: compactString(buildAlreadyAnsweredReply(mergedLead, context.appConfig), 700),
      tools_used: ["leadExtractor"],
    };
  }

  if (isGreetingOnly(context.message)) {
    return {
      fields: fallbackFields,
      lead_patch: {},
      assistant_message: compactString(buildGreetingReply(context.appConfig), 500),
      tools_used: ["leadExtractor"],
    };
  }

  if (
    isBudgetPurposeQuestion(context.message) ||
    (isClarificationQuestion(context.message) && lastAssistantAskedBudget(context.messages))
  ) {
    return {
      fields: fallbackFields,
      lead_patch: {},
      assistant_message: compactString(buildBudgetPurposeReply(), 500),
      tools_used: ["leadExtractor"],
    };
  }

  const activeCustomField = getActiveCustomField(context.lead || {}, context.appConfig);
  if (activeCustomField) {
    const lead_patch = {
      custom_fields: {
        ...(context.lead?.custom_fields || {}),
        [activeCustomField.key]: context.message,
      },
      current_step: "qualifying",
      last_question: "custom_answered",
    };
    const assistant_message = pickNextQuestion(
      context.lead || {},
      lead_patch,
      context.sourceChannel,
      context.appConfig
    );
    const nextCustom = getMissingRequiredCustomField(
      { ...(context.lead || {}), ...lead_patch },
      context.appConfig
    );
    if (nextCustom && assistant_message === customFieldPrompt(nextCustom)) {
      lead_patch.current_step = `custom:${nextCustom.key}`;
      lead_patch.last_question = assistant_message;
    }
    return {
      fields: fallbackFields,
      lead_patch,
      assistant_message: compactString(assistant_message, 500),
      tools_used: ["leadExtractor"],
    };
  }

  const fields = {
    ...fallbackFields,
    // Una respuesta libre a "¿a qué te dedicas?" describe actividad; no se
    // convierte automáticamente en el nombre legal/comercial de la empresa.
    company_name: businessContextAnswer ? null : fallbackFields.company_name,
  };

  const lead_patch = buildLeadPatch(fields);
  if (context.lead?.name && lead_patch.name) delete lead_patch.name;
  const nextState = getNextQuestionState(context.lead || {}, lead_patch, context.sourceChannel, context.appConfig);
  const assistant_message =
    isBudgetPurposeQuestion(context.message) && lastAssistantAskedBudget(context.messages)
      ? buildBudgetPurposeReply()
      : nextState.question;
  if (!lead_patch.current_step && nextState.step && nextState.step !== "ready") {
    lead_patch.current_step = nextState.step;
    lead_patch.last_question = assistant_message;
  }
  const nextCustom = getMissingRequiredCustomField(
    { ...(context.lead || {}), ...lead_patch },
    context.appConfig
  );
  if (nextCustom && assistant_message === customFieldPrompt(nextCustom)) {
    lead_patch.current_step = `custom:${nextCustom.key}`;
    lead_patch.last_question = assistant_message;
  }

  return {
    fields: { ...QUALIFICATION_FIELDS, ...fields },
    lead_patch,
    assistant_message: compactString(assistant_message, 500),
    tools_used: ["leadExtractor"],
  };
}

export const __salesQualificationTestables = {
  getNextQuestionState,
  safeServiceFromFields,
  lastAssistantAskedBudget,
  lastAssistantAskedBusinessType,
};
