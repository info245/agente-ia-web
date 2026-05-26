import { supabase } from "./supabase.js";
import { getDefaultAccount } from "./accountStore.js";

const tableSupportCache = {
  checked: false,
  available: false,
};

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeChannel(row = {}) {
  const fallbackAccount = getDefaultAccount();
  return {
    id: clean(row.id) || null,
    account_id: clean(row.account_id) || fallbackAccount.id,
    provider: clean(row.provider) || "meta_cloud",
    status: clean(row.status) || "active",
    waba_id: clean(row.waba_id || row.business_account_id) || "",
    phone_number_id: clean(row.phone_number_id) || "",
    display_phone_number: clean(row.display_phone_number) || "",
    verified_name: clean(row.verified_name) || "",
    access_token: clean(row.access_token) || "",
    token_label: clean(row.token_label) || "",
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

export function getFallbackWhatsAppChannel() {
  const fallbackAccount = getDefaultAccount();
  return normalizeChannel({
    account_id: fallbackAccount.id,
    provider: "meta_cloud",
    status: "active",
    waba_id: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID,
    display_phone_number: process.env.WHATSAPP_PUBLIC_NUMBER,
    access_token: process.env.WHATSAPP_TOKEN,
    token_label: "env:WHATSAPP_TOKEN",
    metadata: { source: "env_fallback" },
  });
}

async function hasWhatsAppChannelsTable() {
  if (tableSupportCache.checked) return tableSupportCache.available;

  const { error } = await supabase.from("whatsapp_channels").select("id").limit(1);
  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (
      message.includes("whatsapp_channels") ||
      message.includes("does not exist") ||
      message.includes("relation") ||
      message.includes("schema cache")
    ) {
      tableSupportCache.checked = true;
      tableSupportCache.available = false;
      return false;
    }
    throw error;
  }

  tableSupportCache.checked = true;
  tableSupportCache.available = true;
  return true;
}

export async function getWhatsAppChannelForAccount(accountId = null) {
  const fallback = getFallbackWhatsAppChannel();
  const safeAccountId = clean(accountId) || fallback.account_id;

  if (!(await hasWhatsAppChannelsTable())) {
    return safeAccountId === fallback.account_id
      ? fallback
      : { ...fallback, account_id: safeAccountId, phone_number_id: "", access_token: "" };
  }

  const { data, error } = await supabase
    .from("whatsapp_channels")
    .select("*")
    .eq("account_id", safeAccountId)
    .eq("status", "active")
    .order("connected_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data) return normalizeChannel(data);

  return safeAccountId === fallback.account_id
    ? fallback
    : { ...fallback, account_id: safeAccountId, phone_number_id: "", access_token: "" };
}

export async function getWhatsAppChannelByPhoneNumberId(phoneNumberId = null) {
  const safePhoneNumberId = clean(phoneNumberId);
  const fallback = getFallbackWhatsAppChannel();

  if (!safePhoneNumberId) return fallback;

  if (!(await hasWhatsAppChannelsTable())) {
    return safePhoneNumberId === fallback.phone_number_id ? fallback : null;
  }

  const { data, error } = await supabase
    .from("whatsapp_channels")
    .select("*")
    .eq("phone_number_id", safePhoneNumberId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  if (data) return normalizeChannel(data);

  return safePhoneNumberId === fallback.phone_number_id ? fallback : null;
}

export async function resolveWhatsAppChannelFromWebhookValue(value = {}) {
  const phoneNumberId =
    clean(value?.metadata?.phone_number_id) ||
    clean(value?.metadata?.phone_number?.id) ||
    clean(value?.phone_number_id);

  return (await getWhatsAppChannelByPhoneNumberId(phoneNumberId)) || getFallbackWhatsAppChannel();
}
