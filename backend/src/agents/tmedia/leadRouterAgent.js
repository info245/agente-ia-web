import { openai } from "../../lib/openaiClient.js";
import {
  ROUTER_SCHEMA,
  clamp01,
  compactString,
  parseJsonObject,
} from "../core/agentResponseSchema.js";

const SERVICES = ["seo", "google_ads", "meta_ads", "web_design", "consulting", "unknown"];
const INTENTS = ["lead_capture", "service_question", "pricing_question", "support", "unknown"];
const STAGES = ["new", "qualifying", "qualified", "closing", "completed"];
const NEXT_AGENTS = ["sales_qualification", "service_expert", "closing", "lead_memory"];

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function detectService(text = "") {
  const t = normalizeText(text);
  if (t.includes("google ads") || /\bsem\b/.test(t)) return "google_ads";
  if (/\bseo\b/.test(t) || t.includes("posicionamiento")) return "seo";
  if (t.includes("meta ads") || t.includes("facebook ads") || t.includes("instagram ads")) return "meta_ads";
  if (t.includes("diseno web") || t.includes("diseño web") || t.includes("pagina web") || t.includes("tienda online")) return "web_design";
  if (t.includes("consultoria") || t.includes("consultoría") || t.includes("estrategia digital")) return "consulting";
  return "unknown";
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

function heuristicRoute(context = {}) {
  const text = context.message || "";
  const t = normalizeText(text);
  const service = detectService(text);
  const lead_stage = inferLeadStage(context.lead || {});
  const isPricing = /(precio|precios|cuanto cuesta|cuánto cuesta|tarifa|desde|presupuesto|coste|€|eur)/i.test(t);
  const isSupport = /(soporte|incidencia|problema tecnico|factura|reclamacion)/i.test(t);
  const hasLeadData = /(@|\+?\d[\d\s().-]{7,}|me llamo|mi nombre|soy |presupuesto|urgente|prioridad|necesito|quiero|busco)/i.test(text);

  let intent = "unknown";
  if (isSupport) intent = "support";
  else if (isPricing) intent = "pricing_question";
  else if (service !== "unknown" || /\?$/.test(text.trim())) intent = "service_question";
  else if (hasLeadData) intent = "lead_capture";

  let next_agent = "sales_qualification";
  if (intent === "service_question" || intent === "pricing_question") next_agent = "service_expert";
  if (lead_stage === "qualified" || lead_stage === "closing") next_agent = "closing";
  if (intent === "unknown") next_agent = "lead_memory";

  return {
    intent,
    service,
    lead_stage,
    next_agent,
    confidence: intent === "unknown" ? 0.45 : 0.72,
    reason: "Clasificacion heuristica local.",
  };
}

function sanitizeRoute(route = {}) {
  const output = { ...ROUTER_SCHEMA, ...route };
  if (!INTENTS.includes(output.intent)) output.intent = "unknown";
  if (!SERVICES.includes(output.service)) output.service = "unknown";
  if (!STAGES.includes(output.lead_stage)) output.lead_stage = "new";
  if (!NEXT_AGENTS.includes(output.next_agent)) output.next_agent = "sales_qualification";
  output.confidence = clamp01(output.confidence, 0.5);
  output.reason = compactString(output.reason, 180);
  return output;
}

export async function runLeadRouterAgent(context = {}) {
  const fallback = heuristicRoute(context);

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "Eres Lead Router Agent de TMedia Global. Devuelve solo JSON valido con intent, service, lead_stage, next_agent, confidence y reason. No mezcles reporting, BigQuery, dashboards ni analisis de campanas.",
        },
        {
          role: "user",
          content: JSON.stringify({
            message: context.message,
            source_channel: context.sourceChannel,
            lead: context.lead || {},
            recent_messages: (context.messages || []).slice(-8),
            allowed: { intents: INTENTS, services: SERVICES, stages: STAGES, next_agents: NEXT_AGENTS },
          }),
        },
      ],
    });

    return sanitizeRoute(parseJsonObject(response.output_text, fallback));
  } catch (error) {
    console.log("[leadRouterAgent] fallback:", error.message);
    return sanitizeRoute(fallback);
  }
}
