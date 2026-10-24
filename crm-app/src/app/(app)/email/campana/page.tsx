"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import { EmailPreview, SegmentEditor, useDebounced, type Block, type EmailOptions, type Segment } from "@/components/email-editor";
import { EmailCanvas, TemplatePicker, type PickableTemplate } from "@/components/email-canvas";
import { STARTER_TEMPLATES } from "@/lib/email-templates";

type Campaign = { id?: string; name: string; subject: string; preheader: string; from_name: string; blocks: Block[]; segment: Segment; status?: string; scheduled_at?: string | null; sent_at?: string | null; recipients_count?: number };
type Stats = { total: number; queued: number; sent: number; failed: number; opened: number; clicked: number; unsubscribed: number; recipients: { email: string; status: string; opened_at?: string | null; clicked_at?: string | null; unsubscribed_at?: string | null; error?: string | null }[] };
export type Channels = { email: { connected: boolean; from: string; provider: string; daily_limit: number | null }; whatsapp: { connected: boolean; templates: number }; team: { email: string } };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");
const hasContent = (blocks: Block[]) => blocks.some((b) => (b.type === "text" || b.type === "heading") && (b.text || "").trim().length > 3);
const brokenButtons = (blocks: Block[]) => blocks.filter((b) => b.type === "button" && !/^https?:\/\/[^\s]+\.[^\s]+/.test(b.url || "")).length;

export default function CampaignPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { config, user } = useSession();
  const [id, setId] = useState(params.get("id") || "");
  const [c, setC] = useState<Campaign | null>(id ? null : { name: "", subject: "", preheader: "", from_name: config?.brand?.name || "", segment: {}, blocks: [] });
  const [stats, setStats] = useState<Stats | null>(null);
  const [options, setOptions] = useState<EmailOptions | null>(null);
  const [channels, setChannels] = useState<Channels | null>(null);
  const [saved, setSaved] = useState<PickableTemplate[]>([]);
  const [picking, setPicking] = useState(!id);
  const [view, setView] = useState<"desktop" | "mobile" | "real">("desktop");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [brief, setBrief] = useState("");
  const [showAi, setShowAi] = useState(false);
  const [testTo, setTestTo] = useState(user.email);
  const [when, setWhen] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const debouncedSegment = useDebounced(c?.segment || {}, 600);

  useEffect(() => {
    api<EmailOptions>("/crm/email/options").then(setOptions).catch(() => setOptions({ tags: [], services: [], sources: [] }));
    api<Channels>("/crm/email/channels").then(setChannels).catch(() => {});
    api<{ templates: PickableTemplate[] }>("/crm/email/templates").then((r) => setSaved(r.templates || [])).catch(() => {});
    if (!id) return;
    api<{ campaign: Campaign; stats: Stats | null }>(`/crm/email/campaigns/${id}`)
      .then((r) => { setC(r.campaign); setStats(r.stats); })
      .catch((e) => setMsg({ kind: "error", text: (e as Error).message }));
  }, [id]);

  useEffect(() => {
    api<{ count: number }>("/crm/email/audience", { method: "POST", body: { segment: debouncedSegment } }).then((r) => setCount(r.count)).catch(() => setCount(null));
  }, [debouncedSegment]);

  const templates = useMemo(() => [...STARTER_TEMPLATES, ...saved], [saved]);
  if (!c) return msg ? <section className="page"><p className="alert error">{msg.text}</p></section> : <p className="loading">Cargando…</p>;
  const editable = !c.status || ["draft", "scheduled"].includes(c.status);
  const set = (part: Partial<Campaign>) => setC((prev) => (prev ? { ...prev, ...part } : prev));
  const stages = (config?.pipeline?.stages || []).filter((s) => s.is_active !== false);
  const limit = channels?.email.daily_limit;

  const checks: { ok: boolean; warn?: boolean; text: string }[] = [
    { ok: Boolean(c.subject.trim()), text: c.subject.trim() ? "Asunto escrito" : "Falta el asunto" },
    { ok: hasContent(c.blocks), text: hasContent(c.blocks) ? "Contenido listo" : "Falta el contenido" },
    { ok: brokenButtons(c.blocks) === 0, text: brokenButtons(c.blocks) ? `${brokenButtons(c.blocks)} botón sin enlace` : "Botones con enlace" },
    { ok: (count || 0) > 0, text: count === null ? "Calculando destinatarios…" : `${count} destinatario${count === 1 ? "" : "s"}` },
    { ok: Boolean(channels?.email.connected), text: channels ? (channels.email.connected ? `Sale desde ${channels.email.from}` : "El email de salida no está conectado") : "Comprobando el canal…" },
    ...(limit && (count || 0) > limit ? [{ ok: false, warn: true, text: `Gmail permite unos ${limit} envíos al día: conecta un proveedor de envío para listas grandes` }] : []),
  ];
  const ready = checks.every((k) => k.ok || k.warn);

  async function save(): Promise<string> {
    const r = await api<{ campaign: Campaign }>("/crm/email/campaigns", { method: "POST", body: { ...c, name: c!.name || c!.subject || "Campaña sin nombre", id: id || undefined } });
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

  const pick = (t: PickableTemplate) => {
    set({ subject: c.subject || t.subject, preheader: c.preheader || t.preheader, blocks: t.blocks.map((b) => ({ ...b })) });
    setPicking(false);
  };

  const draftWithAi = () => act("ai", async () => {
    const r = await api<{ draft: { subject: string; preheader: string; blocks: Block[] } }>("/crm/email/draft", { method: "POST", body: { brief } });
    set({ subject: r.draft.subject, preheader: r.draft.preheader, blocks: r.draft.blocks });
    setShowAi(false);
    setPicking(false);
    return "Borrador listo: retócalo directamente sobre el email.";
  });

  const saveTemplate = () => act("tpl", async () => {
    const name = window.prompt("Nombre de la plantilla", c.name || c.subject || "Mi plantilla");
    if (!name) return;
    const r = await api<{ template: PickableTemplate }>("/crm/email/templates", { method: "POST", body: { name, subject: c.subject, preheader: c.preheader, blocks: c.blocks } });
    setSaved((prev) => [r.template, ...prev]);
    return "Plantilla guardada: la tienes en campañas y automatizaciones.";
  });

  const sendTest = () => act("test", async () => {
    const campaignId = await save();
    const r = await api<{ sent_to: string }>(`/crm/email/campaigns/${campaignId}/test`, { method: "POST", body: { email: testTo } });
    return `Prueba enviada a ${r.sent_to}.`;
  });

  const send = (scheduled: boolean) => act("send", async () => {
    if (scheduled && !when) throw new Error("Elige fecha y hora.");
    const label = scheduled ? `el ${new Date(when).toLocaleString("es-ES")}` : "ahora";
    if (!window.confirm(`¿Enviar «${c.subject}» a ${count} contacto${count === 1 ? "" : "s"} ${label}? No se puede deshacer.`)) return;
    const campaignId = await save();
    const r = await api<{ campaign: Campaign }>(`/crm/email/campaigns/${campaignId}/send`, { method: "POST", body: scheduled ? { scheduled_at: new Date(when).toISOString() } : {} });
    setC(r.campaign);
    return scheduled ? "Campaña programada." : "Enviando: salen poco a poco y las estadísticas se actualizan solas.";
  });

  const cancel = () => act("cancel", async () => {
    const r = await api<{ campaign: Campaign }>(`/crm/email/campaigns/${id}/cancel`, { method: "POST", body: {} });
    setC(r.campaign);
    return "Programación cancelada: vuelve a ser un borrador.";
  });

  const mailHead = (
    <div className="ec-mailhead">
      <label>De<input aria-label="Nombre del remitente" value={c.from_name} onChange={(e) => set({ from_name: e.target.value })} placeholder="Tu negocio" disabled={!editable} /></label>
      <label>Asunto<input className="ec-subject" aria-label="Asunto" value={c.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="{nombre|Hola}, tenemos algo para ti" disabled={!editable} /></label>
      <label>Vista previa<input aria-label="Texto de vista previa" value={c.preheader} onChange={(e) => set({ preheader: e.target.value })} placeholder="Lo que se lee junto al asunto en la bandeja" disabled={!editable} /></label>
    </div>
  );

  return (
    <section className="page">
      <div className="head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="sub" style={{ margin: 0 }}><Link href="/email">← Email marketing</Link></p>
          <input className="i" aria-label="Nombre de la campaña" style={{ fontSize: 22, fontWeight: 700, border: 0, padding: "2px 0", background: "transparent", maxWidth: 520 }} value={c.name} placeholder="Nombre de la campaña" onChange={(e) => set({ name: e.target.value })} disabled={!editable} />
          {c.status && c.status !== "draft" && (
            <p className="sub" style={{ margin: 0 }}>{c.status === "scheduled" ? `Programada para el ${new Date(c.scheduled_at || "").toLocaleString("es-ES")}` : c.status === "sending" ? "Enviando…" : `Enviada el ${new Date(c.sent_at || "").toLocaleString("es-ES")} a ${c.recipients_count} contactos`}</p>
          )}
        </div>
        {editable && <button className="btn" disabled={Boolean(busy)} onClick={() => act("save", async () => { await save(); return "Borrador guardado."; })}>{busy === "save" ? "Guardando…" : "Guardar borrador"}</button>}
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
          <p className="hint">Las aperturas son aproximadas (Apple Mail las cuenta siempre y otros programas nunca). Los clics son fiables.</p>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>{["Email", "Estado", "Abrió", "Clic", "Baja"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {stats.recipients.map((r) => (
                  <tr key={r.email} style={{ cursor: "default" }}>
                    <td>{r.email}</td>
                    <td title={r.error || ""}>{({ sent: "Enviado", queued: "Pendiente", failed: "Falló", skipped: "Omitido" } as Record<string, string>)[r.status] || r.status}</td>
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

      {editable && picking && <TemplatePicker templates={templates} onPick={pick} onClose={c.blocks.length ? () => setPicking(false) : undefined} />}

      {(!picking || !editable) && (
        <div className="builder">
          <div>
            {editable && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
                <button className="btn small" onClick={() => setPicking(true)}>Cambiar plantilla</button>
                <button className="btn small" onClick={() => setShowAi(!showAi)}>✨ Redactar con IA</button>
                <button className="btn small" disabled={busy === "tpl" || !c.blocks.length} onClick={saveTemplate}>Guardar como plantilla</button>
                <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <button className="chip" aria-pressed={view === "desktop"} onClick={() => setView("desktop")}>Ordenador</button>
                  <button className="chip" aria-pressed={view === "mobile"} onClick={() => setView("mobile")}>Móvil</button>
                  <button className="chip" aria-pressed={view === "real"} onClick={() => setView("real")}>Tal cual llega</button>
                </span>
              </div>
            )}
            {showAi && editable && (
              <div className="card" style={{ padding: 12, marginBottom: 10 }}>
                <textarea className="i" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Qué quieres contar y a quién. Ej.: invitar a los clientes de SEO a una auditoría gratis en noviembre, con botón para pedir cita." />
                <div style={{ marginTop: 8 }}><button className="btn primary small" disabled={busy === "ai" || !brief.trim()} onClick={draftWithAi}>{busy === "ai" ? "Redactando…" : "Redactar"}</button></div>
              </div>
            )}
            {view === "real" ? (
              <EmailPreview subject={c.subject} preheader={c.preheader} blocks={c.blocks} />
            ) : (
              <EmailCanvas blocks={c.blocks} onChange={(blocks) => editable && set({ blocks })} header={mailHead} mobile={view === "mobile"} />
            )}
          </div>

          {editable && (
            <aside className="builder-side">
              <div className="card block" style={{ marginBottom: 0 }}>
                <h2>{ready ? "Lista para enviar" : "Antes de enviar"}</h2>
                {checks.map((k, i) => (
                  <div key={i} className={`check ${k.ok ? "ok" : k.warn ? "warn" : ""}`}><i>{k.ok ? "✓" : "!"}</i>{k.text}</div>
                ))}
                {channels && !channels.email.connected && <Link className="btn small" style={{ marginTop: 8 }} href="/canales">Conectar el email</Link>}
              </div>
              <div className="card block" style={{ marginBottom: 0 }}>
                <h2>A quién</h2>
                <SegmentEditor segment={c.segment || {}} onChange={(segment) => set({ segment })} stages={stages} options={options} />
              </div>
              <div className="card block" style={{ marginBottom: 0 }}>
                <h2>Envío</h2>
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="i" value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="Email para la prueba" />
                  <button className="btn" disabled={Boolean(busy)} onClick={sendTest}>{busy === "test" ? "…" : "Prueba"}</button>
                </div>
                <button className="btn primary" style={{ width: "100%", marginTop: 10 }} disabled={Boolean(busy) || !ready} onClick={() => send(false)}>
                  {busy === "send" ? "Enviando…" : `Enviar ahora${count ? ` a ${count}` : ""}`}
                </button>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input className="i" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Fecha y hora de envío" />
                  <button className="btn" disabled={Boolean(busy) || !when || !ready} onClick={() => send(true)}>Programar</button>
                </div>
                {c.status === "scheduled" && <button className="btn ghost small" style={{ marginTop: 8 }} disabled={Boolean(busy)} onClick={cancel}>Cancelar programación</button>}
              </div>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
