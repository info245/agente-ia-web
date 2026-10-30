"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { QuoteBlocksEditor } from "@/components/quote-blocks-editor";
import type { QuoteTemplate } from "@/lib/types";

type Row = {
  id: string; lead_id: string; title: string; status: string; version: number; total: number; billing_type: string;
  sent_at: string | null; created_at: string; updated_at: string; signed_by: string | null;
  leads: { name?: string; email?: string; phone?: string; interest_service?: string; company_name?: string } | null;
};

const STATUS: Record<string, [string, string]> = { draft: ["Borrador", "p-muted"], sent: ["Enviada", "p-warn"], accepted: ["Aceptada", "p-good"], rejected: ["Rechazada", "p-muted"] };
const money = (n: number) => (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "—");
const BLANK: QuoteTemplate = { name: "", service: "", title: "", billing_type: "monthly", tax_rate: 21, items: [{ concept: "", quantity: 1, unit_price: 0 }], summary: "", scope: "", body: "Hola {nombre}, te compartimos la propuesta de {servicio} para {empresa}.", assumptions: "" };

export default function PropuestasPage() {
  const [tab, setTab] = useState<"lista" | "plantillas">("lista");
  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Propuestas</h1>
          <p className="sub">Todas tus propuestas, en qué punto está cada una y las plantillas por servicio.</p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Propuestas">
        <button role="tab" className="chip" aria-selected={tab === "lista"} onClick={() => setTab("lista")}>Propuestas</button>
        <button role="tab" className="chip" aria-selected={tab === "plantillas"} onClick={() => setTab("plantillas")}>Plantillas por servicio</button>
      </div>
      {tab === "lista" ? <List /> : <Templates />}
    </section>
  );
}

function List() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("");
  const [allVersions, setAllVersions] = useState(false);

  useEffect(() => {
    api<{ quotes: Row[] }>("/crm/quotes").then((r) => setRows(r.quotes)).catch((e) => setError((e as Error).message));
  }, []);

  // Por defecto, una fila por contacto (su última versión).
  const visible = useMemo(() => {
    const seen = new Set<string>();
    return (rows || [])
      .filter((r) => (allVersions ? true : !seen.has(r.lead_id) && Boolean(seen.add(r.lead_id))))
      .filter((r) => !filter || r.status === filter);
  }, [rows, filter, allVersions]);

  if (error) return <p className="alert error">{error}</p>;
  if (!rows) return <p className="loading">Cargando…</p>;

  const latest = new Map<string, Row>();
  for (const r of rows) if (!latest.has(r.lead_id)) latest.set(r.lead_id, r);
  const current = [...latest.values()];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const pending = current.filter((r) => r.status === "sent");
  const wonMonth = current.filter((r) => r.status === "accepted" && Date.parse(r.updated_at) >= monthStart);
  const answered = current.filter((r) => r.status === "accepted" || r.status === "rejected");
  const rate = answered.length ? Math.round((answered.filter((r) => r.status === "accepted").length / answered.length) * 100) : null;
  const sum = (list: Row[]) => list.reduce((s, r) => s + (Number(r.total) || 0), 0);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 14 }}>
        {[
          ["Pendientes de respuesta", `${pending.length} · ${money(sum(pending))}`],
          ["Aceptadas este mes", `${wonMonth.length} · ${money(sum(wonMonth))}`],
          ["Tasa de aceptación", rate === null ? "—" : `${rate} %`],
          ["Borradores", String(current.filter((r) => r.status === "draft").length)],
        ].map(([k, v]) => (
          <div key={k} className="card" style={{ padding: 14 }}><div style={{ color: "var(--muted)", fontSize: 13 }}>{k}</div><b style={{ fontSize: 20 }}>{v}</b></div>
        ))}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "12px 14px" }}>
          {[["", "Todas"], ["draft", "Borradores"], ["sent", "Enviadas"], ["accepted", "Aceptadas"], ["rejected", "Rechazadas"]].map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
          <label style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={allVersions} onChange={(e) => setAllVersions(e.target.checked)} /> Ver todas las versiones
          </label>
        </div>
        {visible.length === 0 ? <p className="empty">No hay propuestas con este filtro. Se crean desde la ficha de cada contacto.</p> : (
          <table className="table">
            <thead><tr>{["Contacto", "Propuesta", "Versión", "Importe", "Estado", "Enviada", "Firmada por"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} onClick={() => router.push(`/propuesta?lead=${r.lead_id}`)}>
                  <td><b>{r.leads?.name || r.leads?.email || "Contacto"}</b><div style={{ color: "var(--muted)", fontSize: 12 }}>{r.leads?.company_name || r.leads?.interest_service || ""}</div></td>
                  <td>{r.title}</td>
                  <td>v{r.version || 1}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{money(r.total)}{r.billing_type === "monthly" ? " /mes" : ""}</td>
                  <td><span className={`pill ${STATUS[r.status]?.[1] || "p-muted"}`}>{STATUS[r.status]?.[0] || r.status}</span></td>
                  <td style={{ color: "var(--muted)" }}>{day(r.sent_at)}</td>
                  <td>{r.signed_by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Templates() {
  const [items, setItems] = useState<QuoteTemplate[] | null>(null);
  const [editing, setEditing] = useState<QuoteTemplate | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const load = useCallback(() => {
    api<{ templates: QuoteTemplate[] }>("/crm/quote-templates").then((r) => setItems(r.templates)).catch((e) => setMsg({ kind: "error", text: (e as Error).message }));
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!editing) return;
    try {
      await api("/crm/quote-templates", { method: "POST", body: { ...editing, items: editing.items.filter((i) => i.concept.trim()) } });
      setEditing(null);
      setMsg({ kind: "ok", text: "Plantilla guardada." });
      load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  };
  // Documento de Claude/ChatGPT (PDF, texto, Markdown o HTML) → borrador de plantilla para revisar antes de guardar.
  const importDoc = async (file?: File) => {
    if (!importText.trim() && !file) return;
    setImporting(true);
    setMsg(null);
    try {
      const body: Record<string, string> = { text: importText };
      if (file) {
        if (file.size > 3.5 * 1024 * 1024) throw new Error("El archivo no puede pasar de 3,5 MB.");
        body.file_name = file.name;
        body.data_url = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(file);
        });
      }
      const r = await api<{ template: QuoteTemplate }>("/crm/quote-templates/import", { method: "POST", body });
      setImportText("");
      setEditing(r.template);
      setMsg({ kind: "ok", text: "Plantilla importada. Revísala y pulsa «Guardar plantilla»." });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setImporting(false);
  };
  const remove = async (t: QuoteTemplate) => {
    if (!window.confirm(`¿Borrar la plantilla «${t.name}»? Las propuestas hechas con ella no cambian.`)) return;
    await api(`/crm/quote-templates/${t.id}`, { method: "DELETE" });
    load();
  };

  if (editing) {
    const e = editing;
    const set = (part: Partial<QuoteTemplate>) => setEditing({ ...e, ...part });
    const setItem = (i: number, part: Partial<QuoteTemplate["items"][number]>) => set({ items: e.items.map((it, j) => (j === i ? { ...it, ...part } : it)) });
    const subtotal = e.items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
    return (
      <div className="card block">
        <h2>{e.id ? "Editar plantilla" : "Nueva plantilla"}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <div><label className="f" htmlFor="t-name">Nombre</label><input id="t-name" className="i" value={e.name} onChange={(x) => set({ name: x.target.value })} placeholder="Google Ads mensual" /></div>
          <div><label className="f" htmlFor="t-svc">Servicio</label><input id="t-svc" className="i" value={e.service} onChange={(x) => set({ service: x.target.value })} placeholder="Google Ads" /></div>
          <div><label className="f" htmlFor="t-bill">Cobro</label>
            <select id="t-bill" className="i" value={e.billing_type} onChange={(x) => set({ billing_type: x.target.value })}><option value="monthly">Mensual</option><option value="one_time">Pago único</option><option value="custom">Otro</option></select>
          </div>
          <div><label className="f" htmlFor="t-tax">IVA (%)</label><input id="t-tax" className="i" type="number" min={0} value={e.tax_rate} onChange={(x) => set({ tax_rate: Number(x.target.value) })} /></div>
        </div>
        <label className="f" htmlFor="t-title">Título de la propuesta</label>
        <input id="t-title" className="i" value={e.title} onChange={(x) => set({ title: x.target.value })} placeholder="Propuesta {servicio} para {empresa}" />
        <label className="f">Partidas</label>
        {e.items.map((it, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 80px 120px auto", gap: 8, marginBottom: 8 }}>
            <input className="i" aria-label="Concepto" value={it.concept} onChange={(x) => setItem(i, { concept: x.target.value })} placeholder="Concepto" />
            <input className="i" aria-label="Cantidad" type="number" min={1} value={it.quantity} onChange={(x) => setItem(i, { quantity: Number(x.target.value) })} />
            <input className="i" aria-label="Precio" type="number" min={0} value={it.unit_price} onChange={(x) => setItem(i, { unit_price: Number(x.target.value) })} />
            <button className="btn ghost small" onClick={() => set({ items: e.items.filter((_, j) => j !== i) })}>Quitar</button>
          </div>
        ))}
        <button className="btn small" onClick={() => set({ items: [...e.items, { concept: "", quantity: 1, unit_price: 0 }] })}>+ Añadir partida</button>
        <p style={{ textAlign: "right", margin: "10px 0 0" }}>Subtotal {money(subtotal)} · <b>Total {money(subtotal * (1 + (Number(e.tax_rate) || 0) / 100))}{e.billing_type === "monthly" ? " / mes" : ""}</b></p>
        <label className="f">Bloques (tablas, packs, fases, imágenes…)</label>
        <QuoteBlocksEditor blocks={e.blocks || []} onChange={(blocks) => set({ blocks })} />
        <label className="f" htmlFor="t-body">Mensaje para el cliente</label>
        <textarea id="t-body" className="i" rows={3} value={e.body} onChange={(x) => set({ body: x.target.value })} />
        <label className="f" htmlFor="t-scope">Qué incluye</label>
        <textarea id="t-scope" className="i" rows={4} value={e.scope} onChange={(x) => set({ scope: x.target.value })} />
        <label className="f" htmlFor="t-ass">Condiciones</label>
        <textarea id="t-ass" className="i" rows={3} value={e.assumptions} onChange={(x) => set({ assumptions: x.target.value })} />
        <p className="hint" style={{ marginTop: 8 }}>En los textos puedes usar <b>{"{nombre}"}</b>, <b>{"{empresa}"}</b> y <b>{"{servicio}"}</b>: se rellenan al usarla en una propuesta.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn primary" disabled={!e.name.trim()} onClick={save}>Guardar plantilla</button>
          <button className="btn ghost" onClick={() => setEditing(null)}>Cancelar</button>
        </div>
        {msg && <p className={`alert ${msg.kind}`} style={{ marginTop: 10 }}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <div className="card block">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Plantillas por servicio</h2>
        <button className="btn primary small" onClick={() => setEditing({ ...BLANK, items: BLANK.items.map((i) => ({ ...i })) })}>+ Nueva plantilla</button>
      </div>
      <p className="hint">Partidas, precios, IVA y textos ya preparados. En cada propuesta eliges una y se rellena sola con los datos del contacto.</p>
      <details style={{ margin: "10px 0" }}>
        <summary><b>Importar desde Claude, ChatGPT o un documento</b></summary>
        <p className="hint" style={{ marginTop: 8 }}>
          Pídele a Claude o ChatGPT tu propuesta tipo (con packs, fases, tablas…) y pega aquí el texto, o sube el PDF, Markdown o HTML que te genere. La IA la convierte en una plantilla con bloques y tu marca; la revisas antes de guardarla.
        </p>
        <textarea className="i" rows={5} aria-label="Texto de la propuesta" placeholder="Pega aquí el texto de la propuesta…" value={importText} onChange={(x) => setImportText(x.target.value)} disabled={importing} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          <button className="btn primary small" disabled={importing || !importText.trim()} onClick={() => importDoc()}>{importing ? "Convirtiendo…" : "Convertir texto"}</button>
          <label className="btn small" style={{ cursor: importing ? "wait" : "pointer" }}>
            Subir PDF, MD o HTML
            <input type="file" hidden accept=".pdf,.txt,.md,.markdown,.html,.htm" disabled={importing} onChange={(x) => { importDoc(x.target.files?.[0]); x.target.value = ""; }} />
          </label>
        </div>
      </details>
      {msg && <p className={`alert ${msg.kind}`}>{msg.text}</p>}
      {items === null ? <p className="loading">Cargando…</p> : items.length === 0 ? <p className="empty">Aún no tienes plantillas. Crea una por cada servicio que vendas (por ejemplo, «Google Ads mensual» o «Auditoría SEO»).</p> : (
        <table className="table">
          <thead><tr>{["Nombre", "Servicio", "Importe", "Partidas", ""].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map((t) => {
              const subtotal = t.items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0);
              return (
                <tr key={t.id} onClick={() => setEditing({ ...t, items: t.items.map((i) => ({ ...i })) })}>
                  <td><b>{t.name}</b></td>
                  <td>{t.service || "—"}</td>
                  <td>{money(subtotal * (1 + (Number(t.tax_rate) || 0) / 100))}{t.billing_type === "monthly" ? " /mes" : ""}</td>
                  <td>{t.items.length}</td>
                  <td onClick={(x) => x.stopPropagation()}><button className="btn ghost small" onClick={() => remove(t)}>Borrar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
