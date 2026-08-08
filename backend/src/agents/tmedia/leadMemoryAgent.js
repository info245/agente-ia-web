import { extractLeadDataFromText, looksLikeValidName } from "../../lib/leadExtractor.js";
import { mergeLeadData } from "../../lib/leadMerge.js";
import { buildMemoryPatch } from "../../lib/memoryUtils.js";
import { shouldBlockLeadExtraction } from "../../lib/conversationIntent.js";
import {
  getLeadRequirementPrompt,
  getLeadRequirementStep,
  getMissingLeadRequirements,
  hasConfiguredLeadRequirements,
} from "../../lib/leadRequirements.js";
import { upsertLeadFromConversation } from "../tools/supabaseTools.js";
import { MEMORY_SCHEMA, compactString } from "../core/agentResponseSchema.js";
import { isBetaAccessLead } from "../../lib/betaAccessFlow.js";

function cleanPatch(patch = {}) {
  return Object.fromEntries(
    Object.entries(patch || {}).filter(([, value]) => value !== null && value !== undefined && value !== "")
  );
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function recoverMainGoalFromText(value = "") {
  const raw = cleanText(value);
  const normalized = normalizeText(raw);
  if (!raw) return null;

  if (/\bm[a?á]s\s+clientes\b/i.test(raw) || /\bmas clientes\b/.test(normalized)) {
    return "Más clientes";
  }

  if (/\b(captar|conseguir|generar)\b.*\b(clientes|leads|contactos)\b/.test(normalized)) {
    return raw
      .replace(
        /[,;.:\s-]*(?:podr[ií]as|podrias|puedes|puede|me\s+puedes|me\s+podr[ií]as|me\s+podrias)\s+(?:contestar|responder|decir|mandar|enviar)(?:me)?\s+(?:en\s+)?(?:json|formato\s+json|un\s+json)\b.*$/i,
        ""
      )
      .trim();
  }

  return null;
}

function isBusinessContextStep(step = "") {
  const value = String(step || "").trim();
  return value === "ask_business_type" || value === "ask_business_context";
}

function hasExplicitCompanyNamePhrase(value = "") {
  const normalized = normalizeText(value);
  return /\b(mi empresa se llama|la empresa se llama|se llama|somos|nombre de la empresa|proyecto se llama)\b/.test(normalized);
}

function isUsefulBusinessContextAnswer(value = "") {
  const raw = cleanText(value);
  const normalized = normalizeText(raw);
  if (!raw || raw.length < 4) return false;
  if (looksLikeEmail(raw) || looksLikePhone(raw)) return false;
  if (/^(si|no|ok|vale|gracias|perfecto|email|correo|whatsapp)$/i.test(normalized)) return false;
  return true;
}

function lastAssistantAskedBusinessType(messages = []) {
  const latest = [...(messages || [])]
    .reverse()
    .find((message) => message?.role === "assistant");
  const text = normalizeText(latest?.content || latest?.text || "");
  return text.includes("tipo de negocio") || text.includes("negocio o proyecto");
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

function sanitizeLeadPatch(patch = {}, currentLead = {}) {
  const output = { ...(patch || {}) };

  if (Object.prototype.hasOwnProperty.call(output, "name")) {
    const name = safeName(output.name);
    if (name) output.name = name;
    else delete output.name;
  }

  if (currentLead?.name && !safeName(currentLead.name)) {
    output.name = null;
  }

  if (Object.prototype.hasOwnProperty.call(output, "email")) {
    const email = cleanText(output.email).toLowerCase();
    if (looksLikeEmail(email)) output.email = email;
    else delete output.email;
  }

  if (Object.prototype.hasOwnProperty.call(output, "phone")) {
    const digits = cleanText(output.phone).replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) output.phone = digits;
    else delete output.phone;
  }

  if (Object.prototype.hasOwnProperty.call(output, "company_name")) {
    const companyName = safeCompanyName(output.company_name);
    if (companyName) output.company_name = companyName;
    else delete output.company_name;
  }

  for (const field of ["main_goal", "business_activity", "current_situation", "pain_points"]) {
    if (output[field] && shouldBlockLeadExtraction(output[field])) {
      if (currentLead?.[field] === output[field]) output[field] = null;
      else delete output[field];
    }
    if (currentLead?.[field] && shouldBlockLeadExtraction(currentLead[field])) {
      output[field] = null;
    }
  }

  return output;
}

function buildPersistedLeadPatch({ deterministicPatch = {}, currentLead = {} } = {}) {
  return sanitizeLeadPatch(cleanPatch(deterministicPatch), currentLead);
}

function applySelectedBetaPatch({ mergedLead = {}, selectedPatch = {}, currentLead = {} } = {}) {
  if (!isBetaAccessLead(selectedPatch)) return mergedLead;
  const safePatch = sanitizeLeadPatch(cleanPatch(selectedPatch), currentLead);
  return {
    ...(mergedLead || {}),
    ...safePatch,
    custom_fields: {
      ...(mergedLead?.custom_fields || {}),
      ...(safePatch?.custom_fields || {}),
    },
  };
}

const TRACKED_LEAD_FIELDS = [
  "name",
  "email",
  "phone",
  "interest_service",
  "urgency",
  "budget_range",
  "business_type",
  "business_activity",
  "main_goal",
  "current_situation",
  "pain_points",
  "preferred_contact_channel",
  "company_name",
  "last_intent",
  "current_step",
  "consent",
  "consent_at",
  "source_platform",
  "source_form_name",
];

function hasNewLeadData(currentLead = {}, patch = {}) {
  const coreChanged = TRACKED_LEAD_FIELDS.some((field) => {
    if (!Object.prototype.hasOwnProperty.call(patch || {}, field)) return false;
    const next = patch?.[field];
    const current = currentLead?.[field];
    if (next === null) return current !== null && current !== undefined && current !== "";
    if (next === undefined || next === "") return false;
    return String(next).trim() !== String(current ?? "").trim();
  });
  if (coreChanged) return true;
  if (!Object.prototype.hasOwnProperty.call(patch || {}, "custom_fields")) return false;
  return JSON.stringify(patch?.custom_fields || {}) !== JSON.stringify(currentLead?.custom_fields || {});
}

function buildSummary({ lead = {}, messages = [], message = "" } = {}) {
  const recent = (messages || [])
    .slice(-8)
    .map((item) => `${item.role}: ${item.content}`)
    .join(" | ");
  const parts = [
    lead?.interest_service ? `Servicio: ${lead.interest_service}` : "",
    lead?.company_name ? `Empresa: ${lead.company_name}` : "",
    lead?.main_goal ? `Objetivo: ${lead.main_goal}` : "",
    lead?.business_type ? `Tipo: ${lead.business_type}` : "",
    lead?.budget_range ? `Presupuesto: ${lead.budget_range}` : "",
    lead?.urgency ? `Urgencia: ${lead.urgency}` : "",
    lead?.source_form_name ? `Formulario: ${lead.source_form_name}` : "",
    lead?.custom_fields?.asunto_formulario
      ? `Asunto: ${lead.custom_fields.asunto_formulario}`
      : "",
    lead?.custom_fields?.consentimiento_privacidad
      ? `Privacidad: ${lead.custom_fields.consentimiento_privacidad}`
      : "",
    lead?.custom_fields?.consentimiento_comercial
      ? `Comunicaciones: ${lead.custom_fields.consentimiento_comercial}`
      : "",
    message ? `Ultimo mensaje: ${message}` : "",
    recent ? `Contexto reciente: ${recent}` : "",
  ].filter(Boolean);
  return compactString(parts.join(". "), 1200);
}

function advanceToNextRequirement({ leadPatch = {}, currentLead = {}, appConfig = null } = {}) {
  if (!hasConfiguredLeadRequirements(appConfig)) return leadPatch;
  const merged = {
    ...(currentLead || {}),
    ...(leadPatch || {}),
    custom_fields: {
      ...(currentLead?.custom_fields || {}),
      ...(leadPatch?.custom_fields || {}),
    },
  };
  const nextMissing = getMissingLeadRequirements(merged, appConfig)[0];
  return {
    ...leadPatch,
    current_step: nextMissing ? getLeadRequirementStep(nextMissing) : "qualifying",
    last_question: nextMissing
      ? getLeadRequirementPrompt(nextMissing, appConfig)
      : "qualification_complete",
  };
}

export async function runLeadMemoryAgent(context = {}) {
  const blocksLeadExtraction = shouldBlockLeadExtraction(context.message);
  const extracted = extractLeadDataFromText(context.message, context.lead || {});
  const memoryPatch = buildMemoryPatch({
    text: context.message,
    leadBefore: context.lead || {},
    extracted,
    mergedLead: { ...(context.lead || {}), ...(context.selectedAgentResult?.lead_patch || {}) },
  });

  let merged = mergeLeadData({
    currentLead: context.lead || {},
    extractedLead: {
      ...extracted,
      ...cleanPatch(memoryPatch || {}),
      ...(context.selectedAgentResult?.lead_patch || {}),
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

  if (context.selectedAgentResult?.lead_patch?.interest_service) {
    merged.interest_service = context.selectedAgentResult.lead_patch.interest_service;
  }

  merged = applySelectedBetaPatch({
    mergedLead: merged,
    selectedPatch: context.selectedAgentResult?.lead_patch || {},
    currentLead: context.lead || {},
  });

  if (context.lead?.current_step === "completed") {
    const explicitPatch = context.selectedAgentResult?.lead_patch || {};
    if (explicitPatch.budget_range) merged.budget_range = explicitPatch.budget_range;
    if (explicitPatch.urgency) merged.urgency = explicitPatch.urgency;
    if (explicitPatch.email) merged.email = explicitPatch.email;
    if (explicitPatch.phone) merged.phone = explicitPatch.phone;
    if (explicitPatch.name && !context.lead?.name) merged.name = explicitPatch.name;
  }

  const deterministicPatch = sanitizeLeadPatch(cleanPatch({
    ...merged,
    current_step: context.selectedAgentResult?.lead_patch?.current_step ?? merged.current_step,
    last_question: context.selectedAgentResult?.lead_patch?.last_question ?? merged.last_question,
    conversation_id: context.conversationId,
    account_id: context.accountId,
    consent_at: context.selectedAgentResult?.lead_patch?.consent_at || merged.consent_at,
    source_platform:
      context.selectedAgentResult?.lead_patch?.source_platform ||
      context.metadata?.source_platform ||
      context.metadata?.sourcePlatform ||
      merged.source_platform,
    source_form_name:
      context.selectedAgentResult?.lead_patch?.source_form_name || merged.source_form_name,
  }), context.lead || {});

  // La IA puede redactar el resumen, pero no decide los campos persistidos ni
  // el estado del flujo. Así una inferencia no demostrable no puede hacer que
  // la conversación avance, retroceda o vuelva a preguntar desde otra fase.
  const lead_patch = buildPersistedLeadPatch({
    deterministicPatch,
    currentLead: context.lead || {},
  });
  const recoveredMainGoal = blocksLeadExtraction
    ? null
    : extracted?.main_goal ||
      context.selectedAgentResult?.lead_patch?.main_goal ||
      memoryPatch?.main_goal ||
      recoverMainGoalFromText(context.message);

  if (!lead_patch.main_goal && recoveredMainGoal) {
    lead_patch.main_goal = recoveredMainGoal;
  }

  if (lead_patch.main_goal && String(lead_patch.current_step || "").trim() === "ask_main_goal") {
    Object.assign(lead_patch, advanceToNextRequirement({
      leadPatch: lead_patch,
      currentLead: context.lead || {},
      appConfig: context.appConfig,
    }));
  }

  if (
    !blocksLeadExtraction &&
    (isBusinessContextStep(context.lead?.current_step) || lastAssistantAskedBusinessType(context.messages)) &&
    isUsefulBusinessContextAnswer(context.message)
  ) {
    if (!lead_patch.business_activity) {
      lead_patch.business_activity = cleanText(context.message);
    }
    if (
      !hasExplicitCompanyNamePhrase(context.message) &&
      normalizeText(lead_patch.company_name || "") === normalizeText(context.message)
    ) {
      delete lead_patch.company_name;
    }
    Object.assign(lead_patch, advanceToNextRequirement({
      leadPatch: lead_patch,
      currentLead: context.lead || {},
      appConfig: context.appConfig,
    }));
  }

  const output = {
    ...MEMORY_SCHEMA,
    lead_patch,
    memory_patch: memoryPatch || {},
    conversation_summary: buildSummary({
      lead: deterministicPatch,
      messages: context.messages,
      message: context.message,
    }),
    // El criterio del agente IA (aiPatch.should_save) puede equivocarse y
    // descartar datos reales del lead (la causa de "a veces ni se guarda en
    // CRM"). Si detectamos datos nuevos respecto al lead actual, guardamos
    // siempre, sin importar lo que diga la IA: perder un lead es mucho peor
    // que un guardado de mas.
    should_save: hasNewLeadData(context.lead || {}, lead_patch),
    tools_used: ["leadExtractor", "leadMerge", "memoryUtils", "supabase"],
  };

  if (output.should_save) {
    try {
      await upsertLeadFromConversation({
        ...(context.lead || {}),
        ...output.lead_patch,
        conversation_id: context.conversationId,
        account_id: context.accountId,
        summary: output.conversation_summary || output.lead_patch.summary || context.lead?.summary || null,
      });
    } catch (error) {
      // No dejes que un fallo al guardar el lead tumbe todo el turno de
      // conversación: sin esto, una excepción aquí impedía generar la
      // respuesta y el usuario recibía un error sin que el lead quedara
      // guardado, obligándole a repetir todo el flujo (bucle).
      console.log("[leadMemoryAgent] upsertLeadFromConversation failed:", error.message);
    }
  }

  return output;
}

export const __leadMemoryTestables = {
  applySelectedBetaPatch,
  buildPersistedLeadPatch,
  advanceToNextRequirement,
  hasNewLeadData,
  lastAssistantAskedBusinessType,
};
