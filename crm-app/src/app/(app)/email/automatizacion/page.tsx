"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import type { EmailOptions } from "@/components/email-editor";
import { EmailCanvas, type PickableTemplate } from "@/components/email-canvas";
import { STARTER_TEMPLATES } from "@/lib/email-templates";
import { hasWaitBefore, insertNode, newId, nodeById, removeNode, updateNode, type Edge, type FlowNode } from "@/lib/automation-graph";
import type { WhatsAppTemplate } from "@/lib/types";
import type { Channels } from "../campana/page";

type Trigger = { type: "lead_created" | "stage" | "tag"; stage?: string; tag?: string; segment?: { services?: string[] } };
type Automation = { id?: string; name: string; status?: string; trigger: Trigger; steps: FlowNode[] };
type Stats = {
  total: number; active: number; done: number; exited: number;
  at: Record<string, number>;
  email: Record<string, { sent: number; opened: number; clicked: number }>;
  recent: { name: string; step_id: string; status: string; exit_reason?: string | null; next_at?: string; updated_at: string }[];
  last_entry_at: string | null;
};

const KIND: Record<FlowNode["type"], { label: string; ico: string; bg: string; fg: string }> = {
  email: { label: "Email", ico: "✉", bg: "var(--accent-soft)", fg: "var(--accent)" },
  whatsapp: { label: "WhatsApp", ico: "◍", bg: "var(--good-soft)", fg: "var(--wa)" },
  notify_team: { label: "Avisar al equipo", ico: "🔔", bg: "var(--warn-soft)", fg: "var(--warn)" },
  wait: { label: "Esperar", ico: "⏱", bg: "var(--surface-2)", fg: "var(--fg)" },
  condition: { label: "Condición", ico: "⑂", bg: "#efe6ff", fg: "#6d41f3" },
  add_tag: { label: "Añadir etiqueta", ico: "#", bg: "var(--surface-2)", fg: "var(--fg)" },
  set_stage: { label: "Cambiar etapa", ico: "→", bg: "var(--surface-2)", fg: "var(--fg)" },
};
const ADD_ORDER: FlowNode["type"][] = ["email", "whatsapp", "wait", "condition", "notify_team", "add_tag", "set_stage"];
const CHECK_LABEL: Record<string, string> = { opened_last: "¿Abrió el email anterior?", clicked_last: "¿Hizo clic en el email anterior?", has_tag: "¿Tiene la etiqueta", stage: "¿Está en la etapa" };
const TRIGGER_LABEL: Record<Trigger["type"], string> = { lead_created: "Entra un contacto nuevo", stage: "Un contacto pasa a la etapa", tag: "Un contacto recibe la etiqueta" };
const ago = (v?: string | null) => {
  if (!v) return "";
  const min = Math.round((Date.now() - Date.parse(v)) / 60000);
  return min < 60 ? `hace ${Math.max(1, min)} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} días`;
};

function blank(type: FlowNode["type"]): FlowNode {
  const id = newId();
  if (type === "email") return { id, type, subject: STARTER_TEMPLATES[1].subject, preheader: STARTER_TEMPLATES[1].preheader, blocks: STARTER_TEMPLATES[1].blocks.map((b) => ({ ...b })) };
  if (type === "wait") return { id, type, amount: 2, unit: "days" };
  if (type === "whatsapp") return { id, type, template_name: "", language: "es", params: [] };
  if (type === "condition") return { id, type, check: "opened_last" };
  if (type === "notify_team") return { id, type, message: "{nombre} necesita que le llaméis" };
  if (type === "add_tag") return { id, type, tag: "" };
  return { id, type, stage: "" };
}

export default function AutomationPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { config } = useSession();
  const [id, setId] = useState(params.get("id") || "");
  const [a, setA] = useState<Automation | null>(id ? null : { name: "", trigger: { type: "lead_created" }, steps: [] });
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<string>("trigger");
  const [adding, setAdding] = useState<string>("");
  const [options, setOptions] = useState<EmailOptions | null>(null);
  const [channels, setChannels] = useState<Channels | null>(null);
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>([]);
  const [saved, setSaved] = useState<PickableTemplate[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  // El refresco automático de datos en directo no pisa lo que se está editando.
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  const stages = (config?.pipeline?.stages || []).filter((s) => s.is_active !== false);
  const stageLabel = (k?: string) => stages.find((s) => s.key === k)?.label || k || "…";

  useEffect(() => {
    api<EmailOptions>("/crm/email/options").then(setOptions).catch(() => {});
    api<Channels>("/crm/email/channels").then(setChannels).catch(() => {});
    api<{ templates: WhatsAppTemplate[] }>("/crm/whatsapp/templates").then((r) => setWaTemplates(r.templates.filter((t) => t.sendable))).catch(() => {});
    api<{ templates: PickableTemplate[] }>("/crm/email/templates").then((r) => setSaved(r.templates || [])).catch(() => {});
    if (!id) return;
    const load = () =>
      api<{ automation: Automation; stats: Stats }>(`/crm/email/automations/${id}`)
        .then((r) => { setA((prev) => (prev && dirtyRef.current ? prev : r.automation)); setStats(r.stats); })
        .catch((e) => setMsg({ kind: "error", text: (e as Error).message }));
    load();
    const timer = setInterval(() => !document.hidden && load(), 30000);
    return () => clearInterval(timer);
  }, [id]);

  if (!a) return msg ? <section className="page"><p className="alert error">{msg.text}</p></section> : <p className="loading">Cargando…</p>;
  const change = (part: Partial<Automation>) => { setA((prev) => (prev ? { ...prev, ...part } : prev)); setDirty(true); };
  const setSteps = (steps: FlowNode[]) => change({ steps });
  const node = selected !== "trigger" ? nodeById(a.steps, selected) : null;
  const edit = (part: Partial<FlowNode>) => node && setSteps(updateNode(a.steps, node.id, part));
  const waTemplate = (name?: string) => waTemplates.find((t) => t.name === name);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ kind: "ok", text: await fn() });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }
  const save = async () => {
    const r = await api<{ automation: Automation }>("/crm/email/automations", { method: "POST", body: { ...a, name: a.name || "Automatización sin nombre", id: id || undefined } });
    if (!id && r.automation.id) {
      setId(r.automation.id);
      router.replace(`/email/automatizacion?id=${r.automation.id}`);
    }
    setDirty(false);
    return r.automation.id as string;
  };
  const setStatus = (status: "active" | "paused") => run(async () => {
    if (status === "active" && !window.confirm("Al activarla entrarán los contactos que cumplan el disparador desde ahora (no los anteriores). ¿Activar?")) return "Sin cambios.";
    const automationId = await save();
    const r = await api<{ automation: Automation }>(`/crm/email/automations/${automationId}/status`, { method: "POST", body: { status } });
    setA((prev) => (prev ? { ...prev, status: r.automation.status } : prev));
    return status === "active" ? "Activada: ya está escuchando." : "Pausada: quien estaba dentro espera a que la reactives.";
  });

  const add = (edge: Edge, type: FlowNode["type"]) => {
    const created = blank(type);
    setSteps(insertNode(a.steps, edge, created));
    setSelected(created.id);
    setAdding("");
  };

  // Avisos de cada nodo: lo que impediría que funcione.
  const problem = (n: FlowNode): string => {
    if (n.type === "email" && (!n.subject?.trim() || !(n.blocks || []).length)) return "Falta asunto o contenido";
    if (n.type === "email" && channels && !channels.email.connected) return "El email de salida no está conectado";
    if (n.type === "whatsapp" && channels && !channels.whatsapp.connected) return "WhatsApp no está conectado";
    if (n.type === "whatsapp" && !n.template_name) return "Elige una plantilla";
    if (n.type === "condition" && (n.check === "opened_last" || n.check === "clicked_last") && !hasWaitBefore(a.steps, n.id)) return "Pon una espera antes: si no, casi nunca se cumple";
    if (n.type === "add_tag" && !n.tag) return "Falta la etiqueta";
    if (n.type === "set_stage" && !n.stage) return "Falta la etapa";
    if (n.type === "notify_team" && channels && !channels.team.email) return "Sin email de avisos: solo llegará al móvil";
    return "";
  };

  const summary = (n: FlowNode): string => {
    if (n.type === "email") return n.subject ? `«${n.subject}»` : "Sin asunto";
    if (n.type === "wait") return `${n.amount} ${n.unit === "hours" ? "horas" : "días"}`;
    if (n.type === "whatsapp") return n.template_name ? `Plantilla «${n.template_name.replace(/_/g, " ")}»` : "Sin plantilla";
    if (n.type === "condition") return n.check === "has_tag" ? `${CHECK_LABEL.has_tag} «${n.value || "…"}»?` : n.check === "stage" ? `${CHECK_LABEL.stage} «${stageLabel(n.value)}»?` : CHECK_LABEL[n.check || "opened_last"];
    if (n.type === "notify_team") return n.message || "Aviso";
    if (n.type === "add_tag") return n.tag ? `#${n.tag}` : "Sin etiqueta";
    return n.stage ? `A «${stageLabel(n.stage)}»` : "Sin etapa";
  };

  const AddPoint = ({ edge }: { edge: Edge }) => {
    const key = `${edge.from}:${edge.key}`;
    return (
      <>
        <div className="edge" />
        <button type="button" className="add" aria-label="Añadir paso aquí" onClick={() => setAdding(adding === key ? "" : key)}>+</button>
        {adding === key && (
          <div className="add-menu">
            {ADD_ORDER.map((t) => (
              <button key={t} type="button" className="btn small" disabled={t === "whatsapp" && channels !== null && !channels.whatsapp.connected} title={t === "whatsapp" && channels && !channels.whatsapp.connected ? "Conecta WhatsApp en Canales" : ""} onClick={() => add(edge, t)}>
                {KIND[t].ico} {KIND[t].label}
              </button>
            ))}
          </div>
        )}
        <div className="edge" />
      </>
    );
  };

  const Path = ({ edge, nodeId, seen }: { edge: Edge; nodeId: string | null | undefined; seen: Set<string> }) => {
    const n = nodeById(a.steps, nodeId);
    if (!n || seen.has(n.id)) {
      return (
        <>
          <AddPoint edge={edge} />
          <span className="flow-end">Fin</span>
        </>
      );
    }
    const visited = new Set(seen).add(n.id);
    const k = KIND[n.type];
    const issue = problem(n);
    const waiting = stats?.at[n.id] || 0;
    const mail = stats?.email[n.id];
    return (
      <>
        <AddPoint edge={edge} />
        <button type="button" className={`node${selected === n.id ? " selected" : ""}${issue ? " warn" : ""}`} onClick={() => setSelected(n.id)}>
          <span className="node-title"><span className="node-ico" style={{ background: k.bg, color: k.fg }}>{k.ico}</span>{k.label}</span>
          <span className="node-sub">{summary(n)}</span>
          {issue && <span className="ec-warn" style={{ marginTop: 0 }}>⚠ {issue}</span>}
          {(waiting > 0 || mail) && (
            <span className="node-stats">
              {waiting > 0 && <span className="live">{waiting} aquí ahora</span>}
              {mail && <span>{mail.sent} enviados</span>}
              {mail && mail.sent > 0 && <span>{Math.round((mail.opened / mail.sent) * 100)} % abren</span>}
              {mail && mail.sent > 0 && <span>{Math.round((mail.clicked / mail.sent) * 100)} % clic</span>}
            </span>
          )}
        </button>
        {n.type === "condition" ? (
          <div className="branches">
            <div className="branch"><span className="branch-label yes">Sí</span><Path edge={{ from: n.id, key: "yes" }} nodeId={n.yes} seen={visited} /></div>
            <div className="branch"><span className="branch-label no">No</span><Path edge={{ from: n.id, key: "no" }} nodeId={n.no} seen={visited} /></div>
          </div>
        ) : (
          <Path edge={{ from: n.id, key: "next" }} nodeId={n.next} seen={visited} />
        )}
      </>
    );
  };

  const triggerText = `${TRIGGER_LABEL[a.trigger.type]}${a.trigger.type === "stage" ? ` «${stageLabel(a.trigger.stage)}»` : ""}${a.trigger.type === "tag" ? ` «${a.trigger.tag || "…"}»` : ""}${a.trigger.segment?.services?.[0] ? ` · solo ${a.trigger.segment.services[0]}` : ""}`;
  const emailTemplates = [...STARTER_TEMPLATES.slice(1), ...saved];

  return (
    <section className="page">
      <div className="head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="sub" style={{ margin: 0 }}><Link href="/email">← Email marketing</Link></p>
          <input className="i" aria-label="Nombre de la automatización" style={{ fontSize: 22, fontWeight: 700, border: 0, padding: "2px 0", background: "transparent", maxWidth: 520 }} value={a.name} placeholder="Nombre de la automatización" onChange={(e) => change({ name: e.target.value })} />
          <div className="chan-chips" style={{ marginTop: 4 }}>
            <span className={`pill ${a.status === "active" ? "p-good" : "p-muted"}`}><span className="dot" />{a.status === "active" ? "Activa" : a.status === "paused" ? "Pausada" : "Borrador"}</span>
            {channels && <span className={`pill ${channels.email.connected ? "p-good" : "p-warn"}`}>✉ {channels.email.connected ? channels.email.from : "Email sin conectar"}</span>}
            {channels && <span className={`pill ${channels.whatsapp.connected ? "p-good" : "p-muted"}`}>◍ {channels.whatsapp.connected ? `WhatsApp · ${channels.whatsapp.templates} plantillas` : "WhatsApp sin conectar"}</span>}
            {channels && <span className={`pill ${channels.team.email ? "p-good" : "p-muted"}`}>🔔 {channels.team.email ? `Avisos a ${channels.team.email}` : "Avisos solo al móvil"}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" disabled={busy || !dirty} onClick={() => run(async () => { await save(); return "Guardada."; })}>{dirty ? "Guardar" : "Guardado"}</button>
          {a.status === "active"
            ? <button className="btn" disabled={busy} onClick={() => setStatus("paused")}>Pausar</button>
            : <button className="btn primary" disabled={busy || !a.steps.length} onClick={() => setStatus("active")}>Activar</button>}
        </div>
      </div>
      {msg && <p className={`alert ${msg.kind}`} role="status" style={{ marginBottom: 14 }}>{msg.text}</p>}

      <div className={`builder${node?.type === "email" ? " wide" : ""}`}>
        <div className="card flow-scroll">
          <div className="flow">
            <button type="button" className={`node trigger${selected === "trigger" ? " selected" : ""}`} onClick={() => setSelected("trigger")}>
              <span className="node-title"><span className="node-ico" style={{ background: "var(--accent)", color: "#fff" }}>⚡</span>Empieza cuando</span>
              <span className="node-sub">{triggerText}</span>
              {stats && (
                <span className="node-stats">
                  <span className={stats.active ? "live" : ""}>{stats.total} han entrado</span>
                  {stats.last_entry_at && <span>último {ago(stats.last_entry_at)}</span>}
                  <span>{stats.done} terminaron</span>
                  {stats.exited > 0 && <span>{stats.exited} salieron</span>}
                </span>
              )}
            </button>
            <Path edge={{ from: null, key: "next" }} nodeId={a.steps[0]?.id} seen={new Set()} />
          </div>
        </div>

        <aside className="builder-side">
          {selected === "trigger" ? (
            <div className="card block" style={{ marginBottom: 0 }}>
              <h2>⚡ Empieza cuando</h2>
              <select className="i" aria-label="Disparador" value={a.trigger.type} onChange={(e) => change({ trigger: { ...a.trigger, type: e.target.value as Trigger["type"] } })}>
                <option value="lead_created">Entra un contacto nuevo</option>
                <option value="stage">Un contacto pasa a la etapa…</option>
                <option value="tag">Un contacto recibe la etiqueta…</option>
              </select>
              {a.trigger.type === "stage" && (
                <select className="i" style={{ marginTop: 8 }} aria-label="Etapa" value={a.trigger.stage || ""} onChange={(e) => change({ trigger: { ...a.trigger, stage: e.target.value } })}>
                  <option value="">Elige etapa</option>
                  {stages.map((s) => <option key={s.key} value={s.key}>{s.label || s.key}</option>)}
                </select>
              )}
              {a.trigger.type === "tag" && <input className="i" style={{ marginTop: 8 }} aria-label="Etiqueta" list="tag-list" value={a.trigger.tag || ""} onChange={(e) => change({ trigger: { ...a.trigger, tag: e.target.value } })} placeholder="etiqueta" />}
              {Boolean(options?.services.length) && (
                <select className="i" style={{ marginTop: 8 }} aria-label="Solo si le interesa" value={a.trigger.segment?.services?.[0] || ""} onChange={(e) => change({ trigger: { ...a.trigger, segment: { services: e.target.value ? [e.target.value] : [] } } })}>
                  <option value="">Cualquier servicio</option>
                  {options!.services.map((s) => <option key={s} value={s}>Solo si le interesa {s}</option>)}
                </select>
              )}
              <p className="hint" style={{ marginTop: 10 }}>Entran contactos con email y consentimiento (o que ya son clientes), una sola vez. Salen si se dan de baja. Se revisa cada minuto.</p>
            </div>
          ) : node ? (
            <div className="card block" style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0 }}>{KIND[node.type].ico} {KIND[node.type].label}</h2>
                <button className="btn ghost small" onClick={() => { if (node.type !== "condition" || window.confirm("Se quita la condición y su camino «No». ¿Seguir?")) { setSteps(removeNode(a.steps, node.id)); setSelected("trigger"); } }}>Quitar</button>
              </div>
              {node.type === "wait" && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input className="i" type="number" min={1} style={{ width: 90 }} aria-label="Cantidad" value={node.amount} onChange={(e) => edit({ amount: Number(e.target.value) })} />
                  <select className="i" aria-label="Unidad" value={node.unit} onChange={(e) => edit({ unit: e.target.value as "hours" | "days" })}>
                    <option value="hours">horas</option>
                    <option value="days">días</option>
                  </select>
                </div>
              )}
              {node.type === "email" && (
                <>
                  <label className="f" htmlFor="n-tpl">Plantilla</label>
                  <select id="n-tpl" className="i" value="" onChange={(e) => { const t = emailTemplates.find((x) => x.id === e.target.value); if (t) edit({ subject: node.subject || t.subject, preheader: t.preheader, blocks: t.blocks.map((b) => ({ ...b })) }); }}>
                    <option value="">Usar una plantilla…</option>
                    {emailTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.builtin ? "" : " (tuya)"}</option>)}
                  </select>
                  <div style={{ marginTop: 10 }}>
                    <EmailCanvas
                      blocks={node.blocks || []}
                      onChange={(blocks) => edit({ blocks })}
                      header={
                        <div className="ec-mailhead">
                          <label>Asunto<input className="ec-subject" aria-label="Asunto" value={node.subject || ""} onChange={(e) => edit({ subject: e.target.value })} placeholder="Asunto" /></label>
                          <label>Vista previa<input aria-label="Vista previa" value={node.preheader || ""} onChange={(e) => edit({ preheader: e.target.value })} placeholder="Texto junto al asunto" /></label>
                        </div>
                      }
                    />
                  </div>
                </>
              )}
              {node.type === "whatsapp" && (
                <>
                  <label className="f" htmlFor="n-wa">Plantilla aprobada por Meta</label>
                  <select id="n-wa" className="i" value={node.template_name ? `${node.template_name}|${node.language}` : ""} onChange={(e) => { const [name, language] = e.target.value.split("|"); edit({ template_name: name || "", language: language || "es", params: Array.from({ length: waTemplate(name)?.params || 0 }, (_, k) => (k === 0 ? "{nombre|}" : "")) }); }}>
                    <option value="">{waTemplates.length ? "Elige una plantilla" : "No hay plantillas aprobadas"}</option>
                    {waTemplates.map((t) => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name.replace(/_/g, " ")} · {t.language}</option>)}
                  </select>
                  {(node.params || []).map((p, k) => (
                    <input key={k} className="i" style={{ marginTop: 6 }} aria-label={`Dato ${k + 1}`} value={p} placeholder={`Dato {{${k + 1}}}: puedes usar {nombre}, {servicio}`} onChange={(e) => edit({ params: (node.params || []).map((x, j) => (j === k ? e.target.value : x)) })} />
                  ))}
                  {waTemplate(node.template_name) && (
                    <div className="m" style={{ marginTop: 10, maxWidth: "100%", background: "#dcf8c6", color: "#1d1b26", borderRadius: 10 }}>{waTemplate(node.template_name)?.body}</div>
                  )}
                  <p className="hint" style={{ marginTop: 8 }}>Solo se envía si el contacto tiene teléfono. Si contesta, la conversación sigue en Conversaciones con tu asistente.</p>
                </>
              )}
              {node.type === "condition" && (
                <>
                  <select className="i" style={{ marginTop: 10 }} aria-label="Condición" value={node.check} onChange={(e) => edit({ check: e.target.value as FlowNode["check"] })}>
                    <option value="opened_last">¿Abrió el email anterior?</option>
                    <option value="clicked_last">¿Hizo clic en el email anterior?</option>
                    <option value="has_tag">¿Tiene la etiqueta…?</option>
                    <option value="stage">¿Está en la etapa…?</option>
                  </select>
                  {node.check === "has_tag" && <input className="i" style={{ marginTop: 8 }} list="tag-list" aria-label="Etiqueta" value={node.value || ""} onChange={(e) => edit({ value: e.target.value })} />}
                  {node.check === "stage" && (
                    <select className="i" style={{ marginTop: 8 }} aria-label="Etapa" value={node.value || ""} onChange={(e) => edit({ value: e.target.value })}>
                      <option value="">Elige etapa</option>
                      {stages.map((st) => <option key={st.key} value={st.key}>{st.label || st.key}</option>)}
                    </select>
                  )}
                  <p className="hint" style={{ marginTop: 8 }}>El camino <b>Sí</b> sigue por la izquierda y el <b>No</b> por la derecha. Añade pasos en cada uno con «+».</p>
                </>
              )}
              {node.type === "notify_team" && (
                <>
                  <label className="f" htmlFor="n-msg">Mensaje del aviso</label>
                  <input id="n-msg" className="i" value={node.message || ""} onChange={(e) => edit({ message: e.target.value })} />
                  <p className="hint" style={{ marginTop: 8 }}>Llega como aviso al móvil y por email a {channels?.team.email || "la dirección de avisos (configúrala en Mi asistente)"}.</p>
                </>
              )}
              {node.type === "add_tag" && <input className="i" style={{ marginTop: 10 }} list="tag-list" aria-label="Etiqueta" value={node.tag || ""} onChange={(e) => edit({ tag: e.target.value })} placeholder="etiqueta" />}
              {node.type === "set_stage" && (
                <select className="i" style={{ marginTop: 10 }} aria-label="Etapa" value={node.stage || ""} onChange={(e) => edit({ stage: e.target.value })}>
                  <option value="">Elige etapa</option>
                  {stages.map((st) => <option key={st.key} value={st.key}>{st.label || st.key}</option>)}
                </select>
              )}
            </div>
          ) : null}

          <div className="card block" style={{ marginBottom: 0 }}>
            <h2>Actividad reciente</h2>
            {!stats?.recent.length ? <p className="hint" style={{ margin: 0 }}>{id ? "Todavía no ha entrado nadie." : "Guárdala y actívala para ver aquí quién entra."}</p> : (
              <div style={{ display: "grid", gap: 6 }}>
                {stats.recent.map((r, i) => {
                  const n = nodeById(a.steps, r.step_id);
                  return (
                    <button key={i} type="button" className="check" style={{ background: "none", border: 0, textAlign: "left", cursor: n ? "pointer" : "default", padding: 0, color: "var(--fg)" }} onClick={() => n && setSelected(n.id)}>
                      <i>{r.status === "active" ? "•" : r.status === "done" ? "✓" : "↩"}</i>
                      <span><b>{r.name}</b> · {r.status === "active" ? `en «${n ? KIND[n.type].label : "…"}»${r.next_at && Date.parse(r.next_at) > Date.now() ? `, sigue ${new Date(r.next_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}` : r.status === "done" ? "terminó" : `salió (${r.exit_reason || "—"})`} <span style={{ color: "var(--muted)" }}>{ago(r.updated_at)}</span></span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
      <datalist id="tag-list">{(options?.tags || []).map((t) => <option key={t} value={t} />)}</datalist>
    </section>
  );
}
