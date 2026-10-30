// Conversiones offline: el CRM avisa a Google Ads y a Meta cuando un lead se cualifica,
// reserva una cita o compra, para que las campañas optimicen hacia clientes reales.
// Este módulo es puro (sin base de datos): normaliza, hashea, decide qué eventos tocan
// y construye los payloads. El envío recibe `fetchImpl` para poder probarlo sin red.
import crypto from "crypto";

export const CONVERSION_JOB_TYPE = "conversion_upload";
export const CONVERSION_EVENTS = Object.freeze(["qualified_lead", "booking", "sale"]);
export const CONVERSION_PLATFORMS = Object.freeze(["google", "meta"]);
export const CONVERSION_EVENT_LABELS = Object.freeze({
  qualified_lead: "Lead cualificado",
  booking: "Cita reservada",
  sale: "Venta",
});

const DATA_MANAGER_URL = "https://datamanager.googleapis.com/v1/events:ingest";
export const GOOGLE_DATA_MANAGER_SCOPE = "https://www.googleapis.com/auth/datamanager";
const LEAD_EVENT_SOURCE = "T-Media CRM";

function clean(value, max = 500) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

function digits(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

function toBool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function toMoney(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0;
}

// ---------------------------------------------------------------------------
// Normalización y hash (SHA-256 en hex, como piden Google y Meta)
// ---------------------------------------------------------------------------

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

// Google (Data Manager): minúsculas, sin espacios y, en gmail/googlemail, sin puntos ni "+etiqueta".
// Meta: minúsculas y sin espacios.
export function normalizeEmail(raw, { platform = "meta" } = {}) {
  const email = String(raw ?? "").toLowerCase().replace(/\s+/g, "");
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1 || !email.slice(at + 1).includes(".")) return "";
  let local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (platform === "google" && (domain === "gmail.com" || domain === "googlemail.com")) {
    local = local.split("+")[0].replace(/\./g, "");
    if (!local) return "";
  }
  return `${local}@${domain}`;
}

// E.164 (+34600111222). Números sin prefijo internacional se completan con el país por defecto.
export function normalizePhoneE164(raw, defaultCountryCode = "34") {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const country = digits(defaultCountryCode) || "34";
  let number = digits(text);
  if (!number) return "";
  if (text.startsWith("+")) {
    // ya trae prefijo
  } else if (number.startsWith("00")) {
    number = number.slice(2);
  } else if (number.length <= 10) {
    number = `${country}${number.replace(/^0+/, "")}`;
  }
  if (number.length < 8 || number.length > 15) return "";
  return `+${number}`;
}

export function hashedEmail(raw, platform) {
  const email = normalizeEmail(raw, { platform });
  return email ? sha256Hex(email) : "";
}

// Google hashea el número con "+"; Meta, solo dígitos con prefijo de país.
export function hashedPhone(raw, platform, defaultCountryCode = "34") {
  const e164 = normalizePhoneE164(raw, defaultCountryCode);
  if (!e164) return "";
  return sha256Hex(platform === "google" ? e164 : e164.slice(1));
}

// ---------------------------------------------------------------------------
// Atribución guardada en custom_fields (widget y formularios)
// ---------------------------------------------------------------------------

export const ATTRIBUTION_KEYS = Object.freeze([
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "fbclid_at",
  "fbc",
  "fbp",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "landing_page",
  "referrer",
]);

// Solo lo que parece un identificador real: evita guardar basura o textos largos.
export function sanitizeAttribution(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = clean(input[key], key === "landing_page" || key === "referrer" ? 300 : 200);
    if (!value) continue;
    if (["gclid", "gbraid", "wbraid", "fbclid"].includes(key) && !/^[A-Za-z0-9_\-.~]+$/.test(value)) continue;
    if (key === "fbclid_at" && !/^\d{10,13}$/.test(value)) continue;
    if ((key === "fbc" || key === "fbp") && !/^fb\.\d\.\d{10,13}\.[A-Za-z0-9_\-.~]+$/.test(value)) continue;
    output[key] = value;
  }
  return output;
}

// Primer contacto manda: no se pisa un gclid ya guardado con el de una visita posterior.
export function mergeAttributionIntoCustomFields(customFields = {}, attribution = {}) {
  const current = customFields && typeof customFields === "object" ? customFields : {};
  const extra = sanitizeAttribution(attribution);
  const additions = Object.fromEntries(Object.entries(extra).filter(([key]) => !clean(current[key])));
  return Object.keys(additions).length ? { ...current, ...additions } : null;
}

export function readLeadAttribution(lead = {}) {
  const fields = lead?.custom_fields && typeof lead.custom_fields === "object" ? lead.custom_fields : {};
  return sanitizeAttribution(fields);
}

// fbc = fb.1.<ms de la visita>.<fbclid>. Si no sabemos cuándo llegó el clic, usamos el alta del lead.
export function buildFbc(attribution = {}, lead = {}) {
  if (attribution.fbc) return attribution.fbc;
  if (!attribution.fbclid) return "";
  const at = Number(attribution.fbclid_at) || Date.parse(lead?.created_at || "") || Date.now();
  const ms = String(at).length === 10 ? at * 1000 : at;
  return `fb.1.${ms}.${attribution.fbclid}`;
}

// lead_id de Meta Lead Ads (leadgen_id): 10-20 dígitos.
export function resolveMetaLeadId({ lead = {}, externalIds = [] } = {}) {
  const fields = lead?.custom_fields || {};
  const candidates = [fields.meta_lead_id, fields.leadgen_id, ...externalIds];
  for (const candidate of candidates) {
    const value = clean(candidate, 40);
    if (/^\d{10,20}$/.test(value)) return value;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Ajustes por cuenta
// ---------------------------------------------------------------------------

// Por defecto cuenta como "cualificado" la etapa cualificado y todas las abiertas posteriores, más las ganadas.
export function defaultQualifiedStages(pipelineStages = []) {
  const stages = (pipelineStages || []).filter((stage) => stage?.is_active !== false && stage?.key);
  const index = stages.findIndex((stage) => stage.key === "cualificado");
  if (index < 0) return stages.filter((stage) => stage.category === "won").map((stage) => stage.key);
  return stages.slice(index).filter((stage) => stage.category !== "lost").map((stage) => stage.key);
}

export function defaultSaleStages(pipelineStages = []) {
  const won = (pipelineStages || []).filter((stage) => stage?.is_active !== false && stage?.category === "won");
  return won.length ? won.map((stage) => stage.key) : ["ganado"];
}

export function defaultConversionSettings(pipelineStages = []) {
  return {
    enabled: false,
    enabled_at: null,
    currency: "EUR",
    default_country_code: "34",
    events: {
      qualified_lead: {
        enabled: true,
        stages: defaultQualifiedStages(pipelineStages),
        value: 0,
        google_conversion_action_id: "",
        meta_event_name: "QualifiedLead",
      },
      booking: {
        enabled: true,
        value: 0,
        google_conversion_action_id: "",
        meta_event_name: "Schedule",
      },
      sale: {
        enabled: true,
        stages: defaultSaleStages(pipelineStages),
        use_quote_value: true,
        value: 0,
        google_conversion_action_id: "",
        meta_event_name: "Purchase",
      },
    },
    google: {
      enabled: false,
      customer_id: "",
      login_customer_id: "",
      refresh_token: "",
      connected_email: "",
      connected_at: null,
    },
    meta: {
      enabled: false,
      pixel_id: "",
      access_token: "",
      test_event_code: "",
    },
  };
}

function cleanStageList(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  return [...new Set(value.map((item) => clean(item, 64)).filter(Boolean))].slice(0, 50);
}

function cleanEventName(value, fallback) {
  const name = clean(value, 50).replace(/[^A-Za-z0-9_ ]+/g, "");
  return name || fallback;
}

// Combina lo guardado con lo que llega del CRM. Los secretos solo cambian si llega un valor nuevo
// (el CRM nunca recibe el token, así que un campo vacío significa "no tocar") o si se pide borrarlos.
export function mergeConversionSettings(stored = {}, input = {}, { pipelineStages = [] } = {}) {
  const base = defaultConversionSettings(pipelineStages);
  const prev = {
    ...base,
    ...(stored || {}),
    events: { ...base.events, ...(stored?.events || {}) },
    google: { ...base.google, ...(stored?.google || {}) },
    meta: { ...base.meta, ...(stored?.meta || {}) },
  };
  const next = JSON.parse(JSON.stringify(prev));
  const body = input && typeof input === "object" ? input : {};

  if ("enabled" in body) next.enabled = toBool(body.enabled, prev.enabled);
  if (next.enabled && !prev.enabled_at) next.enabled_at = new Date().toISOString();
  if (!next.enabled) next.enabled_at = null;
  if ("currency" in body) next.currency = /^[A-Za-z]{3}$/.test(clean(body.currency)) ? clean(body.currency).toUpperCase() : prev.currency;
  if ("default_country_code" in body) next.default_country_code = digits(body.default_country_code).slice(0, 4) || prev.default_country_code;

  for (const key of CONVERSION_EVENTS) {
    const incoming = body.events?.[key];
    if (!incoming || typeof incoming !== "object") continue;
    const current = { ...base.events[key], ...(prev.events?.[key] || {}) };
    next.events[key] = {
      ...current,
      enabled: toBool(incoming.enabled, current.enabled),
      value: "value" in incoming ? toMoney(incoming.value) : current.value,
      google_conversion_action_id: "google_conversion_action_id" in incoming
        ? digits(incoming.google_conversion_action_id).slice(0, 20)
        : current.google_conversion_action_id,
      meta_event_name: "meta_event_name" in incoming
        ? cleanEventName(incoming.meta_event_name, base.events[key].meta_event_name)
        : current.meta_event_name,
      ...(key !== "booking" ? { stages: cleanStageList(incoming.stages, current.stages) } : {}),
      ...(key === "sale" ? { use_quote_value: toBool(incoming.use_quote_value, current.use_quote_value) } : {}),
    };
  }

  const google = body.google;
  if (google && typeof google === "object") {
    if ("enabled" in google) next.google.enabled = toBool(google.enabled, prev.google.enabled);
    if ("customer_id" in google) next.google.customer_id = digits(google.customer_id).slice(0, 10);
    if ("login_customer_id" in google) next.google.login_customer_id = digits(google.login_customer_id).slice(0, 10);
    if (google.disconnect === true) {
      next.google.refresh_token = "";
      next.google.connected_email = "";
      next.google.connected_at = null;
    }
  }

  const meta = body.meta;
  if (meta && typeof meta === "object") {
    if ("enabled" in meta) next.meta.enabled = toBool(meta.enabled, prev.meta.enabled);
    if ("pixel_id" in meta) next.meta.pixel_id = digits(meta.pixel_id).slice(0, 20);
    if ("test_event_code" in meta) next.meta.test_event_code = clean(meta.test_event_code, 40).replace(/[^A-Za-z0-9]/g, "");
    const token = clean(meta.access_token, 1000);
    if (token) next.meta.access_token = token;
    if (meta.clear_access_token === true) next.meta.access_token = "";
  }

  return next;
}

// Lo que ve el CRM: nunca los secretos, solo si están puestos.
export function publicConversionSettings(settings = {}, { pipelineStages = [] } = {}) {
  const full = mergeConversionSettings(settings, {}, { pipelineStages });
  return {
    ...full,
    google: {
      enabled: full.google.enabled,
      customer_id: full.google.customer_id,
      login_customer_id: full.google.login_customer_id,
      connected: Boolean(full.google.refresh_token),
      connected_email: full.google.connected_email,
      connected_at: full.google.connected_at,
    },
    meta: {
      enabled: full.meta.enabled,
      pixel_id: full.meta.pixel_id,
      test_event_code: full.meta.test_event_code,
      access_token_configured: Boolean(full.meta.access_token),
    },
  };
}

export function isPlatformReady(settings = {}, platform, event) {
  if (!settings?.enabled) return false;
  if (platform === "google") {
    const google = settings.google || {};
    return Boolean(
      google.enabled && google.customer_id && google.refresh_token && settings.events?.[event]?.google_conversion_action_id
    );
  }
  if (platform === "meta") {
    const meta = settings.meta || {};
    return Boolean(meta.enabled && meta.pixel_id && meta.access_token);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Qué eventos tocan y qué trabajos se encolan
// ---------------------------------------------------------------------------

export function detectLeadConversionEvents({ lead = {}, settings = {}, quote = null } = {}) {
  if (!settings?.enabled || !lead?.id) return [];
  const status = clean(lead.crm_status, 64);
  const events = [];
  const qualified = settings.events?.qualified_lead;
  if (qualified?.enabled && (qualified.stages || []).includes(status)) {
    events.push({ event: "qualified_lead", value: toMoney(qualified.value) });
  }
  const sale = settings.events?.sale;
  const accepted = clean(lead.quote_status) === "accepted" || clean(quote?.status) === "accepted";
  if (sale?.enabled && ((sale.stages || []).includes(status) || accepted)) {
    const quoteValue = sale.use_quote_value ? toMoney(quote?.total) : 0;
    events.push({
      event: "sale",
      value: quoteValue || toMoney(sale.value),
      currency: (sale.use_quote_value && quoteValue && clean(quote?.currency).toUpperCase()) || null,
    });
  }
  return events;
}

// Un trabajo por plataforma y evento. La clave hace que el mismo lead no cuente dos veces el mismo
// evento aunque cambie de etapa varias veces o se reserven varias citas.
export function conversionDedupeKey({ platform, event, leadId, bookingId }) {
  const subject = clean(leadId) || (clean(bookingId) ? `booking-${clean(bookingId)}` : "");
  if (!subject) return "";
  return `conversion:${platform}:${event}:${subject}`;
}

export function buildConversionJobs({
  settings = {},
  lead = null,
  event,
  value = 0,
  currency = null,
  eventTime = null,
  bookingId = null,
  trigger = "",
} = {}) {
  if (!CONVERSION_EVENTS.includes(event) || !settings?.enabled) return [];
  if (!settings.events?.[event]?.enabled) return [];
  const leadId = clean(lead?.id);
  return CONVERSION_PLATFORMS.filter((platform) => isPlatformReady(settings, platform, event))
    .map((platform) => ({
      jobType: CONVERSION_JOB_TYPE,
      dedupeKey: conversionDedupeKey({ platform, event, leadId, bookingId }),
      payload: {
        platform,
        event,
        lead_id: leadId || null,
        booking_id: clean(bookingId) || null,
        lead_name: clean(lead?.name, 120) || null,
        value: toMoney(value),
        currency: (clean(currency) || settings.currency || "EUR").toUpperCase(),
        event_time: eventTime || new Date().toISOString(),
        trigger: clean(trigger, 60) || null,
      },
    }))
    .filter((job) => job.dedupeKey);
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export function transactionIdFor(payload = {}) {
  return clean(`${payload.event}-${payload.lead_id || payload.booking_id || ""}`, 64);
}

// Sin consentimiento del contacto solo se envían identificadores del clic (gclid, lead_id de Meta, fbc):
// nada de email ni teléfono, aunque vayan hasheados.
export function buildGoogleIngestBody({ settings = {}, lead = {}, payload = {}, validateOnly = false } = {}) {
  const google = settings.google || {};
  const actionId = clean(settings.events?.[payload.event]?.google_conversion_action_id);
  if (!google.customer_id || !actionId) return { skip: "Falta el ID de cliente o de la acción de conversión de Google Ads." };

  const attribution = readLeadAttribution(lead);
  const consent = lead?.consent === true;
  const adIdentifiers = {};
  for (const key of ["gclid", "gbraid", "wbraid"]) if (attribution[key]) adIdentifiers[key] = attribution[key];

  const userIdentifiers = [];
  if (consent) {
    const email = hashedEmail(lead?.email, "google");
    const phone = hashedPhone(lead?.phone, "google", settings.default_country_code);
    if (email) userIdentifiers.push({ emailAddress: email });
    if (phone) userIdentifiers.push({ phoneNumber: phone });
  }
  if (!Object.keys(adIdentifiers).length && !userIdentifiers.length) {
    return {
      skip: consent
        ? "Sin gclid ni email/teléfono válidos para Google."
        : "Sin gclid y el contacto no dio consentimiento para usar su email o teléfono.",
    };
  }

  const destination = {
    operatingAccount: { accountType: "GOOGLE_ADS", accountId: google.customer_id },
    productDestinationId: actionId,
  };
  if (google.login_customer_id && google.login_customer_id !== google.customer_id) {
    destination.loginAccount = { accountType: "GOOGLE_ADS", accountId: google.login_customer_id };
  }

  const event = {
    transactionId: transactionIdFor(payload),
    eventTimestamp: new Date(payload.event_time || Date.now()).toISOString(),
    // Obligatorio en Data Manager. WEB, como en el ejemplo oficial de conversiones offline:
    // el clic y el lead nacen en la web aunque la cualificación o la venta pasen en el CRM.
    eventSource: "WEB",
  };
  if (Object.keys(adIdentifiers).length) event.adIdentifiers = adIdentifiers;
  if (userIdentifiers.length) event.userData = { userIdentifiers };
  if (toMoney(payload.value)) {
    event.conversionValue = toMoney(payload.value);
    event.currency = clean(payload.currency || settings.currency || "EUR").toUpperCase();
  }
  if (consent) event.consent = { adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_GRANTED" };

  const body = { destinations: [destination], encoding: "HEX", events: [event] };
  if (validateOnly) body.validateOnly = true;
  return { body };
}

export function buildMetaEventsBody({ settings = {}, lead = {}, payload = {}, metaLeadId = "" } = {}) {
  const attribution = readLeadAttribution(lead);
  const consent = lead?.consent === true;
  const userData = {};
  if (metaLeadId) userData.lead_id = metaLeadId;
  const fbc = buildFbc(attribution, lead);
  if (fbc) userData.fbc = fbc;
  if (attribution.fbp) userData.fbp = attribution.fbp;
  if (consent) {
    const email = hashedEmail(lead?.email, "meta");
    const phone = hashedPhone(lead?.phone, "meta", settings.default_country_code);
    if (email) userData.em = [email];
    if (phone) userData.ph = [phone];
  }
  if (!Object.keys(userData).length) {
    return {
      skip: consent
        ? "Sin lead_id de Meta, fbclid ni email/teléfono válidos para Meta."
        : "Sin lead_id de Meta ni fbclid y el contacto no dio consentimiento para usar su email o teléfono.",
    };
  }
  if (lead?.id) userData.external_id = [sha256Hex(String(lead.id))];

  const customData = { event_source: "crm", lead_event_source: LEAD_EVENT_SOURCE };
  if (toMoney(payload.value)) {
    customData.value = toMoney(payload.value);
    customData.currency = clean(payload.currency || settings.currency || "EUR").toUpperCase();
  }
  const eventName = settings.events?.[payload.event]?.meta_event_name
    || defaultConversionSettings().events[payload.event]?.meta_event_name
    || "Lead";
  const body = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(new Date(payload.event_time || Date.now()).getTime() / 1000),
        action_source: "system_generated",
        event_id: transactionIdFor(payload),
        user_data: userData,
        custom_data: customData,
      },
    ],
  };
  if (settings.meta?.test_event_code) body.test_event_code = settings.meta.test_event_code;
  return { body };
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

export class ConversionSendError extends Error {
  constructor(message, { retryable = false, status = 0 } = {}) {
    super(message);
    this.retryable = retryable;
    this.status = status;
  }
}

const isRetryableStatus = (status) => status === 0 || status === 408 || status === 429 || status >= 500;

const googleTokenCache = new Map();

export async function getGoogleAccessToken({ refreshToken, clientId, clientSecret, fetchImpl = fetch }) {
  if (!refreshToken) throw new ConversionSendError("Google Ads no está conectado: pulsa «Conectar Google Ads».");
  if (!clientId || !clientSecret) throw new ConversionSendError("Falta GOOGLE_OAUTH_CLIENT_ID/SECRET en el servidor.");
  const cacheKey = sha256Hex(refreshToken);
  const cached = googleTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  let response;
  try {
    response = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch (error) {
    throw new ConversionSendError(`No se pudo contactar con Google: ${error.message}`, { retryable: true });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const revoked = data?.error === "invalid_grant";
    throw new ConversionSendError(
      revoked
        ? "Google retiró el permiso. Vuelve a pulsar «Conectar Google Ads»."
        : `Google rechazó el token: ${data?.error_description || data?.error || response.status}`,
      { retryable: !revoked && isRetryableStatus(response.status), status: response.status }
    );
  }
  googleTokenCache.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 });
  return data.access_token;
}

// El mensaje general de Google suele ser genérico («There was a problem with the request»);
// el motivo real viene en details (ErrorInfo.reason y BadRequest.fieldViolations).
function googleErrorReasons(error = {}) {
  const reasons = [];
  for (const detail of Array.isArray(error?.details) ? error.details : []) {
    if (detail?.reason) reasons.push(clean(detail.reason, 120));
    for (const violation of Array.isArray(detail?.fieldViolations) ? detail.fieldViolations : []) {
      reasons.push(clean([violation.field, violation.reason, violation.description].filter(Boolean).join(": "), 300));
    }
  }
  return [...new Set(reasons.filter(Boolean))].slice(0, 5);
}

export async function sendGoogleConversion({ body, accessToken, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(DATA_MANAGER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ConversionSendError(`No se pudo contactar con Google: ${error.message}`, { retryable: true });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = [data?.error?.message || `HTTP ${response.status}`, ...googleErrorReasons(data?.error)].join(" · ");
    throw new ConversionSendError(`Google Ads rechazó la conversión: ${detail}`.slice(0, 1500), {
      retryable: isRetryableStatus(response.status),
      status: response.status,
    });
  }
  return { request_id: data.requestId || null, warnings: Array.isArray(data.fieldWarnings) ? data.fieldWarnings.slice(0, 5) : [] };
}

export async function sendMetaConversion({ pixelId, accessToken, body, apiVersion = "v25.0", fetchImpl = fetch }) {
  if (!pixelId || !accessToken) throw new ConversionSendError("Falta el Pixel ID o el token de Conversions API de Meta.");
  const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ConversionSendError(`No se pudo contactar con Meta: ${error.message}`, { retryable: true });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const err = data?.error || {};
    const detail = err.error_user_msg || err.message || `HTTP ${response.status}`;
    throw new ConversionSendError(`Meta rechazó la conversión: ${detail}`.slice(0, 1500), {
      retryable: Boolean(err.is_transient) || isRetryableStatus(response.status),
      status: response.status,
    });
  }
  return { events_received: data.events_received ?? null, fbtrace_id: data.fbtrace_id || null };
}
