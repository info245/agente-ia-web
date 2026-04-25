import { supabase } from "./supabase.js";
import {
  getDefaultAppConfig,
  mergeAppConfig,
  sanitizeAppConfig,
} from "./appConfig.js";
import { getDefaultAccount, resolveAccount } from "./accountStore.js";

const CONFIG_KEY = "crm_agent_config";
const CACHE_TTL_MS = 30_000;
const cache = new Map();

function hasSettingsTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("app_settings") ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("schema cache")
  );
}

function buildConfigKey(accountId) {
  const safeAccountId = String(accountId || getDefaultAccount().id).trim();
  return `${CONFIG_KEY}:${safeAccountId}`;
}

function getCached(accountId) {
  const hit = cache.get(buildConfigKey(accountId));
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    cache.delete(buildConfigKey(accountId));
    return null;
  }
  return hit.value;
}

function setCache(accountId, value) {
  cache.set(buildConfigKey(accountId), {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export async function getAppConfig({ force = false, accountId = null } = {}) {
  const account = await resolveAccount(accountId);
  const scopedKey = buildConfigKey(account.id);
  const defaultKey = CONFIG_KEY;

  if (!force) {
    const cached = getCached(account.id);
    if (cached) return cached;
  }

  let query = supabase
    .from("app_settings")
    .select("key, value")
    .in(
      "key",
      account.id === getDefaultAccount().id ? [scopedKey, defaultKey] : [scopedKey]
    )
    .limit(2);

  const { data, error } = await query;

  if (error) {
    if (hasSettingsTableError(error)) {
      const fallback = getDefaultAppConfig();
      setCache(account.id, fallback);
      return fallback;
    }
    throw error;
  }

  const rows = data || [];
  const exact = rows.find((row) => row.key === scopedKey);
  const legacy = rows.find((row) => row.key === defaultKey);
  const merged = mergeAppConfig(exact?.value || legacy?.value || {});

  setCache(account.id, merged);
  return merged;
}

export async function saveAppConfig(input = {}, { accountId = null } = {}) {
  const account = await resolveAccount(accountId);
  const currentConfig = await getAppConfig({ force: true, accountId: account.id });
  const sanitized = sanitizeAppConfig({
    ...currentConfig,
    ...(input || {}),
    product: {
      ...(currentConfig?.product || {}),
      ...(input?.product || {}),
    },
    brand: {
      ...(currentConfig?.brand || {}),
      ...(input?.brand || {}),
    },
    contact: {
      ...(currentConfig?.contact || {}),
      ...(input?.contact || {}),
    },
    agent: {
      ...(currentConfig?.agent || {}),
      ...(input?.agent || {}),
    },
    integrations: {
      ...(currentConfig?.integrations || {}),
      ...(input?.integrations || {}),
    },
    knowledge_sources: {
      ...(currentConfig?.knowledge_sources || {}),
      ...(input?.knowledge_sources || {}),
    },
    message_templates: {
      ...(currentConfig?.message_templates || {}),
      ...(input?.message_templates || {}),
    },
    automation_flows: {
      ...(currentConfig?.automation_flows || {}),
      ...(input?.automation_flows || {}),
    },
    services: {
      ...(currentConfig?.services || {}),
      ...(input?.services || {}),
    },
  });
  const merged = mergeAppConfig(sanitized);

  const { data, error } = await supabase
    .from("app_settings")
    .upsert(
      {
        key: buildConfigKey(account.id),
        value: merged,
      },
      { onConflict: "key" }
    )
    .select("value")
    .single();

  if (error) {
    if (hasSettingsTableError(error)) {
      throw new Error(
        "Falta la tabla app_settings en Supabase. Ejecuta sql/004_app_settings.sql antes de guardar configuracion."
      );
    }
    throw error;
  }

  const finalConfig = mergeAppConfig(data?.value || merged);
  setCache(account.id, finalConfig);
  return finalConfig;
}
