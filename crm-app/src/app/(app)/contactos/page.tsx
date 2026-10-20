"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfigPending, useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import { channelOf, leadName, OWNER_PILL, ownerOf, shortTime } from "@/lib/format";
import type { Lead } from "@/lib/types";

export default function ContactosPage() {
  const { leads, config, configError, reloadLeads } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"board" | "list">("list");
  const [stageFilter, setStageFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [over, setOver] = useState("");
  const [error, setError] = useState("");
  const [moved, setMoved] = useState<Record<string, string>>({});

  const stages = (config?.pipeline?.stages || []).filter((s) => s.is_active !== false);
  if (!config) return <ConfigPending error={configError} />;
  if (!leads) return <p className="loading">Cargando…</p>;

  const q = query.trim().toLowerCase();
  const visible = leads
    .map((lead) => (moved[lead.id] ? { ...lead, crm_status: moved[lead.id] } : lead))
    .filter((lead) => !q || [lead.name, lead.email, lead.phone, lead.company_name, lead.interest_service].some((v) => String(v || "").toLowerCase().includes(q)));
  const stageOf = (lead: Lead) => (stages.some((s) => s.key === lead.crm_status) ? lead.crm_status : stages[0]?.key);
  const services = [...new Set(leads.map((l) => l.interest_service).filter(Boolean) as string[])].sort();
  const rows = visible.filter((lead) => (!stageFilter || stageOf(lead) === stageFilter) && (!serviceFilter || lead.interest_service === serviceFilter));
  const open = (lead: Lead) => router.push(`/conversaciones?c=${lead.conversation_id}`);

  async function remove(lead: Lead) {
    if (!window.confirm(`¿Eliminar a ${leadName(lead)}? Desaparecerá de Contactos y de Conversaciones. No se puede deshacer.`)) return;
    setError("");
    try {
      await api(`/crm/leads/${lead.id}`, { method: "DELETE" });
      await reloadLeads();
    } catch (err) {
      setError((err as Error).message);
    }
  }

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
          <p className="sub">Tu asistente los mueve de estado; tú solo corriges si hace falta.</p>
        </div>
        <div className="board-tools">
          <input className="search" type="search" placeholder="Buscar contacto" aria-label="Buscar contacto" value={query} onChange={(e) => setQuery(e.target.value)} />
          {view === "list" && (
            <>
              <select className="search" aria-label="Filtrar por estado" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                <option value="">Todos los estados</option>
                {stages.map((s) => <option key={s.key} value={s.key}>{s.label || s.key}</option>)}
              </select>
              <select className="search" aria-label="Filtrar por servicio" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
                <option value="">Todos los servicios</option>
                {services.map((sv) => <option key={sv} value={sv}>{sv}</option>)}
              </select>
            </>
          )}
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
          <table className="table">
            <thead>
              <tr>{["Nombre", "Apellidos", "Email", "Teléfono", "Servicio", "Presupuesto", "Estado", ""].map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((lead) => {
                const [first, ...rest] = String(lead.name || "").trim().split(/s+/);
                return (
                  <tr key={lead.id} onClick={() => open(lead)}>
                    <td><b>{first || leadName(lead)}</b></td>
                    <td>{rest.join(" ") || "—"}</td>
                    <td>{lead.email || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{lead.phone || "—"}</td>
                    <td>{lead.interest_service || "—"}</td>
                    <td>{lead.budget_range || "—"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select className="search" aria-label={`Estado de ${leadName(lead)}`} value={stageOf(lead) || ""} onChange={(e) => move(lead.id, e.target.value)}>
                        {stages.map((s) => <option key={s.key} value={s.key}>{s.label || s.key}</option>)}
                      </select>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn ghost small" aria-label={`Eliminar a ${leadName(lead)}`} onClick={() => remove(lead)}>Eliminar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="empty">No hay contactos con estos filtros.</p>}
        </div>
      )}
    </section>
  );
}
