import { supabase } from "./supabase.js";

/**
 * Crea una conversación
 */
export async function createConversation({
  channel = "web",
  external_user_id = null,
} = {}) {
  const payload = { channel, external_user_id };

  const { data, error } = await supabase
    .from("conversations")
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(`Supabase createConversation: ${error.message}`);
  return data;
}

/**
 * Guarda un mensaje
 */
export async function saveMessage({ conversation_id, role, content }) {
  if (!conversation_id) throw new Error("saveMessage: conversation_id es obligatorio");
  if (!role) throw new Error("saveMessage: role es obligatorio");
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("saveMessage: content debe ser texto no vacío");
  }

  const payload = {
    conversation_id,
    role,
    content: content.trim(),
  };

  const { data, error } = await supabase
    .from("messages")
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(`Supabase saveMessage: ${error.message}`);
  return data;
}

/**
 * Obtiene mensajes de una conversación (orden cronológico)
 */
export async function getConversationMessages(conversation_id, limit = 20) {
  if (!conversation_id) {
    throw new Error("getConversationMessages: conversation_id es obligatorio");
  }

  const safeLimit = Number.isFinite(Number(limit))
    ? Math.max(1, Math.min(Number(limit), 100))
    : 20;

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: true })
    .limit(safeLimit);

  if (error) throw new Error(`Supabase getConversationMessages: ${error.message}`);
  return data || [];
}

/**
 * Upsert de lead por conversation_id (conversation_id debe ser UNIQUE)
 */
export async function upsertLeadFromConversation({
  conversation_id,
  name = null,
  email = null,
  phone = null,
  interest_service = null,
  urgency = null,
  budget_range = null,
  summary = null,
  lead_score = null,
  consent = null,
  consent_at = null,
}) {
  if (!conversation_id) {
    throw new Error("upsertLeadFromConversation: conversation_id es obligatorio");
  }

  const payload = {
    conversation_id,
    name,
    email,
    phone,
    interest_service,
    urgency,
    budget_range,
    summary,
    lead_score,
    consent,
    consent_at,
  };

  const { data, error } = await supabase
    .from("leads")
    .upsert(payload, { onConflict: "conversation_id" })
    .select()
    .single();

  if (error) throw new Error(`Supabase upsertLeadFromConversation: ${error.message}`);
  return data;
}

/**
 * Obtener lead por conversation_id
 */
export async function getLeadByConversationId(conversation_id) {
  if (!conversation_id) {
    throw new Error("getLeadByConversationId: conversation_id es obligatorio");
  }

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("conversation_id", conversation_id)
    .maybeSingle();

  if (error) throw new Error(`Supabase getLeadByConversationId: ${error.message}`);
  return data || null;
}

/**
 * Merge inteligente para no pisar datos con null
 */
export function mergeLeadData(existingLead, newLead) {
  const oldLead = existingLead || {};
  const incoming = newLead || {};

  const hasValue = (v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string" && v.trim() === "") return false;
    return true;
  };

  const pick = (newValue, oldValue) => (hasValue(newValue) ? newValue : oldValue ?? null);

  const normalizeScore = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(Math.round(n), 100));
  };

  const oldScore = normalizeScore(oldLead.lead_score);
  const newScore = normalizeScore(incoming.lead_score);

  let mergedScore = null;
  if (oldScore !== null && newScore !== null) mergedScore = Math.max(oldScore, newScore);
  else if (newScore !== null) mergedScore = newScore;
  else if (oldScore !== null) mergedScore = oldScore;

  const oldConsent = typeof oldLead.consent === "boolean" ? oldLead.consent : null;
  const newConsent = typeof incoming.consent === "boolean" ? incoming.consent : null;

  let mergedConsent = null;
  if (oldConsent === true || newConsent === true) mergedConsent = true;
  else if (newConsent === false) mergedConsent = oldConsent ?? false;
  else mergedConsent = oldConsent ?? null;

  let mergedConsentAt = oldLead.consent_at ?? null;
  if (mergedConsent === true) {
    if (hasValue(incoming.consent_at)) mergedConsentAt = incoming.consent_at;
    else if (!hasValue(mergedConsentAt)) mergedConsentAt = new Date().toISOString();
  }

  return {
    conversation_id: incoming.conversation_id ?? oldLead.conversation_id ?? null,
    name: pick(incoming.name, oldLead.name),
    email: pick(incoming.email, oldLead.email),
    phone: pick(incoming.phone, oldLead.phone),
    interest_service: pick(incoming.interest_service, oldLead.interest_service),
    urgency: pick(incoming.urgency, oldLead.urgency),
    budget_range: pick(incoming.budget_range, oldLead.budget_range),
    summary: pick(incoming.summary, oldLead.summary),
    lead_score: mergedScore,
    consent: mergedConsent,
    consent_at: mergedConsentAt,
  };
}