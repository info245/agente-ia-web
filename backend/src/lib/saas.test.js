import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key";
const { applyStripeEvent, computeBillingState, newBillingRecord, stripeEventAccountId, verifyStripeSignature } = await import("./saas.js");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-22T10:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const plans = [{ key: "basico", price_id: "price_basico" }, { key: "pro", price_id: "price_pro" }];

test("sin registro o gestionada por la agencia: agente activo y sin cobro", () => {
  assert.deepEqual(computeBillingState(null, { now: NOW }), { status: "managed", agent_active: true });
  assert.equal(computeBillingState({ managed_by_agency: true, subscription_status: "canceled" }, { now: NOW }).status, "managed");
});

test("prueba local: activa hasta la fecha y después pausa", () => {
  const record = newBillingRecord({ now: NOW });
  const during = computeBillingState(record, { now: NOW + DAY });
  assert.equal(during.status, "trial");
  assert.equal(during.agent_active, true);
  assert.ok(during.days_left > 0);
  const after = computeBillingState(record, { now: Date.parse(record.trial_ends_at) + 1 });
  assert.deepEqual([after.status, after.agent_active, after.reason], ["paused", false, "trial_ended"]);
});

test("impago: aviso durante la gracia y pausa al terminar", () => {
  const record = { subscription_status: "past_due", past_due_since: iso(NOW) };
  const warned = computeBillingState(record, { now: NOW + 2 * DAY, grace: 7 });
  assert.deepEqual([warned.status, warned.agent_active, warned.days_left], ["past_due", true, 5]);
  const paused = computeBillingState(record, { now: NOW + 8 * DAY, grace: 7 });
  assert.deepEqual([paused.status, paused.agent_active, paused.reason], ["paused", false, "unpaid"]);
});

test("activa, en prueba de Stripe y cancelada", () => {
  assert.equal(computeBillingState({ subscription_status: "active" }, { now: NOW }).agent_active, true);
  assert.equal(computeBillingState({ subscription_status: "trialing", trial_ends_at: iso(NOW + DAY) }, { now: NOW }).status, "trial");
  const canceled = computeBillingState({ subscription_status: "canceled" }, { now: NOW });
  assert.deepEqual([canceled.status, canceled.agent_active], ["paused", false]);
});

const sub = (type, status, created, extra = {}) => ({
  type,
  created,
  data: { object: { id: "sub_1", customer: "cus_1", status, metadata: { account_id: "clinica" }, items: { data: [{ price: { id: "price_pro" }, current_period_end: 1800000000 }] }, ...extra } },
});

test("webhooks: checkout guarda el cliente y la suscripción fija estado y plan", () => {
  let record = newBillingRecord({ now: NOW });
  record = applyStripeEvent(record, { type: "checkout.session.completed", created: 100, data: { object: { customer: "cus_1", subscription: "sub_1", client_reference_id: "clinica", metadata: { plan_key: "pro" } } } }, { plans });
  assert.equal(record.stripe_customer_id, "cus_1");
  record = applyStripeEvent(record, sub("customer.subscription.created", "active", 101), { plans });
  assert.deepEqual([record.subscription_status, record.plan_key, record.current_period_end], ["active", "pro", iso(1800000000 * 1000)]);
  assert.equal(computeBillingState(record, { now: NOW }).status, "active");
});

test("webhooks: impago marca desde cuándo, el pago lo limpia y los eventos viejos se ignoran", () => {
  let record = applyStripeEvent({}, sub("customer.subscription.updated", "past_due", 200), { plans });
  assert.equal(record.past_due_since, iso(200 * 1000));
  const again = applyStripeEvent(record, sub("customer.subscription.updated", "past_due", 300), { plans });
  assert.equal(again.past_due_since, iso(200 * 1000), "la gracia cuenta desde el primer fallo");
  const paid = applyStripeEvent(again, sub("customer.subscription.updated", "active", 400), { plans });
  assert.deepEqual([paid.subscription_status, paid.past_due_since], ["active", null]);
  const stale = applyStripeEvent(paid, sub("customer.subscription.updated", "past_due", 350), { plans });
  assert.equal(stale.subscription_status, "active");
  const deleted = applyStripeEvent(paid, sub("customer.subscription.deleted", "active", 500), { plans });
  assert.equal(deleted.subscription_status, "canceled");
  assert.equal(stripeEventAccountId(sub("x", "active", 1)), "clinica");
});

test("firma de Stripe: acepta la buena y rechaza la falsa o caducada", () => {
  const secret = "whsec_test";
  const body = Buffer.from(JSON.stringify({ id: "evt_1" }));
  const t = Math.floor(NOW / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, { now: NOW }), true);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${"0".repeat(64)}`, secret, { now: NOW }), false);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, "otro", { now: NOW }), false);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, { now: NOW + 10 * 60 * 1000 }), false);
  assert.equal(verifyStripeSignature(Buffer.from("{}"), `t=${t},v1=${sig}`, secret, { now: NOW }), false);
});
