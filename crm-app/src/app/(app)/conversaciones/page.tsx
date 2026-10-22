"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, useTeamMembers } from "@/components/app-shell";
import { api, ApiError, getAccountId } from "@/lib/api";
import { channelOf, isHumanMessage, leadName, OWNER_PILL, ownerOf, shortTime, type Owner } from "@/lib/format";
import type { AccessLogEntry, ConsentRecord, Conversation, Lead, Message } from "@/lib/types";

type Thread = { messages: Message[]; lead: Lead; conversation: Conversation | null; fetchedAt: number };
type Template = { name: string; language: string; category: string; header: string; body: string; footer: string; params: number; param_names?: string[]; sendable: boolean };

const DAY_MS = 24 * 60 * 60 * 1000;
type Filter = "all" | Owner;

export default function ConversacionesPage() {
  const { leads, reloadLeads } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("c") || "";
  const [filter, setFilter] = useState<Filter>((params.get("f") as Filter) || "all");
  const [query, setQuery] = useState("");

  const select = (id: string) => router.replace(id ? `/conversaciones?c=${id}` : "/conversaciones");

  const visible = (leads || [])
    .filter((lead) => filter === "all" || ownerOf(lead) === filter)
    .filter((lead) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [lead.name, lead.email, lead.phone, lead.company_name, lead.interest_service, lead.last_message?.content]
        .some((v) => String(v || "").toLowerCase().includes(q));
    })
    .sort((a, b) => (b.last_message?.created_at || b.updated_at || "").localeCompare(a.last_message?.created_at || a.updated_at || ""));
  const waitingCount = (leads || []).filter((lead) => ownerOf(lead) === "waiting").length;

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Conversaciones</h1>
          <p className="sub">WhatsApp, chat de la web y formularios en un solo sitio</p>
        </div>
      </div>
      <div className={`card inbox${selected ? " has-thread" : ""}`}>
        <div className="list">
          <div className="filters">
            <input className="search" type="search" placeholder="Buscar por nombre, email o mensaje" aria-label="Buscar conversaciones" value={query} onChange={(e) => setQuery(e.target.value)} />
            {([["all", "Todas"], ["waiting", `Te esperan (${waitingCount})`], ["ai", "La IA atiende"], ["me", "Atiendes tú"]] as const).map(([key, label]) => (
              <button key={key} className="chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
          {!leads && <p className="loading">Cargando…</p>}
          {leads && visible.length === 0 && <p className="empty">No hay conversaciones con este filtro.</p>}
          {visible.map((lead) => {
            const ch = channelOf(lead);
            const owner = OWNER_PILL[ownerOf(lead)];
            const last = lead.last_message;
            const prefix = last?.role === "assistant" ? (isHumanMessage(last) ? "Tú: " : "Asistente: ") : "";
            return (
              <button key={lead.id} className="conv" aria-current={lead.conversation_id === selected} onClick={() => select(lead.conversation_id)}>
                <div className={`ch ${ch.css}`} title={ch.label}>{ch.short}</div>
                <div className="meta">
                  <div className="top"><b>{leadName(lead)}</b><time>{shortTime(last?.created_at || lead.updated_at)}</time></div>
                  <div className="last">{last?.content ? prefix + last.content : lead.interest_service || "Sin mensajes todavía"}</div>
                  <span className={`pill ${owner.css}`}><span className="dot" />{owner.label}</span>
                </div>
              </button>
            );
          })}
        </div>
        {selected ? (
          <ThreadView key={selected} conversationId={selected} onBack={() => select("")} onChanged={reloadLeads} />
        ) : (
          <div className="thread"><p className="empty" style={{ margin: "auto" }}>Elige una conversación para verla y responder.</p></div>
        )}
      </div>
    </section>
  );
}

function ThreadView({ conversationId, onBack, onChanged }: { conversationId: string; onBack: () => void; onChanged: () => Promise<void> }) {
  const { config, can } = useSession();
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ kind: "error" | "warn"; text: string } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "mode" | "suggest">("");
  const [forceTemplate, setForceTemplate] = useState(false);
  const [showLead, setShowLead] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await api<Omit<Thread, "fetchedAt">>(`/crm/conversations/${conversationId}/messages`);
      setThread({ ...data, fetchedAt: Date.now() });
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [conversationId]);

  useEffect(() => {
    Promise.resolve().then(load);
    const timer = setInterval(() => !document.hidden && load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const count = thread?.messages.length || 0;
    if (count !== lastCount.current && msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    lastCount.current = count;
  }, [thread]);

  if (error) return <div className="thread"><p className="alert error" style={{ margin: 18 }}>{error}</p></div>;
  if (!thread) return <div className="thread"><p className="loading">Cargando conversación…</p></div>;

  const { lead, messages } = thread;
  const conversation = thread.conversation || {};
  const channel = conversation.channel || lead.channel || "";
  const ch = channelOf({ ...lead, channel });
  const paused = conversation.ai_status === "paused";
  const canReply = channel === "whatsapp" || channel === "web";
  const lastMessage = messages.at(-1);
  // WhatsApp solo deja escribir libremente 24 h después del último mensaje del cliente; luego, plantilla.
  const lastUserAt = Math.max(0, ...messages.filter((m) => m.role === "user").map((m) => Date.parse(m.created_at || "") || 0));
  const windowClosed = channel === "whatsapp" && (forceTemplate || !lastUserAt || thread.fetchedAt - lastUserAt >= DAY_MS);

  async function setMode(ai: boolean) {
    setBusy("mode");
    try {
      await api(`/crm/conversations/${conversationId}/state`, { method: "PATCH", body: { ai_status: ai ? "active" : "paused", inbox_status: "open" } });
      await Promise.all([load(), onChanged()]);
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    }
    setBusy("");
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy("send");
    setNotice(null);
    try {
      await api(`/crm/conversations/${conversationId}/reply`, { method: "POST", body: { text: body } });
      setText("");
      await Promise.all([load(), onChanged()]);
    } catch (err) {
      if (err instanceof ApiError && err.data?.code === "whatsapp_window_closed") setForceTemplate(true);
      else setNotice({ kind: "error", text: (err as Error).message });
    }
    setBusy("");
  }

  async function suggest() {
    setBusy("suggest");
    setNotice(null);
    try {
      const history = messages
        .filter((m) => m.content)
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
      const data = await api<{ reply: string }>("/crm/agent/try", { method: "POST", body: { messages: history, mode: "suggest" } });
      setText(data.reply);
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    }
    setBusy("");
  }

  return (
    <>
      <div className="thread">
        <div className="thread-head">
          <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
            <button className="btn small back" onClick={onBack} aria-label="Volver a la lista">←</button>
            <div style={{ minWidth: 0 }}>
              <b>{leadName(lead)}</b>
              <small>{[ch.label, lead.phone || lead.email, lead.business_type].filter(Boolean).join(" · ")}</small>
            </div>
          </div>
          <button className="btn small ficha" onClick={() => setShowLead(true)}>Ficha</button>
          <span className={`pill ${OWNER_PILL[ownerOf({ ...lead, ai_status: conversation.ai_status, last_message: lastMessage })].css}`}>
            <span className="dot" />{OWNER_PILL[ownerOf({ ...lead, ai_status: conversation.ai_status, last_message: lastMessage })].label}
          </span>
        </div>
        <div className="msgs" ref={msgsRef}>
          {messages.length === 0 && <p className="empty">Todavía no hay mensajes.</p>}
          {messages.map((m, i) => {
            const human = isHumanMessage(m);
            const css = m.role === "user" ? "in" : human ? "me" : "ai";
            const who = m.role === "user" ? "" : human ? `${m.metadata?.author?.split("@")[0] || "Tú"} · ` : "Asistente · ";
            return (
              <div key={m.id || i} className={`m ${css}`}>
                {m.content}
                <small>{who}{shortTime(m.created_at)}</small>
              </div>
            );
          })}
          {paused && <div className="sys">Tu asistente no responde en esta conversación: atiendes tú</div>}
        </div>
        {!can("write") ? (
          <div className="composer"><p className="alert warn" style={{ margin: 0 }}>Tu usuario es de solo lectura: puedes ver la conversación, pero no responder.</p></div>
        ) : (
        <div className="composer">
          {notice && <p className={`alert ${notice.kind}`} role="alert" style={{ margin: 0 }}>{notice.text}</p>}
          <div className="mode">
            <span>Quién responde:</span>
            <div className="toggle" role="group" aria-label="Quién responde">
              <button className="ai" aria-pressed={!paused} disabled={busy !== ""} onClick={() => paused && setMode(true)}>Asistente</button>
              <button className="me" aria-pressed={paused} disabled={busy !== ""} onClick={() => !paused && setMode(false)}>Yo</button>
            </div>
          </div>
          {windowClosed ? (
            <TemplateComposer
              conversationId={conversationId}
              defaults={{ name: leadName(lead).split(" ")[0], service: lead.interest_service || "", company: lead.company_name || lead.business_type || "" }}
              onSent={async () => { setForceTemplate(false); await Promise.all([load(), onChanged()]); }}
            />
          ) : canReply ? (
            <>
              {lastMessage?.role === "user" && (
                <div>
                  <button className="btn small" onClick={suggest} disabled={busy !== ""}>{busy === "suggest" ? "Pensando…" : "✨ Sugerir respuesta"}</button>
                </div>
              )}
              <div className="write">
                <textarea
                  aria-label="Escribe tu respuesta"
                  placeholder={`Escribe tu respuesta a ${leadName(lead).split(" ")[0]}…`}
                  value={text}
                  rows={Math.min(6, Math.max(1, text.split("\n").length))}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button className="btn primary" onClick={send} disabled={busy !== "" || !text.trim()}>{busy === "send" ? "Enviando…" : "Enviar"}</button>
              </div>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Al enviar, tu asistente deja de responder en esta conversación hasta que lo vuelvas a activar.</span>
            </>
          ) : (
            <p className="alert warn" style={{ margin: 0 }}>
              Este contacto llegó por formulario. Escríbele directamente
              {lead.email && <> a <a href={`mailto:${lead.email}`}>{lead.email}</a></>}
              {lead.phone && <> o llama al <a href={`tel:${lead.phone}`}>{lead.phone}</a></>}.
            </p>
          )}
        </div>
        )}
      </div>
      <LeadPanel lead={lead} stages={config?.pipeline?.stages || []} open={showLead} onClose={() => setShowLead(false)} onSaved={async () => { await load(); await onChanged(); }} />
    </>
  );
}

type Defaults = { name: string; service: string; company: string };

// Rellena cada variable con lo que ya sabemos del lead: por nombre ({{nombre}}) o por orden ({{1}}, {{2}}).
function guess(name: string, index: number, d: Defaults) {
  if (/nombre|name|cliente|customer/.test(name)) return d.name;
  if (/servicio|service|producto|product|consulta/.test(name)) return d.service;
  if (/empresa|company|negocio|business/.test(name)) return d.company;
  return /^\d+$/.test(name) ? [d.name, d.service][index] || "" : "";
}

function TemplateComposer({ conversationId, defaults, onSent }: { conversationId: string; defaults: Defaults; onSent: () => Promise<void> }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api<{ templates: Template[] }>("/crm/whatsapp/templates")
      .then((data) => setTemplates(data.templates.filter((t) => t.sendable)))
      .catch((err) => { setTemplates([]); setError((err as Error).message); });
  }, []);

  const template = templates?.find((t) => `${t.name}|${t.language}` === selected) || null;
  const names = template?.param_names || [];
  const fill = (text: string) => text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (_, key) => params[names.indexOf(key)]?.trim() || `{{${key}}}`);
  const preview = template ? [template.header, template.body, template.footer].filter(Boolean).map(fill).join("\n\n") : "";

  function choose(value: string) {
    setSelected(value);
    const t = templates?.find((x) => `${x.name}|${x.language}` === value);
    setParams((t?.param_names || []).map((name, i) => guess(name, i, defaults)));
  }

  async function send() {
    if (!template) return;
    setSending(true);
    setError("");
    try {
      await api(`/crm/conversations/${conversationId}/reply`, {
        method: "POST",
        body: { template: { name: template.name, language: template.language, params } },
      });
      setSelected("");
      await onSent();
    } catch (err) {
      setError((err as Error).message);
    }
    setSending(false);
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p className="alert warn" style={{ margin: 0 }}>
        Han pasado más de 24 horas desde su último mensaje. WhatsApp solo deja escribirle con una plantilla aprobada
        (Meta la cobra, unos céntimos). Cuando conteste, podrás escribirle libremente.
      </p>
      {templates === null && <p className="loading" style={{ padding: 8 }}>Cargando plantillas…</p>}
      {templates?.length === 0 && !error && (
        <p className="alert error" style={{ margin: 0 }}>No hay plantillas aprobadas que se puedan enviar desde aquí. Pide a tu agencia que cree una en Meta.</p>
      )}
      {templates && templates.length > 0 && (
        <>
          <select className="i" aria-label="Plantilla de WhatsApp" value={selected} onChange={(e) => choose(e.target.value)}>
            <option value="">Elige una plantilla…</option>
            {templates.map((t) => (
              <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                {t.name.replace(/_/g, " ")} · {t.language}{t.category === "MARKETING" ? " · marketing" : ""}
              </option>
            ))}
          </select>
          {template && (
            <>
              {params.map((value, i) => (
                <input key={i} className="i" aria-label={`Dato ${names[i] || i + 1}`} placeholder={(names[i] || String(i + 1)).replace(/_/g, " ")} value={value}
                  onChange={(e) => setParams(params.map((p, j) => (j === i ? e.target.value : p)))} />
              ))}
              <div className="m me" style={{ maxWidth: "100%", alignSelf: "stretch" }}>{preview}</div>
              <button className="btn primary" onClick={send} disabled={sending || params.some((p) => !p.trim())}>
                {sending ? "Enviando…" : "Enviar plantilla"}
              </button>
            </>
          )}
        </>
      )}
      {error && <p className="alert error" role="alert" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}

const QUOTE_STATUS: Record<string, string> = { borrador: "borrador", draft: "borrador", sent: "enviada", enviado: "enviada", accepted: "aceptada", rejected: "rechazada" };

function LeadPanel({ lead, stages, open, onClose, onSaved }: { lead: Lead; stages: { key: string; label?: string; is_active?: boolean }[]; open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const { can } = useSession();
  const members = useTeamMembers();
  const [note, setNote] = useState(lead.internal_notes || "");
  const [status, setStatus] = useState("");

  async function save(body: Partial<Lead>) {
    setStatus("Guardando…");
    try {
      await api(`/crm/leads/${lead.id}`, { method: "PATCH", body });
      setStatus("Guardado");
      await onSaved();
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  return (
    <aside className={`lead${open ? " open" : ""}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <h2>{leadName(lead)}</h2>
        <button className="btn small ficha" onClick={onClose}>Cerrar</button>
      </div>
      {(lead.business_type || lead.company_name) && <div className="field"><span>Negocio</span>{[lead.company_name, lead.business_type].filter(Boolean).join(" · ")}</div>}
      <div className="field"><span>Le interesa</span>{lead.interest_service || "—"}</div>
      <div className="field">
        <span>Contacto</span>
        {lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : null}
        {lead.email && lead.phone ? <br /> : null}
        {lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : null}
        {!lead.email && !lead.phone && "Aún no lo ha dado"}
      </div>
      {lead.main_goal && <div className="field"><span>Qué busca</span>{lead.main_goal}</div>}
      {lead.budget_range && <div className="field"><span>Presupuesto</span>{lead.budget_range}</div>}
      {lead.current_situation && <div className="field"><span>Situación</span>{lead.current_situation}</div>}
      {lead.pain_points && <div className="field"><span>Problema</span>{lead.pain_points}</div>}
      <fieldset disabled={!can("write")} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="field">
        <span>Asignado a</span>
        <select aria-label="Asignado a" value={lead.assigned_to || ""} onChange={(e) => save({ assigned_to: e.target.value })}>
          <option value="">Sin asignar</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
      </div>
      <div className="field">
        <span>Etapa</span>
        <select aria-label="Etapa del contacto" value={lead.crm_status || ""} onChange={(e) => save({ crm_status: e.target.value })}>
          {stages.filter((s) => s.is_active !== false).map((s) => <option key={s.key} value={s.key}>{s.label || s.key}</option>)}
        </select>
      </div>
      <div className="field">
        <span>Notas internas</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (lead.internal_notes || "") && save({ internal_notes: note })} placeholder="Solo la ves tú" />
      </div>
      </fieldset>
      {status && <p style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 0" }} aria-live="polite">{status}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Link className="btn small" href={`/propuesta?lead=${lead.id}`}>Propuesta{lead.quote_status && lead.quote_status !== "sin_presupuesto" ? ` · ${QUOTE_STATUS[lead.quote_status] || lead.quote_status}` : ""}</Link>
        <Link className="btn small" href={`/analisis?lead=${lead.id}`}>Análisis</Link>
      </div>
      {open && <PrivacySection lead={lead} />}
      {/* El resumen automático es un volcado interno para el agente; aquí se ven sus datos ya ordenados arriba. */}
      {lead.next_action && (
        <div className="next">
          <b>Siguiente paso sugerido</b>
          <p>{lead.next_action}</p>
        </div>
      )}
    </aside>
  );
}

const CHANNEL_LABEL: Record<string, string> = { web: "Chat web", whatsapp: "WhatsApp", fb: "Formulario de Meta", ig: "Formulario de Meta", meta: "Formulario de Meta", web_form: "Formulario web" };
const ACTION_LABEL: Record<AccessLogEntry["action"], string> = { view: "vio la ficha", export: "exportó los datos", delete: "borró los datos", anonymize: "anonimizó los datos" };
const when = (value: string) => new Date(value).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// RGPD en la ficha: de dónde sale el consentimiento, exportar sus datos y quién ha accedido.
function PrivacySection({ lead }: { lead: Lead }) {
  const [data, setData] = useState<{ consent: { granted: boolean | null; at: string | null; records: ConsentRecord[] }; access_log: AccessLogEntry[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<NonNullable<typeof data>>(`/crm/leads/${lead.id}/privacy`).then(setData).catch((err) => setError((err as Error).message));
  }, [lead.id]);

  const exportUrl = (format: "json" | "csv") => {
    const params = new URLSearchParams({ format });
    const accountId = getAccountId();
    if (accountId) params.set("account_id", accountId);
    return `/api/crm/leads/${lead.id}/export?${params}`;
  };

  return (
    <div className="field">
      <span>Privacidad</span>
      {error && <small style={{ color: "var(--bad)" }}>{error}</small>}
      {data && (
        <>
          <div>
            Consentimiento: {data.consent.granted === true ? "sí" : data.consent.granted === false ? "no" : "sin registrar"}
            {data.consent.at && ` (${when(data.consent.at)})`}
          </div>
          {data.consent.records.map((r) => (
            <details key={r.id} style={{ fontSize: 12, marginTop: 4 }}>
              <summary>
                {when(r.created_at)} · {CHANNEL_LABEL[r.channel || ""] || r.channel || "—"}
                {r.payload?.granted === false ? " · rechazado" : ""}
              </summary>
              <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{r.payload?.text || "Sin texto guardado"}</p>
              {r.payload?.policy_url && <a href={r.payload.policy_url} target="_blank" rel="noopener noreferrer">Política enlazada</a>}
            </details>
          ))}
          <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
            <a className="btn small" href={exportUrl("json")} download>Exportar JSON</a>
            <a className="btn small" href={exportUrl("csv")} download>Exportar CSV</a>
          </div>
          {data.access_log.length > 0 && (
            <details style={{ fontSize: 12 }}>
              <summary>Quién ha accedido ({data.access_log.length})</summary>
              <ul style={{ margin: "4px 0", paddingLeft: 16 }}>
                {data.access_log.map((entry, i) => (
                  <li key={i}>{when(entry.created_at)} · {entry.actor_email || "sistema"} {ACTION_LABEL[entry.action] || entry.action}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
