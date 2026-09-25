import { supabase } from "./supabase.js";

const TABLE = "automation_jobs";

function clean(value) {
  return String(value || "").trim();
}

export async function enqueueAutomationJob({ accountId, jobType, dedupeKey, payload, availableAt } = {}) {
  const row = {
    account_id: clean(accountId),
    job_type: clean(jobType),
    dedupe_key: clean(dedupeKey) || null,
    payload: payload && typeof payload === "object" ? payload : {},
    status: "pending",
    available_at: availableAt || new Date().toISOString(),
  };
  const { data, error } = await supabase.from(TABLE).insert(row).select("*").single();
  if (!error) return { job: data, duplicate: false };
  if (error.code !== "23505" || !row.dedupe_key) throw error;
  const { data: existing, error: existingError } = await supabase
    .from(TABLE)
    .select("*")
    .eq("account_id", row.account_id)
    .eq("dedupe_key", row.dedupe_key)
    .maybeSingle();
  if (existingError) throw existingError;
  return { job: existing, duplicate: true };
}

export async function claimAutomationJobs(limit = 20) {
  const { data, error } = await supabase.rpc("claim_automation_jobs", {
    p_limit: Math.max(1, Math.min(100, Number(limit) || 20)),
  });
  if (error) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("claim_automation_jobs") || message.includes("schema cache") || message.includes("does not exist")) {
      return [];
    }
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

export async function completeAutomationJob(jobId, result = {}) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: "completed", result, completed_at: now, locked_at: null, updated_at: now })
    .eq("id", clean(jobId))
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateAutomationJobResult(jobId, result = {}) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ result, updated_at: new Date().toISOString() })
    .eq("id", clean(jobId))
    .eq("status", "processing")
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function retrySkippedAutomationJob(jobId, { payload, availableAt } = {}) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      payload: payload && typeof payload === "object" ? payload : {},
      result: {},
      status: "pending",
      attempts: 0,
      available_at: availableAt || now,
      locked_at: null,
      lock_token: null,
      last_error: null,
      completed_at: null,
      updated_at: now,
    })
    .eq("id", clean(jobId))
    .eq("status", "completed")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function failAutomationJob(job, failure) {
  const attempts = Math.max(1, Number(job?.attempts) || 1);
  const maxAttempts = Math.max(1, Number(job?.max_attempts) || 5);
  const terminal = attempts >= maxAttempts;
  const now = new Date();
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: terminal ? "failed" : "pending",
      available_at: terminal
        ? now.toISOString()
        : new Date(now.getTime() + Math.min(30 * 60_000, 15_000 * 2 ** (attempts - 1))).toISOString(),
      locked_at: null,
      lock_token: null,
      last_error: String(failure?.message || failure || "Error desconocido").slice(0, 2000),
      updated_at: now.toISOString(),
    })
    .eq("id", clean(job?.id))
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
