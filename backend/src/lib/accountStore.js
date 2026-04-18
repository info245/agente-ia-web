import { supabase } from "./supabase.js";

const DEFAULT_ACCOUNT = {
  id: "default",
  slug: "tmedia-global",
  name: "TMedia Global",
  status: "active",
  plan: "internal",
  is_default: true,
};

let accountsTableAvailable = null;
let accountsCache = null;
let accountsCacheExpiresAt = 0;
const CACHE_TTL_MS = 30_000;
const tableSupportCache = new Map();

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function slugify(value, fallback = "account") {
  const normalized = clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function setCache(accounts = []) {
  accountsCache = accounts;
  accountsCacheExpiresAt = Date.now() + CACHE_TTL_MS;
}

async function hasAccountsTable() {
  if (accountsTableAvailable !== null) return accountsTableAvailable;

  const { error } = await supabase.from("accounts").select("id").limit(1);
  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (
      message.includes("accounts") ||
      message.includes("does not exist") ||
      message.includes("relation") ||
      message.includes("schema cache")
    ) {
      accountsTableAvailable = false;
      return false;
    }
    throw error;
  }

  accountsTableAvailable = true;
  return true;
}

async function tableExists(tableName) {
  if (tableSupportCache.has(tableName)) {
    return tableSupportCache.get(tableName);
  }

  const { error } = await supabase.from(tableName).select("id").limit(1);
  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (
      message.includes(tableName.toLowerCase()) ||
      message.includes("does not exist") ||
      message.includes("relation") ||
      message.includes("schema cache")
    ) {
      tableSupportCache.set(tableName, false);
      return false;
    }
    throw error;
  }

  tableSupportCache.set(tableName, true);
  return true;
}

function normalizeAccount(raw = {}) {
  return {
    id: clean(raw.id) || DEFAULT_ACCOUNT.id,
    slug: clean(raw.slug) || DEFAULT_ACCOUNT.slug,
    name: clean(raw.name) || DEFAULT_ACCOUNT.name,
    status: clean(raw.status) || "active",
    plan: clean(raw.plan) || "trial",
    is_default: Boolean(raw.is_default),
  };
}

function resetCache() {
  accountsCache = null;
  accountsCacheExpiresAt = 0;
}

export function getDefaultAccount() {
  return { ...DEFAULT_ACCOUNT };
}

export async function listAccounts({ force = false } = {}) {
  if (!force && accountsCache && Date.now() < accountsCacheExpiresAt) {
    return accountsCache;
  }

  const available = await hasAccountsTable();
  if (!available) {
    const fallback = [getDefaultAccount()];
    setCache(fallback);
    return fallback;
  }

  const { data, error } = await supabase
    .from("accounts")
    .select("id, slug, name, status, plan, is_default, created_at")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const accounts = (data || []).map(normalizeAccount);
  const finalAccounts = accounts.length ? accounts : [getDefaultAccount()];
  setCache(finalAccounts);
  return finalAccounts;
}

export async function resolveAccount(input = null) {
  const candidate = clean(input);
  const accounts = await listAccounts();

  if (!candidate) {
    return (
      accounts.find((account) => account.is_default) ||
      accounts[0] ||
      getDefaultAccount()
    );
  }

  return (
    accounts.find(
      (account) =>
        String(account.id) === candidate || String(account.slug) === candidate
    ) ||
    accounts.find((account) => account.is_default) ||
    accounts[0] ||
    getDefaultAccount()
  );
}

export async function createAccount(input = {}) {
  const available = await hasAccountsTable();
  if (!available) {
    throw new Error(
      "Falta la tabla accounts en Supabase. Ejecuta sql/005_multi_account.sql antes de crear cuentas."
    );
  }

  const name = clean(input.name);
  if (!name) {
    throw new Error("El nombre de la cuenta es obligatorio.");
  }

  const slug = slugify(input.slug || name, "account");
  const id = slugify(input.id || slug, "account");
  const payload = {
    id,
    slug,
    name,
    status: clean(input.status) || "trial",
    plan: clean(input.plan) || "starter",
    is_default: Boolean(input.is_default),
  };

  if (payload.is_default) {
    await supabase.from("accounts").update({ is_default: false }).neq("id", payload.id);
  }

  const { data, error } = await supabase
    .from("accounts")
    .insert(payload)
    .select("id, slug, name, status, plan, is_default, created_at")
    .single();

  if (error) throw error;
  resetCache();
  return normalizeAccount(data);
}

export async function updateAccount(accountId, input = {}) {
  const available = await hasAccountsTable();
  if (!available) {
    throw new Error(
      "Falta la tabla accounts en Supabase. Ejecuta sql/005_multi_account.sql antes de editar cuentas."
    );
  }

  const resolved = await resolveAccount(accountId);
  const safeAccountId = clean(resolved?.id || accountId);
  if (!safeAccountId) {
    throw new Error("Cuenta no valida.");
  }

  const patch = {};
  if (input.name !== undefined) patch.name = clean(input.name) || resolved.name;
  if (input.slug !== undefined) patch.slug = slugify(input.slug || resolved.slug, "account");
  if (input.status !== undefined) patch.status = clean(input.status) || resolved.status;
  if (input.plan !== undefined) patch.plan = clean(input.plan) || resolved.plan;
  if (input.is_default !== undefined) patch.is_default = Boolean(input.is_default);

  if (patch.is_default) {
    await supabase.from("accounts").update({ is_default: false }).neq("id", safeAccountId);
  }

  const { data, error } = await supabase
    .from("accounts")
    .update(patch)
    .eq("id", safeAccountId)
    .select("id, slug, name, status, plan, is_default, created_at")
    .single();

  if (error) throw error;
  resetCache();
  return normalizeAccount(data);
}

export async function deleteAccount(accountId) {
  const available = await hasAccountsTable();
  if (!available) {
    throw new Error(
      "Falta la tabla accounts en Supabase. Ejecuta sql/005_multi_account.sql antes de borrar cuentas."
    );
  }

  const resolved = await resolveAccount(accountId);
  const safeAccountId = clean(resolved?.id || accountId);
  if (!safeAccountId) {
    throw new Error("Cuenta no valida.");
  }

  if (resolved?.is_default) {
    throw new Error("No se puede borrar la cuenta por defecto.");
  }

  const relatedTables = [
    "analysis_results",
    "quotes",
    "messages",
    "conversation_events",
    "leads",
    "conversations",
    "app_settings",
    "crm_users",
  ];

  for (const tableName of relatedTables) {
    if (!(await tableExists(tableName))) continue;
    const { error } = await supabase.from(tableName).delete().eq("account_id", safeAccountId);
    if (error) throw error;
  }

  const { error } = await supabase.from("accounts").delete().eq("id", safeAccountId);
  if (error) throw error;

  resetCache();
  return { ok: true, id: safeAccountId };
}
