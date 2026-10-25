"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SettingsTabs } from "@/components/settings-tabs";
import { api } from "@/lib/api";

type Tag = { tag: string; count: number };

export default function EtiquetasPage() {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [editing, setEditing] = useState<{ tag: string; value: string } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ tags: Tag[] }>("/crm/settings/tags").then((d) => setTags(d.tags)).catch((e) => setMsg({ kind: "error", text: (e as Error).message }));
  }, []);
  useEffect(load, [load]);

  async function rename(from: string, to: string) {
    if (!to && !window.confirm(`¿Quitar la etiqueta «${from}» de todos los contactos? Las automatizaciones que se disparan con ella quedarán en pausa.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ updated: number; automations: number }>("/crm/settings/tags/rename", { method: "POST", body: { from, to } });
      const autos = r.automations ? ` y ${r.automations} automatización${r.automations === 1 ? "" : "es"}` : "";
      setMsg({ kind: "ok", text: to ? `«${from}» ahora es «${to}» en ${r.updated} contactos${autos}.` : `Etiqueta quitada de ${r.updated} contactos${autos ? `; pausada${r.automations === 1 ? "" : "s"} ${r.automations} automatización${r.automations === 1 ? "" : "es"}` : ""}.` });
      setEditing(null);
      load();
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
          <p className="sub">Etiquetas: agrupa contactos para enviarles campañas o lanzar automatizaciones.</p>
        </div>
      </div>
      <SettingsTabs />

      <div className="card block">
        <h2>Cómo se usan</h2>
        <ol className="conv-flow tags-flow">
          <li><span className="conv-ico" aria-hidden>🏷️</span><b>1. Pones la etiqueta</b><span>En <Link href="/contactos">Contactos</Link> (columna Etiquetas) o al importar un CSV.</span></li>
          <li><span className="conv-ico" aria-hidden>🎯</span><b>2. Segmentas</b><span>En una campaña eliges «con la etiqueta…» para escribir solo a ese grupo.</span></li>
          <li><span className="conv-ico" aria-hidden>⚡</span><b>3. Automatizas</b><span>Una automatización puede arrancar cuando alguien recibe la etiqueta.</span></li>
        </ol>
      </div>

      <div className="card block">
        <h2>Tus etiquetas</h2>
        <p className="hint">Renombrar o quitar una etiqueta la cambia en todos los contactos y en las automatizaciones que la usan.</p>
        {msg && <p className={`alert ${msg.kind}`} role="status">{msg.text}</p>}
        {tags === null ? <p className="loading">Cargando…</p> : tags.length === 0 ? (
          <p className="empty">Aún no hay etiquetas. Añade la primera desde <Link href="/contactos">Contactos</Link>.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Etiqueta</th><th>Contactos</th><th /></tr></thead>
              <tbody>
                {tags.map((t) => (
                  <tr key={t.tag} style={{ cursor: "default" }}>
                    <td>
                      {editing?.tag === t.tag ? (
                        <form style={{ display: "flex", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (editing.value.trim()) rename(t.tag, editing.value); }}>
                          <input className="i" autoFocus aria-label="Nuevo nombre" value={editing.value} onChange={(e) => setEditing({ tag: t.tag, value: e.target.value })} />
                          <button className="btn primary small" disabled={busy}>Guardar</button>
                          <button type="button" className="btn ghost small" onClick={() => setEditing(null)}>Cancelar</button>
                        </form>
                      ) : <span className="pill" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{t.tag}</span>}
                    </td>
                    <td>{t.count}</td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      <button className="btn small" disabled={busy} onClick={() => setEditing({ tag: t.tag, value: t.tag })}>Renombrar</button>{" "}
                      <button className="btn ghost small" disabled={busy} onClick={() => rename(t.tag, "")}>Quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
