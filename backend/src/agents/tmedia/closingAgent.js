import { upsertLeadFromConversation } from "../tools/supabaseTools.js";
import { CLOSING_SCHEMA, compactString } from "../core/agentResponseSchema.js";
import { getMissingLeadRequirements } from "../../lib/leadRequirements.js";

function buildInternalSummary(lead = {}) {
  return [
    lead?.name ? `Nombre: ${lead.name}` : "",
    lead?.email ? `Email: ${lead.email}` : "",
    lead?.phone ? `Telefono: ${lead.phone}` : "",
    lead?.company_name ? `Empresa: ${lead.company_name}` : "",
    lead?.interest_service ? `Servicio: ${lead.interest_service}` : "",
    lead?.main_goal ? `Objetivo: ${lead.main_goal}` : "",
    lead?.business_type ? `Tipo de negocio: ${lead.business_type}` : "",
    lead?.budget_range ? `Presupuesto: ${lead.budget_range}` : "",
    lead?.urgency ? `Urgencia: ${lead.urgency}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function fallbackClosing(lead = {}, appConfig = null) {
  const missing = getMissingLeadRequirements(lead, appConfig);
  const chat_completed = missing.length === 0;
  const brandName = String(appConfig?.brand?.name || "la empresa").trim();
  return {
    chat_completed,
    missing_critical_fields: missing,
    closing_message: chat_completed
      ? `Perfecto, ya tengo la informacion clave. El equipo de ${brandName} revisara tu caso y te contactara pronto.`
      : "",
    internal_summary: buildInternalSummary(lead),
  };
}

export async function runClosingAgent(context = {}) {
  const lead = {
    ...(context.lead || {}),
    ...(context.memoryResult?.lead_patch || {}),
  };
  const deterministic = fallbackClosing(lead, context.appConfig);
  const output = {
    ...CLOSING_SCHEMA,
    chat_completed: deterministic.missing_critical_fields.length === 0,
    missing_critical_fields: deterministic.missing_critical_fields,
    closing_message: compactString(
      deterministic.missing_critical_fields.length === 0
        ? deterministic.closing_message
        : "",
      700
    ),
    internal_summary: compactString(buildInternalSummary(lead), 1500),
    tools_used: ["supabase"],
  };

  if (output.chat_completed) {
    try {
      await upsertLeadFromConversation({
        ...lead,
        conversation_id: context.conversationId,
        account_id: context.accountId,
        summary: output.internal_summary || lead.summary || null,
        current_step: "completed",
      });
    } catch (error) {
      // Igual que en leadMemoryAgent: un fallo de guardado aquí no debe
      // tumbar el cierre de la conversación ni dejar al usuario sin respuesta.
      console.log("[closingAgent] upsertLeadFromConversation failed:", error.message);
    }
  }

  return output;
}
