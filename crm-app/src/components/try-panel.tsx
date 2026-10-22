"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// Chat de prueba del asistente con una configuración sin guardar (no crea conversación ni lead).
export function TryPanel({ greeting, config }: { greeting: string; config: object }) {
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
      const data = await api<{ reply: string }>("/crm/agent/try", { method: "POST", body: { config, messages: next } });
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
