import { openai } from "../../lib/openaiClient.js";
import { extractLeadDataFromText } from "../../lib/leadExtractor.js";
import { mergeLeadData } from "../../lib/leadMerge.js";
import { buildMemoryPatch } from "../../lib/memoryUtils.js";
import { upsertLeadFromConversation } from "../tools/supabaseTools.js";
import { MEMORY_SCHEMA, compactString, parseJsonObject } from "../core/agentResponseSchema.js";

function cleanPatch(patch = {}) {
  return Object.fromEntries(
    Object.entries(patch || {}).filter(([, value]) => value !== null && value !== undefined && value !== "")
  );
}

function buildSummary({ lead = {}, messages = [], message = "" } = {}) {
  const recent = (messages || [])
    .slice(-8)
    .map((item) => `${item.role}: ${item.content}`)
    .join(" | ");
  const parts = [
    lead?.interest_service ? `Servicio: ${lead.interest_service}` : "",
    lead?.main_goal ? `Objetivo: ${lead.main_goal}` : "",
    lead?.business_type ? `Tipo: ${lead.business_type}` : "",
    lead?.budget_range ? `Presupuesto: ${lead.budget_range}` : "",
    lead?.urgency ? `Urgencia: ${lead.urgency}` : "",
    message ? `Ultimo mensaje: ${message}` : "",
    recent ? `Contexto reciente: ${recent}` : "",
  ].filter(Boolean);
  return compactString(parts.join(". "), 1200);
}

export async function runLeadMemoryAgent(context = {}) {
  const extracted = extractLeadDataFromText(context.message, context.lead || {});
  const memoryPatch = buildMemoryPatch({
    text: context.message,
    leadBefore: context.lead || {},
    extracted,
    mergedLead: { ...(context.lead || {}), ...(context.selectedAgentResult?.lead_patch || {}) },
  });

  const merged = mergeLeadData({
    currentLead: context.lead || {},
    extractedLead: {
      ...extracted,
      ...(context.selectedAgentResult?.lead_patch || {}),
      ...(memoryPatch || {}),
      phone:
        extracted.phone ||
        context.selectedAgentResult?.lead_patch?.phone ||
        (context.sourceChannel === "whatsapp" ? context.externalUserId : null),
      preferred_contact_channel:
        extracted.preferred_contact_channel ||
        context.selectedAgentResult?.lead_patch?.preferred_contact_channel ||
        (context.sourceChannel === "whatsapp" ? "whatsapp" : null),
    },
    lastUserMessage: context.message,
  });

  const lead_patch = cleanPatch({
    ...merged,
    conversation_id: context.conversationId,
    account_id: context.accountId,
    source_platform: context.metadata?.source_platform || context.metadata?.sourcePlatform || merged.source_platform,
  });

  let aiPatch = {};
  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "Eres Lead Memory Agent. Devuelve solo JSON con lead_patch, memory_patch, conversation_summary y should_save. Fusiona datos sin sobrescrituras malas.",
        },
        {
          role: "user",
          content: JSON.stringify({
            current_lead: context.lead || {},
            deterministic_patch: lead_patch,
            message: context.message,
            recent_messages: (context.messages || []).slice(-10),
          }),
        },
      ],
    });
    aiPatch = parseJsonObject(response.output_text, {});
  } catch (error) {
    console.log("[leadMemoryAgent] fallback:", error.message);
  }

  const output = {
    ...MEMORY_SCHEMA,
    ...aiPatch,
    lead_patch: cleanPatch({ ...lead_patch, ...(aiPatch.lead_patch || {}) }),
    memory_patch: aiPatch.memory_patch || memoryPatch || {},
    conversation_summary:
      aiPatch.conversation_summary || buildSummary({ lead: lead_patch, messages: context.messages, message: context.message }),
    should_save: aiPatch.should_save !== false,
    tools_used: ["leadExtractor", "leadMerge", "memoryUtils", "supabase"],
  };

  if (output.should_save) {
    await upsertLeadFromConversation({
      ...(context.lead || {}),
      ...output.lead_patch,
      conversation_id: context.conversationId,
      account_id: context.accountId,
      summary: output.conversation_summary || output.lead_patch.summary || context.lead?.summary || null,
    });
  }

  return output;
}
