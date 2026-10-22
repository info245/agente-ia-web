// Informe «Resultados»: embudo por fuente y campaña de los leads creados en el periodo
// (leads → cualificados → citas → propuestas enviadas → aceptadas → ventas) y coste por paso.
// La inversión se introduce a mano por mes y fuente/campaña (app_settings ad_spend:<cuenta>).
import { DEFAULT_PIPELINE_STAGES } from "./pipelineConfig.js";

const DAY = 864e5;
export const NO_CAMPAIGN = "(sin campaña)";

const clean = (value) => String(value ?? "").trim();
const norm = (value) => clean(value).toLowerCase();
const ymd = (date) => date.toISOString().slice(0, 10);
const utcDay = (y, m, d) => new Date(Date.UTC(y, m, d));

// Fechas en UTC (día completo). Devuelve { from, to } con `to` exclusivo.
export function resolvePeriod(period = "this_month", { from, to } = {}, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const today = utcDay(y, m, now.getUTCDate());
  if (period === "this_week") {
    const start = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY);
    return { period, from: start, to: new Date(start.getTime() + 7 * DAY) };
  }
  if (period === "last_month") return { period, from: utcDay(y, m - 1, 1), to: utcDay(y, m, 1) };
  if (period === "custom") {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(clean(from)) ? new Date(`${from}T00:00:00Z`) : null;
    const end = /^\d{4}-\d{2}-\d{2}$/.test(clean(to)) ? new Date(`${to}T00:00:00Z`) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new Error("Elige una fecha de inicio y una de fin válidas.");
    }
    if (end.getTime() - start.getTime() > 366 * DAY) throw new Error("El periodo personalizado puede ser de un año como máximo.");
    return { period, from: start, to: new Date(end.getTime() + DAY) };
  }
  return { period: "this_month", from: utcDay(y, m, 1), to: utcDay(y, m + 1, 1) };
}

// Fuente: plataforma del anuncio/formulario, si no utm_source, si no el canal de la conversación.
export function leadSource(lead = {}) {
  const custom = lead.custom_fields || {};
  return norm(lead.source_platform) || norm(custom.utm_source) || norm(lead.conversations?.channel) || "web";
}

export function leadCampaign(lead = {}) {
  const custom = lead.custom_fields || {};
  return clean(lead.source_campaign) || clean(custom.utm_campaign) || clean(lead.source_form_name) || NO_CAMPAIGN;
}

function stageInfo(stages) {
  const list = Array.isArray(stages) && stages.length ? stages : DEFAULT_PIPELINE_STAGES;
  const byKey = new Map(list.map((stage) => [stage.key, stage]));
  const qualifiedAt = byKey.get("cualificado")?.position;
  return { byKey, qualifiedAt };
}

const hasBooking = (lead) =>
  [...(lead.bookings || []), ...(lead.conversations?.bookings || [])].some((b) => b?.status !== "cancelled");

function latestQuote(lead) {
  return [...(lead.quotes || [])].sort((a, b) => clean(b.created_at).localeCompare(clean(a.created_at)))[0] || null;
}

function quoteFlags(lead) {
  const quote = latestQuote(lead);
  const status = norm(quote?.status || lead.quote_status);
  return {
    sent: Boolean(quote?.sent_at) || ["sent", "accepted", "rejected"].includes(status),
    accepted: status === "accepted",
    total: Number(quote?.total) || 0,
  };
}

// Inversión del periodo: cada entrada mensual se reparte por días (una semana cuenta 7/30 del mes).
export function spendInPeriod(entries = [], from, to) {
  return entries
    .map((entry) => {
      const [y, m] = clean(entry.month).split("-").map(Number);
      const amount = Number(entry.amount);
      if (!y || !m || !Number.isFinite(amount) || amount <= 0) return null;
      const monthStart = utcDay(y, m - 1, 1).getTime();
      const monthEnd = utcDay(y, m, 1).getTime();
      const overlap = Math.min(monthEnd, to.getTime()) - Math.max(monthStart, from.getTime());
      if (overlap <= 0) return null;
      return { source: norm(entry.source), campaign: clean(entry.campaign), amount: (amount * overlap) / (monthEnd - monthStart) };
    })
    .filter(Boolean);
}

// Cualificado: ganado, en una etapa abierta igual o posterior a «Cualificado», con cita o propuesta, o puntuación ≥ 60.
function isQualified(lead, { byKey, qualifiedAt }, { booked, quote }) {
  const stage = byKey.get(lead.crm_status);
  if (stage?.category === "won" || booked || quote.sent) return true;
  if (stage?.category === "open" && Number.isFinite(qualifiedAt) && stage.position >= qualifiedAt) return true;
  return Number(lead.lead_score) >= 60;
}

function emptyRow(key, extra = {}) {
  return { key, ...extra, leads: 0, qualified: 0, bookings: 0, proposals_sent: 0, proposals_accepted: 0, sales: 0, revenue: 0, spend: 0 };
}

const round2 = (n) => Math.round(n * 100) / 100;
const rate = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
const per = (spend, count) => (spend && count ? round2(spend / count) : null);

function finish(row) {
  return {
    ...row,
    revenue: round2(row.revenue),
    spend: round2(row.spend),
    rates: {
      qualified: rate(row.qualified, row.leads),
      bookings: rate(row.bookings, row.qualified),
      proposals_sent: rate(row.proposals_sent, row.qualified),
      proposals_accepted: rate(row.proposals_accepted, row.proposals_sent),
      sales: rate(row.sales, row.leads),
    },
    cost: { per_lead: per(row.spend, row.leads), per_booking: per(row.spend, row.bookings), per_sale: per(row.spend, row.sales) },
  };
}

const byLeads = (a, b) => b.leads - a.leads || b.spend - a.spend || a.key.localeCompare(b.key);

// `leads` deben venir ya filtrados por cuenta y por fecha de creación en [from, to).
export function buildResultsReport({ leads = [], stages = null, spend = [], from, to }) {
  const info = stageInfo(stages);
  const total = emptyRow("total");
  const sources = new Map();
  const campaigns = new Map();

  for (const lead of leads) {
    const source = leadSource(lead);
    const campaign = leadCampaign(lead);
    const quote = quoteFlags(lead);
    const booked = hasBooking(lead);
    const won = info.byKey.get(lead.crm_status)?.category === "won";
    const qualified = isQualified(lead, info, { booked, quote });
    const sourceRow = sources.get(source) || emptyRow(source);
    const campaignKey = `${source}\u0000${campaign}`;
    const campaignRow = campaigns.get(campaignKey) || emptyRow(campaign, { source });
    sources.set(source, sourceRow);
    campaigns.set(campaignKey, campaignRow);

    for (const row of [total, sourceRow, campaignRow]) {
      row.leads += 1;
      if (qualified) row.qualified += 1;
      if (booked) row.bookings += 1;
      if (quote.sent) row.proposals_sent += 1;
      if (quote.accepted) row.proposals_accepted += 1;
      if (won) {
        row.sales += 1;
        row.revenue += quote.total;
      }
    }
  }

  // Inversión sin campaña cuenta para la fuente y el total; con campaña, también para esa campaña.
  for (const entry of spendInPeriod(spend, from, to)) {
    total.spend += entry.amount;
    if (!entry.source) continue;
    const sourceRow = sources.get(entry.source) || emptyRow(entry.source);
    sources.set(entry.source, sourceRow);
    sourceRow.spend += entry.amount;
    if (!entry.campaign) continue;
    const key = `${entry.source}\u0000${entry.campaign}`;
    const campaignRow = campaigns.get(key) || emptyRow(entry.campaign, { source: entry.source });
    campaigns.set(key, campaignRow);
    campaignRow.spend += entry.amount;
  }

  return {
    from: ymd(from),
    to: ymd(new Date(to.getTime() - DAY)),
    total: finish(total),
    by_source: [...sources.values()].map(finish).sort(byLeads),
    by_campaign: [...campaigns.values()].map(finish).sort(byLeads),
  };
}

// Entradas de inversión manual. Valida y limita lo que llega del CRM.
export function sanitizeSpendEntries(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 500)
    .map((entry) => ({
      month: clean(entry?.month).slice(0, 7),
      source: norm(entry?.source).slice(0, 60),
      campaign: clean(entry?.campaign).slice(0, 160),
      amount: round2(Number(entry?.amount)),
    }))
    .filter((entry) => /^\d{4}-(0[1-9]|1[0-2])$/.test(entry.month) && entry.source && Number.isFinite(entry.amount) && entry.amount > 0);
}
