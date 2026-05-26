import { openai } from "../../lib/openaiClient.js";
import { extractLeadDataFromText } from "../../lib/leadExtractor.js";
import {
  QUALIFICATION_FIELDS,
  compactString,
  parseJsonObject,
} from "../core/agentResponseSchema.js";

function normalizeService(value) {
  const raw = String(value || "").trim();
  const t = raw.toLowerCase();
  if (!raw) return null;
  if (t.includes("google")) return "Google Ads";
  if (t.includes("seo")) return "SEO";
  if (t.includes("meta") || t.includes("facebook") || t.includes("instagram")) return "Meta Ads";
  if (t.includes("web")) return "Diseño web";
  if (t.includes("consult")) return "Consultoría digital";
  return raw;
}

function buildLeadPatch(fields = {}) {
  const patch = {};
  if (fields.name) patch.name = fields.name;
  if (fields.email) patch.email = fields.email;
  if (fields.phone) patch.phone = fields.phone;
  if (fields.service) patch.interest_service = normalizeService(fields.service);
  if (fields.budget_range) patch.budget_range = fields.budget_range;
  if (fields.urgency) patch.urgency = fields.urgency;
  if (fields.business_type) patch.business_type = fields.business_type;
  if (fields.objective) patch.main_goal = fields.objective;
  if (fields.source_channel) patch.preferred_contact_channel = fields.source_channel === "whatsapp" ? "whatsapp" : null;
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value));
}

function pickNextQuestion(lead = {}, patch = {}, sourceChannel = "web") {
  const merged = { ...(lead || {}), ...(patch || {}) };
  if (!merged.interest_service) return "¿Qué servicio te interesa más: SEO, Google Ads, Meta Ads, diseño web o consultoría digital?";
  if (!merged.main_goal) return "¿Cuál es el objetivo principal que quieres conseguir?";
  if (!merged.business_type && !merged.business_activity) return "¿Qué tipo de negocio o proyecto tienes?";
  if (!merged.budget_range) return "¿Tienes ya una inversión aproximada pensada?";
  if (!merged.urgency) return "¿Te corre prisa ponerlo en marcha o es algo para más adelante?";
  if (sourceChannel === "whatsapp" && !merged.email) return "Perfecto. Si quieres, déjame también tu email para enviarte el resumen.";
  if (!merged.email && !merged.phone) return "Para que podamos revisarlo y responderte bien, ¿me dejas un email o teléfono de contacto?";
  if (!merged.name) return "¿A nombre de quién dejamos la solicitud?";
  return "Gracias. Con esto ya puedo preparar el siguiente paso.";
}

export async function runSalesQualificationAgent(context = {}) {
  const extracted = extractLeadDataFromText(context.message, context.lead || {});
  const fallbackFields = {
    ...QUALIFICATION_FIELDS,
    name: extracted.name || null,
    email: extracted.email || null,
    phone: extracted.phone || (context.sourceChannel === "whatsapp" ? context.externalUserId : null),
    service: extracted.interest_service || context.routerResult?.service || null,
    budget_range: extracted.budget_range || null,
    urgency: extracted.urgency || null,
    business_type: extracted.business_type || extracted.business_activity || null,
    objective: extracted.main_goal || null,
    source_channel: context.sourceChannel || "web",
  };

  let fields = fallbackFields;
  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "Eres Sales Qualification Agent de TMedia Global. Extrae datos explicitos del lead y decide una unica siguiente pregunta natural. No inventes datos. Devuelve solo JSON con fields y assistant_message.",
        },
        {
          role: "user",
          content: JSON.stringify({
            message: context.message,
            source_channel: context.sourceChannel,
            current_lead: context.lead || {},
            extracted_fallback: fallbackFields,
            rules: [
              "No sobrescribas nombre si ya existe.",
              "Si el usuario dice 'me llamo Moure', el nombre es 'Moure'.",
              "No confundas preguntas largas con nombres.",
              "No preguntes todos los datos a la vez.",
              "Prioriza servicio, objetivo, tipo de negocio, presupuesto, urgencia y contacto.",
            ],
          }),
        },
      ],
    });
    const parsed = parseJsonObject(response.output_text, {});
    fields = { ...fallbackFields, ...(parsed.fields || parsed) };
  } catch (error) {
    console.log("[salesQualificationAgent] fallback:", error.message);
  }

  const lead_patch = buildLeadPatch(fields);
  if (context.lead?.name && lead_patch.name) delete lead_patch.name;
  const assistant_message = pickNextQuestion(context.lead || {}, lead_patch, context.sourceChannel);

  return {
    fields: { ...QUALIFICATION_FIELDS, ...fields },
    lead_patch,
    assistant_message: compactString(assistant_message, 500),
    tools_used: ["leadExtractor"],
  };
}
