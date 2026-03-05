// backend/src/lib/chatStore.js
import { supabase } from "./supabase.js";
import { isGenericService } from "./leadExtractor.js";

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
  if (!leadPayload?.conversation_id) throw new Error("upsertLeadFromConversation requiere conversation_id");

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

  // SERVICIO: regla fuerte
  const prevService = existing?.interest_service || null;
  const nextService = incoming?.interest_service || null;

  if (!isEmptyLike(nextService)) {
    if (prevService && !isEmptyLike(prevService)) {
      // Si ya hay servicio específico, NO lo machacamos
      const prevIsGeneric = isGenericService(prevService);
      const nextIsGeneric = isGenericService(nextService);

      // 1) específico + genérico -> mantener específico
      if (!prevIsGeneric && nextIsGeneric) {
        out.interest_service = prevService;
      }
      // 2) específico + específico -> permitir cambio
      else if (!prevIsGeneric && !nextIsGeneric) {
        out.interest_service = nextService;
      }
      // 3) genérico + específico -> mejorar a específico
      else if (prevIsGeneric && !nextIsGeneric) {
        out.interest_service = nextService;
      }
      // 4) genérico + genérico -> usar el nuevo
      else {
        out.interest_service = nextService;
      }
    } else {
      out.interest_service = nextService;
    }
  } else if (prevService) {
    out.interest_service = prevService;
  }

  // Score: conservar el máximo
  const prevScore = typeof existing?.lead_score === "number" ? existing.lead_score : null;
  const nextScore = typeof incoming?.lead_score === "number" ? incoming.lead_score : null;

  if (prevScore !== null && nextScore !== null) out.lead_score = Math.max(prevScore, nextScore);
  else if (nextScore !== null) out.lead_score = nextScore;
  else if (prevScore !== null) out.lead_score = prevScore;

  return out;
}