import {
  ROUTER_SCHEMA,
  clamp01,
  compactString,
} from "../core/agentResponseSchema.js";
import {
  detectPriorityIntent,
  isGreetingOnly,
  isHumanRequest,
  isSupportRequest,
} from "../../lib/conversationIntent.js";

const INTENTS = [
  "greeting",
  "lead_capture",
  "service_question",
  "pricing_question",
  "support",
  "human_request",
  "unknown",
];
const STAGES = ["new", "qualifying", "qualified", "closing", "completed"];
const NEXT_AGENTS = ["sales_qualification", "service_expert", "closing", "lead_memory"];

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getConfiguredServices(appConfig = null) {
  const offersSource = Object.keys(appConfig?.offers || {}).length
    ? appConfig.offers
    : appConfig?.services || {};
  return Object.keys(offersSource || {}).filter(Boolean);
}

function detectService(text = "", appConfig = null) {
  const t = normalizeText(text);
  const match = getConfiguredServices(appConfig).find((service) => {
    const normalizedService = normalizeText(service);
    return normalizedService && (t.includes(normalizedService) || normalizedService.includes(t));
  });
  return match || "unknown";
}

function inferLeadStage(lead = {}) {
  const hasContact = !!(lead?.email || lead?.phone);
  const hasService = !!lead?.interest_service;
  const hasObjective = !!(lead?.main_goal || lead?.business_type || lead?.business_activity);
  if (lead?.chat_completed || lead?.crm_status === "completado") return "completed";
  if (hasContact && hasService && hasObjective) return "qualified";
  if (hasContact && hasService) return "closing";
  if (hasService || lead?.name || lead?.email || lead?.phone) return "qualifying";
  return "new";
}

function safeAgentForIntent(intent = "") {
  if (["greeting", "lead_capture"].includes(intent)) return "sales_qualification";
  if (["service_question", "pricing_question"].includes(intent)) return "service_expert";
  return "lead_memory";
}

function heuristicRoute(context = {}) {
  const text = context.message || "";
  const t = normalizeText(text);
  const service = detectService(text, context.appConfig);
  const lead_stage = inferLeadStage(context.lead || {});
  const isPricing =
    /(precio|precios|cuanto|cuesta|tarifa|coste|eur|iva|paquete|plan|setup|trial|demo)/i.test(t) ||
    (/\b(presupuesto|inversion)\b/i.test(t) &&
      /\b(cuanto|que|necesita|recomendada|minima|minimo|para empezar|para probar|demo|trial|plan|precio|cuesta)\b/i.test(t));
  const priorityIntent = detectPriorityIntent(text);
  const asksServiceInfo =
    service !== "unknown" ||
    /\b(que haceis|que ofreceis|servicios|como funciona|informacion|explicame|integrar|integracion|conectar|compatible|api|mcp|webhook)\b/.test(t);
  const hasLeadData = /(@|\+?\d[\d\s().-]{7,}|me llamo|mi nombre|soy |presupuesto|urgente|prioridad|necesito|quiero|busco)/i.test(text);

  let intent = "unknown";
  if (priorityIntent) intent = priorityIntent;
  else if (isPricing) intent = "pricing_question";
  else if (asksServiceInfo) intent = "service_question";
  else if (hasLeadData) intent = "lead_capture";

  const next_agent = safeAgentForIntent(intent);

  return {
    intent,
    service,
    lead_stage,
    next_agent,
    confidence: intent === "unknown" ? 0.45 : 0.72,
    reason: "Clasificacion heuristica local.",
  };
}

function sanitizeRoute(route = {}, appConfig = null) {
  const services = [...getConfiguredServices(appConfig), "unknown"];
  const output = { ...ROUTER_SCHEMA, ...route };
  if (!INTENTS.includes(output.intent)) output.intent = "unknown";
  if (!services.includes(output.service)) output.service = "unknown";
  if (!STAGES.includes(output.lead_stage)) output.lead_stage = "new";
  if (!NEXT_AGENTS.includes(output.next_agent)) output.next_agent = "sales_qualification";
  output.confidence = clamp01(output.confidence, 0.5);
  output.reason = compactString(output.reason, 180);
  return output;
}

function enforceSafeRoute(route = {}, fallback = {}) {
  const protectedIntents = new Set(["greeting", "support", "human_request"]);
  const intent = protectedIntents.has(fallback.intent) ? fallback.intent : route.intent;
  return {
    ...route,
    intent,
    next_agent: safeAgentForIntent(intent),
    reason: protectedIntents.has(fallback.intent)
      ? fallback.reason
      : route.reason,
  };
}

export async function runLeadRouterAgent(context = {}) {
  return sanitizeRoute(heuristicRoute(context), context.appConfig);
}

export const __leadRouterTestables = {
  heuristicRoute,
  enforceSafeRoute,
  isGreetingOnly,
  isHumanRequest,
  isSupportRequest,
};
