import { openai } from "../../lib/openaiClient.js";
import { getServiceFacts } from "../tools/websiteKbTools.js";
import { compactString } from "../core/agentResponseSchema.js";

const DEFAULT_PRICES = {
  "Google Ads": "desde 250€ + IVA",
  "Diseño web": "desde 700€ + IVA",
  "Consultoría digital": "desde 500€ + IVA",
};

function normalizeServiceName(service = "", lead = {}) {
  const raw = String(service || lead?.interest_service || "").toLowerCase();
  if (raw.includes("google")) return "Google Ads";
  if (raw.includes("seo")) return "SEO";
  if (raw.includes("meta") || raw.includes("facebook") || raw.includes("instagram")) return "Meta Ads";
  if (raw.includes("web")) return "Diseño web";
  if (raw.includes("consult")) return "Consultoría digital";
  return lead?.interest_service || service || "servicio";
}

function nextConversionHint(lead = {}) {
  if (!lead?.main_goal) return "Para orientarte mejor, ¿qué objetivo quieres conseguir?";
  if (!lead?.business_type && !lead?.business_activity) return "¿Qué tipo de negocio tienes?";
  if (!lead?.budget_range) return "¿Tienes una inversión aproximada pensada?";
  if (!lead?.email && !lead?.phone) return "Si te encaja, déjame un contacto y lo revisamos contigo.";
  return "Con esto podemos revisarlo y proponerte el siguiente paso.";
}

export async function runServiceExpertAgent(context = {}) {
  const service = normalizeServiceName(context.routerResult?.service, context.lead || {});
  const facts = getServiceFacts(service, context.appConfig) || {};
  const defaultPrice = DEFAULT_PRICES[service] || "";
  const factsText = [
    context.knowledgeContext,
    facts?.description,
    facts?.notes,
    facts?.min_monthly_fee || facts?.min_project_fee || defaultPrice,
    ...(context.kbContext || []).map((item) => item?.content || item?.text || ""),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);

  const fallback = `${service}: podemos orientarte segun tu objetivo y situacion actual.${
    defaultPrice ? ` Como referencia, ${defaultPrice}.` : ""
  } ${nextConversionHint(context.lead || {})}`;

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "Eres Service Expert Agent de TMedia Global. Responde breve, con tono comercial consultivo, sin agresividad. Usa solo hechos disponibles y lleva la conversacion hacia el siguiente dato del lead. No hables de reporting, BigQuery, dashboards ni analisis de campanas.",
        },
        {
          role: "user",
          content: JSON.stringify({
            message: context.message,
            service,
            lead: context.lead || {},
            facts: factsText,
            required_reference_prices: DEFAULT_PRICES,
            next_hint: nextConversionHint(context.lead || {}),
          }),
        },
      ],
    });
    return {
      service,
      assistant_message: compactString(response.output_text || fallback, 900),
      lead_patch: service !== "servicio" && !context.lead?.interest_service ? { interest_service: service } : {},
      tools_used: ["websiteFacts", "kbRetriever"],
    };
  } catch (error) {
    console.log("[serviceExpertAgent] fallback:", error.message);
    return {
      service,
      assistant_message: compactString(fallback, 900),
      lead_patch: service !== "servicio" && !context.lead?.interest_service ? { interest_service: service } : {},
      tools_used: ["websiteFacts"],
    };
  }
}
