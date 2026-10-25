// Plantillas de propuesta por servicio (sql/022): partidas, IVA, cobro y textos ya preparados.
import { supabase } from "./supabase.js";

const clean = (v, max = 4000) => String(v ?? "").trim().slice(0, max);
const FIELDS = "id, name, service, title, billing_type, tax_rate, items, summary, scope, body, assumptions, updated_at";

function sanitizeItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .slice(0, 40)
    .map((i) => ({ concept: clean(i?.concept, 300), quantity: Math.max(0, Number(i?.quantity) || 1), unit_price: Math.max(0, Number(i?.unit_price) || 0) }))
    .filter((i) => i.concept);
}

async function run(query) {
  const { data, error } = await query;
  if (error) {
    if (/quote_templates|does not exist|schema cache/i.test(String(error.message))) throw new Error("Falta aplicar la migración sql/022 en Supabase.");
    throw error;
  }
  return data;
}

export async function listQuoteTemplates(accountId) {
  return run(supabase.from("quote_templates").select(FIELDS).eq("account_id", accountId).order("service").order("name").limit(200));
}

export async function saveQuoteTemplate(accountId, input = {}) {
  const row = {
    name: clean(input.name, 120) || "Plantilla",
    service: clean(input.service, 160),
    title: clean(input.title, 200),
    billing_type: ["monthly", "one_time", "custom"].includes(input.billing_type) ? input.billing_type : "monthly",
    tax_rate: Math.max(0, Math.min(100, Number(input.tax_rate) || 0)),
    items: sanitizeItems(input.items),
    summary: clean(input.summary, 500),
    scope: clean(input.scope),
    body: clean(input.body),
    assumptions: clean(input.assumptions),
    updated_at: new Date().toISOString(),
  };
  if (input.id) return run(supabase.from("quote_templates").update(row).eq("account_id", accountId).eq("id", input.id).select(FIELDS).single());
  return run(supabase.from("quote_templates").insert({ ...row, account_id: accountId }).select(FIELDS).single());
}

export async function deleteQuoteTemplate(accountId, id) {
  await run(supabase.from("quote_templates").delete().eq("account_id", accountId).eq("id", id));
}
