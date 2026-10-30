import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversionJobs,
  buildFbc,
  buildGoogleIngestBody,
  buildMetaEventsBody,
  conversionDedupeKey,
  defaultConversionSettings,
  detectLeadConversionEvents,
  hashedEmail,
  hashedPhone,
  mergeAttributionIntoCustomFields,
  mergeConversionSettings,
  normalizeEmail,
  normalizePhoneE164,
  publicConversionSettings,
  resolveMetaLeadId,
  sendGoogleConversion,
  sendMetaConversion,
  sha256Hex,
} from "./adConversions.js";
import { DEFAULT_PIPELINE_STAGES } from "./pipelineConfig.js";

const STAGES = DEFAULT_PIPELINE_STAGES.map((stage) => ({ ...stage, is_active: true }));

function readySettings(overrides = {}) {
  return mergeConversionSettings(
    {
      google: { refresh_token: "1//refresh", connected_email: "agencia@example.com" },
    },
    {
      enabled: true,
      events: {
        qualified_lead: { google_conversion_action_id: "111" },
        booking: { google_conversion_action_id: "222" },
        sale: { google_conversion_action_id: "333" },
      },
      google: { enabled: true, customer_id: "123-456-7890", login_customer_id: "999-888-7777" },
      meta: { enabled: true, pixel_id: "4455667788", access_token: "EAAB-secret" },
      ...overrides,
    },
    { pipelineStages: STAGES }
  );
}

test("normaliza y hashea como los ejemplos oficiales de Google", () => {
  assert.equal(
    hashedEmail("  John.Smith@Example.com ", "google").toUpperCase(),
    "8E621E3D0368631D263D07A351FA8D34FBA0D17C15FBCDEC11A5F58008D022A0"
  );
  assert.equal(
    hashedPhone("+1 (800) 555-0199", "google").toUpperCase(),
    "78724165620B8A76386CAB242569EBC85DD2346F3F5AE88DC13BB57E31020B90"
  );
});

test("gmail pierde puntos y +etiqueta solo para Google", () => {
  assert.equal(normalizeEmail("Cloudy.SanFrancisco+shopping@gmail.com", { platform: "google" }), "cloudysanfrancisco@gmail.com");
  assert.equal(normalizeEmail("Cloudy.SanFrancisco+shopping@gmail.com", { platform: "meta" }), "cloudy.sanfrancisco+shopping@gmail.com");
  assert.equal(normalizeEmail("user.name+NYC@Example.com", { platform: "google" }), "user.name+nyc@example.com");
  assert.equal(normalizeEmail("no-es-un-email"), "");
});

test("teléfonos españoles a E.164; Meta hashea sin el +", () => {
  assert.equal(normalizePhoneE164("600 11 22 33"), "+34600112233");
  assert.equal(normalizePhoneE164("0034 600112233"), "+34600112233");
  assert.equal(normalizePhoneE164("+34 600-112-233"), "+34600112233");
  assert.equal(normalizePhoneE164("34600112233"), "+34600112233");
  assert.equal(normalizePhoneE164("612345678", "52"), "+52612345678");
  assert.equal(normalizePhoneE164("123"), "");
  assert.equal(hashedPhone("600112233", "meta"), sha256Hex("34600112233"));
  assert.equal(hashedPhone("600112233", "google"), sha256Hex("+34600112233"));
});

test("la atribución del primer contacto no se pisa y se descartan valores raros", () => {
  const merged = mergeAttributionIntoCustomFields(
    { gclid: "primero", servicio: "SEO" },
    { gclid: "segundo", fbclid: "IwAR1abc", utm_source: "google", fbc: "javascript:alert(1)" }
  );
  assert.deepEqual(merged, { gclid: "primero", servicio: "SEO", fbclid: "IwAR1abc", utm_source: "google" });
  assert.equal(mergeAttributionIntoCustomFields({ gclid: "x" }, { gclid: "y" }), null);
});

test("fbc se construye desde fbclid y el momento del clic", () => {
  assert.equal(buildFbc({ fbclid: "IwAR1abc", fbclid_at: "1760000000000" }), "fb.1.1760000000000.IwAR1abc");
  assert.equal(buildFbc({ fbc: "fb.1.1.x" }), "fb.1.1.x");
  assert.equal(buildFbc({}), "");
});

test("el lead_id de Meta sale de custom_fields o del id externo", () => {
  assert.equal(resolveMetaLeadId({ lead: { custom_fields: { meta_lead_id: "1234567890123456" } } }), "1234567890123456");
  assert.equal(resolveMetaLeadId({ lead: {}, externalIds: ["ana@example.com", "987654321012345"] }), "987654321012345");
  assert.equal(resolveMetaLeadId({ lead: {}, externalIds: ["web_abc"] }), "");
});

test("ajustes: los secretos no se borran con un campo vacío ni salen hacia el CRM", () => {
  const settings = readySettings();
  const again = mergeConversionSettings(settings, { meta: { access_token: "" }, google: { customer_id: "1234567890" } });
  assert.equal(again.meta.access_token, "EAAB-secret");
  assert.equal(again.google.refresh_token, "1//refresh");
  const cleared = mergeConversionSettings(settings, { meta: { clear_access_token: true }, google: { disconnect: true } });
  assert.equal(cleared.meta.access_token, "");
  assert.equal(cleared.google.refresh_token, "");

  const visible = JSON.stringify(publicConversionSettings(settings));
  assert.doesNotMatch(visible, /EAAB-secret|1\/\/refresh/);
  assert.match(visible, /"access_token_configured":true/);
  assert.match(visible, /"connected":true/);
  assert.equal(settings.google.customer_id, "1234567890");
});

test("por defecto, cualificado incluye las etapas posteriores y venta las ganadas", () => {
  const defaults = defaultConversionSettings(STAGES);
  assert.deepEqual(defaults.events.qualified_lead.stages, [
    "cualificado",
    "presupuesto_borrador",
    "presupuesto_enviado",
    "negociacion",
    "ganado",
  ]);
  assert.deepEqual(defaults.events.sale.stages, ["ganado"]);
});

test("detecta cualificado y venta con el valor de la propuesta aceptada", () => {
  const settings = readySettings();
  assert.deepEqual(detectLeadConversionEvents({ lead: { id: "L1", crm_status: "contactado" }, settings }), []);
  assert.deepEqual(
    detectLeadConversionEvents({ lead: { id: "L1", crm_status: "cualificado" }, settings }).map((e) => e.event),
    ["qualified_lead"]
  );
  const won = detectLeadConversionEvents({
    lead: { id: "L1", crm_status: "ganado", quote_status: "accepted" },
    settings,
    quote: { status: "accepted", total: "1210.50", currency: "eur" },
  });
  assert.deepEqual(won, [
    { event: "qualified_lead", value: 0 },
    { event: "sale", value: 1210.5, currency: "EUR" },
  ]);
  assert.deepEqual(detectLeadConversionEvents({ lead: { id: "L1", crm_status: "ganado" }, settings: { ...settings, enabled: false } }), []);
});

test("un trabajo por plataforma con clave estable: el mismo evento no se duplica", () => {
  const settings = readySettings();
  const lead = { id: "L1", name: "Ana" };
  const first = buildConversionJobs({ settings, lead, event: "qualified_lead", trigger: "stage_change" });
  const second = buildConversionJobs({ settings, lead, event: "qualified_lead", trigger: "sweep" });
  assert.deepEqual(first.map((job) => job.dedupeKey), [
    "conversion:google:qualified_lead:L1",
    "conversion:meta:qualified_lead:L1",
  ]);
  assert.deepEqual(first.map((job) => job.dedupeKey), second.map((job) => job.dedupeKey));
  assert.equal(conversionDedupeKey({ platform: "meta", event: "booking", bookingId: "B9" }), "conversion:meta:booking:booking-B9");

  const noGoogleAction = mergeConversionSettings(settings, { events: { sale: { google_conversion_action_id: "" } } });
  assert.deepEqual(buildConversionJobs({ settings: noGoogleAction, lead, event: "sale" }).map((job) => job.payload.platform), ["meta"]);
  const eventOff = mergeConversionSettings(settings, { events: { booking: { enabled: false } } });
  assert.deepEqual(buildConversionJobs({ settings: eventOff, lead, event: "booking" }), []);
});

test("payload de Google: gclid, email/teléfono hasheados con consentimiento, valor y MCC", () => {
  const settings = readySettings();
  const lead = {
    id: "L1",
    email: "Ana.Perez@gmail.com",
    phone: "600112233",
    consent: true,
    custom_fields: { gclid: "Cj0KCQ-abc" },
  };
  const payload = { event: "sale", lead_id: "L1", value: 900, currency: "EUR", event_time: "2026-10-20T10:00:00.000Z" };
  const { body } = buildGoogleIngestBody({ settings, lead, payload });
  assert.deepEqual(body.destinations, [
    {
      operatingAccount: { accountType: "GOOGLE_ADS", accountId: "1234567890" },
      productDestinationId: "333",
      loginAccount: { accountType: "GOOGLE_ADS", accountId: "9998887777" },
    },
  ]);
  assert.equal(body.encoding, "HEX");
  const [event] = body.events;
  assert.equal(event.transactionId, "sale-L1");
  assert.equal(event.eventTimestamp, "2026-10-20T10:00:00.000Z");
  assert.deepEqual(event.adIdentifiers, { gclid: "Cj0KCQ-abc" });
  assert.deepEqual(event.userData.userIdentifiers, [
    { emailAddress: sha256Hex("anaperez@gmail.com") },
    { phoneNumber: sha256Hex("+34600112233") },
  ]);
  assert.equal(event.conversionValue, 900);
  assert.equal(event.currency, "EUR");
  assert.deepEqual(event.consent, { adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_GRANTED" });
});

test("payload de Google sin consentimiento: solo gclid, y si no hay gclid se omite", () => {
  const settings = readySettings();
  const payload = { event: "qualified_lead", lead_id: "L2" };
  const withClick = buildGoogleIngestBody({
    settings,
    lead: { id: "L2", email: "a@b.com", consent: false, custom_fields: { gclid: "abc" } },
    payload,
  });
  assert.equal(withClick.body.events[0].userData, undefined);
  assert.equal(withClick.body.events[0].consent, undefined);
  assert.equal(withClick.body.events[0].conversionValue, undefined);
  const without = buildGoogleIngestBody({ settings, lead: { id: "L2", email: "a@b.com", consent: false }, payload });
  assert.match(without.skip, /consentimiento/);
  assert.equal(buildGoogleIngestBody({ settings, lead: {}, payload, validateOnly: true }).skip !== undefined, true);
});

test("payload de Meta: lead_id de Lead Ads, fbc, datos hasheados y nombre del evento", () => {
  const settings = readySettings({ meta: { test_event_code: "TEST123" } });
  const lead = {
    id: "L3",
    email: "Ana.Perez@gmail.com",
    phone: "+34 600 112 233",
    consent: true,
    created_at: "2026-10-01T00:00:00.000Z",
    custom_fields: { fbclid: "IwAR1abc", fbclid_at: "1760000000000" },
  };
  const payload = { event: "booking", lead_id: "L3", value: 50, currency: "EUR", event_time: "2026-10-20T10:00:00.000Z" };
  const { body } = buildMetaEventsBody({ settings, lead, payload, metaLeadId: "1234567890123456" });
  const [event] = body.data;
  assert.equal(event.event_name, "Schedule");
  assert.equal(event.event_time, 1792490400);
  assert.equal(event.action_source, "system_generated");
  assert.equal(event.event_id, "booking-L3");
  assert.equal(event.user_data.lead_id, "1234567890123456");
  assert.equal(event.user_data.fbc, "fb.1.1760000000000.IwAR1abc");
  assert.deepEqual(event.user_data.em, [sha256Hex("ana.perez@gmail.com")]);
  assert.deepEqual(event.user_data.ph, [sha256Hex("34600112233")]);
  assert.deepEqual(event.user_data.external_id, [sha256Hex("L3")]);
  assert.deepEqual(event.custom_data, { event_source: "crm", lead_event_source: "T-Media CRM", value: 50, currency: "EUR" });
  assert.equal(body.test_event_code, "TEST123");

  const noConsent = buildMetaEventsBody({ settings, lead: { ...lead, consent: false, custom_fields: {} }, payload, metaLeadId: "1234567890123456" });
  assert.equal(noConsent.body.data[0].user_data.em, undefined);
  assert.equal(noConsent.body.data[0].user_data.lead_id, "1234567890123456");
  assert.match(buildMetaEventsBody({ settings, lead: { id: "L4", consent: false }, payload }).skip, /consentimiento/);
});

test("errores de envío: 5xx se reintenta, 400 no", async () => {
  const reply = (status, json) => async () => ({ ok: status < 400, status, json: async () => json });
  await assert.rejects(
    sendGoogleConversion({ body: {}, accessToken: "t", fetchImpl: reply(503, { error: { message: "busy" } }) }),
    (error) => error.retryable === true
  );
  await assert.rejects(
    sendGoogleConversion({ body: {}, accessToken: "t", fetchImpl: reply(400, { error: { message: "bad gclid" } }) }),
    (error) => error.retryable === false && /bad gclid/.test(error.message)
  );
  const detailed = {
    error: {
      message: "There was a problem with the request.",
      details: [
        { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "INVALID_ARGUMENT" },
        { "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [{ field: "events[0].consent", reason: "DMA_CONSENT_REQUIRED" }] },
      ],
    },
  };
  await assert.rejects(
    sendGoogleConversion({ body: {}, accessToken: "t", fetchImpl: reply(400, detailed) }),
    (error) => /INVALID_ARGUMENT/.test(error.message) && /events\[0\]\.consent: DMA_CONSENT_REQUIRED/.test(error.message)
  );
  const ok = await sendGoogleConversion({ body: {}, accessToken: "t", fetchImpl: reply(200, { requestId: "r1" }) });
  assert.equal(ok.request_id, "r1");

  let calledUrl = "";
  const metaOk = await sendMetaConversion({
    pixelId: "4455",
    accessToken: "tok",
    body: { data: [] },
    fetchImpl: async (url) => {
      calledUrl = url;
      return { ok: true, status: 200, json: async () => ({ events_received: 1, fbtrace_id: "f1" }) };
    },
  });
  assert.equal(metaOk.events_received, 1);
  assert.match(calledUrl, /^https:\/\/graph\.facebook\.com\/v25\.0\/4455\/events\?access_token=tok$/);
  await assert.rejects(
    sendMetaConversion({ pixelId: "1", accessToken: "t", body: {}, fetchImpl: reply(400, { error: { message: "Invalid", is_transient: false } }) }),
    (error) => error.retryable === false
  );
});
