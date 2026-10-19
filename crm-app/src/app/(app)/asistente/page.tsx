"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import type { AppConfig, Faq, Offer } from "@/lib/types";

const TONES = [
  ["Cercano", "cercano, amable y claro"],
  ["Profesional", "profesional, claro y de confianza"],
  ["Directo", "directo, breve y al grano"],
] as const;

type ServiceRow = { name: string; price: string; original: string; field: "min_monthly_fee" | "min_project_fee" };
type Draft = { tone: string; greeting: string; services: ServiceRow[]; faq: Faq[] };

function draftFrom(config: AppConfig): Draft {
  const offers = Object.keys(config.offers || {}).length ? config.offers! : config.services || {};
  return {
    tone: config.agent?.tone || "",
    greeting: config.agent?.initial_message || "",
    services: Object.entries(offers).map(([name, offer]) => ({
      name,
      original: name,
      field: offer.min_project_fee && !offer.min_monthly_fee ? "min_project_fee" : "min_monthly_fee",
      price: String(offer.min_monthly_fee || offer.min_project_fee || ""),
    })),
    faq: config.agent?.faq?.length ? config.agent.faq : [],
  };
}

// Solo se envía lo que se edita aquí; el servidor lo mezcla con el resto de la configuración.
function patchFrom(config: AppConfig, draft: Draft) {
  const previous = Object.keys(config.offers || {}).length ? config.offers! : config.services || {};
  const offers: Record<string, Offer> = {};
  for (const row of draft.services) {
    const name = row.name.trim();
    if (!name) continue;
    const base: Offer = previous[row.original] || { category: "", description: "" };
    offers[name] = { ...base, [row.field]: row.price.trim() };
  }
  return {
    agent: {
      ...config.agent,
      tone: draft.tone.trim(),
      initial_message: draft.greeting.trim(),
      faq: draft.faq.filter((f) => f.question.trim() && f.answer.trim()),
    },
    offers,
    services: offers,
  };
}

export default function AsistentePage() {
  const { config, reloadConfig } = useSession();
  if (!config) return <p className="loading">Cargando…</p>;
  return <Editor config={config} reloadConfig={reloadConfig} />;
}

function Editor({ config, reloadConfig }: { config: AppConfig; reloadConfig: () => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(config));
  const [saved, setSaved] = useState(() => JSON.stringify(draftFrom(config)));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const patch = useMemo(() => patchFrom(config, draft), [config, draft]);
  const dirty = JSON.stringify(draft) !== saved;
  const update = (part: Partial<Draft>) => setDraft({ ...draft, ...part });

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await api("/crm/assistant", { method: "POST", body: { agent: patch.agent, offers: patch.offers } });
      await reloadConfig();
      setSaved(JSON.stringify(draft));
      setMessage({ kind: "ok", text: "Guardado. Tu asistente ya responde con estos cambios." });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
    setSaving(false);
  }

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Mi asistente</h1>
          <p className="sub">Cómo atiende a tus clientes. Pruébalo a la derecha antes de guardar.</p>
        </div>
        <span className="pill p-good"><span className="dot" />Activo en WhatsApp y web</span>
      </div>
      <div className="assist">
        <div>
          <div className="card block">
            <h2><span className="num">1</span>Cómo habla</h2>
            <p className="hint">Su tono y el primer mensaje que ve el cliente en tu web.</p>
            <label className="f" htmlFor="tone">Tono</label>
            <div className="tones">
              {TONES.map(([label, value]) => (
                <button key={label} className="chip" aria-pressed={draft.tone === value} onClick={() => update({ tone: value })}>{label}</button>
              ))}
            </div>
            <textarea className="i" id="tone" rows={2} value={draft.tone} onChange={(e) => update({ tone: e.target.value })} placeholder="Por ejemplo: cercano y claro, sin tecnicismos" />
            <label className="f" htmlFor="greeting">Saludo</label>
            <textarea className="i" id="greeting" rows={2} value={draft.greeting} onChange={(e) => update({ greeting: e.target.value })} />
          </div>

          <div className="card block">
            <h2><span className="num">2</span>Qué vendes y a qué precio</h2>
            <p className="hint">Tu asistente solo dará estos precios. Lo que no esté aquí, lo consulta con tu equipo.</p>
            {draft.services.map((row, i) => (
              <div className="svc-row" key={i}>
                <input className="i" aria-label="Servicio" value={row.name} onChange={(e) => update({ services: draft.services.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)) })} />
                <input className="i" aria-label={`Precio de ${row.name}`} placeholder="desde 300 €/mes" value={row.price} onChange={(e) => update({ services: draft.services.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)) })} />
                <button className="btn" aria-label={`Quitar ${row.name}`} onClick={() => update({ services: draft.services.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button className="btn ghost" onClick={() => update({ services: [...draft.services, { name: "", price: "", original: "", field: "min_monthly_fee" }] })}>+ Añadir servicio</button>
          </div>

          <div className="card block">
            <h2><span className="num">3</span>Preguntas frecuentes</h2>
            <p className="hint">Lo que más te preguntan, con tu respuesta. Además, tu asistente aprende de tu web.</p>
            {draft.faq.length === 0 && <p className="empty" style={{ padding: 12 }}>Aún no hay preguntas. Añade las que más te hacen tus clientes.</p>}
            {draft.faq.map((item, i) => (
              <div className="faq-row" key={i}>
                <div className="top">
                  <input className="i" aria-label="Pregunta" placeholder="¿Hay permanencia?" value={item.question} onChange={(e) => update({ faq: draft.faq.map((f, j) => (j === i ? { ...f, question: e.target.value } : f)) })} />
                  <button className="btn" aria-label="Quitar pregunta" onClick={() => update({ faq: draft.faq.filter((_, j) => j !== i) })}>×</button>
                </div>
                <textarea className="i" aria-label="Respuesta" rows={2} placeholder="No, ningún servicio tiene permanencia." value={item.answer} onChange={(e) => update({ faq: draft.faq.map((f, j) => (j === i ? { ...f, answer: e.target.value } : f)) })} />
              </div>
            ))}
            <button className="btn ghost" onClick={() => update({ faq: [...draft.faq, { question: "", answer: "" }] })}>+ Añadir pregunta</button>
          </div>

          <div className="card savebar">
            {message ? <span role="status" className={`alert ${message.kind}`}>{message.text}</span> : <span>{dirty ? "Tienes cambios sin guardar" : "Todo guardado"}</span>}
            <button className="btn primary" onClick={save} disabled={!dirty || saving}>{saving ? "Guardando…" : "Guardar y activar"}</button>
          </div>
        </div>
        <TryPanel greeting={draft.greeting} patch={patch} />
      </div>
    </section>
  );
}

function TryPanel({ greeting, patch }: { greeting: string; patch: object }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages, busy]);

  async function send() {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setText("");
    setBusy(true);
    setError("");
    try {
      const data = await api<{ reply: string }>("/crm/agent/try", { method: "POST", body: { config: patch, messages: next } });
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="card try">
      <div className="try-head">
        <div>
          <h2>Probar</h2>
          <p className="sub" style={{ fontSize: 13 }}>Escribe como si fueras un cliente. Usa los cambios aunque no estén guardados.</p>
        </div>
        {messages.length > 0 && <button className="btn small" onClick={() => setMessages([])}>Reiniciar</button>}
      </div>
      <div className="msgs" ref={ref}>
        {greeting && <div className="m ai">{greeting}<small>Asistente</small></div>}
        {messages.map((m, i) => (
          <div key={i} className={`m ${m.role === "user" ? "in" : "ai"}`}>
            {m.content}
            {m.role === "assistant" && <small>Asistente</small>}
          </div>
        ))}
        {busy && <div className="sys">Tu asistente está escribiendo…</div>}
        {error && <p className="alert error">{error}</p>}
      </div>
      <div className="composer">
        <div className="write">
          <textarea
            aria-label="Mensaje de prueba"
            placeholder="Escribe un mensaje de prueba…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="btn primary" onClick={send} disabled={busy || !text.trim()}>Enviar</button>
        </div>
      </div>
    </div>
  );
}
