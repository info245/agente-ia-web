import test from "node:test";
import assert from "node:assert/strict";
import { acceptanceHtml, renderQuoteSignHtml, validateAcceptance } from "./quoteSignature.js";
import { crmPermissionFor } from "./permissions.js";

const signature = `data:image/png;base64,${"A".repeat(400)}`;

test("la aceptación exige nombre, casilla y firma; el NIF es opcional pero con formato", () => {
  assert.equal(validateAcceptance({ name: "Ana López", accepted: "on", signature }).ok, true);
  assert.equal(validateAcceptance({ name: "Ana López", accepted: "on", signature, nif: "12345678-z" }).nif, "12345678Z");
  assert.equal(validateAcceptance({ name: "An", accepted: "on", signature }).ok, false);
  assert.equal(validateAcceptance({ name: "Ana López", signature }).ok, false, "sin casilla");
  assert.equal(validateAcceptance({ name: "Ana López", accepted: "on", signature: "data:image/png;base64,AA" }).ok, false, "firma vacía");
  assert.equal(validateAcceptance({ name: "Ana López", accepted: "on", signature, nif: "x" }).ok, false);
});

test("la página de firma no acepta nada por sí sola y escapa los datos", () => {
  const html = renderQuoteSignHtml({ action: "accept", lead: { name: "<b>Ana</b>" }, quote: { title: "SEO", total: 363, version: 2, content_json: { billing_type: "monthly" } }, postUrl: "/crm/quotes/1/respond?action=accept", token: "t" });
  assert.match(html, /method="post"/);
  assert.match(html, /versión 2/);
  assert.doesNotMatch(html, /<b>Ana<\/b>/);
  assert.match(acceptanceHtml({ name: "Ana", nif: "12345678Z", at: "2026-10-25T10:00:00Z", signature, version: 2, total: 363 }), /Aceptada y firmada<\/b> por Ana \(NIF\/CIF 12345678Z\)/);
  assert.equal(acceptanceHtml(null), "");
});

test("listado y plantillas de propuestas: permiso de propuestas", () => {
  assert.equal(crmPermissionFor("GET", "/quotes"), "proposals");
  assert.equal(crmPermissionFor("POST", "/quote-templates"), "proposals");
  assert.equal(crmPermissionFor("DELETE", "/quote-templates/x"), "proposals");
  assert.equal(crmPermissionFor("GET", "/leads/x/quote/versions"), "proposals");
});
