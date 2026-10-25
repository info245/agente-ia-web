import test from "node:test";
import assert from "node:assert/strict";
import { buildChannelHealth, timeAgo } from "./channelHealth.js";

const now = Date.parse("2026-10-25T12:00:00Z");
const wa = (patch) => buildChannelHealth({ whatsapp: { configured: true, app_secret: true, templates: 3, token_readable: true, last_webhook_at: "2026-10-25T11:00:00Z", last_outbound_at: "2026-10-25T10:00:00Z", ...patch } }, now).checks[0];

test("WhatsApp: lo de hoy se habría visto — enviamos y Meta no confirma nada", () => {
  const c = wa({ last_webhook_at: "2026-10-21T08:45:00Z", last_outbound_at: "2026-10-25T09:55:00Z" });
  assert.equal(c.status, "error");
  assert.match(c.detail, /no están entrando/);
  assert.match(c.detail, /hace 4 días/);
});

test("WhatsApp: falta la clave secreta, rechazos, token ilegible, sin plantillas y todo bien", () => {
  assert.equal(wa({ app_secret: false }).status, "error");
  assert.match(wa({ rejections: { count: 6, reason: "missing-app-secret", last_at: "2026-10-25T11:12:00Z" } }).detail, /6 avisos .*clave secreta/);
  assert.equal(wa({ rejections: { count: 6, reason: "invalid-signature", last_at: "2026-10-23T11:12:00Z" } }).status, "ok", "rechazos de hace días ya no cuentan");
  assert.equal(wa({ token_readable: false, using_fallback: true }).status, "warn");
  assert.equal(wa({ token_readable: false, using_fallback: false }).status, "error");
  assert.equal(wa({ templates: 0 }).status, "warn");
  assert.equal(wa({ last_outbound_at: "2026-10-25T11:50:00Z", last_webhook_at: "2026-10-25T11:00:00Z" }).status, "ok", "un envío de hace 10 min aún puede no tener confirmación");
  assert.equal(wa({}).status, "ok");
  assert.equal(buildChannelHealth({ whatsapp: { configured: false } }, now).checks[0].status, "off");
});

test("resto de canales y recuento", () => {
  const h = buildChannelHealth({ whatsapp: { configured: false }, email: { connected: true, from: "a@b.c", failed_7d: 2 }, conversions: { enabled: true }, push: { devices: 1 } }, now);
  assert.equal(h.checks.find((c) => c.key === "email").status, "warn");
  assert.equal(h.checks.find((c) => c.key === "conversions").status, "ok");
  assert.equal(h.warnings, 1);
  assert.equal(h.errors, 0);
  assert.equal(timeAgo(null, now), "nunca");
  assert.equal(timeAgo("2026-10-25T11:30:00Z", now), "hace 30 min");
});
