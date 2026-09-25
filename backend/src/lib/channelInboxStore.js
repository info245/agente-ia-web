import { supabase } from "./supabase.js";

const TABLE = "channel_inbox_events";
const MAX_ATTEMPTS = 5;

function clean(value) {
  return String(value || "").trim();
}

function isMissingInboxInfrastructure(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes(TABLE) ||
    message.includes("claim_channel_inbox_events") ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

export async function enqueueChannelInboxEvent({
  accountId,
  provider,
  providerEventId,
  channel,
  payload,
} = {}) {
  const providerName = clean(provider);
  const eventId = clean(providerEventId);
  if (!providerName || !eventId) {
    throw new Error("provider y providerEventId son obligatorios");
  }

  const row = {
    account_id: clean(accountId) || null,
    provider: providerName,
    provider_event_id: eventId,
    channel: clean(channel) || providerName,
    payload: payload && typeof payload === "object" ? payload : {},
    status: "pending",
    available_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, {
      onConflict: "provider,provider_event_id",
      ignoreDuplicates: true,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    if (isMissingInboxInfrastructure(error)) {
      throw new Error(
        "Falta la infraestructura durable de webhooks. Ejecuta sql/012_reliable_runtime_foundation.sql antes de activar WhatsApp."
      );
    }
    throw error;
  }

  if (data) return { event: data, duplicate: false };

  const { data: existing, error: existingError } = await supabase
    .from(TABLE)
    .select("*")
    .eq("provider", providerName)
    .eq("provider_event_id", eventId)
    .maybeSingle();

  if (existingError) throw existingError;
  return { event: existing || null, duplicate: true };
}

export async function claimChannelInboxEvents(limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const { data, error } = await supabase.rpc("claim_channel_inbox_events", {
    p_limit: safeLimit,
  });
  if (error) {
    if (isMissingInboxInfrastructure(error)) return [];
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

export async function completeChannelInboxEvent(eventId, result = {}) {
  const safeId = clean(eventId);
  if (!safeId) return null;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "completed",
      result: result && typeof result === "object" ? result : {},
      completed_at: now,
      locked_at: null,
      last_error: null,
      updated_at: now,
    })
    .eq("id", safeId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateChannelInboxEventResult(eventId, result = {}) {
  const safeId = clean(eventId);
  if (!safeId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      result: result && typeof result === "object" ? result : {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", safeId)
    .eq("status", "processing")
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function failChannelInboxEvent(event, error) {
  const safeId = clean(event?.id);
  if (!safeId) return null;
  const attempts = Math.max(1, Number(event?.attempts) || 1);
  const terminal = attempts >= MAX_ATTEMPTS;
  const delayMs = Math.min(15 * 60_000, 15_000 * 2 ** Math.max(0, attempts - 1));
  const now = new Date();
  const { data, error: updateError } = await supabase
    .from(TABLE)
    .update({
      status: terminal ? "failed" : "pending",
      available_at: terminal ? now.toISOString() : new Date(now.getTime() + delayMs).toISOString(),
      locked_at: null,
      last_error: String(error?.message || error || "Error desconocido").slice(0, 2000),
      updated_at: now.toISOString(),
    })
    .eq("id", safeId)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return data;
}
