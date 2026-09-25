import { supabase } from "./supabase.js";
import {
  getBlankAppConfig,
  getDefaultAppConfig,
  mergeAppConfig,
  sanitizeAppConfig,
} from "./appConfig.js";
import { getDefaultAccount, resolveAccount } from "./accountStore.js";
import { getPublishedConfigVersion } from "./configVersionStore.js";
import { decryptConfigSecrets, encryptConfigSecrets } from "./secretCrypto.js";

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
      const fallback =
        account.id === getDefaultAccount().id
          ? getDefaultAppConfig()
          : getBlankAppConfig({ productMode: account.product_mode });
      setCache(account.id, fallback);
      return fallback;
    }
    throw error;
  }

  const rows = data || [];
  const exact = rows.find((row) => row.key === scopedKey);
  const legacy = rows.find((row) => row.key === defaultKey);
  const baseConfig =
    account.id === getDefaultAccount().id
      ? getDefaultAppConfig()
      : getBlankAppConfig({ productMode: account.product_mode });
  const rawConfig = decryptConfigSecrets(exact?.value || legacy?.value || baseConfig);
  const merged = account.id === getDefaultAccount().id
    ? mergeAppConfig(rawConfig || {})
    : sanitizeAppConfig(rawConfig || baseConfig, { useBlankDefaults: true });

  setCache(account.id, merged);
  return merged;
}

export async function getPublishedAppConfig({ accountId = null } = {}) {
  const account = await resolveAccount(accountId);
  let published = null;
  try {
    published = await getPublishedConfigVersion(account.id);
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("config_versions") || message.includes("schema cache") || message.includes("does not exist")) {
      return getAppConfig({ accountId: account.id });
    }
    throw error;
  }
  if (!published?.config) {
    return account.id === getDefaultAccount().id
      ? getDefaultAppConfig()
      : getBlankAppConfig({ productMode: account.product_mode });
  }
  return account.id === getDefaultAccount().id
    ? mergeAppConfig(published.config)
    : sanitizeAppConfig(published.config, { useBlankDefaults: true });
}

export async function saveAppConfig(input = {}, { accountId = null } = {}) {
  const account = await resolveAccount(accountId);
  const currentConfig = await getAppConfig({ force: true, accountId: account.id });
  const incomingEmail = input?.integrations?.email || {};
  const currentEmail = currentConfig?.integrations?.email || {};
  const mergedEmail = { ...currentEmail, ...incomingEmail };
  for (const secretKey of [
    "smtp_pass",
    "google_client_secret",
    "google_refresh_token",
    "google_access_token",
  ]) {
    const incomingSecret = incomingEmail?.[secretKey];
    if (
      incomingSecret === undefined ||
      incomingSecret === null ||
      String(incomingSecret).trim() === "" ||
      /^\*+$/.test(String(incomingSecret).trim())
    ) {
      mergedEmail[secretKey] = currentEmail?.[secretKey] || "";
    }
  }
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
    widget: {
      ...(currentConfig?.widget || {}),
      ...(input?.widget || {}),
    },
    integrations: {
      ...(currentConfig?.integrations || {}),
      ...(input?.integrations || {}),
      whatsapp: {
        ...(currentConfig?.integrations?.whatsapp || {}),
        ...(input?.integrations?.whatsapp || {}),
      },
      lead_forms: {
        ...(currentConfig?.integrations?.lead_forms || {}),
        ...(input?.integrations?.lead_forms || {}),
      },
      email: mergedEmail,
      automations: {
        ...(currentConfig?.integrations?.automations || {}),
        ...(input?.integrations?.automations || {}),
      },
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
    pipeline: {
      ...(currentConfig?.pipeline || {}),
      ...(input?.pipeline || {}),
    },
    services: {
      ...(currentConfig?.services || {}),
      ...(input?.services || {}),
    },
  }, { useBlankDefaults: account.id !== getDefaultAccount().id });
  const merged =
    account.id === getDefaultAccount().id
      ? mergeAppConfig(sanitized)
      : sanitizeAppConfig(sanitized, { useBlankDefaults: true });

  const { data, error } = await supabase
    .from("app_settings")
    .upsert(
      {
        key: buildConfigKey(account.id),
        value: encryptConfigSecrets(merged),
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

  const finalConfig =
    account.id === getDefaultAccount().id
      ? mergeAppConfig(decryptConfigSecrets(data?.value || merged))
      : sanitizeAppConfig(decryptConfigSecrets(data?.value || merged), { useBlankDefaults: true });
  setCache(account.id, finalConfig);
  return finalConfig;
}
