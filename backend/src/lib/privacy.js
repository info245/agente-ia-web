// RGPD: exportar, borrar o anonimizar todo lo de un contacto, registrar quién accede y el consentimiento.
import { supabase } from "./supabase.js";
import { sanitizePrivacyConfig } from "./appConfig.js";

const clean = (value) => String(value ?? "").trim();

export { sanitizePrivacyConfig };

export const DEFAULT_PRIVACY_NOTICE =
  "Este chat lo atiende un asistente con inteligencia artificial. Usaremos los datos que nos des para responder a tu consulta y, si nos lo pides, contactarte. Puedes ejercer tus derechos de acceso, rectificación y supresión en cualquier momento.";

// Todo lo que guarda datos de un contacto, y por qué columna se encuentra.
// Si se añade una tabla con datos personales, va aquí: export y borrado la cubren a la vez.
export const PERSONAL_DATA_TABLES = [
  { table: "messages", keys: ["conversation_id"] },
  { table: "conversation_events", keys: ["conversation_id"] },
  { table: "quotes", keys: ["lead_id"] },
  { table: "analysis_results", keys: ["lead_id"] },
  { table: "bookings", keys: ["lead_id", "conversation_id"] },
  { table: "intake_events", keys: ["lead_id", "conversation_id"] },
  { table: "agent_feedback", keys: ["lead_id", "conversation_id"] },
  { table: "tool_logs", keys: ["conversation_id"] },
  { table: "agent_runs", keys: ["conversation_id"] },
];

// Campos que se vacían al anonimizar; el resto (estado, servicio, origen, fechas) queda para estadísticas.
const LEAD_PERSONAL_FIELDS = [
  "name", "email", "phone", "company_name", "summary", "business_activity", "main_goal",
  "current_situation", "pain_points", "internal_notes", "next_action", "notes_ai", "last_question",
];

function missingTable(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("does not exist") || message.includes("schema cache");
}

async function rows(query) {
  const { data, error } = await query;
  if (error) {
    if (missingTable(error)) return [];
    throw error;
  }
  return data || [];
}

async function run(query) {
  const { error } = await query;
  if (error && !missingTable(error)) throw error;
}

async function getLead(db, leadId, accountId) {
  let query = db.from("leads").select("*").eq("id", clean(leadId));
  if (clean(accountId)) query = query.eq("account_id", clean(accountId));
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Lead no encontrado");
  return data;
}

// La conversación solo es "suya" si ningún otro contacto la comparte.
async function ownsConversation(db, lead) {
  if (!lead.conversation_id) return false;
  const others = await rows(db.from("leads").select("id").eq("conversation_id", lead.conversation_id));
  return others.every((row) => row.id === lead.id);
}

export async function collectLeadData(leadId, { accountId = null, db = supabase } = {}) {
  const lead = await getLead(db, leadId, accountId);
  const ids = { lead_id: lead.id, conversation_id: lead.conversation_id };
  const conversation = lead.conversation_id
    ? (await rows(db.from("conversations").select("*").eq("id", lead.conversation_id)))[0] || null
    : null;
  const related = {};
  for (const { table, keys } of PERSONAL_DATA_TABLES) {
    const byId = new Map();
    for (const key of keys) {
      if (!ids[key]) continue;
      for (const row of await rows(db.from(table).select("*").eq(key, ids[key]))) byId.set(row.id, row);
    }
    related[table] = [...byId.values()];
  }
  return {
    exported_at: new Date().toISOString(),
    lead,
    conversation,
    consent: (related.conversation_events || []).filter((event) => event.event_type === "consent"),
    ...related,
  };
}

function csvCell(value) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Un CSV plano (tabla, id, campo, valor): abre en Excel sin perder nada de lo anidado.
export function leadDataToCsv(bundle) {
  const lines = [["tabla", "id", "campo", "valor"]];
  const push = (table, record) => {
    for (const [field, value] of Object.entries(record || {})) lines.push([table, record.id ?? "", field, value]);
  };
  push("leads", bundle.lead);
  if (bundle.conversation) push("conversations", bundle.conversation);
  for (const { table } of PERSONAL_DATA_TABLES) for (const record of bundle[table] || []) push(table, record);
  return "﻿" + lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
}

async function eraseRelated(db, lead, ownsConv) {
  for (const { table, keys } of PERSONAL_DATA_TABLES) {
    for (const key of keys) {
      if (key === "lead_id") await run(db.from(table).delete().eq("lead_id", lead.id));
      if (key === "conversation_id" && ownsConv) await run(db.from(table).delete().eq("conversation_id", lead.conversation_id));
    }
  }
  if (ownsConv) {
    // Seguimientos pendientes: llevan el nombre y el teléfono en el payload.
    await run(db.from("automation_jobs").delete().like("dedupe_key", `automation:${lead.conversation_id}:%`));
  }
}

// Supresión (art. 17): el contacto, su conversación y todo lo que cuelga de ellos.
export async function eraseLead(leadId, { accountId = null, db = supabase } = {}) {
  const lead = await getLead(db, leadId, accountId);
  const ownsConv = await ownsConversation(db, lead);
  await eraseRelated(db, lead, ownsConv);
  await run(db.from("leads").delete().eq("id", lead.id));
  if (ownsConv) await run(db.from("conversations").delete().eq("id", lead.conversation_id));
  return { ok: true, id: lead.id, conversation_id: lead.conversation_id || null };
}

// Anonimizar: se borra lo personal y queda una fila sin identificar para las estadísticas.
export async function anonymizeLead(leadId, { accountId = null, db = supabase } = {}) {
  const lead = await getLead(db, leadId, accountId);
  const ownsConv = await ownsConversation(db, lead);
  const conversationId = lead.conversation_id;
  await eraseRelated(db, lead, ownsConv);
  const now = new Date().toISOString();
  await run(
    db.from("leads")
      .update({
        ...Object.fromEntries(LEAD_PERSONAL_FIELDS.map((field) => [field, null])),
        conversation_id: null,
        consent: false,
        custom_fields: { _anonymized_at: now },
        updated_at: now,
      })
      .eq("id", lead.id)
  );
  if (ownsConv) await run(db.from("conversations").delete().eq("id", conversationId));
  return { ok: true, id: lead.id };
}

export async function logDataAccess({ accountId, leadId = null, action, actor = null, details = {} }, { db = supabase } = {}) {
  try {
    await run(
      db.from("data_access_log").insert({
        account_id: clean(accountId),
        lead_id: clean(leadId) || null,
        action,
        actor_id: clean(actor?.id) || null,
        actor_email: clean(actor?.email) || (actor ? null : "sistema"),
        details,
      })
    );
  } catch (error) {
    // Un fallo del registro no debe impedir que el cliente ejerza su derecho.
    console.error("[privacy] no se pudo registrar el acceso", error.message);
  }
}

export async function listDataAccessLog(leadId, { accountId, limit = 50, db = supabase } = {}) {
  return rows(
    db.from("data_access_log")
      .select("action, actor_email, details, created_at")
      .eq("account_id", clean(accountId))
      .eq("lead_id", clean(leadId))
      .order("created_at", { ascending: false })
      .limit(limit)
  );
}

// Ver una conversación se registra como mucho una vez cada 30 min por persona: el CRM la refresca cada 5 s.
const recentViews = new Map();
export function logLeadView({ accountId, leadId, actor }, options) {
  const key = `${actor?.id || actor?.email || "?"}:${leadId}`;
  const now = Date.now();
  if (!leadId || now - (recentViews.get(key) || 0) < 30 * 60 * 1000) return;
  recentViews.set(key, now);
  // ponytail: mapa en memoria sin límite, se vacía al reiniciar; pasar a la base si crece demasiado.
  return logDataAccess({ accountId, leadId, action: "view", actor }, options);
}

// Registro de consentimiento: una entrada por conversación y canal, con el texto que se mostró.
const consentRecorded = new Set();
export async function recordConsent(
  { conversationId, accountId, channel, granted = true, basis, text, policyUrl = "", source = "" },
  { db = supabase } = {}
) {
  const key = `${conversationId}:${channel}:${basis}`;
  if (!conversationId || consentRecorded.has(key)) return;
  const existing = await rows(
    db.from("conversation_events").select("id, payload").eq("conversation_id", conversationId).eq("event_type", "consent")
  );
  consentRecorded.add(key);
  if (existing.some((event) => event.payload?.basis === basis)) return;
  await run(
    db.from("conversation_events").insert({
      conversation_id: conversationId,
      account_id: clean(accountId) || null,
      event_type: "consent",
      channel,
      payload: { granted, basis, text: clean(text).slice(0, 4000), policy_url: clean(policyUrl), source: clean(source) },
    })
  );
}

// Plazos de conservación: contactos sin actividad desde hace N meses se anonimizan o se borran.
export async function applyRetention({ accountId, privacy, now = new Date(), limit = 200, db = supabase }) {
  const { retention_months: months, retention_action: action } = sanitizePrivacyConfig(privacy);
  if (!months) return { account_id: accountId, skipped: true };
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  let query = db.from("leads")
    .select("id, conversation_id")
    .eq("account_id", accountId)
    .lt("updated_at", cutoff.toISOString());
  if (action === "anonymize") query = query.is("custom_fields->>_anonymized_at", null);
  const stale = await rows(query.order("updated_at", { ascending: true }).limit(limit));
  const done = [];
  for (const lead of stale) {
    // Un mensaje reciente cuenta como actividad aunque la ficha no se haya tocado.
    if (lead.conversation_id) {
      const recent = await rows(
        db.from("messages").select("id").eq("conversation_id", lead.conversation_id).gte("created_at", cutoff.toISOString()).limit(1)
      );
      if (recent.length) continue;
    }
    if (action === "delete") await eraseLead(lead.id, { accountId, db });
    else await anonymizeLead(lead.id, { accountId, db });
    await logDataAccess({ accountId, leadId: lead.id, action: action === "delete" ? "delete" : "anonymize", details: { reason: "retention", months } }, { db });
    done.push(lead.id);
  }
  return { account_id: accountId, action, months, processed: done.length };
}
