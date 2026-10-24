// Acceso a datos del email marketing (sql/019_email_marketing.sql).
import { supabase } from "./supabase.js";
import { normalizeEmail, normalizeTags, sanitizeAutomation, sanitizeBlocks, sanitizeSegment } from "./emailMarketing.js";

const clean = (v, max = 2000) => String(v ?? "").trim().slice(0, max);

async function run(query) {
  const { data, error } = await query;
  if (error) {
    if (/email_|relation .* does not exist|schema cache|column .*tags/i.test(String(error.message))) {
      throw new Error("Falta aplicar la migración sql/019_email_marketing.sql en Supabase.");
    }
    throw error;
  }
  return data;
}

// ---------- Audiencia ----------

export async function listMarketingLeads(accountId) {
  return run(
    supabase
      .from("leads")
      .select("id, name, email, consent, crm_status, interest_service, source_platform, company_name, tags, created_at, updated_at, conversations(channel)")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(5000)
  );
}

export async function getSuppressedSet(accountId) {
  const rows = await run(supabase.from("email_suppressions").select("email").eq("account_id", accountId).limit(20000));
  return new Set((rows || []).map((r) => r.email));
}

export async function listSuppressions(accountId) {
  return run(supabase.from("email_suppressions").select("email, reason, created_at").eq("account_id", accountId).order("created_at", { ascending: false }).limit(1000));
}

export async function addSuppression(accountId, email, reason, messageId = null) {
  const safe = normalizeEmail(email);
  if (!safe) return;
  await run(
    supabase.from("email_suppressions").upsert({ account_id: accountId, email: safe, reason, message_id: messageId }, { onConflict: "account_id,email", ignoreDuplicates: true })
  );
}

export async function removeSuppression(accountId, email) {
  await run(supabase.from("email_suppressions").delete().eq("account_id", accountId).eq("email", normalizeEmail(email)));
}

export async function setLeadTags(accountId, leadId, tags) {
  return run(supabase.from("leads").update({ tags: normalizeTags(tags) }).eq("account_id", accountId).eq("id", leadId).select("id, tags").single());
}

export async function setLeadStage(accountId, leadId, stage) {
  return run(supabase.from("leads").update({ crm_status: clean(stage, 80) }).eq("account_id", accountId).eq("id", leadId));
}

// Importación CSV: crea contactos nuevos o completa los existentes (mismo email), sin conversación.
export async function importContacts(accountId, rows = [], { consent = false, tags = [] } = {}) {
  const existing = await run(supabase.from("leads").select("id, email, tags, consent").eq("account_id", accountId).not("email", "is", null).limit(20000));
  const byEmail = new Map((existing || []).map((l) => [normalizeEmail(l.email), l]));
  const extraTags = normalizeTags(tags);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of rows.slice(0, 5000)) {
    const email = normalizeEmail(row.email);
    if (!email) {
      skipped += 1;
      continue;
    }
    const current = byEmail.get(email);
    const rowTags = normalizeTags([...normalizeTags(row.tags), ...extraTags]);
    if (current) {
      await run(
        supabase
          .from("leads")
          .update({ tags: normalizeTags([...(current.tags || []), ...rowTags]), ...(consent && current.consent !== false ? { consent: true, consent_at: new Date().toISOString() } : {}) })
          .eq("id", current.id)
      );
      updated += 1;
    } else {
      await run(
        supabase.from("leads").insert({
          account_id: accountId,
          email,
          name: clean(row.name, 160) || null,
          phone: clean(row.phone, 40) || null,
          company_name: clean(row.company, 160) || null,
          tags: rowTags,
          consent: consent ? true : null,
          consent_at: consent ? new Date().toISOString() : null,
          crm_status: "nuevo",
          source_platform: "import",
          lead_score: 0,
          custom_fields: { imported_at: new Date().toISOString() },
        })
      );
      byEmail.set(email, { email, tags: rowTags });
      created += 1;
    }
  }
  return { created, updated, skipped };
}

// ---------- Campañas ----------

const CAMPAIGN_FIELDS = "id, name, subject, preheader, from_name, blocks, segment, status, scheduled_at, started_at, sent_at, recipients_count, created_at, updated_at";

export async function listCampaigns(accountId) {
  return run(supabase.from("email_campaigns").select(CAMPAIGN_FIELDS).eq("account_id", accountId).order("created_at", { ascending: false }).limit(200));
}

export async function getCampaign(accountId, id) {
  return run(supabase.from("email_campaigns").select(CAMPAIGN_FIELDS).eq("account_id", accountId).eq("id", id).maybeSingle());
}

export async function saveCampaign(accountId, input = {}, { createdBy = null } = {}) {
  const row = {
    name: clean(input.name, 160),
    subject: clean(input.subject, 200),
    preheader: clean(input.preheader, 200),
    from_name: clean(input.from_name, 120),
    blocks: sanitizeBlocks(input.blocks),
    segment: sanitizeSegment(input.segment || {}),
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const current = await getCampaign(accountId, input.id);
    if (!current) throw new Error("Campaña no encontrada.");
    if (!["draft", "scheduled"].includes(current.status)) throw new Error("Esta campaña ya se ha enviado y no se puede editar.");
    return run(supabase.from("email_campaigns").update(row).eq("account_id", accountId).eq("id", input.id).select(CAMPAIGN_FIELDS).single());
  }
  return run(supabase.from("email_campaigns").insert({ ...row, account_id: accountId, created_by: createdBy }).select(CAMPAIGN_FIELDS).single());
}

export async function updateCampaignStatus(accountId, id, patch) {
  return run(supabase.from("email_campaigns").update({ ...patch, updated_at: new Date().toISOString() }).eq("account_id", accountId).eq("id", id).select(CAMPAIGN_FIELDS).single());
}

export async function deleteCampaign(accountId, id) {
  const current = await getCampaign(accountId, id);
  if (current && !["draft", "cancelled"].includes(current.status)) throw new Error("Solo se pueden borrar borradores o campañas canceladas.");
  await run(supabase.from("email_campaigns").delete().eq("account_id", accountId).eq("id", id));
}

export async function listDueCampaigns(nowIso) {
  return run(supabase.from("email_campaigns").select("id, account_id, segment, status").eq("status", "scheduled").lte("scheduled_at", nowIso).limit(20));
}

export async function listSendingCampaigns() {
  return run(supabase.from("email_campaigns").select("id, account_id").eq("status", "sending").limit(50));
}

// ---------- Mensajes ----------

export async function createMessages(rows) {
  if (!rows.length) return [];
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    out.push(...((await run(supabase.from("email_messages").upsert(rows.slice(i, i + 500), { onConflict: "campaign_id,lead_id", ignoreDuplicates: true }).select("id, lead_id"))) || []));
  }
  return out;
}

export async function createRunMessage(row) {
  const rows = await run(supabase.from("email_messages").upsert(row, { onConflict: "run_id,step_index", ignoreDuplicates: true }).select("id"));
  return rows?.[0] || null;
}

export async function getMessage(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) return null;
  return run(supabase.from("email_messages").select("*").eq("id", id).maybeSingle());
}

export async function updateMessage(id, patch) {
  return run(supabase.from("email_messages").update(patch).eq("id", id));
}

export async function countPendingMessages(campaignId) {
  const { count, error } = await supabase.from("email_messages").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "queued");
  if (error) throw error;
  return count || 0;
}

export async function campaignStats(accountId, campaignId) {
  const rows = await run(
    supabase.from("email_messages").select("status, opened_at, clicked_at, unsubscribed_at, error, email, lead_id, open_count, click_count").eq("account_id", accountId).eq("campaign_id", campaignId).limit(20000)
  );
  const list = rows || [];
  const sent = list.filter((m) => m.status === "sent");
  return {
    total: list.length,
    queued: list.filter((m) => m.status === "queued").length,
    sent: sent.length,
    failed: list.filter((m) => m.status === "failed").length,
    opened: sent.filter((m) => m.opened_at).length,
    clicked: sent.filter((m) => m.clicked_at).length,
    unsubscribed: list.filter((m) => m.unsubscribed_at).length,
    recipients: list.slice(0, 500),
  };
}

export async function lastRunMessage(runId) {
  const rows = await run(supabase.from("email_messages").select("opened_at, clicked_at").eq("run_id", runId).order("created_at", { ascending: false }).limit(1));
  return rows?.[0] || null;
}

// ---------- Automatizaciones ----------

const AUTOMATION_FIELDS = "id, name, status, trigger, steps, activated_at, created_at, updated_at";

export async function listAutomations(accountId) {
  return run(supabase.from("email_automations").select(AUTOMATION_FIELDS).eq("account_id", accountId).order("created_at", { ascending: false }));
}

export async function getAutomation(accountId, id) {
  return run(supabase.from("email_automations").select(AUTOMATION_FIELDS).eq("account_id", accountId).eq("id", id).maybeSingle());
}

export async function saveAutomation(accountId, input = {}) {
  const { name, trigger, steps } = sanitizeAutomation(input);
  const row = { name, trigger, steps, updated_at: new Date().toISOString() };
  if (input.id) return run(supabase.from("email_automations").update(row).eq("account_id", accountId).eq("id", input.id).select(AUTOMATION_FIELDS).single());
  return run(supabase.from("email_automations").insert({ ...row, account_id: accountId }).select(AUTOMATION_FIELDS).single());
}

export async function setAutomationStatus(accountId, id, status) {
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === "active") {
    const current = await getAutomation(accountId, id);
    if (!current?.activated_at) patch.activated_at = new Date().toISOString();
  }
  return run(supabase.from("email_automations").update(patch).eq("account_id", accountId).eq("id", id).select(AUTOMATION_FIELDS).single());
}

export async function deleteAutomation(accountId, id) {
  await run(supabase.from("email_automations").delete().eq("account_id", accountId).eq("id", id));
}

export async function listActiveAutomations() {
  return run(supabase.from("email_automations").select("id, account_id, trigger, steps, activated_at").eq("status", "active").limit(500));
}

export async function enrolledLeadIds(automationId) {
  const rows = await run(supabase.from("email_automation_runs").select("lead_id").eq("automation_id", automationId).limit(20000));
  return new Set((rows || []).map((r) => r.lead_id));
}

export async function enroll(accountId, automationId, leadId) {
  await run(
    supabase.from("email_automation_runs").upsert({ account_id: accountId, automation_id: automationId, lead_id: leadId }, { onConflict: "automation_id,lead_id", ignoreDuplicates: true })
  );
}

export async function listDueRuns(nowIso, limit = 100) {
  return run(supabase.from("email_automation_runs").select("*").eq("status", "active").lte("next_at", nowIso).order("next_at").limit(limit));
}

export async function updateRun(id, patch) {
  return run(supabase.from("email_automation_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
}

export async function automationStats(accountId, automationId) {
  const runs = await run(supabase.from("email_automation_runs").select("status").eq("account_id", accountId).eq("automation_id", automationId).limit(20000));
  const list = runs || [];
  return { total: list.length, active: list.filter((r) => r.status === "active").length, done: list.filter((r) => r.status === "done").length, exited: list.filter((r) => r.status === "exited").length };
}
