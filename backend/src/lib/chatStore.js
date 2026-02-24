import { supabase } from "./supabase.js";

/**
 * Crea una conversación nueva
 */
export async function createConversation({ channel = "web", external_user_id = null } = {}) {
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      channel,
      external_user_id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Guarda un mensaje en la tabla messages
 */
export async function saveMessage({ conversation_id, role, content }) {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id,
      role,
      content
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Actualiza previous_response_id (lo usaremos más adelante con OpenAI)
 */
export async function updateConversationPreviousResponseId(conversationId, previous_response_id) {
  const { data, error } = await supabase
    .from("conversations")
    .update({
      previous_response_id,
      updated_at: new Date().toISOString()
    })
    .eq("id", conversationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}