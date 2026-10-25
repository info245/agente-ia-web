"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import { leadName } from "@/lib/format";
import type { Offer, QuoteTemplate } from "@/lib/types";

type Item = { concept: string; quantity: number; unit_price: number };
type Acceptance = { name: string; nif?: string | null; signature?: string; at?: string; ip?: string; version?: number };
type Quote = {
  id?: string;
  title?: string;
  status?: string;
  version?: number;
  currency?: string;
  total?: number;
  sent_at?: string | null;
  created_at?: string;
  acceptance?: Acceptance | null;
  content_json?: {
    body?: string; summary?: string; scope?: string; assumptions?: string;
    billing_type?: string; billing_label?: string; tax_rate?: number; items?: Item[];
  };
};
type Draft = {
  title: string; billing_type: string; billing_label: string; tax_rate: number;
  summary: string; scope: string; body: string; assumptions: string; items: Item[];
};

const STATUS: Record<string, [string, string]> = { draft: ["Borrador", "p-muted"], sent: ["Enviada", "p-warn"], accepted: ["Aceptada", "p-good"], rejected: ["Rechazada", "p-muted"] };
const BILLING: Record<string, string> = { monthly: "Mensual", one_time: "Pago único", custom: "Otro" };
const money = (n: number) => (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "");

function fromQuote(q: Quote | null): Draft {
  const c = q?.content_json || {};
  return {
    title: q?.title || "", billing_type: c.billing_type || "monthly", billing_label: c.billing_label || "",
    tax_rate: c.tax_rate ?? 21, summary: c.summary || "", scope: c.scope || "", body: c.body || "",
    assumptions: c.assumptions || "", items: (c.items || []).map((i) => ({ concept: i.concept || "", quantity: Number(i.quantity) || 1, unit_price: Number(i.unit_price) || 0 })),
  };
}

export default function PropuestaPage() {
  const params = useSearchParams();
  const leadId = params.get("lead") || "";
  const { leads, account, reloadLeads } = useSession();
  const lead = leads?.find((l) => l.id === leadId);
  const [quote, setQuote] = useState<Quote | null | undefined>(undefined);
  const [versions, setVersions] = useState<Quote[]>([]);
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [d, setD] = useState<Draft>(fromQuote(null));
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  const loadVersions = () => api<{ versions: Quote[] }>(`/crm/leads/${leadId}/quote/versions`).then((r) => setVersions(r.versions || [])).catch(() => {});

  useEffect(() => {
    if (!leadId) return;
    api<{ quote: Quote | null }>(`/crm/leads/${leadId}/quote`)
      .then((r) => { setQuote(r.quote); setD(fromQuote(r.quote)); })
      .catch((err) => { setQuote(null); setMsg({ kind: "error", text: (err as Error).message }); });
    api<{ versions: Quote[] }>(`/crm/leads/${leadId}/quote/versions`).then((r) => setVersions(r.versions || [])).catch(() => {});
    api<{ templates: QuoteTemplate[] }>("/crm/quote-templates").then((r) => setTemplates(r.templates || [])).catch(() => {});
  }, [leadId]);

  // Primero las plantillas del servicio que le interesa a este contacto.
  const sortedTemplates = useMemo(() => {
    const service = (lead?.interest_service || "").toLowerCase();
    return [...templates].sort((a, b) => Number(service && b.service.toLowerCase() === service) - Number(service && a.service.toLowerCase() === service));
  }, [templates, lead?.interest_service]);

  if (!leadId) return <section className="page"><p className="empty">Abre la propuesta desde la ficha de un contacto o desde <Link href="/propuestas">Propuestas</Link>.</p></section>;
  if (quote === undefined || !leads) return <p className="loading">Cargando…</p>;
  if (!lead) return <section className="page"><p className="empty">Este contacto no está en la cuenta seleccionada. Cambia de cuenta abajo a la izquierda o vuelve a <Link href="/contactos">Contactos</Link>.</p></section>;

  const set = (part: Partial<Draft>) => setD((prev) => ({ ...prev, ...part }));
  const setItem = (i: number, part: Partial<Item>) => set({ items: d.items.map((it, j) => (j === i ? { ...it, ...part } : it)) });
  const subtotal = d.items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const tax = subtotal * ((Number(d.tax_rate) || 0) / 100);
  const status = quote?.status || "draft";
  const version = Number(quote?.version) || 1;
  const locked = Boolean(quote?.id) && status !== "draft";
  const dirty = JSON.stringify(d) !== JSON.stringify(fromQuote(quote || null));

  async function autofill() {
    const service = lead?.interest_service || "servicio";
    let facts: Offer | null = null;
    try {
      facts = (await api<{ facts: Offer | null }>(`/crm/service-facts/${encodeURIComponent(service)}`)).facts;
    } catch { /* sin precio configurado */ }
    const price = Number(String(facts?.min_monthly_fee || facts?.min_project_fee || "").match(/\d+/)?.[0] || 0);
    const monthly = Boolean(facts?.min_monthly_fee) || !facts?.min_project_fee;
    const business = lead?.company_name || lead?.business_type || "tu negocio";
    set({
      title: `Propuesta ${service}`,
      billing_type: monthly ? "monthly" : "one_time",
      summary: `${service} para ${business}`,
      scope: facts?.description || "",
      body: `Hola ${lead?.name || ""}, te compartimos la propuesta de ${service} para ${business}${lead?.main_goal ? `, orientada a ${lead.main_goal}` : ""}.`.replace("Hola ,", "Hola,"),
      items: [{ concept: `${service}`, quantity: 1, unit_price: price }],
    });
  }

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (d.items.length && !window.confirm(`¿Sustituir el contenido por la plantilla «${t.name}»?`)) return;
    const first = String(lead?.name || "").split(/\s+/)[0];
    const fill = (text: string) => text.replace(/\{nombre\}/g, first).replace(/\{empresa\}/g, lead?.company_name || "tu negocio").replace(/\{servicio\}/g, lead?.interest_service || t.service);
    set({ title: fill(t.title), billing_type: t.billing_type, tax_rate: Number(t.tax_rate), items: t.items.map((i) => ({ ...i })), summary: fill(t.summary), scope: fill(t.scope), body: fill(t.body), assumptions: fill(t.assumptions) });
  };

  async function saveTemplate() {
    const name = window.prompt("Nombre de la plantilla", `${lead?.interest_service || "Servicio"} · estándar`);
    if (!name) return;
    try {
      const r = await api<{ template: QuoteTemplate }>("/crm/quote-templates", { method: "POST", body: { ...d, name, service: lead?.interest_service || "" } });
      setTemplates((prev) => [...prev, r.template]);
      setMsg({ kind: "ok", text: `Plantilla «${name}» guardada. La tienes en todas las propuestas y en Propuestas → Plantillas.` });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  async function save(): Promise<Quote | null> {
    setBusy("save");
    setMsg(null);
    try {
      const r = await api<{ quote: Quote }>(`/crm/leads/${leadId}/quote`, {
        method: "POST",
        body: { ...d, status: "draft", subtotal, tax, total: subtotal + tax, currency: "EUR", items: d.items.filter((it) => it.concept.trim()) },
      });
      const newVersion = Number(r.quote.version) || 1;
      setQuote(r.quote);
      setD(fromQuote(r.quote));
      loadVersions();
      setMsg({ kind: "ok", text: newVersion > version ? `Guardada como versión ${newVersion} (la versión ${version} enviada no cambia).` : "Propuesta guardada." });
      setBusy("");
      return r.quote;
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
      setBusy("");
      return null;
    }
  }

  async function send(via: "email" | "whatsapp") {
    const to = via === "email" ? lead?.email : lead?.phone;
    if (!to) return setMsg({ kind: "error", text: via === "email" ? "Este contacto no tiene email." : "Este contacto no tiene teléfono." });
    const resend = locked && !dirty;
    if (!window.confirm(`¿${resend ? "Reenviar" : "Enviar"} la propuesta por ${via === "email" ? "email" : "WhatsApp"} a ${to}?`)) return;
    // Si no hay cambios en una propuesta ya enviada, se reenvía la misma versión (sin crear otra).
    if (!resend && !(await save())) return;
    setBusy(via);
    try {
      const r = await api<{ quote: Quote }>(`/crm/leads/${leadId}/quote/send`, { method: "POST", body: { via } });
      if (r.quote) setQuote(r.quote);
      loadVersions();
      await reloadLeads();
      setMsg({ kind: "ok", text: `Propuesta enviada por ${via === "email" ? "email" : "WhatsApp"}. Si la acepta, la firmará desde su enlace.` });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy("");
  }

  const preview = `/crm/quotes/${leadId}/preview?account_id=${encodeURIComponent(account.id)}&borrador=1`;
  const pdf = `/crm/quotes/${leadId}/pdf?account_id=${encodeURIComponent(account.id)}`;
  const acceptance = quote?.acceptance;

  return (
    <section className="page">
      <div className="head">
        <div>
          <p className="sub" style={{ margin: 0 }}><Link href="/propuestas">← Propuestas</Link> · <Link href={`/conversaciones?c=${lead.conversation_id}`}>{leadName(lead)}</Link></p>
          <h1>Propuesta</h1>
          <p className="sub">{lead.interest_service || "Sin servicio"} · versión {version} · <span className={`pill ${STATUS[status]?.[1] || "p-muted"}`}>{STATUS[status]?.[0] || status}</span></p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!d.items.length && !quote && <button className="btn" onClick={autofill}>Rellenar con sus datos</button>}
          {quote?.id && <a className="btn" href={preview} target="_blank" rel="noopener noreferrer">Ver como el cliente</a>}
          {quote?.id && <a className="btn" href={pdf}>PDF</a>}
          <button className="btn primary" disabled={Boolean(busy) || (locked && !dirty)} onClick={save}>{busy === "save" ? "Guardando…" : locked ? `Guardar como versión ${version + 1}` : "Guardar"}</button>
        </div>
      </div>
      {msg && <p className={`alert ${msg.kind}`} role="status">{msg.text}</p>}

      {acceptance?.name && (
        <div className="card block" style={{ borderColor: "#bfe3cd" }}>
          <h2>✓ Aceptada y firmada</h2>
          <p style={{ margin: "4px 0 10px" }}>
            Por <b>{acceptance.name}</b>{acceptance.nif ? ` (NIF/CIF ${acceptance.nif})` : ""} el {acceptance.at ? new Date(acceptance.at).toLocaleString("es-ES") : ""} · versión {acceptance.version || version}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {acceptance.signature && <img src={acceptance.signature} alt="Firma del cliente" style={{ maxWidth: 280, maxHeight: 120, background: "#fff", border: "1px solid var(--line)", borderRadius: 8 }} />}
          <p className="hint" style={{ margin: "8px 0 0" }}>La firma aparece también en la propuesta y en su PDF. IP: {acceptance.ip || "—"}</p>
        </div>
      )}
      {locked && (
        <p className="alert warn" style={{ marginBottom: 14 }}>
          Esta es la versión {version}, {status === "sent" ? `enviada el ${day(quote?.sent_at)}` : status === "accepted" ? "ya aceptada" : "ya respondida"}. Si cambias algo y guardas, se crea la versión {version + 1} y la que vio el cliente no se toca.
        </p>
      )}

      <div className="card block">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
          <select className="i" style={{ maxWidth: 320 }} aria-label="Usar una plantilla de propuesta" value="" onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">{templates.length ? "Usar una plantilla…" : "Aún no tienes plantillas de propuesta"}</option>
            {sortedTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.service ? ` · ${t.service}` : ""}</option>)}
          </select>
          <button className="btn small" disabled={!d.items.length} onClick={saveTemplate}>Guardar como plantilla</button>
        </div>
        <label className="f" htmlFor="q-title">Título</label>
        <input id="q-title" className="i" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Propuesta Google Ads" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div>
            <label className="f" htmlFor="q-billing">Cobro</label>
            <select id="q-billing" className="i" value={d.billing_type} onChange={(e) => set({ billing_type: e.target.value })}>
              {Object.entries(BILLING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="f" htmlFor="q-tax">IVA (%)</label>
            <input id="q-tax" className="i" type="number" min={0} value={d.tax_rate} onChange={(e) => set({ tax_rate: Number(e.target.value) })} />
          </div>
        </div>

        <label className="f">Partidas</label>
        {d.items.map((it, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 80px 120px auto", gap: 8, marginBottom: 8 }}>
            <input className="i" aria-label="Concepto" placeholder="Concepto" value={it.concept} onChange={(e) => setItem(i, { concept: e.target.value })} />
            <input className="i" aria-label="Cantidad" type="number" min={1} value={it.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} />
            <input className="i" aria-label="Precio" type="number" min={0} value={it.unit_price} onChange={(e) => setItem(i, { unit_price: Number(e.target.value) })} />
            <button className="btn ghost small" onClick={() => set({ items: d.items.filter((_, j) => j !== i) })}>Quitar</button>
          </div>
        ))}
        <button className="btn small" onClick={() => set({ items: [...d.items, { concept: "", quantity: 1, unit_price: 0 }] })}>+ Añadir partida</button>
        <p style={{ textAlign: "right", margin: "12px 0 0" }}>
          Subtotal {money(subtotal)} · IVA {money(tax)} · <b>Total {money(subtotal + tax)}{d.billing_type === "monthly" ? " / mes" : ""}</b>
        </p>
      </div>

      <div className="card block">
        <label className="f" htmlFor="q-body">Mensaje para el cliente</label>
        <textarea id="q-body" className="i" rows={4} value={d.body} onChange={(e) => set({ body: e.target.value })} />
        <label className="f" htmlFor="q-summary">Resumen</label>
        <input id="q-summary" className="i" value={d.summary} onChange={(e) => set({ summary: e.target.value })} />
        <label className="f" htmlFor="q-scope">Qué incluye</label>
        <textarea id="q-scope" className="i" rows={4} value={d.scope} onChange={(e) => set({ scope: e.target.value })} />
        <label className="f" htmlFor="q-assumptions">Condiciones</label>
        <textarea id="q-assumptions" className="i" rows={3} value={d.assumptions} onChange={(e) => set({ assumptions: e.target.value })} />
      </div>

      <div className="card block" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ marginRight: "auto" }}>
          {locked && !dirty ? `Versión ${version} ${status === "sent" ? `enviada el ${day(quote?.sent_at)}` : STATUS[status]?.[0].toLowerCase()}` : locked ? `Al enviar se guarda como versión ${version + 1}` : "Cuando esté lista, envíasela:"}
        </b>
        <button className="btn" disabled={Boolean(busy) || !lead.phone || status === "accepted"} onClick={() => send("whatsapp")}>{busy === "whatsapp" ? "Enviando…" : locked && !dirty ? "Reenviar por WhatsApp" : "Enviar por WhatsApp"}</button>
        <button className="btn primary" disabled={Boolean(busy) || !lead.email || status === "accepted"} onClick={() => send("email")}>{busy === "email" ? "Enviando…" : locked && !dirty ? "Reenviar por email" : "Enviar por email"}</button>
      </div>

      {versions.length > 1 && (
        <div className="card block">
          <h2>Versiones</h2>
          <table className="table">
            <thead><tr>{["Versión", "Título", "Importe", "Estado", "Enviada", "Firmada por"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} style={{ cursor: "default" }} aria-selected={v.id === quote?.id}>
                  <td>v{Number(v.version) || 1}{v.id === quote?.id ? " (actual)" : ""}</td>
                  <td>{v.title}</td>
                  <td>{money(Number(v.total))}</td>
                  <td><span className={`pill ${STATUS[v.status || "draft"]?.[1] || "p-muted"}`}>{STATUS[v.status || "draft"]?.[0] || v.status}</span></td>
                  <td>{day(v.sent_at) || "—"}</td>
                  <td>{v.acceptance?.name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
