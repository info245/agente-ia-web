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

function normalizeTextValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getAnalyticsStartDate(dateRange = "all") {
  const range = normalizeTextValue(dateRange);
  const now = new Date();

  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (range === "7d") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (range === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return null;
}

function isOnOrAfter(dateValue, startDate) {
  if (!startDate) return true;
  const sample = new Date(dateValue);
  if (Number.isNaN(sample.getTime())) return false;
  return sample.getTime() >= startDate.getTime();
}

function formatAverageMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "-";
  if (minutes < 60) return `${Math.round(minutes)} min`;

  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)} h`;

  const days = hours / 24;
  return `${days.toFixed(1)} d`;
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

export async function listWhatsAppLeadsForFollowUp(limit = 200) {
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
    .eq("conversations.channel", "whatsapp")
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

export async function getCrmAnalytics({
  channel = "all",
  dateRange = "all",
  limit = 1000,
} = {}) {
  const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 1000;
  const safeChannel = normalizeTextValue(channel);
  const startDate = getAnalyticsStartDate(dateRange);

  const leads = await listCrmLeads(safeLimit);
  const filteredLeads = (leads || []).filter((lead) => {
    const leadChannel = normalizeTextValue(lead?.conversations?.channel || "web");
    const channelOk = safeChannel === "all" || leadChannel === safeChannel;
    const dateOk = isOnOrAfter(lead?.created_at, startDate);
    return channelOk && dateOk;
  });

  const leadIds = filteredLeads.map((lead) => lead.id).filter(Boolean);
  const conversationIds = filteredLeads
    .map((lead) => lead.conversation_id)
    .filter(Boolean);

  let quotes = [];
  if (leadIds.length) {
    const { data, error } = await supabase
      .from("quotes")
      .select("id, lead_id, status, sent_at, updated_at, created_at")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) {
      const message = String(error.message || "").toLowerCase();
      if (!message.includes("quotes") && !message.includes("does not exist")) {
        throw error;
      }
    } else {
      quotes = data || [];
    }
  }

  let assistantMessages = [];
  if (conversationIds.length) {
    const { data, error } = await supabase
      .from("messages")
      .select("conversation_id, role, created_at")
      .in("conversation_id", conversationIds)
      .eq("role", "assistant")
      .order("created_at", { ascending: true })
      .limit(10000);

    if (!error) {
      assistantMessages = data || [];
    }
  }

  let events = [];
  if (conversationIds.length) {
    const { data, error } = await supabase
      .from("conversation_events")
      .select("conversation_id, event_type, payload, created_at")
      .in("conversation_id", conversationIds)
      .in("event_type", [
        "channel_handoff_offer",
        "external_lead_autostart",
        "quote_response_received",
        "quote_human_agent_requested",
      ])
      .order("created_at", { ascending: false })
      .limit(10000);

    if (!error) {
      events = data || [];
    }
  }

  const firstAssistantByConversation = new Map();
  for (const message of assistantMessages) {
    if (!firstAssistantByConversation.has(message.conversation_id)) {
      firstAssistantByConversation.set(message.conversation_id, message);
    }
  }

  const leadIdByConversation = new Map(
    filteredLeads.map((lead) => [lead.conversation_id, lead.id])
  );

  const whatsappLeadIds = new Set();
  const whatsappPreferenceLeadIds = new Set();
  const whatsappHandoffLeadIds = new Set();
  for (const lead of filteredLeads) {
    if (
      normalizeTextValue(lead?.preferred_contact_channel) === "whatsapp" ||
      normalizeTextValue(lead?.conversations?.channel) === "whatsapp"
    ) {
      whatsappLeadIds.add(lead.id);
      whatsappPreferenceLeadIds.add(lead.id);
    }
  }

  for (const event of events) {
    const leadId = leadIdByConversation.get(event?.conversation_id);
    if (!leadId) continue;

    const eventType = normalizeTextValue(event?.event_type);
    const targetChannel = normalizeTextValue(event?.payload?.target_channel);
    const via = normalizeTextValue(event?.payload?.via);

    if (
      (eventType === "channel_handoff_offer" && targetChannel === "whatsapp") ||
      (eventType === "external_lead_autostart" && via === "whatsapp")
    ) {
      whatsappLeadIds.add(leadId);
      whatsappHandoffLeadIds.add(leadId);
    }
  }

  const quoteByLead = new Map();
  for (const quote of quotes) {
    if (!quoteByLead.has(quote.lead_id)) {
      quoteByLead.set(quote.lead_id, quote);
    }
  }

  const proposalsSent = Array.from(quoteByLead.values()).filter((quote) => {
    const status = normalizeTextValue(quote?.status);
    return !!quote?.sent_at || ["sent", "accepted", "rejected"].includes(status);
  }).length;

  const proposalsAccepted = Array.from(quoteByLead.values()).filter(
    (quote) => normalizeTextValue(quote?.status) === "accepted"
  ).length;

  const responseSamples = filteredLeads
    .map((lead) => {
      const firstAssistant = firstAssistantByConversation.get(lead.conversation_id);
      if (!firstAssistant?.created_at || !lead?.created_at) return null;

      const createdAt = new Date(lead.created_at).getTime();
      const answeredAt = new Date(firstAssistant.created_at).getTime();
      if (!Number.isFinite(createdAt) || !Number.isFinite(answeredAt) || answeredAt < createdAt) {
        return null;
      }

      return (answeredAt - createdAt) / 60000;
    })
    .filter((value) => Number.isFinite(value));

  const averageResponseMinutes = responseSamples.length
    ? responseSamples.reduce((sum, value) => sum + value, 0) / responseSamples.length
    : null;

  const channelBreakdown = Object.entries(
    filteredLeads.reduce((acc, lead) => {
      const key = lead?.conversations?.channel || "web";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const sourceBreakdown = Object.entries(
    filteredLeads.reduce((acc, lead) => {
      const key = lead?.source_platform || "sin_fuente";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const acceptanceRate = proposalsSent
    ? Math.round((proposalsAccepted / proposalsSent) * 100)
    : 0;

  const timelineMap = new Map();
  for (const lead of filteredLeads) {
    const sampleDate = new Date(lead?.created_at);
    if (Number.isNaN(sampleDate.getTime())) continue;

    const key = sampleDate.toISOString().slice(0, 10);
    if (!timelineMap.has(key)) {
      timelineMap.set(key, {
        date: key,
        leads: 0,
        quotes_sent: 0,
        quotes_accepted: 0,
      });
    }

    const bucket = timelineMap.get(key);
    bucket.leads += 1;

    const quote = quoteByLead.get(lead.id);
    const quoteStatus = normalizeTextValue(quote?.status);
    const wasSent =
      !!quote?.sent_at || ["sent", "accepted", "rejected"].includes(quoteStatus);

    if (wasSent) bucket.quotes_sent += 1;
    if (quoteStatus === "accepted") bucket.quotes_accepted += 1;
  }

  const timeline = Array.from(timelineMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return {
    generated_at: new Date().toISOString(),
    filters: {
      channel: safeChannel || "all",
      date_range: normalizeTextValue(dateRange) || "all",
    },
    totals: {
      leads_generated: filteredLeads.length,
      passed_to_whatsapp: whatsappLeadIds.size,
      whatsapp_preference: whatsappPreferenceLeadIds.size,
      whatsapp_handoff_real: whatsappHandoffLeadIds.size,
      quotes_sent: proposalsSent,
      quotes_accepted: proposalsAccepted,
      average_response_minutes: averageResponseMinutes,
      average_response_label: formatAverageMinutes(averageResponseMinutes),
      acceptance_rate: acceptanceRate,
    },
    breakdowns: {
      channel: channelBreakdown,
      source: sourceBreakdown,
    },
    timeline,
  };
}

export async function updateLeadCrmFields(leadId, patch = {}) {
  const safeLeadId = clean(leadId);
  if (!safeLeadId) {
    throw new Error("updateLeadCrmFields: leadId es obligatorio");
  }

  const payload = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);
  const assignClean = (key) => {
    if (has(key)) payload[key] = clean(patch[key]);
  };

  assignClean("name");
  assignClean("email");
  assignClean("phone");
  assignClean("company_name");
  assignClean("interest_service");
  assignClean("budget_range");
  assignClean("main_goal");
  assignClean("current_situation");
  assignClean("pain_points");
  assignClean("preferred_contact_channel");
  assignClean("crm_status");
  assignClean("assigned_to");
  assignClean("internal_notes");
  assignClean("next_action");
  assignClean("quote_status");

  if (has("follow_up_at")) {
    payload.follow_up_at = patch.follow_up_at || null;
  }

  if (!Object.keys(payload).length) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", safeLeadId)
      .single();

    if (error) throw error;
    return data;
  }

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

export async function markLatestQuoteResponse(leadId, action) {
  const safeLeadId = clean(leadId);
  const safeAction = clean(action);

  if (!safeLeadId) {
    throw new Error("markLatestQuoteResponse: leadId es obligatorio");
  }

  if (!["accepted", "rejected"].includes(safeAction)) {
    throw new Error("markLatestQuoteResponse: accion no valida");
  }

  const current = await getLatestQuoteByLeadId(safeLeadId);
  if (!current) {
    throw new Error("No hay presupuesto guardado para este lead");
  }

  const respondedAt = new Date().toISOString();
  const nextLeadState =
    safeAction === "accepted"
      ? { quote_status: "accepted", crm_status: "ganado" }
      : { quote_status: "rejected", crm_status: "perdido" };

  const previousQuoteState = {
    status: current.status,
    updated_at: current.updated_at,
  };

  const { data: updatedQuote, error: quoteError } = await supabase
    .from("quotes")
    .update({
      status: safeAction,
      updated_at: respondedAt,
    })
    .eq("id", current.id)
    .select()
    .single();

  if (quoteError) throw quoteError;

  const { data: updatedLead, error: leadError } = await supabase
    .from("leads")
    .update(nextLeadState)
    .eq("id", safeLeadId)
    .select()
    .single();

  if (leadError) {
    await supabase
      .from("quotes")
      .update(previousQuoteState)
      .eq("id", current.id);
    throw leadError;
  }

  return {
    quote: updatedQuote,
    lead: updatedLead,
    action: safeAction,
    responded_at: respondedAt,
  };
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
    source_platform: clean(lead.source_platform),
    source_campaign: clean(lead.source_campaign),
    source_form_name: clean(lead.source_form_name),
    source_ad_name: clean(lead.source_ad_name),
    source_adset_name: clean(lead.source_adset_name),
  };

  const { data, error } = await supabase
    .from("leads")
    .upsert(payload, { onConflict: "conversation_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}
