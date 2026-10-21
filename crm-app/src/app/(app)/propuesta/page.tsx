"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import { leadName } from "@/lib/format";
import type { Offer } from "@/lib/types";

type Item = { concept: string; quantity: number; unit_price: number };
type Quote = {
  id?: string;
  title?: string;
  status?: string;
  currency?: string;
  sent_at?: string | null;
  content_json?: {
    body?: string; summary?: string; scope?: string; assumptions?: string;
    billing_type?: string; billing_label?: string; tax_rate?: number; items?: Item[];
  };
};
type Draft = {
  title: string; billing_type: string; billing_label: string; tax_rate: number;
  summary: string; scope: string; body: string; assumptions: string; items: Item[];
};

const STATUS: Record<string, string> = { draft: "Borrador", sent: "Enviada", accepted: "Aceptada", rejected: "Rechazada" };
const BILLING: Record<string, string> = { monthly: "Mensual", one_time: "Pago único", custom: "Otro" };
const money = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

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
  const [d, setD] = useState<Draft>(fromQuote(null));
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!leadId) return;
    api<{ quote: Quote | null }>(`/crm/leads/${leadId}/quote`)
      .then((r) => { setQuote(r.quote); setD(fromQuote(r.quote)); })
      .catch((err) => { setQuote(null); setMsg({ kind: "error", text: (err as Error).message }); });
  }, [leadId]);

  if (!leadId) return <section className="page"><p className="empty">Abre la propuesta desde la ficha de un contacto en Conversaciones.</p></section>;
  if (quote === undefined || !leads) return <p className="loading">Cargando…</p>;

  const set = (part: Partial<Draft>) => setD((prev) => ({ ...prev, ...part }));
  const setItem = (i: number, part: Partial<Item>) => set({ items: d.items.map((it, j) => (j === i ? { ...it, ...part } : it)) });
  const subtotal = d.items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
  const tax = subtotal * ((Number(d.tax_rate) || 0) / 100);
  const status = quote?.status || "draft";
  const sent = status !== "draft";

  // Primer borrador con lo que ya sabemos del lead y el precio configurado en "Qué vendes".
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

  async function save(): Promise<boolean> {
    setBusy("save");
    setMsg(null);
    try {
      const r = await api<{ quote: Quote }>(`/crm/leads/${leadId}/quote`, {
        method: "POST",
        body: { ...d, status, subtotal, tax, total: subtotal + tax, currency: "EUR", items: d.items.filter((it) => it.concept.trim()) },
      });
      setQuote(r.quote);
      setMsg({ kind: "ok", text: "Propuesta guardada." });
      setBusy("");
      return true;
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
      setBusy("");
      return false;
    }
  }

  async function send(via: "email" | "whatsapp") {
    const to = via === "email" ? lead?.email : lead?.phone;
    if (!to) return setMsg({ kind: "error", text: via === "email" ? "Este contacto no tiene email." : "Este contacto no tiene teléfono." });
    if (!window.confirm(`¿Enviar la propuesta por ${via === "email" ? "email" : "WhatsApp"} a ${to}?`)) return;
    if (!(await save())) return;
    setBusy(via);
    try {
      const r = await api<{ quote: Quote }>(`/crm/leads/${leadId}/quote/send`, { method: "POST", body: { via } });
      if (r.quote) setQuote(r.quote);
      await reloadLeads();
      setMsg({ kind: "ok", text: `Propuesta enviada por ${via === "email" ? "email" : "WhatsApp"}.` });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy("");
  }

  const preview = `/crm/quotes/${leadId}/preview?account_id=${encodeURIComponent(account.id)}`;

  return (
    <section className="page">
      <div className="head">
        <div>
          <p className="sub" style={{ margin: 0 }}><Link href={lead ? `/conversaciones?c=${lead.conversation_id}` : "/conversaciones"}>← {lead ? leadName(lead) : "Volver"}</Link></p>
          <h1>Propuesta</h1>
          <p className="sub">{lead?.interest_service || "Sin servicio"} · <span className={`pill ${sent ? "p-good" : "p-muted"}`}>{STATUS[status] || status}</span></p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!d.items.length && !quote && <button className="btn" onClick={autofill}>Rellenar con sus datos</button>}
          {quote?.id && <a className="btn" href={preview} target="_blank" rel="noopener noreferrer">Ver como el cliente</a>}
          <button className="btn primary" disabled={Boolean(busy)} onClick={save}>{busy === "save" ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
      {msg && <p className={`alert ${msg.kind}`} role="status">{msg.text}</p>}

      <div className="card block">
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
        <b style={{ marginRight: "auto" }}>{sent && quote?.sent_at ? `Enviada el ${new Date(quote.sent_at).toLocaleDateString("es-ES")}` : "Cuando esté lista, envíasela:"}</b>
        <button className="btn" disabled={Boolean(busy) || !lead?.phone} onClick={() => send("whatsapp")}>{busy === "whatsapp" ? "Enviando…" : "Enviar por WhatsApp"}</button>
        <button className="btn primary" disabled={Boolean(busy) || !lead?.email} onClick={() => send("email")}>{busy === "email" ? "Enviando…" : "Enviar por email"}</button>
      </div>
    </section>
  );
}
