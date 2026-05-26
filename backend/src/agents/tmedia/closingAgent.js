import { openai } from "../../lib/openaiClient.js";
import { upsertLeadFromConversation } from "../tools/supabaseTools.js";
import { CLOSING_SCHEMA, compactString, parseJsonObject } from "../core/agentResponseSchema.js";

const CRITICAL_FIELDS = ["interest_service", "main_goal", "contact"];

function missingFields(lead = {}) {
  const missing = [];
  if (!lead?.interest_service) missing.push("interest_service");
  if (!lead?.main_goal) missing.push("main_goal");
  if (!lead?.email && !lead?.phone) missing.push("contact");
  return missing;
}

function buildInternalSummary(lead = {}) {
  return [
    lead?.name ? `Nombre: ${lead.name}` : "",
    lead?.email ? `Email: ${lead.email}` : "",
    lead?.phone ? `Telefono: ${lead.phone}` : "",
    lead?.interest_service ? `Servicio: ${lead.interest_service}` : "",
    lead?.main_goal ? `Objetivo: ${lead.main_goal}` : "",
    lead?.business_type ? `Tipo de negocio: ${lead.business_type}` : "",
    lead?.budget_range ? `Presupuesto: ${lead.budget_range}` : "",
    lead?.urgency ? `Urgencia: ${lead.urgency}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function fallbackClosing(lead = {}) {
  const missing = missingFields(lead);
  const chat_completed = missing.length === 0;
  return {
    chat_completed,
    missing_critical_fields: missing,
    closing_message: chat_completed
      ? "Perfecto, ya tengo la información clave. El equipo de TMedia Global revisará tu caso y te contactará pronto."
      : "",
    internal_summary: buildInternalSummary(lead),
  };
}

export async function runClosingAgent(context = {}) {
  const lead = {
    ...(context.lead || {}),
    ...(context.memoryResult?.lead_patch || {}),
  };
  const deterministic = fallbackClosing(lead);
  let output = deterministic;

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "Eres Closing Agent de TMedia Global. Determina si el lead esta cualificado y genera cierre breve. Devuelve solo JSON con chat_completed, missing_critical_fields, closing_message e internal_summary.",
        },
        {
          role: "user",
          content: JSON.stringify({
            lead,
            message: context.message,
            recent_messages: (context.messages || []).slice(-10),
            critical_fields: CRITICAL_FIELDS,
          }),
        },
      ],
    });
    output = { ...output, ...parseJsonObject(response.output_text, output) };
  } catch (error) {
    console.log("[closingAgent] fallback:", error.message);
  }

  output = {
    ...CLOSING_SCHEMA,
    ...output,
    chat_completed: deterministic.missing_critical_fields.length === 0,
    missing_critical_fields: deterministic.missing_critical_fields,
    closing_message: compactString(
      deterministic.missing_critical_fields.length === 0
        ? deterministic.closing_message
        : "",
      700
    ),
    internal_summary: compactString(output.internal_summary || buildInternalSummary(lead), 1500),
    tools_used: ["supabase"],
  };

  if (output.chat_completed) {
    await upsertLeadFromConversation({
      ...lead,
      conversation_id: context.conversationId,
      account_id: context.accountId,
      summary: output.internal_summary || lead.summary || null,
      current_step: "completed",
    });
  }

  return output;
}
