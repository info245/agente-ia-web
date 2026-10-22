"use client";

import { useEffect, useState } from "react";
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
type Report = { from: string; to: string; total: Row; by_source: Row[]; by_campaign: Row[] };
type Spend = { month: string; source: string; campaign: string; amount: number };

const PERIODS = [
  { key: "this_week", label: "Esta semana" },
  { key: "this_month", label: "Este mes" },
  { key: "last_month", label: "Mes anterior" },
  { key: "custom", label: "Personalizado" },
];

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

const eur = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: n < 100 ? 2 : 0 }));
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-ES")} %`);
const today = () => new Date().toISOString().slice(0, 10);

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

export default function ResultadosPage() {
  const [period, setPeriod] = useState("this_month");
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [to, setTo] = useState(today());
  const [byCampaign, setByCampaign] = useState(true);
  const [report, setReport] = useState<Report | null>(null);
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
  }, [period, from, to, refresh]);

  const total = report?.total;
  const rows = report ? (byCampaign ? report.by_campaign : report.by_source) : [];
  const max = Math.max(1, total?.leads || 0);
  const range = report
    ? `${new Date(report.from).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" })} – ${new Date(report.to).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
    : "";

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Resultados</h1>
          <p className="sub">Leads que entraron en el periodo y hasta dónde llegaron{range ? ` · ${range}` : ""}</p>
        </div>
        {report && (
          <button className="btn" onClick={() => downloadCsv(report, rows, byCampaign)}>
            Exportar CSV
          </button>
        )}
      </div>

      <div className="tabs" role="tablist" aria-label="Periodo">
        {PERIODS.map((p) => (
          <button key={p.key} className="chip" role="tab" aria-selected={period === p.key} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <div className="period-range">
          <label>
            Desde
            <input className="i" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Hasta
            <input className="i" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      )}

      {error && <p className="alert error">{error}</p>}
      {!report && !error && <p className="loading">Cargando…</p>}

      {total && (
        <>
          <div className="kpis">
            <div className="card kpi">
              <div className="l">Leads</div>
              <div className="n">{total.leads}</div>
              <div className="d">{total.cost.per_lead !== null ? `${eur(total.cost.per_lead)} por lead` : `${total.qualified} cualificados`}</div>
            </div>
            <div className="card kpi">
              <div className="l">Citas</div>
              <div className="n">{total.bookings}</div>
              <div className="d">{total.cost.per_booking !== null ? `${eur(total.cost.per_booking)} por cita` : total.qualified ? `${pct(total.rates.bookings)} de los cualificados` : "Sin cualificados todavía"}</div>
            </div>
            <div className="card kpi">
              <div className="l">Ventas</div>
              <div className="n">{total.sales}</div>
              <div className="d">{total.revenue ? `${eur(total.revenue)} facturados` : total.leads ? `${pct(total.rates.sales)} de los leads` : "Sin leads en el periodo"}</div>
            </div>
            <div className="card kpi">
              <div className="l">Inversión</div>
              <div className="n">{eur(total.spend)}</div>
              <div className="d">{total.cost.per_sale !== null ? `${eur(total.cost.per_sale)} por venta` : total.spend ? "Sin ventas todavía" : "Añádela abajo"}</div>
            </div>
          </div>

          <div className="card panel results-funnel">
            <h2>Embudo del periodo</h2>
            <ol className="funnel" aria-label="Embudo">
              {STEPS.map((step, i) => {
                const value = total[step.key];
                const stepRate = step.key === "leads" ? null : total.rates[step.key];
                return (
                  <li key={step.key}>
                    <span className="funnel-label">{step.label}</span>
                    <span className="funnel-track">
                      <i style={{ width: `${Math.max(value ? 2 : 0, (value / max) * 100)}%`, opacity: 1 - i * 0.1 }} />
                    </span>
                    <b>{value}</b>
                    <small>{stepRate === null ? "" : `${pct(stepRate)} ${step.of}`}</small>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="card block">
            <div className="results-head">
              <h2>Detalle</h2>
              <div className="tabs" role="tablist" aria-label="Agrupar por">
                <button className="chip" role="tab" aria-selected={byCampaign} onClick={() => setByCampaign(true)}>Por campaña</button>
                <button className="chip" role="tab" aria-selected={!byCampaign} onClick={() => setByCampaign(false)}>Por fuente</button>
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="empty">No entraron leads en este periodo.</p>
            ) : (
              <div className="table-scroll">
                <table className="table results-table">
                  <thead>
                    <tr>
                      <th>{byCampaign ? "Campaña" : "Fuente"}</th>
                      {COLUMNS.map((c) => <th key={c.label}>{c.label}</th>)}
                    </tr>
                  </thead>
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
    </section>
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
