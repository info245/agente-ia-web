"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConfigPending, useSession } from "@/components/app-shell";
import { SettingsTabs } from "@/components/settings-tabs";
import { api } from "@/lib/api";
import type { Meeting, WhatsAppTemplate } from "@/lib/types";

const DAYS = [[1, "L", "lunes"], [2, "M", "martes"], [3, "X", "miércoles"], [4, "J", "jueves"], [5, "V", "viernes"], [6, "S", "sábado"], [0, "D", "domingo"]] as const;
const NOTICE = [[0, "Sin antelación"], [1, "1 hora"], [2, "2 horas"], [4, "4 horas"], [12, "12 horas"], [24, "1 día"], [48, "2 días"]] as const;
const REMINDERS = [[48, "2 días antes"], [24, "1 día antes"], [2, "2 horas antes"], [1, "1 hora antes"]] as const;
const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;

function fromConfig(m: Meeting = {}): Meeting {
  return {
    days: m.days?.length ? m.days : [1, 2, 3, 4, 5],
    ranges: m.ranges?.length ? m.ranges : [{ start: pad(m.start_hour ?? 9), end: pad(m.end_hour ?? 18) }],
    duration_minutes: m.duration_minutes ?? 30,
    slot_step_minutes: m.slot_step_minutes ?? 0,
    buffer_minutes: m.buffer_minutes ?? 0,
    min_notice_hours: m.min_notice_hours ?? 1,
    max_days_ahead: m.max_days_ahead ?? 14,
    timezone: m.timezone || "Europe/Madrid",
    confirmation_email: m.confirmation_email !== false,
    reminders: m.reminders ?? [24, 2],
    reminder_template_name: m.reminder_template_name || "",
    reminder_template_language: m.reminder_template_language || "es",
  };
}

// Resumen en una frase, para ver de un vistazo qué ofrece el asistente.
function summary(m: Meeting) {
  const days = DAYS.filter(([d]) => (m.days || []).includes(d)).map(([, , name]) => name);
  const ranges = (m.ranges || []).map((r) => `${r.start}–${r.end}`).join(" y ");
  const notice = NOTICE.find(([h]) => h === m.min_notice_hours)?.[1] || `${m.min_notice_hours} h`;
  return `${days.join(", ") || "Ningún día"} · ${ranges} · citas de ${m.duration_minutes} min${m.buffer_minutes ? ` con ${m.buffer_minutes} min de descanso` : ""} · ${m.min_notice_hours ? `con ${notice} de antelación` : "sin antelación mínima"} · hasta ${m.max_days_ahead} días vista`;
}

export default function DisponibilidadPage() {
  const { config, configError, reloadConfig } = useSession();
  const [m, setM] = useState<Meeting | null>(null);
  const [templates, setTemplates] = useState<WhatsAppTemplate[] | null>(null);
  const [slots, setSlots] = useState<{ start: string; label: string }[] | null>(null);
  const [slotsError, setSlotsError] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSlots = () => {
    setSlotsError("");
    api<{ slots: { start: string; label: string }[] }>("/crm/calendar/slots?days=7").then((r) => setSlots(r.slots)).catch((e) => setSlotsError((e as Error).message));
  };
  useEffect(() => {
    api<{ templates: WhatsAppTemplate[] }>("/crm/whatsapp/templates").then((d) => setTemplates(d.templates.filter((t) => t.sendable && t.params === 2))).catch(() => setTemplates([]));
    Promise.resolve().then(loadSlots);
  }, []);

  if (!config) return <ConfigPending error={configError} />;
  const draft = m ?? fromConfig(config.agent?.meeting);
  const set = (part: Partial<Meeting>) => setM({ ...draft, ...part });
  const ranges = draft.ranges || [];
  const setRange = (i: number, part: Partial<{ start: string; end: string }>) => set({ ranges: ranges.map((r, j) => (j === i ? { ...r, ...part } : r)) });
  const badRange = ranges.some((r) => !r.start || !r.end || r.start >= r.end);
  const calendarConnected = Boolean(config.integrations?.calendar?.google_refresh_token_configured);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/crm/settings/meeting", { method: "POST", body: { meeting: draft } });
      await reloadConfig();
      setM(null);
      setMsg({ kind: "ok", text: "Guardado. El asistente ya ofrece los huecos con este horario." });
      loadSlots();
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
          <p className="sub">Agenda: cuándo puede reservar el cliente y qué mensajes recibe antes de la cita.</p>
        </div>
      </div>
      <SettingsTabs />

      {!calendarConnected && <p className="alert warn">El calendario no está conectado: el asistente no puede reservar hasta que lo conectes en <Link href="/canales">Canales</Link>.</p>}

      <div className="card block">
        <h2>Cuándo se puede reservar</h2>
        <p className="hint">{summary(draft)}.</p>

        <label className="f">Días</label>
        <div className="tones">
          {DAYS.map(([day, label, name]) => {
            const on = (draft.days || []).includes(day);
            return <button key={day} type="button" className="chip" aria-pressed={on} aria-label={name} onClick={() => set({ days: on ? (draft.days || []).filter((d) => d !== day) : [...(draft.days || []), day] })}>{label}</button>;
          })}
        </div>

        <label className="f">Tramos horarios</label>
        <div style={{ display: "grid", gap: 8 }}>
          {ranges.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input className="i" type="time" step={900} style={{ width: 130 }} aria-label={`Inicio del tramo ${i + 1}`} value={r.start} onChange={(e) => setRange(i, { start: e.target.value })} />
              <span>a</span>
              <input className="i" type="time" step={900} style={{ width: 130 }} aria-label={`Fin del tramo ${i + 1}`} value={r.end} onChange={(e) => setRange(i, { end: e.target.value })} />
              {ranges.length > 1 && <button type="button" className="btn ghost small" onClick={() => set({ ranges: ranges.filter((_, j) => j !== i) })}>Quitar</button>}
            </div>
          ))}
          {ranges.length < 4 && <div><button type="button" className="btn small" onClick={() => set({ ranges: [...ranges, { start: "16:00", end: "19:00" }] })}>+ Añadir tramo (p. ej. por la tarde)</button></div>}
          {badRange && <p className="alert error" style={{ margin: 0 }}>Cada tramo tiene que acabar después de empezar.</p>}
        </div>

        <div className="conv-fields" style={{ marginTop: 14 }}>
          <label className="f">Duración de la cita
            <select className="i" value={draft.duration_minutes} onChange={(e) => set({ duration_minutes: Number(e.target.value) })}>
              {[15, 20, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} min</option>)}
            </select>
          </label>
          <label className="f">Los huecos empiezan
            <select className="i" value={draft.slot_step_minutes} onChange={(e) => set({ slot_step_minutes: Number(e.target.value) })}>
              <option value={0}>Uno detrás de otro (cada {draft.duration_minutes} min)</option>
              {[15, 30, 60].map((n) => <option key={n} value={n}>Cada {n} min</option>)}
            </select>
          </label>
          <label className="f">Descanso entre citas
            <select className="i" value={draft.buffer_minutes} onChange={(e) => set({ buffer_minutes: Number(e.target.value) })}>
              {[0, 5, 10, 15, 30].map((n) => <option key={n} value={n}>{n ? `${n} min` : "Sin descanso"}</option>)}
            </select>
          </label>
          <label className="f">Antelación mínima
            <select className="i" value={draft.min_notice_hours} onChange={(e) => set({ min_notice_hours: Number(e.target.value) })}>
              {NOTICE.map(([h, label]) => <option key={h} value={h}>{label}</option>)}
            </select>
          </label>
          <label className="f">Se puede reservar hasta
            <select className="i" value={draft.max_days_ahead} onChange={(e) => set({ max_days_ahead: Number(e.target.value) })}>
              {[7, 14, 21, 30, 60].map((n) => <option key={n} value={n}>{n} días vista</option>)}
            </select>
          </label>
          <label className="f">Zona horaria
            <select className="i" value={draft.timezone} onChange={(e) => set({ timezone: e.target.value })}>
              {["Europe/Madrid", "Atlantic/Canary", "Europe/Lisbon", "America/Mexico_City", "America/Bogota", "America/Argentina/Buenos_Aires"].map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
            </select>
          </label>
        </div>
        <p className="hint" style={{ margin: "4px 0 0" }}>Los huecos que ya tienes ocupados en tu Google Calendar nunca se ofrecen. Cuándo propone el asistente una videollamada se decide en <Link href="/asistente">Mi asistente → Cuándo actúa</Link>.</p>
      </div>

      <div className="card block">
        <h2>Mensajes al cliente</h2>
        <p className="hint">Además de la invitación de Google Calendar. Si cancela o reagenda, se ajustan solos.</p>
        <label className="conv-switch"><input type="checkbox" checked={draft.confirmation_email !== false} onChange={(e) => set({ confirmation_email: e.target.checked })} /> Email de confirmación al reservar</label>
        <label className="f">Recordatorios (hasta 3)</label>
        <div className="tones">
          {REMINDERS.map(([h, label]) => {
            const on = (draft.reminders || []).includes(h);
            const full = !on && (draft.reminders || []).length >= 3;
            return <button key={h} type="button" className="chip" aria-pressed={on} disabled={full} onClick={() => set({ reminders: on ? (draft.reminders || []).filter((x) => x !== h) : [...(draft.reminders || []), h] })}>{on ? "✓ " : ""}{label}</button>;
          })}
        </div>
        <p className="hint" style={{ margin: "8px 0 0" }}>Se envían por WhatsApp si te escribió por WhatsApp en las últimas 24 h; si no, con la plantilla de abajo; y si no hay plantilla, por email.</p>
        <label className="f" htmlFor="rem-tpl">Plantilla de WhatsApp para recordatorios (opcional)</label>
        <select id="rem-tpl" className="i" value={draft.reminder_template_name ? `${draft.reminder_template_name}|${draft.reminder_template_language}` : ""} onChange={(e) => { const [name, language] = e.target.value.split("|"); set({ reminder_template_name: name || "", reminder_template_language: language || "es" }); }}>
          <option value="">{templates === null ? "Cargando plantillas…" : templates.length ? "Sin plantilla (pasadas 24 h, por email)" : "No hay plantillas aprobadas con nombre y fecha"}</option>
          {(templates || []).map((t) => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name.replace(/_/g, " ")} · {t.language}</option>)}
        </select>
        <p className="hint" style={{ margin: "6px 0 0" }}>La plantilla lleva dos datos: {"{{1}}"} su nombre y {"{{2}}"} el día y la hora. Por ejemplo, «Hola {"{{1}}"}, te recordamos tu videollamada con TMedia Global el {"{{2}}"}. Si no puedes asistir, responde a este mensaje.» (categoría Utilidad).</p>
      </div>

      <div className="row-actions" style={{ marginBottom: 14 }}>
        <button className="btn primary" disabled={busy || !m || badRange || !(draft.days || []).length} onClick={save}>{busy ? "Guardando…" : "Guardar"}</button>
        {m && <button className="btn ghost" onClick={() => setM(null)}>Descartar cambios</button>}
      </div>
      {msg && <p className={`alert ${msg.kind}`} role="status">{msg.text}</p>}

      <div className="card block">
        <div className="panel-head"><h2>Próximos huecos que ofrece el asistente</h2><button className="btn ghost small" onClick={loadSlots}>Actualizar</button></div>
        {slotsError ? <p className="hint" style={{ margin: 0 }}>{calendarConnected ? `No se pudieron consultar: ${slotsError}` : "Conecta el calendario para verlos."}</p> : slots === null ? <p className="loading">Consultando tu calendario…</p> : slots.length === 0 ? (
          <p className="empty">Ningún hueco libre en los próximos 7 días con este horario.</p>
        ) : (
          <div className="stage-flow">{slots.slice(0, 12).map((s) => <span key={s.start} className="chip">{s.label}</span>)}</div>
        )}
        <p className="hint" style={{ margin: "8px 0 0" }}>Con lo guardado. Si cambias algo, guarda y pulsa «Actualizar».</p>
      </div>
    </section>
  );
}
