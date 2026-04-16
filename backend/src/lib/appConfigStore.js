import { supabase } from "./supabase.js";
import {
  getDefaultAppConfig,
  mergeAppConfig,
  sanitizeAppConfig,
} from "./appConfig.js";

const CONFIG_KEY = "crm_agent_config";
let cache = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 30_000;

function hasSettingsTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("app_settings") ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("schema cache")
  );
}

function setCache(value) {
  cache = value;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
}

export async function getAppConfig({ force = false } = {}) {
  if (!force && cache && Date.now() < cacheExpiresAt) {
    return cache;
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", CONFIG_KEY)
    .maybeSingle();

  if (error) {
    if (hasSettingsTableError(error)) {
      const fallback = getDefaultAppConfig();
      setCache(fallback);
      return fallback;
    }
    throw error;
  }

  const merged = mergeAppConfig(data?.value || {});
  setCache(merged);
  return merged;
}

export async function saveAppConfig(input = {}) {
  const sanitized = sanitizeAppConfig(input);
  const merged = mergeAppConfig(sanitized);

  const { data, error } = await supabase
    .from("app_settings")
    .upsert(
      {
        key: CONFIG_KEY,
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
  setCache(finalConfig);
  return finalConfig;
}
