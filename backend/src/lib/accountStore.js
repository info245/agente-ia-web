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

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
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
