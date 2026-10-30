// Formularios de cliente potencial de Google Ads: webhook nativo de Google → lead del CRM.
// Formato: https://developers.google.com/google-ads/webhook/docs/implementation
import crypto from "node:crypto";

// Clave del webhook por cuenta, derivada del secreto de integraciones: sin guardar nada en BD.
export function googleLeadFormKey(secret, accountId) {
  if (!secret || !accountId) return "";
  return crypto.createHmac("sha256", String(secret)).update(`google-lead-form:${accountId}`).digest("hex").slice(0, 32);
}

export function isValidGoogleLeadFormKey(secret, accountId, supplied) {
  const expected = Buffer.from(googleLeadFormKey(secret, accountId));
  const given = Buffer.from(String(supplied || ""));
  return expected.length > 0 && given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const STANDARD_COLUMNS = {
  FULL_NAME: "name",
  EMAIL: "email",
  WORK_EMAIL: "email",
  PHONE_NUMBER: "phone",
  WORK_PHONE: "phone",
  COMPANY_NAME: "company_name",
};

const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const plain = (value) => clean(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Las preguntas propias del formulario llegan como texto libre: se guardan tal cual y van al resumen.
export function mapGoogleLeadFormPayload(body = {}) {
  const payload = { source_platform: "google_ads" };
  const answers = [];
  let firstName = "";
  let lastName = "";

  for (const column of Array.isArray(body.user_column_data) ? body.user_column_data.slice(0, 60) : []) {
    const id = clean(column?.column_id, 120).toUpperCase();
    const label = clean(column?.column_name, 200);
    const value = clean(column?.string_value);
    if (!value) continue;
    if (STANDARD_COLUMNS[id]) {
      payload[STANDARD_COLUMNS[id]] ||= value;
    } else if (id === "FIRST_NAME") {
      firstName = value;
    } else if (id === "LAST_NAME") {
      lastName = value;
    } else {
      const question = label || id.toLowerCase();
      payload[question] = value;
      answers.push(`${question}: ${value}`);
      const q = plain(question);
      if (!payload.interest_service && q.includes("servicio")) payload.interest_service = value;
      if (!payload.preferred_contact_channel && q.includes("contacto") && q.includes("prefer")) {
        payload.preferred_contact_channel = value;
      }
    }
  }

  if (!payload.name && (firstName || lastName)) payload.name = [firstName, lastName].filter(Boolean).join(" ");
  if (answers.length) payload.summary = answers.join("\n");
  if (body.lead_id) payload.external_user_id = clean(body.lead_id, 200);
  if (body.gcl_id) payload.gclid = clean(body.gcl_id, 200);
  if (body.campaign_id) payload.source_campaign = `Google Ads · campaña ${clean(body.campaign_id, 40)}`;
  if (body.form_id) payload.source_form_name = `Formulario Google Ads ${clean(body.form_id, 40)}`;
  if (body.is_test) payload.google_lead_test = "true";
  return payload;
}
