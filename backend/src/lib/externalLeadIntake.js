import { createHash } from "node:crypto";

const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_TEXT_LENGTH = 4000;
const MAX_CUSTOM_FIELDS = 50;

const FIELD_ALIASES = {
  account_id: ["account_id"],
  account_slug: ["account_slug", "account"],
  external_user_id: ["external_user_id", "lead_id", "leadgen_id", "leadgenid", "l"],
  name: ["name", "full_name", "nombre", "nombre_completo", "your_name", "first_name"],
  email: ["email", "correo", "correo_electronico", "email_address", "your_email"],
  phone: ["phone", "telefono", "tel", "mobile", "movil", "your_phone", "p"],
  company_name: ["company_name", "empresa", "company"],
  interest_service: [
    "interest_service",
    "service",
    "servicio",
    "servicio_interesado",
    "servicio_de_interes",
    "en_que_servicio_estas_interesado",
    "que_servicio_necesitas",
  ],
  business_type: ["business_type", "tipo_negocio", "tipo_de_negocio"],
  business_activity: ["business_activity", "actividad", "actividad_empresa", "sector"],
  budget_range: ["budget_range", "budget", "presupuesto", "presupuesto_estimado", "inversion"],
  main_goal: ["main_goal", "goal", "objetivo", "objetivo_principal", "que_quieres_mejorar"],
  current_situation: ["current_situation", "situacion_actual", "estado_actual"],
  pain_points: ["pain_points", "puntos_dolor", "problema", "problema_principal"],
  summary: ["summary", "resumen", "message", "mensaje", "comments", "comentarios"],
  preferred_contact_channel: [
    "preferred_contact_channel",
    "contact_channel",
    "canal_preferido",
    "canal",
  ],
  source_platform: ["source_platform", "platform", "source", "publisher_platform"],
  source_campaign: ["source_campaign", "campaign", "campaign_name", "campaignname"],
  source_form_name: ["source_form_name", "form_name", "formname"],
  source_ad_name: ["source_ad_name", "ad_name", "adname"],
  source_adset_name: ["source_adset_name", "adset_name", "adsetname"],
  consent: [
    "consent",
    "rgpd",
    "gdpr",
    "acuerdo_rgpd",
    "consentimiento",
    "consentimiento_de_datos",
    "acepto",
    "acceptance",
    "acceptance_rgpd",
  ],
  consent_at: ["consent_at", "consented_at"],
  auto_start: ["auto_start", "auto_contact"],
  lead_score: ["lead_score"],
};

const NESTED_FIELD_CONTAINERS = [
  "fields",
  "form_fields",
  "formfields",
  "entry",
  "submission",
  "data",
  "contact",
  "lead",
];

const RESERVED_KEYS = new Set([
  ...Object.values(FIELD_ALIASES).flat(),
  ...NESTED_FIELD_CONTAINERS,
  "field_data",
  "leadgen_data",
  "custom_fields",
  "form",
  "secret",
  "notify_internal",
]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stripAccents(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeExternalFieldKey(value) {
  return stripAccents(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function cleanText(value, maxLength = MAX_TEXT_LENGTH) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function externalFieldValue(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const values = value.map(externalFieldValue).filter((item) => item !== null);
    return values.length ? values.join(", ") : null;
  }
  if (!isPlainObject(value)) return cleanText(value);

  for (const key of ["value", "values", "raw_value", "rawValue", "answer", "text"]) {
    if (value[key] !== undefined && value[key] !== null && value[key] !== "") {
      return externalFieldValue(value[key]);
    }
  }
  return null;
}

function assignField(target, key, value) {
  const normalizedKey = normalizeExternalFieldKey(key);
  if (!normalizedKey || ["__proto__", "prototype", "constructor"].includes(normalizedKey)) return;
  const cleaned = externalFieldValue(value);
  if (cleaned === null || target[normalizedKey] !== undefined) return;
  target[normalizedKey] = cleaned;
}

function flattenContainer(target, container) {
  if (Array.isArray(container)) {
    for (const field of container.slice(0, 200)) {
      if (!isPlainObject(field)) continue;
      const key = field.name || field.key || field.label || field.title || field.id || field.field_name;
      assignField(target, key, field);
    }
    return;
  }
  if (!isPlainObject(container)) return;
  for (const [key, value] of Object.entries(container).slice(0, 200)) {
    assignField(target, key, value);
    if (isPlainObject(value)) {
      for (const alias of [value.id, value.name, value.label, value.title]) {
        assignField(target, alias, value);
      }
    }
  }
}

function flattenPayload(rawPayload) {
  const flattened = Object.create(null);
  for (const [key, value] of Object.entries(rawPayload).slice(0, 300)) {
    const normalizedKey = normalizeExternalFieldKey(key);
    if (!normalizedKey || ["__proto__", "prototype", "constructor"].includes(normalizedKey)) continue;
    flattened[normalizedKey] = value;
  }

  for (const containerKey of NESTED_FIELD_CONTAINERS) {
    flattenContainer(flattened, flattened[containerKey]);
  }

  if (isPlainObject(flattened.form)) {
    assignField(
      flattened,
      "source_form_name",
      flattened.form.name || flattened.form.title || flattened.form.id
    );
  }

  const metaFields = Array.isArray(flattened.field_data)
    ? flattened.field_data
    : Array.isArray(flattened.leadgen_data?.field_data)
      ? flattened.leadgen_data.field_data
      : [];
  flattenContainer(flattened, metaFields);
  return flattened;
}

function firstValue(payload, aliases) {
  for (const alias of aliases) {
    const key = normalizeExternalFieldKey(alias);
    const value = externalFieldValue(payload[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizedBooleanToken(value) {
  return stripAccents(value).toLowerCase().trim().replace(/\s+/g, " ");
}

// Returns null for absent or ambiguous values. This deliberately never treats an
// arbitrary non-empty checkbox label as consent.
export function parseStrictConsent(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value !== "string") return null;

  const token = normalizedBooleanToken(value);
  if (["true", "1", "yes", "si", "on", "accepted", "aceptado", "acepto"].includes(token)) {
    return true;
  }
  if (["false", "0", "no", "off", "rejected", "rechazado", "no acepto"].includes(token)) {
    return false;
  }
  if (
    /^(doy|presto) mi consentimiento\b/.test(token) ||
    /^acepto (la|las|el|los) (politica|politicas|condiciones|terminos|tratamiento)\b/.test(token)
  ) {
    return true;
  }
  return null;
}

export function parseStrictBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value !== "string") return null;
  const token = normalizedBooleanToken(value);
  if (["true", "1", "yes", "si", "on"].includes(token)) return true;
  if (["false", "0", "no", "off"].includes(token)) return false;
  return null;
}

function normalizeSourcePlatform(value) {
  const token = normalizeExternalFieldKey(value);
  if (["fb", "facebook", "meta", "meta_ads", "facebook_ads", "facebook_lead_ads", "ig", "instagram", "instagram_ads"].includes(token)) {
    return "meta_ads";
  }
  if (["google", "google_ads", "adwords"].includes(token)) return "google_ads";
  if (["website", "web", "website_form", "elementor", "wpforms", "contact_form_7", "forminator"].includes(token)) {
    return "website_form";
  }
  return token || "external_form";
}

function normalizeEmail(value) {
  return cleanText(value, 320)?.toLowerCase() || null;
}

function normalizePhone(value) {
  const raw = cleanText(value, 80);
  if (!raw) return null;
  const hasPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");
  return digits ? `${hasPlus ? "+" : ""}${digits}` : null;
}

function normalizeIsoDate(value) {
  const raw = cleanText(value, 80);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeLeadScore(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
}

function normalizeCustomFields(payload) {
  const result = Object.create(null);
  if (isPlainObject(payload.custom_fields)) {
    for (const [key, value] of Object.entries(payload.custom_fields).slice(0, MAX_CUSTOM_FIELDS)) {
      assignField(result, key, value);
    }
  }

  for (const [key, value] of Object.entries(payload)) {
    if (Object.keys(result).length >= MAX_CUSTOM_FIELDS) break;
    if (RESERVED_KEYS.has(key) || NESTED_FIELD_CONTAINERS.includes(key)) continue;
    if (typeof value === "object" || value === undefined || value === null) continue;
    assignField(result, key, value);
  }
  return { ...result };
}

export function normalizeExternalLeadPayload(rawPayload = {}) {
  if (!isPlainObject(rawPayload)) {
    throw new TypeError("El payload del lead debe ser un objeto JSON.");
  }

  let payloadSize = 0;
  try {
    payloadSize = Buffer.byteLength(JSON.stringify(rawPayload), "utf8");
  } catch (_error) {
    throw new TypeError("El payload del lead debe ser serializable como JSON.");
  }
  if (payloadSize > MAX_PAYLOAD_BYTES) {
    throw new RangeError(`El payload del lead supera ${MAX_PAYLOAD_BYTES} bytes.`);
  }

  const flattened = flattenPayload(rawPayload);
  const pick = (field) => firstValue(flattened, FIELD_ALIASES[field]);
  const consentRaw = pick("consent");
  const consentProvided = consentRaw !== null;
  const parsedConsent = parseStrictConsent(consentRaw);
  const autoStart = parseStrictBoolean(pick("auto_start")) === true;

  return {
    account_id: cleanText(pick("account_id"), 100),
    account_slug: normalizeExternalFieldKey(pick("account_slug")) || null,
    external_user_id: cleanText(pick("external_user_id"), 200),
    name: cleanText(pick("name"), 200),
    email: normalizeEmail(pick("email")),
    phone: normalizePhone(pick("phone")),
    company_name: cleanText(pick("company_name"), 200),
    interest_service: cleanText(pick("interest_service"), 200),
    business_type: cleanText(pick("business_type"), 200),
    business_activity: cleanText(pick("business_activity")),
    budget_range: cleanText(pick("budget_range"), 200),
    main_goal: cleanText(pick("main_goal")),
    current_situation: cleanText(pick("current_situation")),
    pain_points: cleanText(pick("pain_points")),
    summary: cleanText(pick("summary")),
    preferred_contact_channel: normalizeExternalFieldKey(pick("preferred_contact_channel")) || null,
    source_platform: normalizeSourcePlatform(pick("source_platform")),
    source_campaign: cleanText(pick("source_campaign"), 300),
    source_form_name: cleanText(pick("source_form_name"), 300),
    source_ad_name: cleanText(pick("source_ad_name"), 300),
    source_adset_name: cleanText(pick("source_adset_name"), 300),
    lead_score: normalizeLeadScore(pick("lead_score")),
    consent: parsedConsent === true,
    consent_at: parsedConsent === true ? normalizeIsoDate(pick("consent_at")) : null,
    consent_provided: consentProvided,
    consent_valid: !consentProvided || parsedConsent !== null,
    auto_start: autoStart && parsedConsent === true,
    custom_fields: normalizeCustomFields(flattened),
  };
}

export function validateExternalLeadPayload(payload, { requireConsent = false } = {}) {
  const errors = [];
  const add = (field, code, message) => errors.push({ field, code, message });
  if (!isPlainObject(payload)) {
    return {
      valid: false,
      errors: [{ field: "payload", code: "invalid_type", message: "El lead debe ser un objeto." }],
    };
  }

  if (!payload.email && !payload.phone && !payload.external_user_id) {
    add("contact", "missing_contact", "Se requiere email, teléfono o identificador externo.");
  }
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
    add("email", "invalid_email", "El email no tiene un formato válido.");
  }
  if (payload.phone) {
    const digits = String(payload.phone).replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) {
      add("phone", "invalid_phone", "El teléfono debe contener entre 7 y 15 dígitos.");
    }
  }
  if (payload.consent_valid === false) {
    add("consent", "ambiguous_consent", "El consentimiento debe ser una aceptación o rechazo explícito.");
  }
  if (requireConsent && payload.consent !== true) {
    add("consent", "consent_required", "Se requiere consentimiento explícito.");
  }
  if (payload.consent_at && payload.consent !== true) {
    add("consent_at", "consent_timestamp_without_consent", "No puede haber fecha sin consentimiento.");
  }
  return { valid: errors.length === 0, errors };
}

export function parseExternalLeadIntake(rawPayload, options = {}) {
  const value = normalizeExternalLeadPayload(rawPayload);
  const validation = validateExternalLeadPayload(value, options);
  return { ...validation, value };
}

export function validateIdempotencyKey(value) {
  if (typeof value !== "string") return false;
  const cleaned = value.trim();
  return cleaned.length >= 16 && cleaned.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._:-]+$/.test(cleaned);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => !["consent_at", "received_at", "timestamp", "retry", "notify_internal"].includes(key))
      .map((key) => [key, canonicalize(value[key])])
  );
}

export function deriveExternalLeadIdempotencyKey({
  accountId,
  sourcePlatform,
  externalUserId = null,
  payload = {},
} = {}) {
  const account = cleanText(accountId, 100);
  if (!account) throw new TypeError("accountId es obligatorio para derivar la clave de idempotencia.");
  const source = normalizeSourcePlatform(sourcePlatform);
  const externalId = cleanText(externalUserId, 200);
  const identity = externalId
    ? { account, source, external_id: externalId }
    : { account, source, payload: canonicalize(payload) };
  const digest = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  return `lead:${digest}`;
}

