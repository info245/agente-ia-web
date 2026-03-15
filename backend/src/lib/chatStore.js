// backend/src/lib/chatStore.js
import { supabase } from "./supabase.js";

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