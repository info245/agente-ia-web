import test from "node:test";
import assert from "node:assert/strict";
import { buildMarketingReport, buildResultsReport, dailySeries, openPipeline, previousRange, leadCampaign, leadSource, resolvePeriod, sanitizeSpendEntries, spendInPeriod, NO_CAMPAIGN } from "./resultsReport.js";

const from = new Date("2026-10-01T00:00:00Z");
const to = new Date("2026-11-01T00:00:00Z");

test("resolvePeriod: semana empieza en lunes, mes anterior y personalizado con fin incluido", () => {
  const now = new Date("2026-10-22T15:00:00Z"); // jueves
  assert.equal(resolvePeriod("this_week", {}, now).from.toISOString().slice(0, 10), "2026-10-19");
  const last = resolvePeriod("last_month", {}, now);
  assert.deepEqual([last.from.toISOString().slice(0, 10), last.to.toISOString().slice(0, 10)], ["2026-09-01", "2026-10-01"]);
  const custom = resolvePeriod("custom", { from: "2026-10-05", to: "2026-10-05" }, now);
  assert.equal(custom.to.getTime() - custom.from.getTime(), 864e5);
  assert.throws(() => resolvePeriod("custom", { from: "2026-10-05", to: "2026-10-01" }, now));
  assert.equal(resolvePeriod("cualquiera", {}, now).period, "this_month");
});

test("fuente y campaña: campos del lead, después utm, después canal", () => {
  assert.equal(leadSource({ source_platform: "Meta" }), "meta");
  assert.equal(leadSource({ custom_fields: { utm_source: "google" }, conversations: { channel: "web" } }), "google");
  assert.equal(leadSource({ conversations: { channel: "whatsapp" } }), "whatsapp");
  assert.equal(leadCampaign({ custom_fields: { utm_campaign: "otoño" } }), "otoño");
  assert.equal(leadCampaign({ source_form_name: "Form A" }), "Form A");
  assert.equal(leadCampaign({}), NO_CAMPAIGN);
});

test("la inversión mensual se reparte por días del periodo", () => {
  const week = spendInPeriod([{ month: "2026-10", source: "meta", amount: 310 }], new Date("2026-10-19T00:00:00Z"), new Date("2026-10-26T00:00:00Z"));
  assert.equal(Math.round(week[0].amount), 70);
  assert.equal(spendInPeriod([{ month: "2026-09", source: "meta", amount: 100 }], from, to).length, 0);
});

test("embudo, ventas con importe, tasas y coste por fuente y campaña", () => {
  const leads = [
    { created_at: "2026-10-02T10:00:00Z", source_platform: "meta", source_campaign: "Otoño", crm_status: "ganado",
      quotes: [{ status: "accepted", total: 1200, sent_at: "2026-10-03", created_at: "2026-10-03" }], bookings: [{ status: "confirmed" }] },
    { created_at: "2026-10-05T10:00:00Z", source_platform: "meta", source_campaign: "Otoño", crm_status: "presupuesto_enviado",
      quotes: [{ status: "sent", total: 800, sent_at: "2026-10-06", created_at: "2026-10-06" }], conversations: { channel: "web", bookings: [{ status: "confirmed" }] } },
    { created_at: "2026-10-06T10:00:00Z", source_platform: "meta", crm_status: "nuevo", lead_score: 10, bookings: [{ status: "cancelled" }] },
    { created_at: "2026-10-07T10:00:00Z", crm_status: "contactado", lead_score: 70, conversations: { channel: "whatsapp" } },
  ];
  const spend = [
    { month: "2026-10", source: "meta", campaign: "Otoño", amount: 300 },
    { month: "2026-10", source: "meta", campaign: "", amount: 100 },
  ];
  const report = buildResultsReport({ leads, spend, from, to });

  assert.equal(report.total.leads, 4);
  assert.equal(report.total.qualified, 3); // ganado, presupuesto_enviado, score 70
  assert.equal(report.total.bookings, 2); // la cancelada no cuenta
  assert.equal(report.total.proposals_sent, 2);
  assert.equal(report.total.proposals_accepted, 1);
  assert.equal(report.total.sales, 1);
  assert.equal(report.total.revenue, 1200);
  assert.equal(report.total.spend, 400);
  assert.equal(report.total.cost.per_lead, 100);
  assert.equal(report.total.cost.per_sale, 400);
  assert.equal(report.total.rates.qualified, 75);

  const meta = report.by_source.find((row) => row.key === "meta");
  assert.equal(meta.leads, 3);
  assert.equal(meta.spend, 400);
  assert.equal(meta.cost.per_booking, 200);
  assert.equal(report.by_source.find((row) => row.key === "whatsapp").cost.per_lead, null);

  const otono = report.by_campaign.find((row) => row.key === "Otoño");
  assert.equal(otono.source, "meta");
  assert.equal(otono.spend, 300);
  assert.equal(otono.cost.per_lead, 150);
});

test("inversión de una campaña sin leads sigue apareciendo con su coste", () => {
  const report = buildResultsReport({ leads: [], spend: [{ month: "2026-10", source: "google", campaign: "Marca", amount: 50 }], from, to });
  assert.equal(report.by_campaign[0].key, "Marca");
  assert.equal(report.by_campaign[0].spend, 50);
  assert.equal(report.by_campaign[0].cost.per_lead, null);
  assert.equal(report.total.rates.qualified, null);
});

test("las etapas propias del pipeline cuentan", () => {
  const stages = [
    { key: "abierto", category: "open", position: 0 },
    { key: "cualificado", category: "open", position: 1 },
    { key: "cerrado", category: "won", position: 2 },
  ];
  const report = buildResultsReport({
    leads: [{ created_at: "2026-10-01T00:00:00Z", crm_status: "cerrado", quotes: [] }],
    stages,
    from: new Date("2026-07-01T00:00:00Z"),
    to,
  });
  assert.equal(report.total.sales, 1);
  assert.equal(report.total.qualified, 1);
});

test("sanitizeSpendEntries descarta entradas inválidas", () => {
  const entries = sanitizeSpendEntries([
    { month: "2026-10", source: " Meta ", campaign: " Otoño ", amount: "120.456" },
    { month: "2026-13", source: "meta", amount: 10 },
    { month: "2026-10", source: "", amount: 10 },
    { month: "2026-10", source: "google", amount: -5 },
  ]);
  assert.deepEqual(entries, [{ month: "2026-10", source: "meta", campaign: "Otoño", amount: 120.46 }]);
  assert.deepEqual(sanitizeSpendEntries("x"), []);
});

test("panel: periodo anterior, serie diaria y propuestas en juego", () => {
  const prev = previousRange(new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"), new Date("2026-10-11T12:00:00Z"));
  assert.equal(prev.from.toISOString(), "2026-09-20T12:00:00.000Z");
  assert.equal(prev.to.toISOString(), "2026-10-01T00:00:00.000Z");
  const days = dailySeries([{ created_at: "2026-10-02T10:00:00Z", crm_status: "ganado" }, { created_at: "2026-10-02T11:00:00Z", crm_status: "nuevo" }], null, new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"), new Date("2026-10-03T09:00:00Z"));
  assert.equal(days.length, 3, "del 1 al 3, hoy incluido");
  assert.deepEqual(days[1], { date: "2026-10-02", leads: 2, sales: 1 });
  // v2 borrador no cuenta: el cliente ve la v1 enviada. Otro contacto ya aceptó.
  assert.deepEqual(openPipeline([
    { lead_id: "a", status: "draft", total: 999 },
    { lead_id: "a", status: "sent", total: 363 },
    { lead_id: "b", status: "accepted", total: 500 },
    { lead_id: "b", status: "sent", total: 400 },
  ]), { count: 1, value: 363 });
});

test("panel de email: tasas, clientes en 30 días y reparto por campaña y automatización", () => {
  const report = buildMarketingReport({
    messages: [
      { campaign_id: "c1", lead_id: "l1", status: "sent", sent_at: "2026-10-02T10:00:00Z", opened_at: "x", clicked_at: "x" },
      { campaign_id: "c1", lead_id: "l2", status: "sent", sent_at: "2026-10-02T10:00:00Z", opened_at: "x" },
      { campaign_id: "c1", lead_id: "l3", status: "failed" },
      { run_id: "r1", lead_id: "l4", status: "sent", sent_at: "2026-10-03T10:00:00Z", unsubscribed_at: "x" },
    ],
    campaigns: [{ id: "c1", name: "Octubre", status: "sent", sent_at: "2026-10-02T10:00:00Z" }, { id: "c2", name: "Vieja", status: "sent" }],
    automations: [{ id: "a1", name: "Bienvenida", status: "active", trigger: { type: "lead_created" }, steps: [{ type: "email" }, { type: "wait" }, { type: "whatsapp" }] }],
    runs: [{ id: "r1", automation_id: "a1", lead_id: "l4", status: "done", created_at: "2026-10-03T09:00:00Z" }],
    wins: [{ lead_id: "l1", at: "2026-10-10T00:00:00Z" }, { lead_id: "l2", at: "2026-09-01T00:00:00Z" }, { lead_id: "l4", at: "2026-10-05T00:00:00Z" }],
  });
  assert.equal(report.email.sent, 3);
  assert.equal(report.email.failed, 1);
  assert.equal(report.email.rates.open, 66.7);
  assert.equal(report.email.customers, 2, "l1 tras la campaña y l4 tras la automatización; l2 compró antes");
  assert.equal(report.campaigns.length, 1);
  assert.equal(report.campaigns[0].rates.click_to_open, 50);
  assert.equal(report.campaigns[0].customers, 1);
  assert.deepEqual(report.automations[0].channels, ["email", "whatsapp"]);
  assert.equal(report.automations[0].customer_rate, 100);
  assert.equal(report.automations[0].email.unsubscribed, 1);
});
