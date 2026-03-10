// backend/src/lib/chatStore.js
import { supabase } from "./supabase.js";
import { isGenericService } from "./leadExtractor.js";

function normalizeStr(v) {
  return typeof v === "string" ? v.trim() : v;
}

function isEmptyLike(v) {
  if (v === undefined || v === null) return true;
  if (typeof v !== "string") return false;

  const s = v.trim().toLowerCase();

  return (
    s === "" ||
    s === "pendiente" ||
    s === "por definir" ||
    s === "por determinar" ||
    s === "n/a" ||
    s === "na"
  );
}

export async function createConversation({ channel = "web", external_user_id = null } = {}) {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ channel, external_user_id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function saveMessage({ conversation_id, role, content }) {
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id, role, content })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getConversationMessages(conversation_id, limit = 50) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []).slice().reverse();
}

export async function getLeadByConversationId(conversation_id) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("conversation_id", conversation_id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function upsertLeadFromConversation(leadPayload) {
  if (!leadPayload?.conversation_id) {
    throw new Error("upsertLeadFromConversation requiere conversation_id");
  }

  const { data, error } = await supabase
    .from("leads")
    .upsert(leadPayload, { onConflict: "conversation_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export function mergeLeadData(existing = null, incoming = {}) {
  const out = { ...(existing || {}) };

  const setIfValue = (key) => {
    const v = incoming?.[key];
    if (isEmptyLike(v)) return;
    out[key] = normalizeStr(v);
  };

  // Campos básicos
  setIfValue("conversation_id");
  setIfValue("name");
  setIfValue("email");
  setIfValue("phone");
  setIfValue("urgency");
  setIfValue("budget_range");
  setIfValue("summary");
  setIfValue("consent");
  setIfValue("consent_at");
  setIfValue("business_type");
  setIfValue("main_goal");
  setIfValue("current_situation");
  setIfValue("pain_points");
  setIfValue("preferred_contact_channel");
  setIfValue("notes_ai");
  setIfValue("last_intent");
  setIfValue("last_seen_at");

  // PROTECCIÓN FUERTE DEL SERVICIO
  const prevService = normalizeStr(existing?.interest_service || null);
  const nextService = normalizeStr(incoming?.interest_service || null);

  if (!isEmptyLike(prevService) && isEmptyLike(nextService)) {
    out.interest_service = prevService;
  } else if (!isEmptyLike(prevService) && !isEmptyLike(nextService)) {
    const prevIsGeneric = isGenericService(prevService);
    const nextIsGeneric = isGenericService(nextService);

    // Si ya hay uno específico, no lo cambies por otro genérico
    if (!prevIsGeneric && nextIsGeneric) {
      out.interest_service = prevService;
    }
    // Si ya hay servicio previo, lo mantenemos salvo que realmente quieras sustituirlo de forma controlada
    else {
      out.interest_service = prevService;
    }
  } else if (isEmptyLike(prevService) && !isEmptyLike(nextService)) {
    out.interest_service = nextService;
  }

  // Score: conservar máximo
  const prevScore = typeof existing?.lead_score === "number" ? existing.lead_score : null;
  const nextScore = typeof incoming?.lead_score === "number" ? incoming.lead_score : null;

  if (prevScore !== null && nextScore !== null) out.lead_score = Math.max(prevScore, nextScore);
  else if (nextScore !== null) out.lead_score = nextScore;
  else if (prevScore !== null) out.lead_score = prevScore;

  return out;
}