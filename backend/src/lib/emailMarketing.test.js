import test from "node:test";
import assert from "node:assert/strict";
import {
  eligibility,
  matchesSegment,
  nextAction,
  personalize,
  renderEmail,
  renderEmailText,
  sanitizeAutomation,
  signLink,
  triggerMatches,
  verifyLink,
} from "./emailMarketing.js";

const lead = { name: "Ana López", email: "Ana@Ejemplo.com", consent: true, crm_status: "nuevo", interest_service: "SEO", tags: ["vip"], created_at: "2026-10-20T10:00:00Z", updated_at: "2026-10-21T10:00:00Z" };

test("solo se envía con consentimiento o a clientes, nunca a bajas", () => {
  assert.deepEqual(eligibility(lead), { ok: true, email: "ana@ejemplo.com" });
  assert.equal(eligibility({ ...lead, consent: null }).reason, "sin_consentimiento");
  assert.equal(eligibility({ ...lead, consent: null, crm_status: "ganado" }).ok, true);
  assert.equal(eligibility({ ...lead, consent: false, crm_status: "ganado" }).ok, false);
  assert.equal(eligibility(lead, new Set(["ana@ejemplo.com"])).reason, "baja");
  assert.equal(eligibility({ ...lead, email: "no-es-email" }).reason, "sin_email");
});

test("segmentos por etapa, servicio, etiquetas y fechas", () => {
  assert.equal(matchesSegment(lead, {}), true);
  assert.equal(matchesSegment(lead, { stages: ["nuevo"], services: ["SEO"], tags: ["VIP"] }), true);
  assert.equal(matchesSegment(lead, { stages: ["ganado"] }), false);
  assert.equal(matchesSegment(lead, { exclude_tags: ["vip"] }), false);
  assert.equal(matchesSegment(lead, { created_from: "2026-10-21" }), false);
  assert.equal(matchesSegment(lead, { created_to: "2026-10-20" }), true);
});

test("personalización con alternativa", () => {
  assert.equal(personalize("Hola {nombre}, sobre {servicio}.", lead), "Hola Ana, sobre SEO.");
  assert.equal(personalize("Hola {nombre|amigo}", {}), "Hola amigo");
  assert.equal(personalize("Hola {nombre}, ¿qué tal?", {}), "Hola, ¿qué tal?");
});

test("el email escapa el contenido, sigue los clics y lleva la baja", () => {
  const html = renderEmail({
    subject: "Hola",
    blocks: [
      { type: "heading", text: "Hola {nombre} <b>" },
      { type: "text", text: "Mira [la oferta](https://x.com/o)" },
      { type: "button", text: "Entrar", url: "https://x.com/b" },
      { type: "button", text: "Malo", url: "javascript:alert(1)" },
    ],
    lead,
    unsubscribeUrl: "https://api/e/u/1",
    pixelUrl: "https://api/e/o/1.gif",
    mapUrl: (u) => `https://api/e/c/1?u=${encodeURIComponent(u)}`,
  });
  assert.match(html, /Hola Ana &lt;b&gt;/);
  assert.match(html, /href="https:\/\/api\/e\/c\/1\?u=https%3A%2F%2Fx\.com%2Fo"/);
  assert.match(html, /href="https:\/\/api\/e\/c\/1\?u=https%3A%2F%2Fx\.com%2Fb"/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /Darme de baja/);
  assert.match(html, /e\/o\/1\.gif/);
  assert.match(renderEmailText({ blocks: [{ type: "button", text: "Entrar", url: "https://x.com/b" }], unsubscribeUrl: "https://u" }), /Entrar: https:\/\/x\.com\/b[\s\S]*Darme de baja: https:\/\/u/);
});

test("los enlaces de clic van firmados", () => {
  const sig = signLink("m1", "https://x.com", "secreto");
  assert.equal(verifyLink("m1", "https://x.com", sig, "secreto"), true);
  assert.equal(verifyLink("m1", "https://otro.com", sig, "secreto"), false);
  assert.equal(verifyLink("m2", "https://x.com", sig, "secreto"), false);
});

test("disparadores: solo lo ocurrido tras activar la automatización", () => {
  const activatedAt = "2026-10-20T00:00:00Z";
  assert.equal(triggerMatches({ type: "lead_created", segment: {} }, lead, { activatedAt }), true);
  assert.equal(triggerMatches({ type: "lead_created", segment: {} }, lead, { activatedAt: "2026-10-22T00:00:00Z" }), false);
  assert.equal(triggerMatches({ type: "stage", stage: "nuevo", segment: {} }, lead, { activatedAt }), true);
  assert.equal(triggerMatches({ type: "tag", tag: "vip", segment: { services: ["Web"] } }, lead, { activatedAt }), false);
  assert.equal(triggerMatches({ type: "lead_created" }, lead, {}), false);
});

test("motor de pasos: esperar, email, condición y fin", () => {
  const { steps } = sanitizeAutomation({
    steps: [
      { type: "email", subject: "Bienvenida", blocks: [{ type: "text", text: "Hola" }] },
      { type: "wait", amount: 2, unit: "days" },
      { type: "condition", check: "opened_last" },
      { type: "whatsapp", template_name: "seguimiento" },
      { type: "nada" },
    ],
  });
  assert.equal(steps.length, 4);
  const now = Date.parse("2026-10-24T10:00:00Z");
  assert.equal(nextAction({ step_index: 0 }, steps, { now }).kind, "email");
  const wait = nextAction({ step_index: 1 }, steps, { now });
  assert.equal(wait.kind, "wait");
  assert.equal(wait.next_at, "2026-10-26T10:00:00.000Z");
  assert.equal(nextAction({ step_index: 2 }, steps, { now, lastEmail: { opened_at: null } }).kind, "exit");
  assert.equal(nextAction({ step_index: 2 }, steps, { now, lastEmail: { opened_at: "x" } }).kind, "continue");
  assert.equal(nextAction({ step_index: 3 }, steps, { now }).kind, "whatsapp");
  assert.equal(nextAction({ step_index: 4 }, steps, { now }).kind, "done");
});
