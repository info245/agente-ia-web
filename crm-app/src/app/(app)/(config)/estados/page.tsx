"use client";

import { useState } from "react";
import { ConfigPending, useSession } from "@/components/app-shell";
import { SettingsTabs } from "@/components/settings-tabs";
import { api } from "@/lib/api";
import type { PipelineStage } from "@/lib/types";

const CATEGORY: Record<string, string> = { open: "En curso", won: "Ganado (cliente)", lost: "Perdido" };

export default function EstadosPage() {
  const { config, configError, leads, reloadConfig } = useSession();
  const [stages, setStages] = useState<PipelineStage[] | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!config) return <ConfigPending error={configError} />;
  const saved = config.pipeline?.stages || [];
  const list = stages ?? saved;
  const savedKeys = new Set(saved.map((s) => s.key));
  const count = (key: string) => (leads || []).filter((l) => l.crm_status === key).length;
  const update = (i: number, patch: Partial<PipelineStage>) => setStages(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...list];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setStages(next);
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/crm/settings/stages", { method: "POST", body: { stages: list.map((s, position) => ({ ...s, position })) } });
      await reloadConfig();
      setStages(null);
      setMsg({ kind: "ok", text: "Estados guardados. Ya los ves en Contactos y en Conversaciones." });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Configuración</h1>
          <p className="sub">Estados: las etapas por las que pasa un contacto hasta hacerse cliente.</p>
        </div>
      </div>
      <SettingsTabs />

      <div className="card block">
        <h2>Tu embudo</h2>
        <p className="hint">Así se ve el recorrido. Los que están «Ganado» cuentan como venta en Resultados y en Conversiones.</p>
        <div className="stage-flow">
          {list.filter((s) => s.is_active !== false).map((s) => (
            <span key={s.key || s.label} className="stage-chip" style={{ borderColor: s.color, color: s.color }}>
              {s.label || "Sin nombre"} <b>{s.key ? count(s.key) : 0}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="card block">
        <h2>Etapas</h2>
        <p className="hint">Cambia el nombre, el color y el orden. Una etapa con contactos no se borra: se oculta y deja de aparecer para elegir.</p>
        <div className="stage-list">
          {list.map((s, i) => (
            <div key={s.key || `nuevo-${i}`} className={`stage-row${s.is_active === false ? " off" : ""}`}>
              <div className="stage-move">
                <button className="btn ghost small" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="btn ghost small" aria-label="Bajar" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
              </div>
              <input type="color" aria-label={`Color de ${s.label}`} value={s.color || "#6d41f3"} onChange={(e) => update(i, { color: e.target.value })} />
              <input className="i" aria-label="Nombre de la etapa" value={s.label || ""} placeholder="Nombre de la etapa" onChange={(e) => update(i, { label: e.target.value })} />
              <select className="i" aria-label="Tipo" value={s.category || "open"} onChange={(e) => update(i, { category: e.target.value as PipelineStage["category"] })}>
                {Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <span className="stage-count">{s.key ? `${count(s.key)} contacto${count(s.key) === 1 ? "" : "s"}` : "Nueva"}</span>
              {savedKeys.has(s.key) ? (
                <button className="btn small" onClick={() => update(i, { is_active: s.is_active === false })}>{s.is_active === false ? "Mostrar" : "Ocultar"}</button>
              ) : (
                <button className="btn small" onClick={() => setStages(list.filter((_, j) => j !== i))}>Quitar</button>
              )}
            </div>
          ))}
        </div>
        <div className="row-actions">
          <button className="btn" onClick={() => setStages([...list, { key: "", label: "", category: "open", color: "#6d41f3", is_active: true }])}>+ Añadir etapa</button>
          <button className="btn primary" disabled={busy || !stages} onClick={save}>{busy ? "Guardando…" : "Guardar"}</button>
          {stages && <button className="btn ghost" onClick={() => setStages(null)}>Descartar cambios</button>}
        </div>
        {msg && <p className={`alert ${msg.kind}`} role="status" style={{ marginTop: 10 }}>{msg.text}</p>}
        <p className="hint" style={{ margin: "12px 0 0" }}>Tiene que haber al menos una etapa «En curso», una «Ganado» y una «Perdido». Los contadores son de los últimos 200 contactos.</p>
      </div>
    </section>
  );
}
