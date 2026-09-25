import { supabase } from "./supabase.js";

const TABLE = "intake_events";

function clean(value) {
  return String(value || "").trim();
}

function isMissingInfrastructure(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes(TABLE) || message.includes("schema cache") || message.includes("does not exist");
}

export async function beginExternalLeadIntake({
  accountId,
  source,
  idempotencyKey,
  externalEventId = null,
  rawPayload = {},
  normalizedPayload = {},
} = {}) {
  const row = {
    account_id: clean(accountId),
    source: clean(source) || "external_form",
    idempotency_key: clean(idempotencyKey),
    external_event_id: clean(externalEventId) || null,
    raw_payload: rawPayload && typeof rawPayload === "object" ? rawPayload : {},
    normalized_payload:
      normalizedPayload && typeof normalizedPayload === "object" ? normalizedPayload : {},
    status: "processing",
    attempts: 1,
    last_error: null,
  };
  if (!row.account_id || !row.idempotency_key) {
    throw new Error("accountId e idempotencyKey son obligatorios");
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select("*")
    .single();

  if (!error) return { event: data, duplicate: false };
  if (isMissingInfrastructure(error)) {
    throw new Error(
      "Falta la infraestructura durable de formularios. Ejecuta sql/012_reliable_runtime_foundation.sql."
    );
  }
  if (error.code !== "23505") throw error;

  const { data: existing, error: existingError } = await supabase
    .from(TABLE)
    .select("*")
    .eq("account_id", row.account_id)
    .eq("idempotency_key", row.idempotency_key)
    .single();
  if (existingError) throw existingError;
  if (existing?.status === "failed") {
    const { data: retried, error: retryError } = await supabase
      .from(TABLE)
      .update({
        status: "processing",
        attempts: Math.max(1, Number(existing.attempts) || 1) + 1,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("status", "failed")
      .select("*")
      .maybeSingle();
    if (retryError) throw retryError;
    if (retried) return { event: retried, duplicate: false, retry: true };
  }
  return { event: existing, duplicate: true };
}

export async function completeExternalLeadIntake(eventId, { conversationId, leadId } = {}) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "completed",
      conversation_id: clean(conversationId) || null,
      lead_id: clean(leadId) || null,
      processed_at: now,
      last_error: null,
      updated_at: now,
    })
    .eq("id", clean(eventId))
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function failExternalLeadIntake(eventId, error, { rejected = false } = {}) {
  if (!clean(eventId)) return null;
  const now = new Date().toISOString();
  const { data, error: updateError } = await supabase
    .from(TABLE)
    .update({
      status: rejected ? "rejected" : "failed",
      last_error: String(error?.message || error || "Error desconocido").slice(0, 2000),
      processed_at: now,
      updated_at: now,
    })
    .eq("id", clean(eventId))
    .select("*")
    .single();
  if (updateError) throw updateError;
  return data;
}
