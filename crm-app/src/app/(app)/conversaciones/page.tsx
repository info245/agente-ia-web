"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { api, ApiError } from "@/lib/api";
import { channelOf, isHumanMessage, leadName, OWNER_PILL, ownerOf, shortTime, type Owner } from "@/lib/format";
import type { Conversation, Lead, Message } from "@/lib/types";

type Thread = { messages: Message[]; lead: Lead; conversation: Conversation | null };
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
  const { config } = useSession();
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ kind: "error" | "warn"; text: string } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "mode" | "suggest">("");
  const msgsRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await api<Thread>(`/crm/conversations/${conversationId}/messages`);
      setThread(data);
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
      const closed = err instanceof ApiError && err.data?.code === "whatsapp_window_closed";
      setNotice({ kind: closed ? "warn" : "error", text: (err as Error).message });
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
        <div className="composer">
          {notice && <p className={`alert ${notice.kind}`} role="alert" style={{ margin: 0 }}>{notice.text}</p>}
          <div className="mode">
            <span>Quién responde:</span>
            <div className="toggle" role="group" aria-label="Quién responde">
              <button className="ai" aria-pressed={!paused} disabled={busy !== ""} onClick={() => paused && setMode(true)}>Asistente</button>
              <button className="me" aria-pressed={paused} disabled={busy !== ""} onClick={() => !paused && setMode(false)}>Yo</button>
            </div>
          </div>
          {canReply ? (
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
      </div>
      <LeadPanel lead={lead} stages={config?.pipeline?.stages || []} onSaved={async () => { await load(); await onChanged(); }} />
    </>
  );
}

function LeadPanel({ lead, stages, onSaved }: { lead: Lead; stages: { key: string; label?: string; is_active?: boolean }[]; onSaved: () => Promise<void> }) {
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
    <aside className="lead">
      <h2>{leadName(lead)}</h2>
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
      <div className="field">
        <span>Etapa</span>
        <select aria-label="Etapa del contacto" value={lead.crm_status || ""} onChange={(e) => save({ crm_status: e.target.value })}>
          {stages.filter((s) => s.is_active !== false).map((s) => <option key={s.key} value={s.key}>{s.label || s.key}</option>)}
        </select>
      </div>
      <div className="field">
        <span>Nota para tu equipo</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (lead.internal_notes || "") && save({ internal_notes: note })} placeholder="Solo la ves tú" />
      </div>
      {status && <p style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 0" }} aria-live="polite">{status}</p>}
      {(lead.next_action || lead.summary) && (
        <div className="next">
          <b>{lead.next_action ? "Siguiente paso sugerido" : "Resumen de la conversación"}</b>
          <p>{lead.next_action || lead.summary}</p>
        </div>
      )}
    </aside>
  );
}
