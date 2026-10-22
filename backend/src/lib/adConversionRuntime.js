// Pegamento entre el CRM y la cola: decide qué conversiones encolar y procesa cada envío.
// Los disparadores directos (cambio de etapa, propuesta aceptada) dan inmediatez; el barrido
// periódico recoge lo que entra por otros caminos (agente, reservas, integraciones).
import { supabase } from "./supabase.js";
import { getCrmLeadById, getLatestQuoteByLeadId } from "./chatStore.js";
import { completeAutomationJob, enqueueAutomationJob, failAutomationJob } from "./automationJobStore.js";
import {
  CONVERSION_JOB_TYPE,
  ConversionSendError,
  buildConversionJobs,
  buildGoogleIngestBody,
  buildMetaEventsBody,
  detectLeadConversionEvents,
  getGoogleAccessToken,
  isPlatformReady,
  mergeConversionSettings,
  resolveMetaLeadId,
  sendGoogleConversion,
  sendMetaConversion,
} from "./adConversions.js";
import { findExistingConversionKeys, getConversionSettings, listEnabledConversionSettings } from "./adConversionStore.js";

const SWEEP_LOOKBACK_MS = 72 * 3600_000;
const META_MAX_AGE_MS = 7 * 24 * 3600_000;

function metaApiVersion() {
  return process.env.META_GRAPH_API_VERSION || process.env.WHATSAPP_API_VERSION || "v25.0";
}

async function loadSettings(accountId, settings) {
  const stored = settings || (await getConversionSettings(accountId));
  return stored ? mergeConversionSettings(stored, {}) : null;
}

async function enqueueJobs(accountId, jobs, knownKeys = null) {
  const queued = [];
  for (const job of jobs) {
    if (knownKeys?.has(job.dedupeKey)) continue;
    const result = await enqueueAutomationJob({ accountId, ...job });
    knownKeys?.add(job.dedupeKey);
    if (!result.duplicate) queued.push(result.job?.id);
  }
  return queued;
}

function leadJobs({ settings, lead, quote, trigger, eventTime }) {
  return detectLeadConversionEvents({ lead, settings, quote }).flatMap((item) =>
    buildConversionJobs({ settings, lead, event: item.event, value: item.value, currency: item.currency, eventTime, trigger })
  );
}

async function quoteFor(settings, lead) {
  const sale = settings.events?.sale;
  if (!sale?.enabled || !sale.use_quote_value) return null;
  const relevant = (sale.stages || []).includes(lead.crm_status) || lead.quote_status === "accepted";
  return relevant ? getLatestQuoteByLeadId(lead.id).catch(() => null) : null;
}

// Nunca rompe el flujo que la llama: una conversión que no se encola la recoge el barrido.
export async function queueLeadConversions({ accountId, lead, trigger = "stage_change", settings = null } = {}) {
  try {
    if (!accountId || !lead?.id) return [];
    const resolved = await loadSettings(accountId, settings);
    if (!resolved?.enabled) return [];
    const quote = await quoteFor(resolved, lead);
    return await enqueueJobs(accountId, leadJobs({ settings: resolved, lead, quote, trigger }));
  } catch (error) {
    console.log("[conversions] queue lead error", error?.message || error);
    return [];
  }
}

export async function queueBookingConversion({ accountId, booking, lead = null, settings = null, knownKeys = null } = {}) {
  try {
    if (!accountId || !booking?.id || booking.status === "cancelled") return [];
    const resolved = await loadSettings(accountId, settings);
    if (!resolved?.enabled) return [];
    const jobs = buildConversionJobs({
      settings: resolved,
      lead: lead || { id: booking.lead_id || null, name: booking.attendee_name },
      event: "booking",
      value: resolved.events?.booking?.value,
      bookingId: booking.id,
      eventTime: booking.created_at || null,
      trigger: "booking",
    });
    return await enqueueJobs(accountId, jobs, knownKeys);
  } catch (error) {
    console.log("[conversions] queue booking error", error?.message || error);
    return [];
  }
}

// Revisa leads y reservas recientes de las cuentas con conversiones activas. Mira como mucho 72 h
// atrás y nunca antes de activar las conversiones, para no mandar el histórico de golpe.
export async function runConversionSweep({ now = Date.now() } = {}) {
  const accounts = await listEnabledConversionSettings();
  const summary = [];
  for (const { accountId, settings: stored } of accounts) {
    const settings = mergeConversionSettings(stored, {});
    if (!settings.enabled) continue;
    const since = new Date(Math.max(now - SWEEP_LOOKBACK_MS, Date.parse(settings.enabled_at || "") || 0)).toISOString();
    let queued = 0;
    try {
      const stageKeys = [...new Set([...(settings.events.qualified_lead.stages || []), ...(settings.events.sale.stages || [])])];
      const { data: leads, error } = await supabase
        .from("leads")
        .select("id, name, crm_status, quote_status, updated_at")
        .eq("account_id", accountId)
        .gte("updated_at", since)
        .or(`crm_status.in.(${stageKeys.map((key) => `"${key}"`).join(",") || '""'}),quote_status.eq.accepted`)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const candidates = [];
      for (const lead of leads || []) {
        const quote = await quoteFor(settings, lead);
        candidates.push(...leadJobs({ settings, lead, quote, trigger: "sweep", eventTime: lead.updated_at }));
      }

      const { data: bookings, error: bookingError } = await supabase
        .from("bookings")
        .select("id, lead_id, conversation_id, attendee_name, status, created_at")
        .eq("account_id", accountId)
        .eq("status", "confirmed")
        .gte("created_at", since)
        .limit(200);
      if (bookingError && !String(bookingError.message || "").includes("bookings")) throw bookingError;

      const known = await findExistingConversionKeys(accountId, candidates.map((job) => job.dedupeKey));
      queued += (await enqueueJobs(accountId, candidates, known)).length;
      for (const booking of bookings || []) {
        let leadId = booking.lead_id;
        if (!leadId && booking.conversation_id) {
          const { data } = await supabase.from("leads").select("id").eq("conversation_id", booking.conversation_id).maybeSingle();
          leadId = data?.id || null;
        }
        queued += (
          await queueBookingConversion({
            accountId,
            booking: { ...booking, lead_id: leadId },
            lead: { id: leadId, name: booking.attendee_name },
            settings,
            knownKeys: known,
          })
        ).length;
      }
      summary.push({ account_id: accountId, queued });
    } catch (error) {
      console.log("[conversions] sweep error", accountId, error?.message || error);
      summary.push({ account_id: accountId, queued, error: error?.message || String(error) });
    }
  }
  return summary;
}

async function leadForJob(accountId, payload) {
  if (payload.lead_id) {
    const lead = await getCrmLeadById(payload.lead_id, { accountId });
    if (lead) return lead;
  }
  if (payload.booking_id) {
    const { data } = await supabase
      .from("bookings")
      .select("id, attendee_name, attendee_email, created_at")
      .eq("account_id", accountId)
      .eq("id", payload.booking_id)
      .maybeSingle();
    // Sin lead no consta consentimiento: solo valdría un identificador de clic, que aquí no hay.
    if (data) return { id: null, name: data.attendee_name, email: data.attendee_email, consent: false, created_at: data.created_at };
  }
  return null;
}

async function metaExternalIds(accountId, lead) {
  const ids = [lead?.conversations?.external_user_id];
  if (lead?.id) {
    const { data } = await supabase
      .from("intake_events")
      .select("external_event_id")
      .eq("account_id", accountId)
      .eq("lead_id", lead.id)
      .not("external_event_id", "is", null)
      .limit(5);
    ids.push(...(data || []).map((row) => row.external_event_id));
  }
  return ids.filter(Boolean);
}

export async function sendConversionJob(job, { fetchImpl = fetch } = {}) {
  const payload = job.payload || {};
  const accountId = job.account_id;
  const base = { platform: payload.platform, event: payload.event };
  const skip = (reason) => ({ ...base, skipped: true, reason });

  const settings = await loadSettings(accountId);
  if (!settings?.enabled) return skip("Las conversiones están desactivadas en esta cuenta.");
  if (!isPlatformReady(settings, payload.platform, payload.event)) {
    return skip(payload.platform === "google" ? "Google Ads no está configurado para este evento." : "Meta no está configurado.");
  }
  const lead = await leadForJob(accountId, payload);
  if (!lead) return skip("El contacto ya no existe en el CRM.");

  if (payload.platform === "google") {
    const built = buildGoogleIngestBody({ settings, lead, payload });
    if (built.skip) return skip(built.skip);
    const accessToken = await getGoogleAccessToken({
      refreshToken: settings.google.refresh_token,
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      fetchImpl,
    });
    const sent = await sendGoogleConversion({ body: built.body, accessToken, fetchImpl });
    return { ...base, sent: true, ...sent, identifiers: Object.keys(built.body.events[0].adIdentifiers || {}).concat(built.body.events[0].userData ? ["email/teléfono"] : []) };
  }

  if (Date.now() - Date.parse(payload.event_time || "") > META_MAX_AGE_MS) {
    return skip("Meta solo acepta eventos de los últimos 7 días.");
  }
  const metaLeadId = resolveMetaLeadId({ lead, externalIds: await metaExternalIds(accountId, lead) });
  const built = buildMetaEventsBody({ settings, lead, payload, metaLeadId });
  if (built.skip) return skip(built.skip);
  const sent = await sendMetaConversion({
    pixelId: settings.meta.pixel_id,
    accessToken: settings.meta.access_token,
    body: built.body,
    apiVersion: metaApiVersion(),
    fetchImpl,
  });
  return { ...base, sent: true, ...sent, identifiers: Object.keys(built.body.data[0].user_data) };
}

// Lo llama el worker de automation_jobs. Errores de red/5xx se reintentan con espera creciente;
// un rechazo definitivo (datos o permisos) se marca fallido al momento para verlo en el CRM.
export async function runConversionJob(job, options = {}) {
  if (job?.job_type !== CONVERSION_JOB_TYPE) throw new Error("No es un envío de conversión.");
  try {
    const result = { ...(await sendConversionJob(job, options)), completed_at: new Date().toISOString() };
    await completeAutomationJob(job.id, result);
    return { id: job.id, ok: true, ...result };
  } catch (error) {
    const retryable = !(error instanceof ConversionSendError) || error.retryable;
    const attempts = retryable ? job.attempts : Math.max(Number(job.max_attempts) || 5, Number(job.attempts) || 1);
    await failAutomationJob({ ...job, attempts }, error).catch(() => null);
    return { id: job.id, ok: false, error: error?.message || String(error), retryable };
  }
}
