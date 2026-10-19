"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import { channelOf, leadName, OWNER_PILL, ownerOf, shortTime } from "@/lib/format";
import type { Lead } from "@/lib/types";

export default function ContactosPage() {
  const { leads, config, reloadLeads } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [over, setOver] = useState("");
  const [error, setError] = useState("");
  const [moved, setMoved] = useState<Record<string, string>>({});

  const stages = (config?.pipeline?.stages || []).filter((s) => s.is_active !== false);
  if (!leads || !config) return <p className="loading">Cargando…</p>;

  const q = query.trim().toLowerCase();
  const visible = leads
    .map((lead) => (moved[lead.id] ? { ...lead, crm_status: moved[lead.id] } : lead))
    .filter((lead) => !q || [lead.name, lead.email, lead.phone, lead.company_name, lead.interest_service].some((v) => String(v || "").toLowerCase().includes(q)));
  const stageOf = (lead: Lead) => (stages.some((s) => s.key === lead.crm_status) ? lead.crm_status : stages[0]?.key);
  const open = (lead: Lead) => router.push(`/conversaciones?c=${lead.conversation_id}`);

  async function move(leadId: string, stage: string) {
    setMoved((m) => ({ ...m, [leadId]: stage }));
    setError("");
    try {
      await api(`/crm/leads/${leadId}`, { method: "PATCH", body: { crm_status: stage } });
      await reloadLeads();
    } catch (err) {
      setError((err as Error).message);
    }
    setMoved((m) => {
      const next = { ...m };
      delete next[leadId];
      return next;
    });
  }

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Contactos</h1>
          <p className="sub">Tu asistente los mueve de etapa; tú solo corriges si hace falta. Arrastra una tarjeta para cambiarla.</p>
        </div>
        <div className="board-tools">
          <input className="search" type="search" placeholder="Buscar contacto" aria-label="Buscar contacto" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn" onClick={() => setView(view === "board" ? "list" : "board")}>{view === "board" ? "Ver como lista" : "Ver por etapas"}</button>
        </div>
      </div>
      {error && <p className="alert error" role="alert">{error}</p>}

      {view === "board" ? (
        <div className="board">
          {stages.map((stage) => {
            const items = visible.filter((lead) => stageOf(lead) === stage.key);
            return (
              <div
                key={stage.key}
                className={`col${over === stage.key ? " over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setOver(stage.key); }}
                onDragLeave={() => setOver("")}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver("");
                  const id = e.dataTransfer.getData("text/plain");
                  const lead = visible.find((l) => l.id === id);
                  if (lead && stageOf(lead) !== stage.key) move(id, stage.key);
                }}
              >
                <h3>{stage.label || stage.key} <span>{items.length}</span></h3>
                {items.map((lead) => {
                  const owner = OWNER_PILL[ownerOf(lead)];
                  return (
                    <button key={lead.id} className="tile" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)} onClick={() => open(lead)}>
                      <b>{leadName(lead)}</b>
                      <div className="svc">{[lead.interest_service, lead.business_type].filter(Boolean).join(" · ") || channelOf(lead).label}</div>
                      <div className="row"><span className={`pill ${owner.css}`}>{owner.label}</span><span>{shortTime(lead.updated_at || lead.created_at)}</span></div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 13 }}>
                {["Nombre", "Le interesa", "Contacto", "Canal", "Etapa", "Último movimiento"].map((h) => <th key={h} style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontWeight: 500 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map((lead) => (
                <tr key={lead.id} onClick={() => open(lead)} style={{ cursor: "pointer" }}>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}><b>{leadName(lead)}</b></td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>{lead.interest_service || "—"}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>{lead.email || lead.phone || "—"}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>{channelOf(lead).label}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>{stages.find((s) => s.key === stageOf(lead))?.label || "—"}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", color: "var(--muted)" }}>{shortTime(lead.updated_at || lead.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p className="empty">No hay contactos con esa búsqueda.</p>}
        </div>
      )}
    </section>
  );
}
