"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import { channelOf, leadName, ownerOf, relative, startOfWeek } from "@/lib/format";
import type { Booking, Onboarding } from "@/lib/types";

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

function greeting() {
  const hour = new Date().getHours();
  return hour < 14 ? "Buenos días" : hour < 21 ? "Buenas tardes" : "Buenas noches";
}

export default function InicioPage() {
  const { user, leads } = useSession();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);

  useEffect(() => {
    api<{ bookings: Booking[] }>("/crm/bookings")
      .then((data) => setBookings(data.bookings))
      .catch(() => setBookings([]));
    api<{ onboarding: Onboarding | null }>("/crm/onboarding").then((d) => setOnboarding(d.onboarding)).catch(() => null);
  }, []);

  if (!leads) return <p className="loading">Cargando…</p>;

  const weekStart = startOfWeek();
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 864e5);
  const weekEnd = new Date(weekStart.getTime() + 7 * 864e5);
  const created = (lead: { created_at?: string }) => new Date(lead.created_at || 0);
  const thisWeek = leads.filter((lead) => created(lead) >= weekStart);
  const lastWeek = leads.filter((lead) => created(lead) >= lastWeekStart && created(lead) < weekStart);
  const byAi = thisWeek.filter((lead) => lead.ai_status !== "paused").length;
  const waiting = leads
    .filter((lead) => ownerOf(lead) === "waiting")
    .sort((a, b) => (b.last_message?.created_at || b.updated_at || "").localeCompare(a.last_message?.created_at || a.updated_at || ""));
  const upcoming = (bookings || []).filter((b) => new Date(b.starts_at) >= new Date());
  const diff = thisWeek.length - lastWeek.length;

  const perDay = DAYS.map((_, i) => {
    const start = new Date(weekStart.getTime() + i * 864e5);
    const end = new Date(start.getTime() + 864e5);
    return thisWeek.filter((lead) => created(lead) >= start && created(lead) < end).length;
  });
  const max = Math.max(1, ...perDay);
  const todayIndex = (new Date().getDay() + 6) % 7;
  const range = `${weekStart.toLocaleDateString("es-ES", { day: "numeric" })} al ${new Date(weekEnd.getTime() - 1).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}`;

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>{greeting()}, {user.display_name?.split(" ")[0] || user.email.split("@")[0]}</h1>
          <p className="sub">Esta semana · {range}</p>
        </div>
      </div>

      {onboarding && !onboarding.completed && <MissingSteps onboarding={onboarding} />}

      <div className="kpis">
        <div className="card kpi">
          <div className="l">Leads nuevos</div>
          <div className="n">{thisWeek.length}</div>
          <div className="d">
            {diff === 0 ? "Igual que la semana pasada" : <><b className={diff < 0 ? "down" : undefined}>{diff > 0 ? `+${diff}` : diff}</b> que la semana pasada</>}
          </div>
        </div>
        <div className="card kpi">
          <div className="l">Atendidos por tu asistente</div>
          <div className="n">{byAi}</div>
          <div className="d">{thisWeek.length ? `${Math.round((byAi / thisWeek.length) * 100)} % sin que tuvieras que intervenir` : "Todavía no hay leads esta semana"}</div>
        </div>
        <Link href="/conversaciones?f=waiting" className={`card kpi${waiting.length ? " attn" : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="l">Te esperan a ti</div>
          <div className="n">{waiting.length}</div>
          <div className="d">{waiting.length ? "Pidieron hablar con una persona" : "Nadie pendiente. ¡Bien!"}</div>
        </Link>
        <Link href="/agenda" className="card kpi" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="l">Videollamadas reservadas</div>
          <div className="n">{bookings ? upcoming.length : "…"}</div>
          <div className="d">
            {upcoming[0]
              ? `Próxima: ${new Date(upcoming[0].starts_at).toLocaleString("es-ES", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
              : "Ninguna próxima"}
          </div>
        </Link>
      </div>

      <div className="home-grid">
        <div className="card panel">
          <h2>Requiere tu atención</h2>
          {waiting.length === 0 && <p className="empty">Tu asistente está atendiendo todas las conversaciones.</p>}
          {waiting.slice(0, 6).map((lead) => {
            const ch = channelOf(lead);
            return (
              <div className="todo" key={lead.id}>
                <div className={`ch ${ch.css}`} title={ch.label}>{ch.short}</div>
                <div className="who">
                  <b>{leadName(lead)}{lead.business_type ? ` · ${lead.business_type}` : ""}</b>
                  <span>{lead.last_message?.content || lead.interest_service || "Sin mensajes"}</span>
                </div>
                <span className="pill p-new">{relative(lead.last_message?.created_at || lead.updated_at)}</span>
                <Link className="btn" href={`/conversaciones?c=${lead.conversation_id}`}>Responder</Link>
              </div>
            );
          })}
        </div>
        <div className="card panel">
          <h2>Leads por día</h2>
          <div className="chart" role="img" aria-label={`Leads por día esta semana: ${perDay.map((n, i) => `${DAYS[i]} ${n}`).join(", ")}`}>
            {perDay.map((n, i) => (
              <div className="bar" key={DAYS[i]}>
                {n > 0 && <em>{n}</em>}
                <i className={i === todayIndex ? "today" : undefined} style={{ height: `${(n / max) * 80}%` }} />
                <small>{DAYS[i]}</small>
              </div>
            ))}
          </div>
          <div className="legend"><span>Leads</span><span className="today">Hoy</span></div>
        </div>
      </div>
    </section>
  );
}

// Mientras el alta guiada no esté completa: qué falta y un botón para seguir donde se dejó.
function MissingSteps({ onboarding }: { onboarding: Onboarding }) {
  const pending = onboarding.steps.filter((s) => !s.done);
  const done = onboarding.steps.length - pending.length;
  return (
    <div className="card block" style={{ marginBottom: 14, borderColor: "var(--accent)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h2>Te falta poco para activar tu asistente</h2>
          <p className="hint" style={{ margin: "4px 0 0" }}>{done} de {onboarding.steps.length} pasos hechos. Te falta: {pending.map((s) => s.label.toLowerCase()).join(", ")}.</p>
        </div>
        <Link className="btn primary" href="/alta">{done ? "Continuar" : "Empezar"}</Link>
      </div>
      <div className="progress" style={{ margin: "12px 0 0" }} aria-hidden><i style={{ width: `${(done / onboarding.steps.length) * 100}%` }} /></div>
    </div>
  );
}
