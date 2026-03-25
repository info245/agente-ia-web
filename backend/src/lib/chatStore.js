import { supabase } from "./supabase.js";

function clean(value) {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  return v.length ? v : null;
}

export async function getLatestConversationByExternalUserId({
  channel,
  external_user_id,
}) {
  const safeChannel = clean(channel);
  const safeExternalUserId = clean(external_user_id);

  if (!safeChannel || !safeExternalUserId) return null;

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("channel", safeChannel)
    .eq("external_user_id", safeExternalUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function createConversation({
  channel = "web",
  external_user_id = null,
} = {}) {
  const safeChannel = clean(channel) || "web";
  const safeExternalUserId = clean(external_user_id);

  if (safeChannel === "whatsapp" && safeExternalUserId) {
    const existing = await getLatestConversationByExternalUserId({
      channel: safeChannel,
      external_user_id: safeExternalUserId,
    });

    if (existing) return existing;
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      channel: safeChannel,
      external_user_id: safeExternalUserId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function saveMessage({
  conversation_id,
  role,
  content,
  metadata = null,
}) {
  const safeConversationId = clean(conversation_id);
  const safeRole = clean(role);
  const safeContent = typeof content === "string" ? content.trim() : null;

  if (!safeConversationId) {
    throw new Error("saveMessage: conversation_id es obligatorio");
  }
  if (!safeRole) {
    throw new Error("saveMessage: role es obligatorio");
  }
  if (!safeContent) {
    throw new Error("saveMessage: content es obligatorio");
  }

  const payload = {
    conversation_id: safeConversationId,
    role: safeRole,
    content: safeContent,
  };

  if (metadata && typeof metadata === "object") {
    payload.metadata = metadata;
  }

  const { data, error } = await supabase
    .from("messages")
    .insert(payload)
    .select()
    .single();

  if (error) {
    if (
      payload.metadata &&
      String(error.message || "").toLowerCase().includes("metadata")
    ) {
      const retry = await supabase
        .from("messages")
        .insert({
          conversation_id: safeConversationId,
          role: safeRole,
          content: safeContent,
        })
        .select()
        .single();

      if (retry.error) throw retry.error;
      return retry.data;
    }

    throw error;
  }

  return data;
}

export async function getConversationMessages(conversation_id, limit = 30) {
  const safeConversationId = clean(conversation_id);
  if (!safeConversationId) {
    throw new Error("getConversationMessages: conversation_id es obligatorio");
  }

  const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 30;

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", safeConversationId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  return (data || []).slice().reverse();
}

export async function getLeadByConversationId(conversation_id) {
  const safeConversationId = clean(conversation_id);
  if (!safeConversationId) {
    throw new Error("getLeadByConversationId: conversation_id es obligatorio");
  }

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("conversation_id", safeConversationId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function upsertLeadFromConversation(lead = {}) {
  const safeConversationId = clean(lead.conversation_id);
  if (!safeConversationId) {
    throw new Error("upsertLeadFromConversation: conversation_id es obligatorio");
  }

  const payload = {
    conversation_id: safeConversationId,
    name: clean(lead.name),
    email: clean(lead.email),
    phone: clean(lead.phone),
    interest_service: clean(lead.interest_service),
    urgency: clean(lead.urgency),
    budget_range: clean(lead.budget_range),
    summary: clean(lead.summary),
    lead_score: lead.lead_score ?? lead.lead_Score ?? null,
    consent:
      typeof lead.consent === "boolean"
        ? lead.consent
        : lead.consent == null
        ? null
        : Boolean(lead.consent),
    consent_at: lead.consent_at || null,
    business_type: clean(lead.business_type),
    main_goal: clean(lead.main_goal),
    current_situation: clean(lead.current_situation),
    pain_points: clean(lead.pain_points),
    preferred_contact_channel: clean(lead.preferred_contact_channel),
    last_intent: clean(lead.last_intent),

    // nuevos campos
    company_name: clean(lead.company_name),
    business_activity: clean(lead.business_activity),
    current_step: clean(lead.current_step),
    last_question: clean(lead.last_question),
  };

  const { data, error } = await supabase
    .from("leads")
    .upsert(payload, { onConflict: "conversation_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}