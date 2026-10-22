import { supabase } from "./supabase.js";
import { decryptSecret, encryptSecret } from "./secretCrypto.js";
import { CONVERSION_JOB_TYPE } from "./adConversions.js";

const TABLE = "ad_conversion_settings";

function clean(value) {
  return String(value ?? "").trim();
}

function isMissingTable(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes(TABLE) || message.includes("schema cache") || message.includes("does not exist");
}

// Un secreto cifrado con otra clave no debe tumbar el resto: se trata como "sin conectar".
function safeDecrypt(value, label, accountId) {
  try {
    return decryptSecret(clean(value));
  } catch (error) {
    console.error("[conversions] no se pudo descifrar", { account_id: accountId, label, error: error?.message });
    return "";
  }
}

function decryptSettings(settings = {}, accountId) {
  const copy = JSON.parse(JSON.stringify(settings || {}));
  if (copy.google?.refresh_token) copy.google.refresh_token = safeDecrypt(copy.google.refresh_token, "google", accountId);
  if (copy.meta?.access_token) copy.meta.access_token = safeDecrypt(copy.meta.access_token, "meta", accountId);
  return copy;
}

function encryptSettings(settings = {}) {
  const copy = JSON.parse(JSON.stringify(settings || {}));
  if (copy.google?.refresh_token) copy.google.refresh_token = encryptSecret(copy.google.refresh_token);
  if (copy.meta?.access_token) copy.meta.access_token = encryptSecret(copy.meta.access_token);
  return copy;
}

export async function getConversionSettings(accountId) {
  const { data, error } = await supabase.from(TABLE).select("settings").eq("account_id", clean(accountId)).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data ? decryptSettings(data.settings, accountId) : null;
}

export async function saveConversionSettings(accountId, settings) {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert({ account_id: clean(accountId), settings: encryptSettings(settings) }, { onConflict: "account_id" })
    .select("settings")
    .single();
  if (error) {
    if (isMissingTable(error)) throw new Error("Falta aplicar la migración sql/018_ad_conversions.sql en Supabase.");
    throw error;
  }
  return decryptSettings(data.settings, accountId);
}

export async function listEnabledConversionSettings() {
  const { data, error } = await supabase.from(TABLE).select("account_id, settings").eq("settings->>enabled", "true");
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data || []).map((row) => ({ accountId: row.account_id, settings: decryptSettings(row.settings, row.account_id) }));
}

// Qué claves ya están en la cola, para no lanzar un insert fallido por cada lead en cada barrido.
export async function findExistingConversionKeys(accountId, keys = []) {
  const found = new Set();
  const unique = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await supabase
      .from("automation_jobs")
      .select("dedupe_key")
      .eq("account_id", clean(accountId))
      .in("dedupe_key", unique.slice(i, i + 200));
    if (error) throw error;
    for (const row of data || []) found.add(row.dedupe_key);
  }
  return found;
}

export async function listConversionJobs(accountId, { limit = 100 } = {}) {
  const { data, error } = await supabase
    .from("automation_jobs")
    .select("id, status, payload, result, attempts, max_attempts, last_error, available_at, completed_at, created_at, updated_at")
    .eq("account_id", clean(accountId))
    .eq("job_type", CONVERSION_JOB_TYPE)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(300, Number(limit) || 100)));
  if (error) throw error;
  return data || [];
}

// Reintento manual desde el CRM: solo para envíos fallidos u omitidos (no para los ya aceptados).
export async function requeueConversionJob(accountId, jobId) {
  const now = new Date().toISOString();
  const { data: job, error: readError } = await supabase
    .from("automation_jobs")
    .select("id, status, result")
    .eq("account_id", clean(accountId))
    .eq("job_type", CONVERSION_JOB_TYPE)
    .eq("id", clean(jobId))
    .maybeSingle();
  if (readError) throw readError;
  if (!job) throw new Error("Envío no encontrado.");
  const retriable = job.status === "failed" || (job.status === "completed" && job.result?.skipped);
  if (!retriable) throw new Error("Solo se pueden reintentar envíos fallidos u omitidos.");
  const { data, error } = await supabase
    .from("automation_jobs")
    .update({
      status: "pending",
      attempts: 0,
      result: {},
      available_at: now,
      locked_at: null,
      lock_token: null,
      last_error: null,
      completed_at: null,
      updated_at: now,
    })
    .eq("id", job.id)
    .eq("status", job.status)
    .select("id, status")
    .maybeSingle();
  if (error) throw error;
  return data;
}
