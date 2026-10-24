"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import { BlockEditor, EmailPreview, SegmentEditor, type Block, type EmailOptions, type Segment } from "@/components/email-editor";

type Campaign = { id?: string; name: string; subject: string; preheader: string; from_name: string; blocks: Block[]; segment: Segment; status?: string; scheduled_at?: string | null; sent_at?: string | null; recipients_count?: number };
type Stats = { total: number; queued: number; sent: number; failed: number; opened: number; clicked: number; unsubscribed: number; recipients: { email: string; status: string; opened_at?: string | null; clicked_at?: string | null; unsubscribed_at?: string | null; error?: string | null }[] };

const EMPTY: Campaign = { name: "", subject: "", preheader: "", from_name: "", segment: {}, blocks: [{ type: "heading", text: "Hola {nombre|}" }, { type: "text", text: "" }] };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");

export default function CampaignPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { config, user } = useSession();
  const [id, setId] = useState(params.get("id") || "");
  const [c, setC] = useState<Campaign | null>(id ? null : { ...EMPTY, from_name: config?.brand?.name || "" });
  const [stats, setStats] = useState<Stats | null>(null);
  const [options, setOptions] = useState<EmailOptions | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [brief, setBrief] = useState("");
  const [testTo, setTestTo] = useState(user.email);
  const [when, setWhen] = useState("");

  useEffect(() => {
    api<EmailOptions>("/crm/email/options").then(setOptions).catch(() => setOptions({ tags: [], services: [], sources: [] }));
    if (!id) return;
    api<{ campaign: Campaign; stats: Stats | null }>(`/crm/email/campaigns/${id}`)
      .then((r) => { setC(r.campaign); setStats(r.stats); })
      .catch((e) => setMsg({ kind: "error", text: (e as Error).message }));
  }, [id]);

  if (!c) return msg ? <section className="page"><p className="alert error">{msg.text}</p></section> : <p className="loading">Cargando…</p>;
  const editable = !c.status || ["draft", "scheduled"].includes(c.status);
  const set = (part: Partial<Campaign>) => setC((prev) => (prev ? { ...prev, ...part } : prev));
  const stages = (config?.pipeline?.stages || []).filter((s) => s.is_active !== false);

  async function save(): Promise<string> {
    const r = await api<{ campaign: Campaign }>("/crm/email/campaigns", { method: "POST", body: { ...c, id: id || undefined } });
    if (!id && r.campaign.id) {
      setId(r.campaign.id);
      router.replace(`/email/campana?id=${r.campaign.id}`);
    }
    setC(r.campaign);
    return r.campaign.id as string;
  }

  async function act(kind: string, fn: () => Promise<string | void>) {
    setBusy(kind);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ kind: "ok", text });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy("");
  }

  const draftWithAi = () => act("ai", async () => {
    const r = await api<{ draft: { subject: string; preheader: string; blocks: Block[] } }>("/crm/email/draft", { method: "POST", body: { brief } });
    set({ subject: r.draft.subject, preheader: r.draft.preheader, blocks: r.draft.blocks, name: c.name || r.draft.subject });
    return "Borrador listo. Revísalo y ajústalo antes de enviar.";
  });

  const sendTest = () => act("test", async () => {
    const campaignId = await save();
    const r = await api<{ sent_to: string }>(`/crm/email/campaigns/${campaignId}/test`, { method: "POST", body: { email: testTo } });
    return `Prueba enviada a ${r.sent_to}.`;
  });

  const send = (scheduled: boolean) => act("send", async () => {
    if (scheduled && !when) throw new Error("Elige fecha y hora.");
    const label = scheduled ? `el ${new Date(when).toLocaleString("es-ES")}` : "ahora";
    if (!window.confirm(`¿Enviar «${c.subject}» ${label}? Una vez enviada no se puede deshacer.`)) return;
    const campaignId = await save();
    const r = await api<{ campaign: Campaign }>(`/crm/email/campaigns/${campaignId}/send`, { method: "POST", body: scheduled ? { scheduled_at: new Date(when).toISOString() } : {} });
    setC(r.campaign);
    return scheduled ? "Campaña programada." : "Enviando. Los envíos salen poco a poco; las estadísticas se actualizan solas.";
  });

  const cancel = () => act("cancel", async () => {
    const r = await api<{ campaign: Campaign }>(`/crm/email/campaigns/${id}/cancel`, { method: "POST", body: {} });
    setC(r.campaign);
    return "Programación cancelada. Vuelve a ser un borrador.";
  });

  return (
    <section className="page">
      <div className="head">
        <div>
          <p className="sub" style={{ margin: 0 }}><Link href="/email">← Email marketing</Link></p>
          <h1>{c.name || "Nueva campaña"}</h1>
          {c.status && c.status !== "draft" && <p className="sub">{c.status === "scheduled" ? `Programada para el ${new Date(c.scheduled_at || "").toLocaleString("es-ES")}` : c.status === "sending" ? "Enviando…" : `Enviada el ${new Date(c.sent_at || "").toLocaleString("es-ES")}`}</p>}
        </div>
        {editable && <button className="btn primary" disabled={Boolean(busy)} onClick={() => act("save", async () => { await save(); return "Guardada."; })}>{busy === "save" ? "Guardando…" : "Guardar borrador"}</button>}
      </div>
      {msg && <p className={`alert ${msg.kind}`} role="status" style={{ marginBottom: 14 }}>{msg.text}</p>}

      {stats && (
        <div className="card block">
          <h2>Resultados</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, margin: "8px 0 16px" }}>
            {[["Enviados", String(stats.sent)], ["Pendientes", String(stats.queued)], ["Aperturas", `${stats.opened} · ${pct(stats.opened, stats.sent)}`], ["Clics", `${stats.clicked} · ${pct(stats.clicked, stats.sent)}`], ["Bajas", String(stats.unsubscribed)], ["Fallidos", String(stats.failed)]].map(([k, v]) => (
              <div key={k} className="card" style={{ padding: 12 }}><div style={{ color: "var(--muted)", fontSize: 13 }}>{k}</div><b style={{ fontSize: 20 }}>{v}</b></div>
            ))}
          </div>
          <p className="hint">Las aperturas son aproximadas: algunos programas de correo (como Apple Mail) las cuentan siempre y otros nunca. Los clics son fiables.</p>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>{["Email", "Estado", "Abrió", "Clic", "Baja"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {stats.recipients.map((r) => (
                  <tr key={r.email} style={{ cursor: "default" }}>
                    <td>{r.email}</td>
                    <td title={r.error || ""}>{{ sent: "Enviado", queued: "Pendiente", failed: "Falló", skipped: "Omitido" }[r.status] || r.status}</td>
                    <td>{r.opened_at ? "Sí" : "—"}</td>
                    <td>{r.clicked_at ? "Sí" : "—"}</td>
                    <td>{r.unsubscribed_at ? "Sí" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editable && (
        <>
          <div className="card block">
            <h2>Redactar con IA</h2>
            <p className="hint">Cuéntale qué quieres comunicar y a quién. Tu asistente prepara el asunto y el contenido con los datos de tu negocio.</p>
            <textarea className="i" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Ej.: recordar a los clientes de SEO que en noviembre hacemos auditorías gratis, con botón para pedir cita." />
            <div style={{ marginTop: 8 }}><button className="btn" disabled={busy === "ai" || !brief.trim()} onClick={draftWithAi}>{busy === "ai" ? "Redactando…" : "Redactar"}</button></div>
          </div>

          <div className="assist">
            <div>
              <div className="card block">
                <h2>Email</h2>
                <label className="f" htmlFor="c-name">Nombre interno</label>
                <input id="c-name" className="i" value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder="Newsletter noviembre" />
                <label className="f" htmlFor="c-subject">Asunto</label>
                <input id="c-subject" className="i" value={c.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="{nombre|Hola}, tenemos algo para ti" />
                <label className="f" htmlFor="c-pre">Texto de vista previa</label>
                <input id="c-pre" className="i" value={c.preheader} onChange={(e) => set({ preheader: e.target.value })} placeholder="Lo que se lee junto al asunto en la bandeja" />
                <label className="f" htmlFor="c-from">Nombre del remitente</label>
                <input id="c-from" className="i" value={c.from_name} onChange={(e) => set({ from_name: e.target.value })} />
                <label className="f">Contenido</label>
                <BlockEditor blocks={c.blocks} onChange={(blocks) => set({ blocks })} />
              </div>
              <div className="card block">
                <h2>A quién</h2>
                <SegmentEditor segment={c.segment || {}} onChange={(segment) => set({ segment })} stages={stages} options={options} />
              </div>
              <div className="card block">
                <h2>Enviar</h2>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input className="i" style={{ maxWidth: 280 }} value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="Email para la prueba" />
                  <button className="btn" disabled={Boolean(busy)} onClick={sendTest}>{busy === "test" ? "Enviando…" : "Enviar prueba"}</button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
                  <button className="btn primary" disabled={Boolean(busy)} onClick={() => send(false)}>Enviar ahora</button>
                  <span style={{ color: "var(--muted)" }}>o programar:</span>
                  <input className="i" type="datetime-local" style={{ maxWidth: 230 }} value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Fecha y hora de envío" />
                  <button className="btn" disabled={Boolean(busy) || !when} onClick={() => send(true)}>Programar</button>
                  {c.status === "scheduled" && <button className="btn ghost" disabled={Boolean(busy)} onClick={cancel}>Cancelar programación</button>}
                </div>
              </div>
            </div>
            <EmailPreview subject={c.subject} preheader={c.preheader} blocks={c.blocks} />
          </div>
        </>
      )}
    </section>
  );
}
