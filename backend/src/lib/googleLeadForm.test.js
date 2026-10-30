import test from "node:test";
import assert from "node:assert/strict";
import { googleLeadFormKey, isValidGoogleLeadFormKey, mapGoogleLeadFormPayload } from "./googleLeadForm.js";

test("la clave es estable por cuenta y distinta entre cuentas", () => {
  const key = googleLeadFormKey("secreto", "cuenta-a");
  assert.equal(key.length, 32);
  assert.equal(key, googleLeadFormKey("secreto", "cuenta-a"));
  assert.notEqual(key, googleLeadFormKey("secreto", "cuenta-b"));
  assert.equal(isValidGoogleLeadFormKey("secreto", "cuenta-a", key), true);
  assert.equal(isValidGoogleLeadFormKey("secreto", "cuenta-b", key), false);
  assert.equal(isValidGoogleLeadFormKey("", "cuenta-a", ""), false);
});

test("convierte el webhook de Google en un lead", () => {
  const lead = mapGoogleLeadFormPayload({
    lead_id: "TeSter-123",
    gcl_id: "Cj0KCQjw3Yv",
    campaign_id: 23456,
    form_id: 99,
    is_test: true,
    user_column_data: [
      { column_id: "FULL_NAME", column_name: "Full Name", string_value: "Lina Pérez" },
      { column_id: "EMAIL", column_name: "User Email", string_value: "lina@example.com" },
      { column_id: "PHONE_NUMBER", column_name: "User Phone", string_value: "+34622365730" },
      { column_id: "x1", column_name: "¿Qué servicios te interesan?", string_value: "SEO" },
      { column_id: "x2", column_name: "¿Cuál es su forma de contacto preferida?", string_value: "Email" },
    ],
  });
  assert.equal(lead.name, "Lina Pérez");
  assert.equal(lead.email, "lina@example.com");
  assert.equal(lead.phone, "+34622365730");
  assert.equal(lead.gclid, "Cj0KCQjw3Yv");
  assert.equal(lead.external_user_id, "TeSter-123");
  assert.equal(lead.source_platform, "google_ads");
  assert.equal(lead.interest_service, "SEO");
  assert.equal(lead.preferred_contact_channel, "Email");
  assert.match(lead.summary, /¿Qué servicios te interesan\?: SEO/);
  assert.equal(lead.google_lead_test, "true");
});

test("une nombre y apellidos si no viene el nombre completo", () => {
  const lead = mapGoogleLeadFormPayload({
    user_column_data: [
      { column_id: "FIRST_NAME", string_value: "Ana" },
      { column_id: "LAST_NAME", string_value: "Gil" },
    ],
  });
  assert.equal(lead.name, "Ana Gil");
});
