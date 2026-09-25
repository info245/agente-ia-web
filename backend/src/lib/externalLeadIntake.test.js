import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveExternalLeadIdempotencyKey,
  normalizeExternalLeadPayload,
  parseExternalLeadIntake,
  parseStrictConsent,
  validateExternalLeadPayload,
  validateIdempotencyKey,
} from "./externalLeadIntake.js";

test("strict consent rejects ambiguous non-empty checkbox values", () => {
  assert.equal(parseStrictConsent(true), true);
  assert.equal(parseStrictConsent("Sí"), true);
  assert.equal(
    parseStrictConsent("Doy mi consentimiento para que esta web almacene la información que envío."),
    true
  );
  assert.equal(parseStrictConsent("no"), false);
  assert.equal(parseStrictConsent("contactadme cuando queráis"), null);
  assert.equal(parseStrictConsent({ value: "yes" }), null);
});

test("normalizes Elementor fields without granting ambiguous consent", () => {
  const lead = normalizeExternalLeadPayload({
    account_slug: "TMedia Global",
    source_platform: "elementor",
    form: { name: "Formulario SEO" },
    fields: {
      nombre: { title: "Nombre", value: "  Miguel Morales  " },
      correo: { title: "Correo electrónico", value: "MIGUEL@EXAMPLE.COM" },
      telefono: { title: "Teléfono", value: "+34 679 006 444" },
      rgpd: { title: "Acuerdo RGPD", value: "marcado" },
      ciudad: { title: "Ciudad", value: "Granada" },
    },
    auto_start: true,
  });

  assert.equal(lead.account_slug, "tmedia_global");
  assert.equal(lead.name, "Miguel Morales");
  assert.equal(lead.email, "miguel@example.com");
  assert.equal(lead.phone, "+34679006444");
  assert.equal(lead.source_platform, "website_form");
  assert.equal(lead.source_form_name, "Formulario SEO");
  assert.equal(lead.consent, false);
  assert.equal(lead.consent_valid, false);
  assert.equal(lead.auto_start, false);
  assert.equal(lead.custom_fields.ciudad, "Granada");
});

test("normalizes Meta field_data and only enables contact with explicit consent", () => {
  const result = parseExternalLeadIntake({
    source_platform: "fb",
    external_user_id: "961191756517367",
    field_data: [
      { name: "full_name", values: ["Nuria Mejías"] },
      { name: "email", values: ["NURIA@EXAMPLE.COM"] },
      { name: "preferred_contact_channel", values: ["WhatsApp"] },
    ],
    consent: "acepto",
    auto_contact: "sí",
  });

  assert.equal(result.valid, true);
  assert.equal(result.value.source_platform, "meta_ads");
  assert.equal(result.value.name, "Nuria Mejías");
  assert.equal(result.value.email, "nuria@example.com");
  assert.equal(result.value.preferred_contact_channel, "whatsapp");
  assert.equal(result.value.consent, true);
  assert.equal(result.value.auto_start, true);
});

test("schema validation requires a contact identity and validates email, phone and consent", () => {
  const missing = validateExternalLeadPayload(
    normalizeExternalLeadPayload({ name: "Sin contacto", consent: "quizá" }),
    { requireConsent: true }
  );
  assert.equal(missing.valid, false);
  assert.deepEqual(
    missing.errors.map((item) => item.code),
    ["missing_contact", "ambiguous_consent", "consent_required"]
  );

  const malformed = validateExternalLeadPayload(
    normalizeExternalLeadPayload({ email: "no-es-email", phone: "123", consent: false })
  );
  assert.equal(malformed.valid, false);
  assert.deepEqual(
    malformed.errors.map((item) => item.code),
    ["invalid_email", "invalid_phone"]
  );
});

test("idempotency keys are stable across field order and ignore delivery timestamps", () => {
  const first = deriveExternalLeadIdempotencyKey({
    accountId: "default",
    sourcePlatform: "google_ads",
    payload: { email: "ana@example.com", name: "Ana", received_at: "2026-01-01" },
  });
  const retry = deriveExternalLeadIdempotencyKey({
    accountId: "default",
    sourcePlatform: "google_ads",
    payload: { received_at: "2026-01-02", name: "Ana", email: "ana@example.com" },
  });

  assert.equal(first, retry);
  assert.equal(validateIdempotencyKey(first), true);
  assert.equal(validateIdempotencyKey("short"), false);
  assert.equal(validateIdempotencyKey("valid-key-but\nforged"), false);
});

test("external identity wins over mutable payload data for retries", () => {
  const base = {
    accountId: "default",
    sourcePlatform: "meta_ads",
    externalUserId: "meta:lead:123",
  };
  const first = deriveExternalLeadIdempotencyKey({ ...base, payload: { name: "Ana" } });
  const retry = deriveExternalLeadIdempotencyKey({ ...base, payload: { name: "Ana María" } });
  assert.equal(first, retry);
});

