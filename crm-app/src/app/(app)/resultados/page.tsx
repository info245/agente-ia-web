"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Row = {
  key: string;
  source?: string;
  leads: number;
  qualified: number;
  bookings: number;
  proposals_sent: number;
  proposals_accepted: number;
  sales: number;
  revenue: number;
  spend: number;
  rates: Record<"qualified" | "bookings" | "proposals_sent" | "proposals_accepted" | "sales", number | null>;
  cost: Record<"per_lead" | "per_booking" | "per_sale", number | null>;
};
type Day = { date: string; leads: number; sales: number };
type Report = { from: string; to: string; total: Row; previous?: Row; daily?: Day[]; by_source: Row[]; by_campaign: Row[] };
type Spend = { month: string; source: string; campaign: string; amount: number };
type EmailStats = {
  sent: number;
  failed: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  customers: number;
  rates: Record<"open" | "click" | "click_to_open" | "unsubscribe" | "customers", number | null>;
};
type Marketing = {
  email: EmailStats;
  campaigns: (EmailStats & { id: string; name: string; subject: string; status: string; sent_at?: string | null; scheduled_at?: string | null })[];
  automations: {
    id: string;
    name: string;
    status: string;
    trigger: string;
    channels: string[];
    runs: { total: number; active: number; done: number; exited: number };
    customers: number;
    customer_rate: number | null;
    email: EmailStats;
  }[];
  pipeline: { count: number; value: number };
  closed: { count: number; value: number };
};

const PERIODS = [
  { key: "this_week", label: "Esta semana" },
  { key: "this_month", label: "Este mes" },
  { key: "last_month", label: "Mes anterior" },
  { key: "custom", label: "Personalizado" },
];
const VIEWS = [
  { key: "resumen", label: "Resumen" },
  { key: "embudo", label: "Embudo y fuentes" },
  { key: "email", label: "Email y automatizaciones" },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  meta_ads: "Meta Ads",
  meta: "Meta Ads",
  facebook: "Facebook",
  instagram: "Instagram",
  google: "Google Ads",
  google_ads: "Google Ads",
  whatsapp: "WhatsApp",
  web: "Chat de la web",
  lead_form: "Formulario",
};
const sourceLabel = (key = "") => SOURCE_LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1)).replace(/_/g, " ");
const TRIGGER: Record<string, string> = { lead_created: "Contacto nuevo", stage: "Cambio de etapa", tag: "Etiqueta", no_reply: "Sin contestar", quote_sent: "Propuesta sin responder" };
const CHANNEL: Record<string, string> = { email: "✉ Email", whatsapp: "◍ WhatsApp" };
const CAMPAIGN_STATUS: Record<string, [string, string]> = { sent: ["Enviada", "p-good"], sending: ["Enviando", "p-warn"], scheduled: ["Programada", "p-warn"] };

const eur = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: n < 100 ? 2 : 0 }));
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-ES")} %`);
const today = () => new Date().toISOString().slice(0, 10);
const shortDay = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "—");

type Rate = keyof Row["rates"];
const STEPS: { key: "leads" | Rate; label: string; of?: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "qualified", label: "Cualificados", of: "de los leads" },
  { key: "bookings", label: "Citas", of: "de los cualificados" },
  { key: "proposals_sent", label: "Propuestas enviadas", of: "de los cualificados" },
  { key: "proposals_accepted", label: "Propuestas aceptadas", of: "de las enviadas" },
  { key: "sales", label: "Ventas", of: "de los leads" },
];

const COLUMNS: { label: string; value: (r: Row) => number | null; money?: boolean }[] = [
  { label: "Leads", value: (r) => r.leads },
  { label: "Cualificados", value: (r) => r.qualified },
  { label: "Citas", value: (r) => r.bookings },
  { label: "Prop. enviadas", value: (r) => r.proposals_sent },
  { label: "Prop. aceptadas", value: (r) => r.proposals_accepted },
  { label: "Ventas", value: (r) => r.sales },
  { label: "Importe ventas", value: (r) => r.revenue, money: true },
  { label: "Inversión", value: (r) => r.spend, money: true },
  { label: "Coste/lead", value: (r) => r.cost.per_lead, money: true },
  { label: "Coste/cita", value: (r) => r.cost.per_booking, money: true },
  { label: "Coste/venta", value: (r) => r.cost.per_sale, money: true },
];

// CSV para Excel en español: punto y coma, coma decimal y BOM.
function downloadCsv(report: Report, rows: Row[], byCampaign: boolean) {
  const cell = (v: string | number | null) => {
    const text = v === null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const head = [...(byCampaign ? ["Fuente", "Campaña"] : ["Fuente"]), ...COLUMNS.map((c) => c.label), "% cualificados", "% cierre"];
  const line = (r: Row, name: string[]) => [...name, ...COLUMNS.map((c) => c.value(r)), r.rates.qualified, r.rates.sales].map(cell).join(";");
  const body = rows.map((r) => line(r, byCampaign ? [sourceLabel(r.source), r.key] : [sourceLabel(r.key)]));
  body.push(line(report.total, byCampaign ? ["Total", ""] : ["Total"]));
  const blob = new Blob(["﻿" + [head.map(cell).join(";"), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `resultados-${byCampaign ? "campanas" : "fuentes"}-${report.from}-a-${report.to}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Variación frente al periodo anterior (mismos días). Sin base, no se muestra.
function Delta({ now, before, invert }: { now: number; before?: number; invert?: boolean }) {
  if (before === undefined || (!before && !now)) return null;
  if (!before) return <b>nuevo</b>;
  const change = Math.round(((now - before) / before) * 100);
  const up = change >= 0;
  return <b className={up !== Boolean(invert) ? "" : "down"}>{up ? "▲" : "▼"} {Math.abs(change)} %</b>;
}

export default function ResultadosPage() {
  const [period, setPeriod] = useState("this_month");
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [to, setTo] = useState(today());
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("resumen");
  const [byCampaign, setByCampaign] = useState(true);
  const [report, setReport] = useState<Report | null>(null);
  const [marketing, setMarketing] = useState<Marketing | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const query = new URLSearchParams({ period, ...(period === "custom" ? { from, to } : {}) });
    api<{ report: Report }>(`/crm/reports/results?${query}`)
      .then((data) => {
        setReport(data.report);
        setError("");
      })
      .catch((err) => setError((err as Error).message));
    api<{ report: Marketing }>(`/crm/reports/marketing?${query}`)
      .then((data) => setMarketing(data.report))
      .catch(() => setMarketing(null));
  }, [period, from, to, refresh]);

  const total = report?.total;
  const prev = report?.previous;
  const rows = report ? (byCampaign ? report.by_campaign : report.by_source) : [];
  const range = report
    ? `${new Date(report.from).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" })} – ${new Date(report.to).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
    : "";

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Resultados</h1>
          <p className="sub">De dónde vienen tus clientes, cuánto cuestan y qué funciona{range ? ` · ${range}` : ""}</p>
        </div>
        {report && view === "embudo" && <button className="btn" onClick={() => downloadCsv(report, rows, byCampaign)}>Exportar CSV</button>}
      </div>

      <div className="results-bar">
        <div className="tabs" role="tablist" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button key={p.key} className="chip" role="tab" aria-selected={period === p.key} onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
        </div>
        <div className="tabs" role="tablist" aria-label="Vista">
          {VIEWS.map((v) => (
            <button key={v.key} className="chip" role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}>{v.label}</button>
          ))}
        </div>
      </div>
      {period === "custom" && (
        <div className="period-range">
          <label>Desde<input className="i" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Hasta<input className="i" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      )}

      {error && <p className="alert error">{error}</p>}
      {!report && !error && <p className="loading">Cargando…</p>}

      {total && view === "resumen" && (
        <>
          <div className="kpis kpis-6">
            <Kpi label="Leads" value={total.leads} delta={<Delta now={total.leads} before={prev?.leads} />} note={total.cost.per_lead !== null ? `${eur(total.cost.per_lead)} por lead` : "vs. periodo anterior"} />
            <Kpi label="Cualificados" value={pct(total.rates.qualified)} delta={<Delta now={total.qualified} before={prev?.qualified} />} note={`${total.qualified} de ${total.leads}`} />
            <Kpi label="Citas" value={total.bookings} delta={<Delta now={total.bookings} before={prev?.bookings} />} note={total.cost.per_booking !== null ? `${eur(total.cost.per_booking)} por cita` : "reservadas"} />
            <Kpi label="Ventas" value={total.sales} delta={<Delta now={total.sales} before={prev?.sales} />} note={`${pct(total.rates.sales)} de los leads`} />
            <Kpi label="Facturado" value={eur(total.revenue)} delta={<Delta now={total.revenue} before={prev?.revenue} />} note={total.cost.per_sale !== null ? `${eur(total.cost.per_sale)} por venta` : total.spend ? `${eur(total.spend)} invertidos` : "de leads del periodo"} />
            <Kpi label="Propuestas en juego" value={marketing ? eur(marketing.pipeline.value) : "…"} note={marketing ? `${marketing.pipeline.count} enviadas sin responder` : ""} href="/propuestas" />
          </div>

          <div className="results-grid">
            <div className="card panel">
              <div className="panel-head"><h2>Leads y ventas por día</h2><span className="legend"><i className="lg-leads" /> Leads <i className="lg-sales" /> Ventas</span></div>
              <DailyChart days={report.daily || []} />
            </div>
            <div className="card panel">
              <h2>Embudo</h2>
              <Funnel total={total} />
            </div>
          </div>

          <div className="results-grid">
            <div className="card panel">
              <div className="panel-head"><h2>Campañas de email</h2><Link href="/email" className="btn ghost small">Ver todas</Link></div>
              {!marketing ? <p className="loading">Cargando…</p> : (
                <>
                  <div className="mini-kpis">
                    <Mini label="Aperturas" value={pct(marketing.email.rates.open)} />
                    <Mini label="Clics" value={pct(marketing.email.rates.click)} />
                    <Mini label="Bajas" value={pct(marketing.email.rates.unsubscribe)} />
                    <Mini label="Clientes" value={pct(marketing.email.rates.customers)} hint={`${marketing.email.customers} compraron en 30 días`} />
                  </div>
                  {marketing.campaigns.length === 0 ? <p className="empty">Sin campañas en este periodo. <Link href="/email/campana">Crear una</Link></p> : (
                    <ul className="rank">
                      {marketing.campaigns.slice(0, 4).map((c) => (
                        <li key={c.id}>
                          <div><b>{c.name || c.subject || "Sin nombre"}</b><span>{CAMPAIGN_STATUS[c.status]?.[0] || c.status} · {shortDay(c.sent_at || c.scheduled_at)} · {c.sent} enviados</span></div>
                          <Bar label="Aperturas" value={c.rates.open} />
                          <Bar label="Clics" value={c.rates.click} />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
            <div className="card panel">
              <div className="panel-head"><h2>Automatizaciones</h2><Link href="/email" className="btn ghost small">Ver todas</Link></div>
              {!marketing ? <p className="loading">Cargando…</p> : marketing.automations.length === 0 ? <p className="empty">Aún no tienes automatizaciones. <Link href="/email/automatizacion">Crear una</Link></p> : (
                <ul className="rank">
                  {marketing.automations.slice(0, 5).map((a) => (
                    <li key={a.id}>
                      <div>
                        <b>{a.name || "Sin nombre"} <span className={`pill ${a.status === "active" ? "p-good" : "p-muted"}`}>{a.status === "active" ? "Activa" : a.status === "paused" ? "Pausada" : "Borrador"}</span></b>
                        <span>{TRIGGER[a.trigger] || a.trigger} · {a.channels.map((c) => CHANNEL[c]).join(" · ") || "—"} · {a.runs.active} en curso · {a.runs.total} en total</span>
                      </div>
                      <Bar label="Clientes" value={a.customer_rate} good />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {total && view === "embudo" && (
        <>
          <div className="card panel results-funnel">
            <h2>Embudo del periodo</h2>
            <Funnel total={total} />
          </div>
          <div className="card block">
            <div className="results-head">
              <h2>Detalle</h2>
              <div className="tabs" role="tablist" aria-label="Agrupar por">
                <button className="chip" role="tab" aria-selected={byCampaign} onClick={() => setByCampaign(true)}>Por campaña</button>
                <button className="chip" role="tab" aria-selected={!byCampaign} onClick={() => setByCampaign(false)}>Por fuente</button>
              </div>
            </div>
            {rows.length === 0 ? <p className="empty">No entraron leads en este periodo.</p> : (
              <div className="table-scroll">
                <table className="table results-table">
                  <thead><tr><th>{byCampaign ? "Campaña" : "Fuente"}</th>{COLUMNS.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
                  <tbody>
                    {[...rows, total].map((r) => (
                      <tr key={r === total ? "total" : `${r.source || ""}/${r.key}`} className={r === total ? "total" : undefined}>
                        <th scope="row">
                          {r === total ? "Total" : byCampaign ? r.key : sourceLabel(r.key)}
                          {byCampaign && r !== total && <small>{sourceLabel(r.source)}</small>}
                        </th>
                        {COLUMNS.map((c) => {
                          const v = c.value(r);
                          return <td key={c.label}>{c.money ? (v ? eur(v) : "—") : v}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <SpendEditor sources={report.by_source.map((r) => r.key)} onSaved={() => setRefresh((n) => n + 1)} />
        </>
      )}

      {report && view === "email" && (
        !marketing ? <p className="loading">Cargando…</p> : (
          <>
            <div className="kpis kpis-6">
              <Kpi label="Emails enviados" value={marketing.email.sent} note={marketing.email.failed ? `${marketing.email.failed} fallidos` : "en el periodo"} />
              <Kpi label="Aperturas" value={pct(marketing.email.rates.open)} note={`${marketing.email.opened} abiertos · media del sector 35–40 %`} />
              <Kpi label="Clics" value={pct(marketing.email.rates.click)} note={`${pct(marketing.email.rates.click_to_open)} de los que abren · media 2–3 %`} />
              <Kpi label="Bajas" value={pct(marketing.email.rates.unsubscribe)} note={`${marketing.email.unsubscribed} · conviene < 0,5 %`} />
              <Kpi label="Clientes desde email" value={marketing.email.customers} note={`${pct(marketing.email.rates.customers)} de los que lo recibieron`} />
              <Kpi label="Ventas cerradas" value={eur(marketing.closed.value)} note={`${marketing.closed.count} propuestas aceptadas en el periodo`} />
            </div>
            <p className="hint" style={{ margin: "0 0 14px" }}>
              «Clientes» = recibió el email y aceptó una propuesta en los 30 días siguientes. Las aperturas de Apple Mail se cuentan aunque el cliente no lo lea, así que los clics son el dato más fiable.
            </p>

            <div className="card block">
              <div className="results-head"><h2>Campañas</h2><Link href="/email/campana" className="btn primary small">+ Nueva campaña</Link></div>
              {marketing.campaigns.length === 0 ? <p className="empty">Sin campañas en este periodo.</p> : (
                <div className="table-scroll">
                  <table className="table">
                    <thead><tr>{["Campaña", "Estado", "Enviados", "Aperturas", "Clics", "Clic/apertura", "Bajas", "Clientes"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {marketing.campaigns.map((c) => (
                        <tr key={c.id} style={{ cursor: "default" }}>
                          <td><Link href={`/email/campana?id=${c.id}`}><b>{c.name || "Sin nombre"}</b></Link><div className="hint" style={{ margin: 0 }}>{c.subject}</div></td>
                          <td><span className={`pill ${CAMPAIGN_STATUS[c.status]?.[1] || "p-muted"}`}>{CAMPAIGN_STATUS[c.status]?.[0] || c.status}</span><div className="hint" style={{ margin: 0 }}>{shortDay(c.sent_at || c.scheduled_at)}</div></td>
                          <td>{c.sent}</td>
                          <td><Bar value={c.rates.open} /></td>
                          <td><Bar value={c.rates.click} /></td>
                          <td>{pct(c.rates.click_to_open)}</td>
                          <td>{pct(c.rates.unsubscribe)}</td>
                          <td>{c.customers} <span className="hint">({pct(c.rates.customers)})</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card block">
              <div className="results-head"><h2>Automatizaciones</h2><Link href="/email/automatizacion" className="btn primary small">+ Nueva automatización</Link></div>
              {marketing.automations.length === 0 ? <p className="empty">Aún no tienes automatizaciones.</p> : (
                <div className="table-scroll">
                  <table className="table">
                    <thead><tr>{["Automatización", "Estado", "Canales", "En curso", "Terminados", "Salieron (contestaron)", "Aperturas", "Clientes"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {marketing.automations.map((a) => (
                        <tr key={a.id} style={{ cursor: "default" }}>
                          <td><Link href={`/email/automatizacion?id=${a.id}`}><b>{a.name || "Sin nombre"}</b></Link><div className="hint" style={{ margin: 0 }}>{TRIGGER[a.trigger] || a.trigger}</div></td>
                          <td><span className={`pill ${a.status === "active" ? "p-good" : "p-muted"}`}>{a.status === "active" ? "Activa" : a.status === "paused" ? "Pausada" : "Borrador"}</span></td>
                          <td style={{ whiteSpace: "nowrap" }}>{a.channels.map((c) => CHANNEL[c]).join(" · ") || "—"}</td>
                          <td>{a.runs.active}</td>
                          <td>{a.runs.done}</td>
                          <td>{a.runs.exited}</td>
                          <td>{a.email.sent ? pct(a.email.rates.open) : "—"}</td>
                          <td>{a.customers} <span className="hint">({pct(a.customer_rate)})</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )
      )}
    </section>
  );
}

function Kpi({ label, value, delta, note, href }: { label: string; value: React.ReactNode; delta?: React.ReactNode; note?: string; href?: string }) {
  const body = (
    <>
      <div className="l">{label}</div>
      <div className="n">{value}</div>
      <div className="d">{delta} {note}</div>
    </>
  );
  return href ? <Link href={href} className="card kpi kpi-link">{body}</Link> : <div className="card kpi">{body}</div>;
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="mini" title={hint}><span>{label}</span><b>{value}</b></div>;
}

function Bar({ label, value, good }: { label?: string; value: number | null; good?: boolean }) {
  return (
    <div className={`rate-bar${label ? "" : " bare"}`} aria-label={`${label ? `${label}: ` : ""}${pct(value)}`}>
      {label && <span>{label}</span>}
      <span className="rate-track"><i className={good ? "good" : ""} style={{ width: `${Math.min(100, value || 0)}%` }} /></span>
      <b>{pct(value)}</b>
    </div>
  );
}

// Embudo con forma: cada paso centrado y proporcional al primero, con el % de paso entre etapas.
function Funnel({ total }: { total: Row }) {
  const max = Math.max(1, total.leads);
  return (
    <ol className="funnel-shape" aria-label="Embudo">
      {STEPS.map((step, i) => {
        const value = total[step.key];
        const stepRate = step.key === "leads" ? null : total.rates[step.key];
        return (
          <li key={step.key}>
            {i > 0 && <span className="funnel-rate">↓ {pct(stepRate)} <small>{step.of}</small></span>}
            <div className="funnel-step" style={{ width: `${Math.max(18, (value / max) * 100)}%`, opacity: 1 - i * 0.11 }}>
              <span>{step.label}</span>
              <b>{value}</b>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Barras de leads por día con la línea de ventas encima (SVG, sin librerías).
function DailyChart({ days }: { days: Day[] }) {
  if (!days.length) return <p className="empty">Sin datos en este periodo.</p>;
  const W = 600;
  const H = 160;
  const max = Math.max(1, ...days.map((d) => d.leads));
  const step = W / days.length;
  const bw = Math.max(2, step * 0.7);
  const y = (n: number) => H - 18 - (n / max) * (H - 30);
  const line = days.map((d, i) => `${i ? "L" : "M"}${(i + 0.5) * step},${y(d.sales)}`).join(" ");
  const labelEvery = Math.ceil(days.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="daily-chart" role="img" aria-label={`Leads por día: ${days.reduce((s, d) => s + d.leads, 0)} en total`}>
      {[0.5, 1].map((f) => <line key={f} x1="0" x2={W} y1={y(max * f)} y2={y(max * f)} className="grid" />)}
      <text x="2" y={y(max) - 3} className="axis">{max}</text>
      {days.map((d, i) => (
        <g key={d.date}>
          <rect x={(i + 0.5) * step - bw / 2} y={y(d.leads)} width={bw} height={Math.max(0, H - 18 - y(d.leads))} rx="2" className="bar">
            <title>{`${new Date(d.date).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" })}: ${d.leads} leads, ${d.sales} ventas`}</title>
          </rect>
          {i % labelEvery === 0 && <text x={(i + 0.5) * step} y={H - 4} textAnchor="middle" className="axis">{Number(d.date.slice(8))}</text>}
        </g>
      ))}
      <path d={line} className="sales" />
    </svg>
  );
}

// Inversión introducida a mano por mes y fuente (y campaña si se quiere afinar).
function SpendEditor({ sources, onSaved }: { sources: string[]; onSaved: () => void }) {
  const [entries, setEntries] = useState<Spend[] | null>(null);
  const [draft, setDraft] = useState<Spend>({ month: today().slice(0, 7), source: "", campaign: "", amount: 0 });
  const [status, setStatus] = useState("");

  useEffect(() => {
    api<{ entries: Spend[] }>("/crm/reports/spend")
      .then((data) => setEntries(data.entries))
      .catch((err) => setStatus((err as Error).message));
  }, []);

  async function save(next: Spend[]) {
    setStatus("");
    try {
      const data = await api<{ entries: Spend[] }>("/crm/reports/spend", { method: "PUT", body: { entries: next } });
      setEntries(data.entries);
      onSaved();
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  const options = [...new Set([...sources, "meta_ads", "google_ads"])];
  const sorted = [...(entries || [])].sort((a, b) => b.month.localeCompare(a.month) || a.source.localeCompare(b.source));

  return (
    <div className="card block">
      <h2>Inversión en publicidad</h2>
      <p className="hint">
        Apunta lo invertido cada mes por fuente (y por campaña si quieres el coste de cada una). Si el periodo no es un mes completo, se reparte por días.
      </p>
      <form
        className="spend-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.source || !(draft.amount > 0)) return setStatus("Indica la fuente y un importe mayor que cero.");
          save([...(entries || []), draft]);
          setDraft({ ...draft, campaign: "", amount: 0 });
        }}
      >
        <label>
          Mes
          <input className="i" type="month" required value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })} />
        </label>
        <label>
          Fuente
          <select className="i" required value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })}>
            <option value="">Elige…</option>
            {options.map((key) => <option key={key} value={key}>{sourceLabel(key)}</option>)}
          </select>
        </label>
        <label>
          Campaña (opcional)
          <input className="i" value={draft.campaign} onChange={(e) => setDraft({ ...draft, campaign: e.target.value })} placeholder="Toda la fuente" />
        </label>
        <label>
          Importe (€)
          <input className="i" type="number" min="0" step="0.01" inputMode="decimal" required value={draft.amount || ""} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} />
        </label>
        <button className="btn primary" type="submit">Añadir</button>
      </form>
      {status && <p className="alert error">{status}</p>}
      {entries && entries.length > 0 && (
        <div className="table-scroll">
          <table className="table spend-table">
            <thead>
              <tr><th>Mes</th><th>Fuente</th><th>Campaña</th><th>Importe</th><th /></tr>
            </thead>
            <tbody>
              {sorted.map((entry) => (
                <tr key={`${entry.month}/${entry.source}/${entry.campaign}/${entries.indexOf(entry)}`}>
                  <td>{new Date(`${entry.month}-01`).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" })}</td>
                  <td>{sourceLabel(entry.source)}</td>
                  <td>{entry.campaign || "Toda la fuente"}</td>
                  <td>{eur(entry.amount)}</td>
                  <td>
                    <button className="btn small" onClick={() => save(entries.filter((e) => e !== entry))} aria-label="Quitar inversión">Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
