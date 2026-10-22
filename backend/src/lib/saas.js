// Venta del CRM como SaaS: cobro con Stripe y alta guiada.
// Ambos se guardan en app_settings (billing:<cuenta> y onboarding:<cuenta>), sin tablas nuevas.
// Las cuentas sin registro de cobro (las de siempre, dadas de alta a mano) cuentan como
// gestionadas por la agencia: el despliegue no pausa a nadie.
import crypto from "crypto";
import { supabase } from "./supabase.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const STRIPE_API = "https://api.stripe.com/v1";

export const ONBOARDING_STEPS = [
  ["negocio", "Tu negocio y tu web"],
  ["servicios", "Servicios y precios"],
  ["tono", "Tono y saludo"],
  ["canales", "Conectar canales"],
  ["probar", "Probar el asistente"],
  ["activar", "Activar"],
];

export function trialDays() {
  return Math.max(0, Number(process.env.BILLING_TRIAL_DAYS ?? 14) || 0);
}

export function graceDays() {
  return Math.max(0, Number(process.env.BILLING_GRACE_DAYS ?? 7) || 0);
}

// BILLING_PLANS='[{"key":"basico","name":"Básico","price_id":"price_...","price_label":"49 €/mes","description":"..."}]'
export function getBillingPlans() {
  try {
    const plans = JSON.parse(process.env.BILLING_PLANS || "[]");
    return Array.isArray(plans) ? plans.filter((p) => p?.key && p?.price_id) : [];
  } catch {
    return [];
  }
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && getBillingPlans().length);
}

const BAD_STATUSES = new Set(["past_due", "unpaid", "incomplete"]);
const ENDED_STATUSES = new Set(["canceled", "incomplete_expired", "paused"]);
const daysUntil = (iso, now) => Math.max(0, Math.ceil((Date.parse(iso) - now) / DAY_MS));

// Qué ve el cliente y si su agente atiende. Puro: se prueba sin Stripe ni base de datos.
export function computeBillingState(record, { now = Date.now(), grace = graceDays() } = {}) {
  if (!record || record.managed_by_agency) return { status: "managed", agent_active: true };
  const sub = record.subscription_status || "";
  const base = { plan_key: record.plan_key || "", has_customer: Boolean(record.stripe_customer_id) };

  if (sub === "active") {
    return { ...base, status: "active", agent_active: true, period_end: record.current_period_end || null, cancel_at_period_end: Boolean(record.cancel_at_period_end) };
  }
  if (BAD_STATUSES.has(sub)) {
    const since = Date.parse(record.past_due_since || "") || now;
    const graceEndsAt = new Date(since + grace * DAY_MS).toISOString();
    return now < Date.parse(graceEndsAt)
      ? { ...base, status: "past_due", agent_active: true, grace_ends_at: graceEndsAt, days_left: daysUntil(graceEndsAt, now) }
      : { ...base, status: "paused", agent_active: false, reason: "unpaid" };
  }
  if (ENDED_STATUSES.has(sub)) return { ...base, status: "paused", agent_active: false, reason: "canceled" };

  // "trialing" en Stripe o prueba local sin tarjeta todavía.
  const trialEnd = record.trial_ends_at;
  if (sub === "trialing" || (trialEnd && now < Date.parse(trialEnd))) {
    return { ...base, status: "trial", agent_active: true, trial_ends_at: trialEnd || null, days_left: trialEnd ? daysUntil(trialEnd, now) : null, subscribed: sub === "trialing" };
  }
  return { ...base, status: "paused", agent_active: false, reason: "trial_ended" };
}

// Aplica un evento de Stripe al registro de cobro de la cuenta. Puro; devuelve el registro nuevo
// (o el mismo si el evento no cambia nada o llega desordenado).
export function applyStripeEvent(record, event, { plans = getBillingPlans() } = {}) {
  const current = record || {};
  const obj = event?.data?.object || {};
  const created = Number(event?.created) || 0;

  if (event?.type === "checkout.session.completed") {
    return {
      ...current,
      stripe_customer_id: obj.customer || current.stripe_customer_id || null,
      stripe_subscription_id: obj.subscription || current.stripe_subscription_id || null,
      plan_key: obj.metadata?.plan_key || current.plan_key || "",
    };
  }

  if (!String(event?.type || "").startsWith("customer.subscription.")) return current;
  if (created && created < Number(current.last_subscription_event || 0)) return current;

  const status = event.type === "customer.subscription.deleted" ? "canceled" : obj.status || "";
  const item = obj.items?.data?.[0] || {};
  const priceId = item.price?.id || "";
  const periodEnd = obj.current_period_end || item.current_period_end;
  const pastDueSince = BAD_STATUSES.has(status)
    ? current.past_due_since || new Date((created || Date.now() / 1000) * 1000).toISOString()
    : null;

  return {
    ...current,
    stripe_customer_id: obj.customer || current.stripe_customer_id || null,
    stripe_subscription_id: obj.id || current.stripe_subscription_id || null,
    subscription_status: status,
    plan_key: plans.find((p) => p.price_id === priceId)?.key || obj.metadata?.plan_key || current.plan_key || "",
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : current.current_period_end || null,
    trial_ends_at: obj.trial_end ? new Date(obj.trial_end * 1000).toISOString() : current.trial_ends_at || null,
    cancel_at_period_end: Boolean(obj.cancel_at_period_end),
    past_due_since: pastDueSince,
    last_subscription_event: created || current.last_subscription_event || 0,
  };
}

export function stripeEventAccountId(event) {
  const obj = event?.data?.object || {};
  return String(obj.metadata?.account_id || obj.client_reference_id || "").trim();
}

// Cabecera Stripe-Signature: "t=<segundos>,v1=<hmac>,...". Firma = HMAC-SHA256("<t>.<cuerpo>").
export function verifyStripeSignature(rawBody, header, secret, { now = Date.now(), toleranceSeconds = 300 } = {}) {
  if (!rawBody || !header || !secret) return false;
  const parts = String(header).split(",").map((p) => p.split("="));
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  });
}

// --- Almacén (app_settings) ---
// ponytail: caché por proceso de 30 s; con varias instancias de Render, un cambio tarda hasta 30 s en verse en las demás.
const cache = new Map();
const CACHE_MS = 30_000;

async function readSetting(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  const value = data?.value || null;
  cache.set(key, { value, expires: Date.now() + CACHE_MS });
  return value;
}

async function writeSetting(key, accountId, value) {
  const { error } = await supabase.from("app_settings").upsert({ key, value, account_id: accountId }, { onConflict: "key" });
  if (error) throw error;
  cache.set(key, { value, expires: Date.now() + CACHE_MS });
  return value;
}

export const getBillingRecord = (accountId) => readSetting(`billing:${accountId}`);
export const saveBillingRecord = (accountId, record) =>
  writeSetting(`billing:${accountId}`, accountId, { ...record, updated_at: new Date().toISOString() });

export async function getBillingState(accountId, { isDefault = false } = {}) {
  if (isDefault) return { status: "managed", agent_active: true };
  return computeBillingState(await getBillingRecord(accountId));
}

// Cuenta nueva: prueba gratis o gestionada por la agencia.
export function newBillingRecord({ managedByAgency = false, now = Date.now() } = {}) {
  return managedByAgency
    ? { managed_by_agency: true }
    : { managed_by_agency: false, trial_ends_at: new Date(now + trialDays() * DAY_MS).toISOString() };
}

export async function getOnboarding(accountId) {
  return readSetting(`onboarding:${accountId}`);
}

export async function saveOnboarding(accountId, value) {
  return writeSetting(`onboarding:${accountId}`, accountId, value);
}

export function summarizeOnboarding(record) {
  if (!record) return null;
  const done = new Set(Array.isArray(record.done) ? record.done : []);
  const steps = ONBOARDING_STEPS.map(([key, label]) => ({ key, label, done: done.has(key) }));
  return { steps, completed: Boolean(record.completed_at), completed_at: record.completed_at || null };
}

// --- Stripe (API REST con fetch: sin SDK) ---
function formEncode(params, prefix = "", out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object") formEncode(value, name, out);
    else out.append(name, String(value));
  }
  return out;
}

async function stripePost(path, params) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formEncode(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Stripe respondió ${res.status}`);
  return data;
}

export async function createCheckoutSession({ account, plan, record, email, returnUrl, now = Date.now() }) {
  const trialEnd = Date.parse(record?.trial_ends_at || "");
  // Stripe exige que trial_end esté al menos 48 h en el futuro; si queda menos, se cobra ya.
  const keepTrial = trialEnd && trialEnd - now > 2 * DAY_MS + 60_000;
  const meta = { account_id: account.id, plan_key: plan.key };
  return stripePost("/checkout/sessions", {
    mode: "subscription",
    line_items: { 0: { price: plan.price_id, quantity: 1 } },
    success_url: `${returnUrl}?pago=ok`,
    cancel_url: returnUrl,
    client_reference_id: account.id,
    customer: record?.stripe_customer_id || undefined,
    customer_email: record?.stripe_customer_id ? undefined : email || undefined,
    allow_promotion_codes: "true",
    metadata: meta,
    subscription_data: { metadata: meta, trial_end: keepTrial ? Math.floor(trialEnd / 1000) : undefined },
  });
}

export async function createPortalSession({ customerId, returnUrl }) {
  return stripePost("/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
}
