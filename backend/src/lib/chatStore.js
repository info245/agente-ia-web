import { supabase } from "./supabase.js";

/**
 * Normaliza strings vacíos a null
 */
function clean(value) {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  return v.length ? v : null;
}

/**
 * Busca la conversación más reciente para un canal + external_user_id.
 * Esto lo usamos especialmente para WhatsApp, donde external_user_id = teléfono
 * y queremos mantener el mismo hilo.
 */
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

  if (error) {
    throw error;
  }

  return data || null;
}

/**
 * Crea una conversación nueva.
 *
 * IMPORTANTE:
 * - Para WhatsApp: si ya existe una conversación con ese teléfono, reutiliza la última.
 * - Para web: sigue creando una nueva salvo que explícitamente quieras otra lógica.
 */
export async function createConversation({
  channel = "web",
  external_user_id = null,
} = {}) {
  const safeChannel = clean(channel) || "web";
  const safeExternalUserId = clean(external_user_id);

  // Solo reutilizamos automáticamente para WhatsApp
  if (safeChannel === "whatsapp" && safeExternalUserId) {
    const existing = await getLatestConversationByExternalUserId({
      channel: safeChannel,
      external_user_id: safeExternalUserId,
    });

    if (existing) {
      return existing;
    }
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      channel: safeChannel,
      external_user_id: safeExternalUserId,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Helper explícito por si quieres usarlo más adelante desde server.js
 * sin depender de la lógica interna de createConversation.
 */
export async function findOrCreateConversation({
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

  return createConversation({
    channel: safeChannel,
    external_user_id: safeExternalUserId,
  });
}

/**
 * Guarda un mensaje en la tabla messages
 */
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

  // Solo añade metadata si tu tabla la soporta
  if (metadata && typeof metadata === "object") {
    payload.metadata = metadata;
  }

  const { data, error } = await supabase
    .from("messages")
    .insert(payload)
    .select()
    .single();

  if (error) {
    // Si falla por no existir columna metadata, reintentamos sin metadata
    if (
      payload.metadata &&
      String(error.message || "").toLowerCase().includes("metadata")
    ) {
      const fallbackPayload = {
        conversation_id: safeConversationId,
        role: safeRole,
        content: safeContent,
      };

      const retry = await supabase
        .from("messages")
        .insert(fallbackPayload)
        .select()
        .single();

      if (retry.error) throw retry.error;
      return retry.data;
    }

    throw error;
  }

  return data;
}

/**
 * Recupera mensajes de una conversación.
 * Devuelve del más antiguo al más reciente para alimentar bien a OpenAI.
 */
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

  if (error) {
    throw error;
  }

  // Como los traemos descendentes para coger los últimos N,
  // aquí los invertimos para devolverlos en orden cronológico.
  return (data || []).slice().reverse();
}

/**
 * Obtiene el lead asociado a una conversación
 */
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

  if (error) {
    throw error;
  }

  return data || null;
}

/**
 * Upsert del lead por conversation_id
 *
 * NOTA:
 * Guardamos en lead_score porque es el nombre correcto que espera Supabase.
 * Aceptamos tanto lead_score como lead_Score al leer el objeto de entrada.
 */
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

    // Campos ampliados que estás usando en server.js
    business_type: clean(lead.business_type),
    main_goal: clean(lead.main_goal),
    current_situation: clean(lead.current_situation),
    pain_points: clean(lead.pain_points),
    preferred_contact_channel: clean(lead.preferred_contact_channel),
    last_intent: clean(lead.last_intent),
  };

  const { data, error } = await supabase
    .from("leads")
    .upsert(payload, {
      onConflict: "conversation_id",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Recupera una conversación concreta por id
 */
export async function getConversationById(conversation_id) {
  const safeConversationId = clean(conversation_id);

  if (!safeConversationId) {
    throw new Error("getConversationById: conversation_id es obligatorio");
  }

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", safeConversationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

/**
 * Opcional: útil para depuración o backoffice
 */
export async function getMessagesByExternalUserId({
  channel,
  external_user_id,
  limit = 100,
}) {
  const conversation = await getLatestConversationByExternalUserId({
    channel,
    external_user_id,
  });

  if (!conversation) return [];

  return getConversationMessages(conversation.id, limit);
}