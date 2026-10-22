"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfigPending, useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import { channelOf, leadName, OWNER_PILL, ownerOf, shortTime } from "@/lib/format";
import type { Lead } from "@/lib/types";

const day = (value?: string | null) => (value ? new Date(value).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" }) : "—");
// Último contacto: el último mensaje de la conversación, o la última actualización si no hay mensajes.
const lastContact = (lead: Lead) => lead.last_message?.created_at || lead.updated_at || lead.created_at;

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

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
    if (!window.confirm(`¿Eliminar a ${leadName(lead)}? Se borran también su conversación y sus mensajes. No se puede deshacer.`)) return;
    setError("");
    try {
      await api(`/crm/leads/${lead.id}`, { method: "DELETE" });
      await reloadLeads();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Acciones sobre varios contactos a la vez: una petición por contacto, en orden.
  async function bulk(action: "delete" | string) {
    const ids = [...selected];
    if (!ids.length) return;
    if (action === "delete" && !window.confirm(`¿Eliminar ${ids.length} contacto${ids.length === 1 ? "" : "s"}? Se borran también sus conversaciones y mensajes. No se puede deshacer.`)) return;
    setBulkBusy(true);
    setError("");
    try {
      for (const id of ids) {
        await api(`/crm/leads/${id}`, action === "delete" ? { method: "DELETE" } : { method: "PATCH", body: { crm_status: action } });
      }
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    }
    await reloadLeads();
    setBulkBusy(false);
  }
  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

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
      {view === "list" && selected.size > 0 && (
        <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", marginBottom: 12 }}>
          <b>{selected.size} seleccionado{selected.size === 1 ? "" : "s"}</b>
          <select className="search" style={{ width: "auto" }} aria-label="Cambiar estado de los seleccionados" value="" disabled={bulkBusy} onChange={(e) => e.target.value && bulk(e.target.value)}>
            <option value="">Cambiar estado a…</option>
            {stages.map((s) => <option key={s.key} value={s.key}>{s.label || s.key}</option>)}
          </select>
          <button className="btn small" disabled={bulkBusy} onClick={() => bulk("delete")}>Eliminar</button>
          <button className="btn ghost small" disabled={bulkBusy} onClick={() => setSelected(new Set())}>Quitar selección</button>
          {bulkBusy && <span className="hint" style={{ margin: 0 }}>Aplicando…</span>}
        </div>
      )}

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
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" aria-label="Seleccionar todos" checked={rows.length > 0 && rows.every((l) => selected.has(l.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((l) => l.id)) : new Set())} />
                </th>
                {["Nombre", "Email", "Teléfono", "Servicio", "Presupuesto", "Entrada", "Último contacto", "Notas internas", "Estado", ""].map((h) => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => {
                return (
                  <tr key={lead.id} onClick={() => open(lead)} aria-selected={selected.has(lead.id)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Seleccionar a ${leadName(lead)}`} checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} />
                    </td>
                    <td><b>{leadName(lead)}</b></td>
                    <td>{lead.email || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{lead.phone || "—"}</td>
                    <td>{lead.interest_service || "—"}</td>
                    <td>{lead.budget_range || "—"}</td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>{day(lead.created_at)}</td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>{day(lastContact(lead))}</td>
                    <td onClick={(e) => e.stopPropagation()}><NoteCell lead={lead} /></td>
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

// Nota interna editable en la propia fila: se guarda al salir del campo.
function NoteCell({ lead }: { lead: Lead }) {
  const [note, setNote] = useState(lead.internal_notes || "");
  const [savedNote, setSavedNote] = useState(lead.internal_notes || "");
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");

  async function save() {
    if (note === savedNote) return;
    setState("saving");
    try {
      await api(`/crm/leads/${lead.id}`, { method: "PATCH", body: { internal_notes: note } });
      setSavedNote(note);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <textarea
      className="search"
      rows={1}
      aria-label={`Notas internas de ${leadName(lead)}`}
      placeholder="Añadir nota…"
      title={state === "error" ? "No se pudo guardar" : state === "saved" ? "Guardada" : note}
      value={note}
      onChange={(e) => { setNote(e.target.value); setState(""); }}
      onBlur={save}
      style={{ minWidth: 180, resize: "vertical", borderColor: state === "error" ? "var(--bad)" : state === "saved" ? "var(--good)" : undefined }}
    />
  );
}
