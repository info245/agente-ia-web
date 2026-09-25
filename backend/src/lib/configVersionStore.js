import { supabase } from "./supabase.js";
import { decryptConfigSecrets, encryptConfigSecrets } from "./secretCrypto.js";

const TABLE = "config_versions";

function clean(value) {
  return String(value || "").trim();
}

function safeUuid(value) {
  const candidate = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

export async function saveDraftConfigVersion({ accountId, config, createdBy = null, changeSummary = "" }) {
  const storedConfig = encryptConfigSecrets(config);
  const { data, error } = await supabase.rpc("save_draft_config_version", {
    p_account_id: accountId,
    p_config: storedConfig,
    p_change_summary: clean(changeSummary) || null,
    p_created_by: safeUuid(createdBy),
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return result ? { ...result, config: decryptConfigSecrets(result.config) } : result;
}

export async function publishConfigVersion({ accountId, config, createdBy = null, changeSummary = "" }) {
  const { data, error } = await supabase.rpc("publish_config_version", {
    p_account_id: accountId,
    p_config: encryptConfigSecrets(config),
    p_change_summary: clean(changeSummary) || null,
    p_created_by: safeUuid(createdBy),
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return result ? { ...result, config: decryptConfigSecrets(result.config) } : result;
}

export async function getPublishedConfigVersion(accountId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, config: decryptConfigSecrets(data.config) } : null;
}

export async function listConfigVersions(accountId, limit = 30) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, account_id, version, status, change_summary, published_at, created_at, updated_at")
    .eq("account_id", accountId)
    .order("version", { ascending: false })
    .limit(Math.max(1, Math.min(100, Number(limit) || 30)));
  if (error) throw error;
  return data || [];
}

export async function getConfigVersion(accountId, version) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("account_id", accountId)
    .eq("version", Number(version))
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, config: decryptConfigSecrets(data.config) } : null;
}
