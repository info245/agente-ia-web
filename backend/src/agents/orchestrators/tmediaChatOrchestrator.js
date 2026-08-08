import { buildTmediaAgentContext } from "../core/agentContextBuilder.js";
import { runAgent } from "../core/agentRouter.js";
import {
  saveMessage,
  saveConversationEvent,
  getLeadByConversationId,
  listConversationEventsByType,
} from "../tools/supabaseTools.js";
import { decideEmailSend } from "../../lib/leadEmailPolicy.js";
import { extractLeadDataFromText } from "../../lib/leadExtractor.js";
import {
  getMissingLeadRequirements,
  getLeadRequirementPrompt,
  hasConfiguredLeadRequirements,
  hasRequiredLeadData,
} from "../../lib/leadRequirements.js";
import { detectPriorityIntent } from "../../lib/conversationIntent.js";
import { isCapabilityQuestion } from "../../lib/capabilityPolicy.js";
import {
  buildDeterministicConversationReply,
  buildPrivacyBoundaryReply,
} from "../tmedia/conversationAgent.js";

function finalReply({ selectedResult, closingResult, memoryResult, context = {} }) {
  if (closingResult?.chat_completed && closingResult?.closing_message) {
    return sanitizeCommercialReply(closingResult.closing_message);
  }
  if (selectedResult?.assistant_message) return sanitizeCommercialReply(selectedResult.assistant_message);
  if (selectedResult?.response) return sanitizeCommercialReply(selectedResult.response);
  const deterministic = buildDeterministicConversationReply(context);
  if (deterministic.handled && deterministic.assistant_message) {
    return sanitizeCommercialReply(deterministic.assistant_message);
  }
  return "No he podido responder bien a ese mensaje y no voy a sustituirlo por una pregunta genérica. Puedes reformularlo o pedirme que lo derive al equipo.";
}

function sanitizeCommercialReply(reply = "") {
  const text = String(reply || "").trim();
  if (!text) return text;

  const cleaned = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/consentimiento|consient|autoriza/i.test(sentence))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || text;
}

const BANNED_GENERIC_REPLY = /gracias lo tengo en cuenta me das un poco mas de detalle para poder orientarte mejor/;

function previousUserText(messages = [], currentMessage = "") {
  const current = normalizeText(currentMessage);
  const users = (messages || [])
    .filter((message) => message?.role === "user")
    .map((message) => String(message?.content || message?.text || "").trim())
    .filter(Boolean);
  if (users.length && normalizeText(users.at(-1)) === current) users.pop();
  return users.at(-1) || "";
}

function buildLoopBreakerReply({ currentMessage = "", lead = {}, appConfig = null } = {}) {
  const excerpt = String(currentMessage || "")
    .replace(/[¿?]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const nextMissing = getMissingLeadRequirements(lead || {}, appConfig)[0];
  const nextQuestion = nextMissing ? getLeadRequirementPrompt(nextMissing, appConfig) : "";
  const acknowledgement = excerpt
    ? `He entendido tu último mensaje: «${excerpt}».`
    : "He entendido tu último mensaje.";

  if (nextQuestion) {
    return `${acknowledgement} La respuesta anterior se estaba repitiendo y la he bloqueado. Para avanzar sin volver atrás: ${nextQuestion}`;
  }
  return `${acknowledgement} La respuesta anterior se estaba repitiendo y la he bloqueado. No voy a inventar una respuesta; puedo dejar este punto registrado para que lo revise el equipo.`;
}

function buildSafeRepeatedIntentReply({ currentMessage = "", reply = "", appConfig = null } = {}) {
  const priorityIntent = detectPriorityIntent(currentMessage);
  if (priorityIntent === "prompt_injection") {
    return buildPrivacyBoundaryReply(appConfig, currentMessage, true);
  }
  if (priorityIntent === "human_request") {
    return "Mantengo tu petición de atención humana y no voy a devolverte al cuestionario comercial. El equipo debe continuar desde el contexto ya recogido.";
  }
  if (priorityIntent === "loop_complaint") {
    return "Entendido: no repetiré la pregunta anterior. Si falta una precisión, debe ser concreta y distinta; si no, responderé con lo que ya has dado.";
  }
  if (priorityIntent === "agent_question") {
    return "No me corresponde decir que soy mejor que otro asistente. Debo demostrar utilidad respondiendo con contexto, límites claros y sin inventar capacidades.";
  }
  if (priorityIntent === "booking_request") {
    return "La limitación sigue siendo la misma: no puedo reservar la cita directamente desde este chat, pero sí recoger los datos para que el equipo continúe y facilite el acceso gratuito a la beta.";
  }
  if (isCapabilityQuestion(currentMessage)) {
    return "La comprobación debe hacerse para cada sistema por separado. Tampoco puedo confirmar esa conexión sin documentación específica; hay que validar su API o sus webhooks y el entorno concreto antes de prometerla.";
  }
  if (/\b(precio|precios|cuanto|cuesta|tarifa|coste|plan|planes|pricing)\b/.test(normalizeText(currentMessage))) {
    return `Para responderte directamente sin cambiar la información: ${String(reply || "").trim()}`;
  }
  return "";
}

function guardAgainstReplyLoop({
  reply = "",
  messages = [],
  currentMessage = "",
  lead = {},
  appConfig = null,
} = {}) {
  const normalizedReply = normalizeText(reply);
  const recentAssistantReplies = (messages || [])
    .filter((message) => message?.role === "assistant")
    .slice(-6)
    .map((message) => normalizeText(message?.content || message?.text || ""))
    .filter(Boolean);
  const currentUserChanged = normalizeText(previousUserText(messages, currentMessage)) !== normalizeText(currentMessage);
  const repeatedVerbatim = currentUserChanged && recentAssistantReplies.includes(normalizedReply);
  const bannedGeneric = BANNED_GENERIC_REPLY.test(normalizedReply);

  if (repeatedVerbatim && !bannedGeneric) {
    const safeRepeatedIntentReply = buildSafeRepeatedIntentReply({ currentMessage, reply, appConfig });
    if (safeRepeatedIntentReply) return sanitizeCommercialReply(safeRepeatedIntentReply);
  }

  if (!reply || bannedGeneric || repeatedVerbatim) {
    const deterministic = buildDeterministicConversationReply({
      message: currentMessage,
      messages,
      lead,
      appConfig,
    });
    const deterministicText = sanitizeCommercialReply(deterministic?.assistant_message || "");
    if (
      deterministic?.handled &&
      deterministicText &&
      !recentAssistantReplies.includes(normalizeText(deterministicText)) &&
      !BANNED_GENERIC_REPLY.test(normalizeText(deterministicText))
    ) {
      return deterministicText;
    }
    return sanitizeCommercialReply(buildLoopBreakerReply({ currentMessage, lead, appConfig }));
  }

  return reply;
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function recentUserTexts(messages = [], currentMessage = "", limit = 8) {
  return [
    String(currentMessage || "").trim(),
    ...(messages || [])
      .filter((message) => message?.role === "user")
      .slice(-limit)
      .map((message) => String(message?.content || message?.text || "").trim()),
  ].filter(Boolean);
}

function inferGoalFromMessages(messages = [], currentMessage = "", lead = {}) {
  if (lead?.main_goal) return lead.main_goal;
  for (const text of recentUserTexts(messages, currentMessage)) {
    const extracted = extractLeadDataFromText(text, lead || {});
    if (extracted?.main_goal) return extracted.main_goal;
  }
  return "";
}

function inferContextFromMessages(messages = [], currentMessage = "", lead = {}) {
  if (lead?.business_activity) return lead.business_activity;
  if (lead?.current_situation) return lead.current_situation;
  let firstContext = "";
  for (const text of recentUserTexts(messages, currentMessage)) {
    const extracted = extractLeadDataFromText(text, lead || {});
    if (extracted?.business_activity && !firstContext) firstContext = extracted.business_activity;
    if (extracted?.current_situation && !firstContext) firstContext = extracted.current_situation;
    const normalized = normalizeText(text);
    if (/\b(local|provincial|granada|loja|antequera|zonas|colindantes|piscinas|anos nos avalan|50 anos)\b/.test(normalized)) {
      if (/\b(local|provincial|granada|loja|antequera|zonas|colindantes)\b/.test(normalized)) {
        return text;
      }
      if (!firstContext) firstContext = text;
    }
  }
  return firstContext;
}

function userIsFrustratedOrSaysAlreadyAnswered(message = "") {
  const t = normalizeText(message);
  return (
    /\b(ya se lo he comentado|ya lo he comentado|ya lo he explicado|ya esta todo|ya lo he explicado todo|se lo he explicado|lo he explicado todo)\b/.test(t) ||
    /\b(no sois de fiar|no se f[ií]ar|no me fio|no me f[ií]o|no me da confianza|me esta dando a pensar)\b/.test(t)
  );
}

function userReportsProblemWithSancho(message = "") {
  const t = normalizeText(message);
  return (
    /\b(la (web|pagina) (que )?no funciona (bien )?es la tuya|la que no funciona (bien )?es la tuya)\b/.test(t) ||
    /\b(tu|vuestra|esta) (web|pagina|chat|asistente)\b.*\b(no funciona|falla|fallo|problema|error)\b/.test(t) ||
    /\b(no funciona|falla|fallo|problema|error)\b.*\b(sancho|sanchito|tu web|vuestra web|este chat|esta web)\b/.test(t) ||
    /\b(sancho|sanchito)\b.*\b(no funciona|falla|fallo|problema|error)\b/.test(t)
  );
}

function buildSanchoSupportReply() {
  return "Entiendo: te refieres a que la propia web o el asistente de Sancho no está funcionando bien. Perdona, te había interpretado como una consulta comercial y por eso repetí la pregunta. ¿Qué fallo concreto estás viendo para que pueda registrarlo y ayudarte?";
}

function buildHumanHandoffReply(appConfig = null, { handoffRecorded = false, notificationResult = null } = {}) {
  const channels = [];
  if (String(appConfig?.contact?.public_whatsapp_number || "").trim()) channels.push("WhatsApp");
  if (String(appConfig?.contact?.support_email || "").trim()) channels.push("email");
  const registered = handoffRecorded || notificationResult?.sent_internal;
  if (registered && channels.length) {
    return `Sí. He dejado registrada la petición para que la revise el equipo. No voy a seguir con el cuestionario comercial; también puedes continuar por ${channels.join(" o ")}.`;
  }
  if (registered) {
    return "Sí. He dejado registrada la petición para que la revise el equipo. No voy a seguir con el cuestionario comercial.";
  }
  if (channels.length) {
    return `No puedo confirmar un envío interno desde este chat. No voy a seguir con el cuestionario comercial; puedes continuar con una persona del equipo por ${channels.join(" o ")}.`;
  }
  return "No puedo confirmar un envío interno ni prometer que el equipo haya recibido un aviso. Sí he identificado que solicitas atención humana y no seguiré con el cuestionario comercial.";
}

function buildGenericSupportReply() {
  return "Entiendo que se trata de una incidencia, no de una consulta comercial. Cuéntame qué está fallando, desde cuándo ocurre y si aparece algún mensaje de error para poder dejar el caso bien definido.";
}

function buildOdooIntegrationReply({ messages = [], currentMessage = "" } = {}) {
  const userTexts = recentUserTexts(messages, currentMessage, 8);
  const thread = normalizeText(userTexts.join(" "));
  const current = normalizeText(currentMessage);
  const isOdooThread = /\b(odoo|erp)\b/.test(thread);
  if (!isOdooThread) return null;

  if (/\b(api|mcp|como se integra|como integrar|integracion)\b/.test(current)) {
    return "La vía base es la API de Odoo. MCP no viene integrado automáticamente: solo se usaría si se configura un servidor o conector MCP específico sobre esa API. Para automatizar campañas habría que definir qué datos salen de Odoo, qué acciones vuelven al ERP y con qué plataformas publicitarias se conectará. ¿Usas Odoo Online, Odoo.sh o una instalación propia?";
  }

  if (/\b(automatizar|automatizacion)\b.*\b(campana|campanas|marketing|ads|anuncios)\b/.test(current)) {
    return "Perfecto: el objetivo es automatizar campañas usando los datos de Odoo. El siguiente paso ya no es volver a preguntarte el objetivo, sino concretar la arquitectura: ¿usas Odoo Online, Odoo.sh o una instalación propia, y quieres conectarlo con Google Ads, Meta Ads o ambas?";
  }

  return null;
}

function asksForAlreadyKnownObjective(reply = "", lead = {}, messages = [], currentMessage = "") {
  const t = normalizeText(reply);
  if (!/\b(objetivo principal|objetivo quieres conseguir|que quieres conseguir|objetivo especifico)\b/.test(t)) {
    return false;
  }
  return Boolean(inferGoalFromMessages(messages, currentMessage, lead));
}

const QUESTION_RULES = [
  { field: "main_goal", pattern: /\b(cual es tu objetivo|que objetivo|que quieres conseguir|que buscas lograr|que resultado buscas)\b/ },
  { field: "business_context", pattern: /\b(tipo de negocio|a que te dedicas|negocio o proyecto|captando clientes ahora)\b/ },
  { field: "company_name", pattern: /\b(como se llama tu empresa|nombre de (tu|la) empresa|como se llama tu proyecto)\b/ },
  { field: "name", pattern: /\b(como te llamas|cual es tu nombre|a nombre de quien)\b/ },
  { field: "contact", pattern: /\b(me dejas|facilitas|cual es tu)\b.*\b(email|correo|telefono|whatsapp|contacto)\b|\b(email|correo|telefono) de contacto\b/ },
  { field: "preferred_contact_channel", pattern: /\b(prefieres|preferido)\b.*\b(email|correo|whatsapp|telefono)\b/ },
  { field: "budget_range", pattern: /\b(que|cual|tienes|alguna)\b.*\b(presupuesto|inversion)\b|\b(beta gratuita|inversion prevista)\b/ },
  { field: "urgency", pattern: /\b(urgencia|te corre prisa|cuando quieres|para cuando)\b/ },
  { field: "interest_service", pattern: /\b(que servicio|cual servicio|servicio te interesa|canal quieres valorar)\b/ },
];

function questionField(value = "") {
  const text = normalizeText(value);
  return QUESTION_RULES.find((rule) => rule.pattern.test(text))?.field || null;
}

function enrichLeadFromMessages(lead = {}, messages = [], currentMessage = "") {
  const enriched = { ...(lead || {}) };
  for (const text of recentUserTexts(messages, currentMessage, 10).reverse()) {
    const extracted = extractLeadDataFromText(text, enriched);
    for (const field of [
      "name", "email", "phone", "interest_service", "urgency", "budget_range",
      "business_type", "business_activity", "company_name", "main_goal",
      "current_situation", "pain_points", "preferred_contact_channel",
    ]) {
      if (!enriched[field] && extracted?.[field]) enriched[field] = extracted[field];
    }
  }
  return enriched;
}

function leadKnowsField(lead = {}, field = "") {
  if (field === "contact") return Boolean(lead?.email || lead?.phone);
  if (field === "business_context") {
    return Boolean(lead?.business_type || lead?.business_activity || lead?.current_situation || lead?.pain_points);
  }
  return Boolean(lead?.[field]);
}

function enforceNoRepeatedQuestions({ reply = "", lead = {}, messages = [], currentMessage = "", appConfig = null } = {}) {
  const enrichedLead = enrichLeadFromMessages(lead, messages, currentMessage);
  const sentences = String(reply || "").split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept = sentences.filter((sentence) => {
    if (!sentence.includes("?")) return true;
    const field = questionField(sentence);
    return !field || !leadKnowsField(enrichedLead, field);
  });
  const oneQuestion = [];
  let hasQuestion = false;
  for (const sentence of kept) {
    if (sentence.includes("?")) {
      if (hasQuestion) continue;
      hasQuestion = true;
    }
    oneQuestion.push(sentence);
  }
  if (kept.length === sentences.length && oneQuestion.length === sentences.length) return reply;
  if (oneQuestion.length) return oneQuestion.join(" ").trim();

  const nextMissing = getMissingLeadRequirements(enrichedLead, appConfig)[0];
  return nextMissing
    ? `Ya tengo ese dato. ${getLeadRequirementPrompt(nextMissing, appConfig)}`
    : "Ya tengo la información necesaria. Voy a continuar desde aquí sin repetir preguntas.";
}

function configuredOffers(appConfig = null) {
  const offersSource = Object.keys(appConfig?.offers || {}).length
    ? appConfig.offers
    : appConfig?.services || {};
  return Object.keys(offersSource || {}).filter(Boolean);
}

function getRecoveryServiceLabel(lead = {}, appConfig = null) {
  const explicitService = String(lead?.interest_service || "").trim();
  if (explicitService) return explicitService;

  const offers = configuredOffers(appConfig);
  if (offers.length === 1) return offers[0];

  const brandName = String(appConfig?.brand?.name || "").trim();
  if (brandName && offers.some((offer) => offer.toLowerCase() === brandName.toLowerCase())) {
    return brandName;
  }

  return "";
}

function buildRecoveryReply({ lead = {}, messages = [], currentMessage = "", appConfig = null } = {}) {
  const goal = inferGoalFromMessages(messages, currentMessage, lead);
  const context = inferContextFromMessages(messages, currentMessage, lead);
  const service = getRecoveryServiceLabel(lead, appConfig);
  const brandName = String(appConfig?.brand?.name || "el equipo").trim();
  const facts = [
    service ? `servicio: ${service}` : null,
    goal ? `objetivo: ${goal}` : null,
    context ? `contexto/zona: ${context}` : null,
  ].filter(Boolean);
  const summary = facts.length ? `Tengo anotado ${facts.join("; ")}.` : "Tienes razon, ya me has dado contexto suficiente.";
  return `${summary} Perdona por repetir la pregunta. No voy a inventar resultados ni forzar un cuestionario; lo serio es entender tu negocio, tus datos disponibles y el siguiente paso que necesitas. Con esto, ${brandName} deberia revisarlo y responderte con una orientacion concreta.`;
}

function repairFinalReply({
  reply = "",
  lead = {},
  messages = [],
  currentMessage = "",
  appConfig = null,
  handoffRecorded = false,
  notificationResult = null,
} = {}) {
  const priorityIntent = detectPriorityIntent(currentMessage);
  if (priorityIntent === "human_request") {
    return buildHumanHandoffReply(appConfig, { handoffRecorded, notificationResult });
  }
  if (userReportsProblemWithSancho(currentMessage)) {
    return buildSanchoSupportReply();
  }
  if (priorityIntent === "support") return buildGenericSupportReply();
  const odooReply = buildOdooIntegrationReply({ messages, currentMessage });
  if (odooReply) return odooReply;
  if (
    userIsFrustratedOrSaysAlreadyAnswered(currentMessage) ||
    asksForAlreadyKnownObjective(reply, lead, messages, currentMessage)
  ) {
    return sanitizeCommercialReply(buildRecoveryReply({ lead, messages, currentMessage, appConfig }));
  }
  return enforceNoRepeatedQuestions({ reply, lead, messages, currentMessage, appConfig });
}

function normalizePhone(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function buildHandoffOptions({ appConfig = null, conversationId = "", reply = "", show = false } = {}) {
  if (!show) return [];

  const options = [];
  const whatsapp = normalizePhone(appConfig?.contact?.public_whatsapp_number);
  const email = String(appConfig?.contact?.support_email || "").trim();
  const brandName = String(appConfig?.brand?.name || "el equipo").trim();
  const refText = conversationId ? ` Ref: ${conversationId}` : "";

  if (whatsapp) {
    const text = encodeURIComponent(
      `Hola, vengo desde el chat web y quiero seguir con ${brandName}.${refText}`
    );
    options.push({
      type: "whatsapp",
      label: String(appConfig?.agent?.final_cta_label || "").trim() || "Continuar en WhatsApp",
      title: "Seguir por WhatsApp",
      description: "Abre WhatsApp y seguimos con el contexto de esta conversación.",
      url: `https://wa.me/${whatsapp}?text=${text}`,
    });
  }

  if (email) {
    const subject = encodeURIComponent(`Seguimos con la consulta${conversationId ? ` ${conversationId}` : ""}`);
    const body = encodeURIComponent(
      `Hola, vengo desde el chat web y quiero seguir con mi consulta.${refText}`
    );
    options.push({
      type: "email",
      label: "Continuar por email",
      title: "Seguir por email",
      description: "Abre tu correo para continuar con el equipo.",
      url: `mailto:${email}?subject=${subject}&body=${body}`,
    });
  }

  return options;
}

function shouldShowHandoffOptions({ reply = "", selectedResult = null, closingResult = null, finalLead = null, sourceChannel = "web" } = {}) {
  if (sourceChannel !== "web") return false;
  if (closingResult?.chat_completed || finalLead?.current_step === "completed") return true;
  const step = String(selectedResult?.lead_patch?.current_step || finalLead?.current_step || "");
  if (["ask_contact", "ask_email", "ask_phone", "ask_preferred_contact_channel", "close_ask_channel", "close_ready"].includes(step)) {
    return true;
  }
  return /whatsapp|email|correo|telefono|teléfono|contacto|siguiente paso/i.test(String(reply || ""));
}

function isPricingQuestion(value = "") {
  const text = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /\b(precio|precios|cuanto|cuesta|tarifa|tarifas|coste|costes|paquete|paquetes|pricing|plan|planes|setup|trial)\b/.test(text);
}

function selectAgentId({ routerResult = {}, message = "" } = {}) {
  if (isPricingQuestion(message)) return "service_expert";

  const requested = String(routerResult?.next_agent || "").trim();
  return ["sales_qualification", "service_expert", "lead_memory", "conversation"].includes(requested)
    ? requested
    : "sales_qualification";
}

function shouldRunClosing(routerResult, lead = {}, memoryResult = {}, appConfig = null) {
  if (routerResult?.intent !== "lead_capture") return false;
  if (!hasConfiguredLeadRequirements(appConfig)) return false;
  const merged = { ...(lead || {}), ...(memoryResult?.lead_patch || {}) };
  return hasRequiredLeadData(merged, appConfig);
}

function getLastSuccessfulNotification(events = []) {
  return (
    (events || []).find(
      (event) =>
        event?.payload?.sent_internal === true ||
        event?.payload?.internal?.ok === true
    ) || null
  );
}

function decideNotification({ leadBefore, leadAfter, notificationEvents = [], chatCompleted = false } = {}) {
  const lastSuccess = getLastSuccessfulNotification(notificationEvents);
  const decision = decideEmailSend({
    leadBefore,
    leadAfter,
    lastSignatureSent: lastSuccess?.payload?.signature || null,
    minMinutesBetween: chatCompleted ? 0 : 10,
    lastSentAtMs: lastSuccess?.created_at ? new Date(lastSuccess.created_at).getTime() : 0,
  });

  if (chatCompleted && decision.sendType === "none" && !lastSuccess) {
    return { sendType: "new", changedFields: [] };
  }

  return decision;
}

export async function processTmediaIncomingMessage({
  conversationId = null,
  externalUserId = null,
  sourceChannel = "web",
  message,
  metadata = {},
  accountId = null,
} = {}) {
  if (!message || typeof message !== "string") {
    throw new Error("message es obligatorio y debe ser texto");
  }

  const context = await buildTmediaAgentContext({
    conversationId,
    externalUserId,
    sourceChannel,
    message,
    metadata,
    accountId,
  });

  await saveMessage({
    conversation_id: context.conversationId,
    role: "user",
    content: context.message,
    metadata,
    account_id: accountId,
  });

  await saveConversationEvent({
    conversation_id: context.conversationId,
    event_type: "message_received",
    channel: sourceChannel,
    external_user_id: externalUserId,
    account_id: accountId,
    payload: { role: "user", text: context.message.slice(0, 500), source_channel: sourceChannel },
  }).catch((error) => {
    console.log("[tmediaChatOrchestrator] message_received event skipped:", error.message);
  });

  const refreshedContext = await buildTmediaAgentContext({
    conversationId: context.conversationId,
    externalUserId,
    sourceChannel,
    message,
    metadata,
    accountId,
  });

  const routerResult = await runAgent("lead_router", refreshedContext);
  const selectedAgentId = selectAgentId({
    routerResult,
    message: refreshedContext.message,
  });
  const selectedResult = await runAgent(selectedAgentId, {
    ...refreshedContext,
    routerResult,
  });

  const memoryResult = await runAgent("lead_memory", {
    ...refreshedContext,
    routerResult,
    selectedAgentResult: selectedResult,
  });

  const leadAfterMemory = await getLeadByConversationId(context.conversationId, { accountId }).catch(() => null);
  let handoffRecorded = false;
  if (routerResult?.intent === "human_request") {
    const handoffEvent = await saveConversationEvent({
      conversation_id: context.conversationId,
      event_type: "human_handoff_requested",
      channel: sourceChannel,
      external_user_id: externalUserId,
      account_id: accountId,
      payload: { text: refreshedContext.message.slice(0, 500), source_channel: sourceChannel },
    }).catch(() => null);
    handoffRecorded = Boolean(handoffEvent && !handoffEvent?.skipped);
  }
  let closingResult = null;
  if (
    refreshedContext.lead?.current_step !== "completed" &&
    shouldRunClosing(
      routerResult,
      leadAfterMemory || refreshedContext.lead,
      memoryResult,
      refreshedContext.appConfig
    )
  ) {
    closingResult = await runAgent("closing", {
      ...refreshedContext,
      lead: leadAfterMemory || refreshedContext.lead,
      routerResult,
      memoryResult,
    });
  }

  let notificationResult = null;
  const leadForNotification = closingResult?.chat_completed
    ? await getLeadByConversationId(context.conversationId, { accountId }).catch(() => leadAfterMemory)
    : leadAfterMemory;
  const notificationEvents = await listConversationEventsByType(
    context.conversationId,
    "agent_notification_sent",
    25,
    accountId
  ).catch(() => []);
  const notificationDecision = decideNotification({
    leadBefore: refreshedContext.lead || {},
    leadAfter: leadForNotification || {},
    notificationEvents,
    chatCompleted: !!closingResult?.chat_completed,
  });

  const forceHandoffNotification = routerResult?.intent === "human_request";
  if (notificationDecision.sendType !== "none" || forceHandoffNotification) {
    notificationResult = await runAgent("notification", {
      ...refreshedContext,
      lead: leadForNotification || refreshedContext.lead,
      routerResult,
      memoryResult,
      closingResult,
      notificationType: forceHandoffNotification ? "handoff" : notificationDecision.sendType,
      changedFields: notificationDecision.changedFields,
      sendClientConfirmation: forceHandoffNotification ? false : !!closingResult?.chat_completed,
      forceNotification: forceHandoffNotification,
    }).catch((error) => ({
      sent_internal: false,
      sent_client: false,
      error: error.message,
      skipped: true,
    }));
  }

  const rawReply = finalReply({
    selectedResult,
    closingResult,
    memoryResult,
    context: {
      ...refreshedContext,
      lead: leadAfterMemory || refreshedContext.lead || {},
    },
  });
  const repairedReply = repairFinalReply({
    reply: rawReply,
    lead: leadAfterMemory || refreshedContext.lead || {},
    messages: refreshedContext.messages || [],
    currentMessage: refreshedContext.message,
    appConfig: refreshedContext.appConfig,
    handoffRecorded,
    notificationResult,
  });
  const reply = guardAgainstReplyLoop({
    reply: repairedReply,
    messages: refreshedContext.messages || [],
    currentMessage: refreshedContext.message,
    lead: leadAfterMemory || refreshedContext.lead || {},
    appConfig: refreshedContext.appConfig,
  });

  await saveMessage({
    conversation_id: context.conversationId,
    role: "assistant",
    content: reply,
    metadata: {
      router: routerResult,
      selected_agent: selectedAgentId,
      chat_completed: !!closingResult?.chat_completed,
    },
    account_id: accountId,
  });

  await saveConversationEvent({
    conversation_id: context.conversationId,
    event_type: closingResult?.chat_completed ? "chat_completed" : "message_sent",
    channel: sourceChannel,
    external_user_id: externalUserId,
    account_id: accountId,
    payload: {
      role: "assistant",
      text: reply.slice(0, 500),
      router: routerResult,
      selected_agent: selectedAgentId,
    },
  }).catch((error) => {
    console.log("[tmediaChatOrchestrator] message_sent event skipped:", error.message);
  });

  const finalLead = await getLeadByConversationId(context.conversationId, { accountId }).catch(() => null);
  const isCompleted = !!closingResult?.chat_completed || finalLead?.current_step === "completed";
  const handoffOptions = buildHandoffOptions({
    appConfig: refreshedContext.appConfig,
    conversationId: context.conversationId,
    reply,
    show: shouldShowHandoffOptions({
      reply,
      selectedResult,
      closingResult,
      finalLead,
      sourceChannel,
    }),
  });
  const whatsappHandoff = handoffOptions.find((option) => option.type === "whatsapp") || null;

  return {
    ok: true,
    build: "tmedia-agents-v5-privacy-form",
    conversation_id: context.conversationId,
    reply,
    replyText: reply,
    assistantMessage: reply,
    lead: finalLead,
    router: routerResult,
    selected_agent: selectedAgentId,
    selected_result: selectedResult,
    memory: memoryResult,
    closing: closingResult,
    notification: notificationResult,
    handoff_recorded: handoffRecorded,
    chat_completed: isCompleted,
    handoff_options: handoffOptions,
    handoff_url: whatsappHandoff?.url || null,
    handoff_label: whatsappHandoff?.label || null,
    handoff: whatsappHandoff
      ? {
          whatsapp_url: whatsappHandoff.url,
          label: whatsappHandoff.label,
          options: handoffOptions,
        }
      : handoffOptions.length
        ? { options: handoffOptions }
        : null,
  };
}

export const __tmediaChatOrchestratorTestables = {
  repairFinalReply,
  userReportsProblemWithSancho,
  buildOdooIntegrationReply,
  enforceNoRepeatedQuestions,
  selectAgentId,
  shouldRunClosing,
  guardAgainstReplyLoop,
  buildSafeRepeatedIntentReply,
};
