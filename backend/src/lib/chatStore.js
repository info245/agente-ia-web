// backend/src/lib/chatStore.js
import { supabase } from "./supabase.js";
import { isGenericService } from "./leadExtractor.js";

function isEmptyLike(v) {
  if (v === undefined || v === null) return true;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return s === "" || s === "pendiente" || s === "por definir" || s === "n/a" || s === "na";
}

/**
 * Crea una conversación nueva
 */
export async function createConversation({ channel = "web", external_user_id = null } = {}) {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ channel, external_user_id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Guarda un mensaje
 */
export async function saveMessage({ conversation_id, role, content }) {
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id, role, content })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Obtiene últimos mensajes de una conversación (orden cronológico)
 */
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

/**
 * Devuelve el lead asociado a una conversación
 */
export async function getLeadByConversationId(conversation_id) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("conversation_id", conversation_id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * Upsert de lead por conversation_id
 */
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

/**
 * Merge “inteligente”:
 * - No pisa con vacíos o placeholders ("pendiente")
 * - No pisa servicio específico con genérico (IA/Automatización)
 * - Conserva lead_score máximo
 */
export function mergeLeadData(existing = null, incoming = {}) {
  const out = { ...(existing || {}) };

  const applyIf = (key) => {
    const v = incoming?.[key];
    if (isEmptyLike(v)) return;
    out[key] = v;
  };

  applyIf("conversation_id");
  applyIf("name");
  applyIf("email");
  applyIf("phone");
  applyIf("urgency");
  applyIf("budget_range");
  applyIf("summary");
  applyIf("consent");
  applyIf("consent_at");

  // Servicio protegido
  const prevService = existing?.interest_service || null;
  const nextService = incoming?.interest_service || null;

  if (!isEmptyLike(nextService)) {
    if (prevService && !isGenericService(prevService) && isGenericService(nextService)) {
      out.interest_service = prevService; // NO machacar
    } else {
      out.interest_service = nextService;
    }
  } else if (prevService) {
    out.interest_service = prevService;
  }

  // Lead score: mantener máximo
  const prevScore = typeof existing?.lead_score === "number" ? existing.lead_score : null;
  const nextScore = typeof incoming?.lead_score === "number" ? incoming.lead_score : null;

  if (prevScore !== null && nextScore !== null) out.lead_score = Math.max(prevScore, nextScore);
  else if (nextScore !== null) out.lead_score = nextScore;
  else if (prevScore !== null) out.lead_score = prevScore;

  return out;
}