import { supabase } from "./supabase.js";

function clean(value) {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  return v.length ? v : null;
}

function cleanJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function cleanQuoteItems(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ({
      concept: clean(item?.concept),
      quantity: Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 0,
      unit_price: Number.isFinite(Number(item?.unit_price)) ? Number(item.unit_price) : 0,
    }))
    .filter((item) => item.concept || item.quantity || item.unit_price);
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

export async function saveConversationEvent({
  conversation_id,
  event_type,
  channel = null,
  external_user_id = null,
  payload = null,
} = {}) {
  const safeConversationId = clean(conversation_id);
  const safeEventType = clean(event_type);

  if (!safeConversationId) {
    throw new Error("saveConversationEvent: conversation_id es obligatorio");
  }
  if (!safeEventType) {
    throw new Error("saveConversationEvent: event_type es obligatorio");
  }

  const insertPayload = {
    conversation_id: safeConversationId,
    event_type: safeEventType,
    channel: clean(channel),
    external_user_id: clean(external_user_id),
    payload: cleanJson(payload),
  };

  const { data, error } = await supabase
    .from("conversation_events")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (
      message.includes("conversation_events") ||
      message.includes("does not exist") ||
      message.includes("payload")
    ) {
      console.log("conversation_events skipped", error.message);
      return { skipped: true, reason: error.message };
    }

    throw error;
  }

  return data;
}

export async function getLatestConversationEvent(
  conversation_id,
  event_type = null
) {
  const safeConversationId = clean(conversation_id);
  if (!safeConversationId) {
    throw new Error(
      "getLatestConversationEvent: conversation_id es obligatorio"
    );
  }

  let query = supabase
    .from("conversation_events")
    .select("*")
    .eq("conversation_id", safeConversationId)
    .order("created_at", { ascending: false })
    .limit(1);

  const safeEventType = clean(event_type);
  if (safeEventType) {
    query = query.eq("event_type", safeEventType);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (message.includes("conversation_events") || message.includes("does not exist")) {
      return null;
    }
    throw error;
  }

  return data || null;
}

export async function findConversationEventByHandoffCode(
  handoffCode,
  limit = 500
) {
  const safeCode = clean(handoffCode)?.toUpperCase() || null;
  if (!safeCode) return null;

  const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 500;

  const { data, error } = await supabase
    .from("conversation_events")
    .select("*")
    .eq("event_type", "channel_handoff_offer")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (message.includes("conversation_events") || message.includes("does not exist")) {
      return null;
    }
    throw error;
  }

  const events = data || [];
  const matched = events.find(
    (event) => String(event?.payload?.handoff_code || "").toUpperCase() === safeCode
  );

  return matched || null;
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 9) return `34${digits}`;
  return digits;
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

export async function listCrmLeads(limit = 200) {
  const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 200;

  const { data, error } = await supabase
    .from("leads")
    .select(
      `
      *,
      conversations (
        id,
        channel,
        external_user_id,
        created_at
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
}

export async function findLatestWebLeadByContact({
  email = null,
  phone = null,
  limit = 200,
} = {}) {
  const safeEmail = clean(email)?.toLowerCase() || null;
  const safePhone = normalizePhone(phone);
  if (!safeEmail && !safePhone) return null;

  const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 200;

  const { data, error } = await supabase
    .from("leads")
    .select(
      `
      *,
      conversations!inner (
        id,
        channel,
        external_user_id,
        created_at
      )
    `
    )
    .eq("conversations.channel", "web")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  const leads = data || [];
  const matched = leads.find((lead) => {
    const leadEmail = clean(lead?.email)?.toLowerCase() || null;
    const leadPhone = normalizePhone(lead?.phone);
    return (
      (safeEmail && leadEmail && leadEmail === safeEmail) ||
      (safePhone && leadPhone && leadPhone === safePhone)
    );
  });

  return matched || null;
}

export async function updateLeadCrmFields(leadId, patch = {}) {
  const safeLeadId = clean(leadId);
  if (!safeLeadId) {
    throw new Error("updateLeadCrmFields: leadId es obligatorio");
  }

  const payload = {
    crm_status: clean(patch.crm_status),
    assigned_to: clean(patch.assigned_to),
    internal_notes: clean(patch.internal_notes),
    next_action: clean(patch.next_action),
    follow_up_at: patch.follow_up_at || null,
    quote_status: clean(patch.quote_status),
  };

  const { data, error } = await supabase
    .from("leads")
    .update(payload)
    .eq("id", safeLeadId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getLatestQuoteByLeadId(leadId) {
  const safeLeadId = clean(leadId);
  if (!safeLeadId) {
    throw new Error("getLatestQuoteByLeadId: leadId es obligatorio");
  }

  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("lead_id", safeLeadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (message.includes("quotes") || message.includes("does not exist")) {
      return null;
    }
    throw error;
  }

  return data || null;
}

export async function upsertLatestQuoteForLead(lead = {}, quote = {}) {
  const safeLeadId = clean(lead.id);
  if (!safeLeadId) {
    throw new Error("upsertLatestQuoteForLead: lead.id es obligatorio");
  }

  const current = await getLatestQuoteByLeadId(safeLeadId);

  const total = Number.isFinite(Number(quote.total)) ? Number(quote.total) : 0;
  const subtotal = Number.isFinite(Number(quote.subtotal))
    ? Number(quote.subtotal)
    : total;
  const tax = Number.isFinite(Number(quote.tax)) ? Number(quote.tax) : 0;

  const payload = {
    lead_id: safeLeadId,
    conversation_id: clean(lead.conversation_id),
    title: clean(quote.title) || "Propuesta comercial",
    status: clean(quote.status) || "draft",
    currency: clean(quote.currency) || "EUR",
    subtotal,
    tax,
    total,
    content_json: {
      body: clean(quote.body),
      summary: clean(quote.summary),
      scope: clean(quote.scope),
      assumptions: clean(quote.assumptions),
      billing_type: clean(quote.billing_type) || "monthly",
      billing_label: clean(quote.billing_label),
      tax_rate: Number.isFinite(Number(quote.tax_rate)) ? Number(quote.tax_rate) : 0,
      items: cleanQuoteItems(quote.items),
    },
    html_snapshot: clean(quote.html_snapshot),
    sent_via: clean(quote.sent_via),
    sent_at: quote.sent_at || null,
    updated_at: new Date().toISOString(),
  };

  const query = current
    ? supabase.from("quotes").update(payload).eq("id", current.id)
    : supabase.from("quotes").insert(payload);

  const { data, error } = await query.select().single();

  if (error) throw error;
  return data;
}

export async function markLatestQuoteAsSent(leadId, sentVia) {
  const safeLeadId = clean(leadId);
  const safeSentVia = clean(sentVia);

  if (!safeLeadId) {
    throw new Error("markLatestQuoteAsSent: leadId es obligatorio");
  }

  const current = await getLatestQuoteByLeadId(safeLeadId);
  if (!current) {
    throw new Error("No hay presupuesto guardado para este lead");
  }

  const sentAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("quotes")
    .update({
      status: "sent",
      sent_via: safeSentVia,
      sent_at: sentAt,
      updated_at: sentAt,
    })
    .eq("id", current.id)
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from("leads")
    .update({ quote_status: "sent" })
    .eq("id", safeLeadId);

  return data;
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
