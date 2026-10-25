"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/components/app-shell";
import { parseCsv } from "@/components/email-editor";
import { TemplateThumb, type PickableTemplate } from "@/components/email-canvas";
import { STARTER_TEMPLATES } from "@/lib/email-templates";

type Campaign = { id: string; name: string; subject: string; status: string; scheduled_at?: string | null; sent_at?: string | null; recipients_count: number; created_at: string };
type Automation = { id: string; name: string; status: string; trigger: { type: string; stage?: string; tag?: string; hours?: number }; steps: { type: string }[]; stats: { total: number; active: number; done: number; exited: number } };

const STATUS: Record<string, [string, string]> = {
  draft: ["Borrador", "p-muted"], scheduled: ["Programada", "p-warn"], sending: ["Enviando", "p-warn"], sent: ["Enviada", "p-good"], cancelled: ["Cancelada", "p-muted"],
  active: ["Activa", "p-good"], paused: ["Pausada", "p-muted"],
};
const TRIGGER: Record<string, string> = { lead_created: "Entra un contacto nuevo", stage: "Pasa a la etapa", tag: "Recibe la etiqueta", no_reply: "Sin contestar", quote_sent: "Propuesta sin responder" };
const CHANNEL_ICON: Record<string, string> = { email: "✉ Email", whatsapp: "◍ WhatsApp", notify_team: "🔔 Equipo" };
const day = (v?: string | null) => (v ? new Date(v).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export default function EmailPage() {
  const [tab, setTab] = useState<"campanas" | "automatizaciones" | "plantillas" | "audiencia">("automatizaciones");
  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Automatizaciones</h1>
          <p className="sub">Todo lo que se envía solo: bienvenidas, seguimientos por WhatsApp y email, avisos al equipo y campañas.</p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Automatizaciones">
        {([["automatizaciones", "Automatizaciones"], ["campanas", "Campañas"], ["plantillas", "Plantillas"], ["audiencia", "Audiencia y bajas"]] as const).map(([key, label]) => (
          <button key={key} role="tab" className="chip" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab === "campanas" && <Campaigns />}
      {tab === "automatizaciones" && <Automations />}
      {tab === "plantillas" && <Templates />}
      {tab === "audiencia" && <Audience />}
    </section>
  );
}

function useList<T>(path: string, key: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api<Record<string, T[]>>(path).then((r) => setItems(r[key] || [])).catch((e) => setError((e as Error).message));
  }, [path, key]);
  useEffect(load, [load]);
  return { items, error, load };
}

function Campaigns() {
  const router = useRouter();
  const { items, error } = useList<Campaign>("/crm/email/campaigns", "campaigns");
  if (error) return <p className="alert error">{error}</p>;
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px" }}>
        <b>Campañas</b>
        <Link className="btn primary small" href="/email/campana">+ Nueva campaña</Link>
      </div>
      {items === null ? <p className="loading">Cargando…</p> : items.length === 0 ? (
        <p className="empty">Aún no has enviado ninguna campaña. Crea la primera: novedades, una oferta o un recordatorio a tus contactos.</p>
      ) : (
        <table className="table">
          <thead><tr>{["Nombre", "Asunto", "Estado", "Destinatarios", "Fecha"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} onClick={() => router.push(`/email/campana?id=${c.id}`)}>
                <td><b>{c.name || "Sin nombre"}</b></td>
                <td>{c.subject || "—"}</td>
                <td><span className={`pill ${STATUS[c.status]?.[1] || "p-muted"}`}>{STATUS[c.status]?.[0] || c.status}</span></td>
                <td>{c.recipients_count || "—"}</td>
                <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>{day(c.sent_at || c.scheduled_at || c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Automations() {
  const router = useRouter();
  const { config } = useSession();
  const { items, error } = useList<Automation>("/crm/email/automations", "automations");
  // El primer WhatsApp a leads de formulario se configura en Canales (plantilla de Meta), pero se ve aquí con lo demás.
  const welcome = config?.integrations?.whatsapp;
  const welcomeOn = Boolean(welcome?.form_autocontact_enabled && welcome?.intro_template_name);
  if (error) return <p className="alert error">{error}</p>;
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px" }}>
        <b>Automatizaciones</b>
        <Link className="btn primary small" href="/email/automatizacion">+ Nueva automatización</Link>
      </div>
      {items === null ? <p className="loading">Cargando…</p> : (
        <table className="table">
          <thead><tr>{["Nombre", "Cuándo salta", "Por dónde escribe", "Estado", "En curso", "Terminados"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            <tr onClick={() => router.push("/canales")} title="Se cambia en Canales → Formularios">
              <td><b>Bienvenida a leads de formulario</b><div className="hint" style={{ margin: 0 }}>{welcome?.intro_template_name ? `Plantilla «${welcome.intro_template_name}» · se cambia en Canales` : "Elige la plantilla en Canales"}</div></td>
              <td>Llega un lead de formulario · al momento</td>
              <td style={{ whiteSpace: "nowrap" }}>{CHANNEL_ICON.whatsapp}</td>
              <td><span className={`pill ${welcomeOn ? "p-good" : "p-muted"}`}>{welcomeOn ? "Activa" : "Pausada"}</span></td>
              <td>—</td>
              <td>—</td>
            </tr>
            {items.map((a) => (
              <tr key={a.id} onClick={() => router.push(`/email/automatizacion?id=${a.id}`)}>
                <td><b>{a.name || "Sin nombre"}</b></td>
                <td>{TRIGGER[a.trigger?.type] || "—"}{a.trigger?.type === "no_reply" || a.trigger?.type === "quote_sent" ? ` ${a.trigger.hours || 24} h` : ""}{a.trigger?.stage ? ` «${a.trigger.stage}»` : ""}{a.trigger?.tag ? ` «${a.trigger.tag}»` : ""}</td>
                <td style={{ whiteSpace: "nowrap" }}>{[...new Set((a.steps || []).map((s) => s.type))].filter((t) => CHANNEL_ICON[t]).map((t) => CHANNEL_ICON[t]).join(" · ") || "—"}</td>
                <td><span className={`pill ${STATUS[a.status]?.[1] || "p-muted"}`}>{STATUS[a.status]?.[0] || a.status}</span></td>
                <td>{a.stats?.active ?? 0}</td>
                <td>{(a.stats?.done ?? 0) + (a.stats?.exited ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Audience() {
  const [csv, setCsv] = useState("");
  const [consent, setConsent] = useState(false);
  const [tags, setTags] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const { items: suppressions, load } = useList<{ email: string; reason: string; created_at: string }>("/crm/email/suppressions", "suppressions");
  const rows = csv.trim() ? parseCsv(csv) : [];
  const valid = rows.filter((r) => /@/.test(r.email || ""));

  async function importRows() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ created: number; updated: number; skipped: number }>("/crm/email/import", { method: "POST", body: { rows: valid, consent, tags: tags.split(",") } });
      setMsg({ kind: "ok", text: `Hecho: ${r.created} nuevos, ${r.updated} actualizados${r.skipped ? `, ${r.skipped} sin email válido` : ""}.` });
      setCsv("");
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }

  async function suppress() {
    try {
      await api("/crm/email/suppressions", { method: "POST", body: { email: manual } });
      setManual("");
      load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  const REASON: Record<string, string> = { unsubscribed: "Se dio de baja", bounced: "Rebotó", complained: "Lo marcó como spam", manual: "Añadido a mano" };

  return (
    <>
      <div className="card block">
        <h2>Importar contactos</h2>
        <p className="hint">Pega un CSV con cabecera (email, nombre, teléfono, empresa, etiquetas) o sube el archivo. Si el email ya existe, se completa el contacto.</p>
        <input type="file" accept=".csv,text/csv" aria-label="Archivo CSV" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
        <textarea className="i" rows={6} style={{ marginTop: 8 }} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"email;nombre;empresa;etiquetas\nana@ejemplo.com;Ana López;Clínica Sol;clientes 2025"} />
        <label className="f" htmlFor="imp-tags">Etiquetas para todos (separadas por comas)</label>
        <input id="imp-tags" className="i" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="feria 2026, newsletter" />
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12 }}>
          <input type="checkbox" style={{ marginTop: 3 }} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Estos contactos me han dado su <b>consentimiento</b> para recibir emails comerciales (o ya son clientes míos). <span style={{ color: "var(--muted)" }}>Sin esto se importan, pero no recibirán campañas.</span></span>
        </label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
          <button className="btn primary" disabled={busy || !valid.length} onClick={importRows}>{busy ? "Importando…" : `Importar ${valid.length || ""} contacto${valid.length === 1 ? "" : "s"}`}</button>
          {rows.length > valid.length && <span className="hint" style={{ margin: 0 }}>{rows.length - valid.length} filas sin email válido</span>}
        </div>
        {msg && <p className={`alert ${msg.kind}`} role="status" style={{ marginTop: 10 }}>{msg.text}</p>}
      </div>

      <div className="card block">
        <h2>Bajas</h2>
        <p className="hint">Quien se da de baja, rebota o lo pide no vuelve a recibir campañas, aunque lo importes de nuevo.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input className="i" style={{ maxWidth: 320 }} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="email@ejemplo.com" aria-label="Email para dar de baja" />
          <button className="btn" disabled={!/@/.test(manual)} onClick={suppress}>Dar de baja</button>
        </div>
        {suppressions === null ? <p className="loading">Cargando…</p> : suppressions.length === 0 ? <p className="empty">Nadie se ha dado de baja.</p> : (
          <table className="table">
            <thead><tr>{["Email", "Motivo", "Fecha"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{suppressions.map((s) => <tr key={s.email}><td>{s.email}</td><td>{REASON[s.reason] || s.reason}</td><td style={{ color: "var(--muted)" }}>{day(s.created_at)}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Templates() {
  const { items, error, load } = useList<PickableTemplate>("/crm/email/templates", "templates");
  const remove = async (t: PickableTemplate) => {
    if (!window.confirm(`¿Borrar la plantilla «${t.name}»? Las campañas que ya la usaron no cambian.`)) return;
    await api(`/crm/email/templates/${t.id}`, { method: "DELETE" });
    load();
  };
  return (
    <>
      <div className="card block">
        <h2>Tus plantillas</h2>
        <p className="hint">Guárdalas desde cualquier campaña con «Guardar como plantilla». Sirven para campañas y para los emails de las automatizaciones.</p>
        {error && <p className="alert error">{error}</p>}
        {items === null ? <p className="loading">Cargando…</p> : items.length === 0 ? <p className="empty">Aún no has guardado ninguna.</p> : (
          <div className="ec-gallery">
            {items.map((t) => (
              <div key={t.id} className="ec-card" style={{ cursor: "default" }}>
                <TemplateThumb blocks={t.blocks} />
                <b>{t.name}</b>
                <span>{t.subject || "Sin asunto"}</span>
                <button className="btn ghost small" onClick={() => remove(t)}>Borrar</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card block">
        <h2>Modelos de partida</h2>
        <p className="hint">Disponibles al crear cualquier campaña o email de automatización.</p>
        <div className="ec-gallery">
          {STARTER_TEMPLATES.filter((t) => t.id !== "builtin-blank").map((t) => (
            <Link key={t.id} href="/email/campana" className="ec-card" style={{ textDecoration: "none" }}>
              <TemplateThumb blocks={t.blocks} />
              <b>{t.name}</b>
              <span>{t.description}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
