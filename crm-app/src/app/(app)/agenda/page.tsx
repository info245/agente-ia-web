"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import type { Booking } from "@/lib/types";

type Slot = { start: string; label: string };
type Data = { bookings: Booking[]; calendar_connected: boolean };

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const when = (iso: string) => `${dayKey(iso)} a las ${time(iso)}`;
const firstName = (b: Booking) => (b.attendee_name || "").split(" ")[0] || "";

export default function AgendaPage() {
  const { can } = useSession();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ booking: Booking; mode: "move" | "cancel" } | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setData(await api<Data>("/crm/bookings"));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  if (error) return <section className="page"><p className="alert error">{error}</p></section>;
  if (!data) return <p className="loading">Cargando…</p>;

  const upcoming = data.bookings.filter((b) => Date.parse(b.starts_at) >= now - 60 * 60 * 1000);
  const past = data.bookings.filter((b) => Date.parse(b.starts_at) < now - 60 * 60 * 1000).reverse();
  const days = [...new Set(upcoming.map((b) => dayKey(b.starts_at)))];

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Agenda</h1>
          <p className="sub">Videollamadas que ha reservado tu asistente en tu Google Calendar</p>
        </div>
      </div>
      {!data.calendar_connected && (
        <p className="alert warn">Tu calendario no está conectado, así que tu asistente no puede reservar. <Link href="/canales">Conéctalo en Canales</Link>.</p>
      )}
      {notice && <p className={`alert ${notice.kind}`} role="status" style={{ marginBottom: 14 }}>{notice.text}</p>}

      {upcoming.length === 0 && <div className="card"><p className="empty">No hay videollamadas próximas.</p></div>}
      {days.map((day) => (
        <div className="card panel" key={day} style={{ marginBottom: 14 }}>
          <h2 style={{ textTransform: "capitalize" }}>{day}</h2>
          {upcoming.filter((b) => dayKey(b.starts_at) === day).map((b) => (
            <div key={b.id}>
              <div className="todo">
                <div className="ch web" style={{ width: 52, borderRadius: 8, fontSize: 13 }}>{time(b.starts_at)}</div>
                <div className="who">
                  <b>{b.attendee_name || "Sin nombre"}</b>
                  <span>{b.attendee_email}{b.ends_at ? ` · hasta las ${time(b.ends_at)}` : ""}</span>
                </div>
                {b.conversation_id && <Link className="btn small" href={`/conversaciones?c=${b.conversation_id}`}>Conversación</Link>}
                {can("write") && <>
                <button className="btn small" disabled={!data.calendar_connected} onClick={() => { setNotice(null); setEditing({ booking: b, mode: "move" }); }}>Cambiar hora</button>
                <button className="btn small" disabled={!data.calendar_connected} onClick={() => { setNotice(null); setEditing({ booking: b, mode: "cancel" }); }}>Cancelar</button>
                </>}
              </div>
              {editing?.booking.id === b.id && (
                <ChangeBooking
                  booking={b}
                  mode={editing.mode}
                  onClose={() => setEditing(null)}
                  onDone={async (text, kind) => { setEditing(null); setNotice({ kind, text }); await load(); }}
                />
              )}
            </div>
          ))}
        </div>
      ))}

      {past.length > 0 && (
        <details className="card panel">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Pasadas (últimos 30 días): {past.length}</summary>
          {past.map((b) => (
            <div className="todo" key={b.id}>
              <div className="who"><b>{b.attendee_name || "Sin nombre"}</b><span>{when(b.starts_at)}</span></div>
              {b.conversation_id && <Link className="btn small" href={`/conversaciones?c=${b.conversation_id}`}>Conversación</Link>}
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

function ChangeBooking({ booking, mode, onClose, onDone }: {
  booking: Booking;
  mode: "move" | "cancel";
  onClose: () => void;
  onDone: (text: string, kind: "ok" | "warn") => Promise<void>;
}) {
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [notify, setNotify] = useState(Boolean(booking.conversation_id));
  const [text, setText] = useState(() =>
    mode === "cancel"
      ? `Hola ${firstName(booking)}, tenemos que cancelar la videollamada del ${when(booking.starts_at)}. ¿Te viene bien que busquemos otro momento?`
      : ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "move") return;
    let cancelled = false;
    api<{ slots: Slot[] }>(`/crm/calendar/slots?from=${from}&days=7`)
      .then((d) => !cancelled && setSlots(d.slots))
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => { cancelled = true; };
  }, [from, mode]);

  function pick(s: Slot) {
    setSlot(s);
    setText(`Hola ${firstName(booking)}, te escribo para mover nuestra videollamada al ${when(s.start)}. Te llegará la invitación actualizada por email. Si no te viene bien, dímelo y buscamos otro hueco.`);
  }

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const path = mode === "move" ? "reschedule" : "cancel";
      const result = await api<{ notified?: { sent: boolean; reason?: string } }>(`/crm/bookings/${booking.id}/${path}`, {
        method: "POST",
        body: { ...(mode === "move" ? { start: slot?.start } : {}), message: notify ? text : "" },
      });
      const base = mode === "move" ? `Videollamada movida al ${when(slot!.start)}. Google le ha enviado la invitación actualizada.` : "Videollamada cancelada. Google le ha avisado por email.";
      const n = result.notified;
      if (notify && n && !n.sent && n.reason === "whatsapp_window_closed") {
        await onDone(`${base} No se le pudo escribir por WhatsApp porque han pasado más de 24 h desde su último mensaje.`, "warn");
      } else {
        await onDone(`${base}${notify && n?.sent ? " También le has escrito por su chat." : ""}`, "ok");
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const byDay = (slots || []).reduce<Record<string, Slot[]>>((acc, s) => {
    (acc[dayKey(s.start)] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="faq-row" style={{ margin: "4px 0 12px" }}>
      {mode === "move" && (
        <>
          <label className="f" style={{ marginTop: 0 }}>Buscar huecos libres desde
            <input className="i" type="date" value={from} min={new Date().toISOString().slice(0, 10)} onChange={(e) => { setSlots(null); setSlot(null); setFrom(e.target.value); }} style={{ maxWidth: 200 }} />
          </label>
          {slots === null && !error && <p className="loading" style={{ padding: 8 }}>Buscando huecos en tu calendario…</p>}
          {slots?.length === 0 && <p className="empty" style={{ padding: 8 }}>No hay huecos libres esa semana.</p>}
          {Object.entries(byDay).map(([day, list]) => (
            <div key={day}>
              <p style={{ margin: "6px 0 4px", fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{day}</p>
              <div className="tones" style={{ marginBottom: 0 }}>
                {list.map((s) => <button key={s.start} className="chip" aria-pressed={slot?.start === s.start} onClick={() => pick(s)}>{time(s.start)}</button>)}
              </div>
            </div>
          ))}
        </>
      )}
      {(mode === "cancel" || slot) && booking.conversation_id && (
        <>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginTop: 6 }}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Avisarle también por su chat (WhatsApp o web)
          </label>
          {notify && <textarea className="i" rows={3} aria-label="Mensaje para el cliente" value={text} onChange={(e) => setText(e.target.value)} />}
        </>
      )}
      {error && <p className="alert error" role="alert">{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button className="btn primary" disabled={busy || (mode === "move" && !slot)} onClick={confirm}>
          {busy ? "Guardando…" : mode === "move" ? "Confirmar nueva hora" : "Cancelar videollamada"}
        </button>
        <button className="btn" onClick={onClose} disabled={busy}>Volver</button>
      </div>
    </div>
  );
}
