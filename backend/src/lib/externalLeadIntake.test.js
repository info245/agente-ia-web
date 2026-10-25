import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFormLeadTemplateParams,
  decideFormLeadWhatsApp,
  deriveExternalLeadIdempotencyKey,
  normalizeExternalLeadPayload,
  parseExternalLeadIntake,
  parseStrictConsent,
  renderWhatsAppTemplateBody,
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


test("form lead WhatsApp never goes out without explicit consent", () => {
  const whatsappConfig = { form_autocontact_enabled: true, intro_template_name: "bienvenida_formulario" };
  const phone = "34600111222";
  const withoutConsent = parseExternalLeadIntake({ name: "Ana", phone, consent: "no", auto_start: true }).value;
  const missingConsent = parseExternalLeadIntake({ name: "Ana", phone }).value;
  const withConsent = parseExternalLeadIntake({ name: "Ana", phone, consent: "sí" }).value;

  assert.deepEqual(decideFormLeadWhatsApp({ intake: withoutConsent, whatsappConfig, phone }), {
    send: false,
    reason: "no_consent",
  });
  assert.equal(decideFormLeadWhatsApp({ intake: missingConsent, whatsappConfig, phone }).send, false);
  // Con el interruptor activo basta el consentimiento: no hace falta auto_start.
  assert.equal(decideFormLeadWhatsApp({ intake: withConsent, whatsappConfig, phone }).send, true);
  assert.equal(decideFormLeadWhatsApp({ intake: withConsent, whatsappConfig, phone: null }).reason, "no_phone");
  assert.equal(
    decideFormLeadWhatsApp({ intake: withConsent, whatsappConfig: { form_autocontact_enabled: true }, phone }).reason,
    "whatsapp_template_required"
  );
  assert.equal(
    decideFormLeadWhatsApp({ intake: withConsent, whatsappConfig: { intro_template_name: "x" }, phone }).reason,
    "disabled"
  );
  // Sin interruptor se mantiene el auto_start del formulario con canal WhatsApp.
  const autoStart = parseExternalLeadIntake({
    phone,
    consent: true,
    auto_start: true,
    preferred_contact_channel: "WhatsApp",
  }).value;
  assert.equal(decideFormLeadWhatsApp({ intake: autoStart, whatsappConfig: { intro_template_name: "x" }, phone }).send, true);
});

test("template params fit Meta limits and render the sent text", () => {
  const params = buildFormLeadTemplateParams({
    name: "  María José López ",
    service: "Diseño web\ncorporativo",
    requestSummary: `quieres\ttraer más clientes${" ".repeat(8)}a tu clínica ${"x".repeat(400)}`,
  });
  assert.equal(params.length, 3);
  assert.equal(params[0], "María");
  assert.equal(params[1], "Diseño web corporativo");
  assert.ok(params[2].length <= 180);
  for (const param of params) assert.doesNotMatch(param, /[\n\t]| {5,}/);

  assert.deepEqual(buildFormLeadTemplateParams({ count: 3 }), ["👋", "tu proyecto", "quieres que te contactemos"]);
  assert.deepEqual(buildFormLeadTemplateParams({ name: "Ana", count: 1 }), ["Ana"]);
  assert.deepEqual(buildFormLeadTemplateParams({ name: "Ana", count: 0 }), []);

  assert.equal(
    renderWhatsAppTemplateBody("Hola {{1}}, gracias por escribirnos sobre {{2}}. Hemos visto tu consulta: {{3}}.", [
      "Ana",
      "SEO",
      "quieres salir en Google",
    ]),
    "Hola Ana, gracias por escribirnos sobre SEO. Hemos visto tu consulta: quieres salir en Google."
  );
});

test("el primer WhatsApp guardado sustituye también variables con nombre, por orden", () => {
  assert.equal(
    renderWhatsAppTemplateBody("Hola {{nombre}}, sobre {{servicio}}. ¡Gracias {{nombre}}!", ["Laura", "SEO"]),
    "Hola Laura, sobre SEO. ¡Gracias Laura!"
  );
});

test("los permisos de WhatsApp y de novedades se leen aparte y respetan un «no»", () => {
  const base = { name: "Ana", email: "ana@example.com", phone: "+34600111222", consent: true };
  const both = parseExternalLeadIntake({ ...base, whatsapp_consent: true, marketing_consent: false }).value;
  assert.equal(both.whatsapp_consent, true);
  assert.equal(both.marketing_consent, false);
  assert.equal(parseExternalLeadIntake(base).value.whatsapp_consent, null, "si el formulario no lo pregunta, null");
  const config = { form_autocontact_enabled: true, intro_template_name: "bienvenida" };
  assert.equal(decideFormLeadWhatsApp({ intake: { ...both, whatsapp_consent: false }, whatsappConfig: config, phone: "34600111222" }).reason, "no_whatsapp_consent");
  assert.equal(decideFormLeadWhatsApp({ intake: both, whatsappConfig: config, phone: "34600111222" }).send, true);
});
