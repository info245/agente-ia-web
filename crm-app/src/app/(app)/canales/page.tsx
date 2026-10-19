"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { api } from "@/lib/api";

type WhatsAppChannel = { configured?: boolean; status?: string; display_phone_number?: string; verified_name?: string };

const WIDGET_SRC = "https://tmedia-global-ai.onrender.com/widget.js";
const DAY_NAMES = ["D", "L", "M", "X", "J", "V", "S"];

function hours(meeting?: { days?: number[]; start_hour?: number; end_hour?: number }) {
  const days = (meeting?.days || [1, 2, 3, 4, 5]).slice().sort();
  const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const label = consecutive && days.length > 1 ? `${DAY_NAMES[days[0]]}–${DAY_NAMES[days.at(-1)!]}` : days.map((d) => DAY_NAMES[d]).join(", ");
  return `${label} ${meeting?.start_hour ?? 9}:00–${meeting?.end_hour ?? 18}:00`;
}

export default function CanalesPage() {
  const { account, config, leads } = useSession();
  const params = useSearchParams();
  const [whatsapp, setWhatsapp] = useState<WhatsAppChannel | null>(null);
  const [copied, setCopied] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [monthAgo] = useState(() => Date.now() - 30 * 864e5);

  useEffect(() => {
    api<{ channel: WhatsAppChannel }>("/crm/integrations/whatsapp/channel")
      .then((data) => setWhatsapp(data.channel))
      .catch(() => setWhatsapp({}));
  }, []);

  if (!config) return <p className="loading">Cargando…</p>;

  const snippet = `<script src="${WIDGET_SRC}" data-account-slug="${account.slug || account.id}"></script>`;
  const calendar = config.integrations?.calendar;
  const calendarConnected = Boolean(calendar?.google_refresh_token_configured);
  const formLeads = (leads || []).filter((l) => l.channel === "lead_form" || (l.source_platform && l.channel !== "whatsapp" && l.channel !== "web"));
  const formLeadsMonth = formLeads.filter((l) => new Date(l.created_at || 0).getTime() >= monthAgo).length;
  const oauthResult = params.get("calendar_oauth");

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.getSelection()?.selectAllChildren(document.getElementById("widget-code")!);
    }
  }

  async function connectCalendar() {
    setCalendarError("");
    try {
      const data = await api<{ auth_url: string }>("/crm/integrations/calendar/google/connect-url", { method: "POST", body: { return_to: "app" } });
      window.location.href = data.auth_url;
    } catch (err) {
      setCalendarError((err as Error).message);
    }
  }

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Canales</h1>
          <p className="sub">Dónde te encuentran tus clientes y dónde reserva tu asistente</p>
        </div>
      </div>
      {oauthResult === "connected" && <p className="alert ok" role="status" style={{ marginBottom: 14 }}>Calendario conectado. Tu asistente ya puede reservar videollamadas.</p>}
      {oauthResult === "error" && <p className="alert error" role="alert" style={{ marginBottom: 14 }}>No se pudo conectar el calendario: {params.get("calendar_oauth_message")}</p>}

      <div className="channels">
        <div className="card chan">
          <div className="ico" style={{ background: "var(--good-soft)", color: "var(--wa)" }}>WA</div>
          <div className="body">
            <h2>WhatsApp</h2>
            {whatsapp === null ? <p>Comprobando…</p> : whatsapp.configured ? (
              <>
                <p>{whatsapp.display_phone_number || config.contact?.public_whatsapp_number} · Tu asistente responde las 24 horas</p>
                <span className="pill p-good"><span className="dot" />Conectado</span>
              </>
            ) : (
              <>
                <p>Tus clientes podrán escribirte por WhatsApp y tu asistente les responderá al momento.</p>
                <span className="pill p-muted">Sin conectar · tu agencia lo configura</span>
              </>
            )}
          </div>
        </div>

        <div className="card chan">
          <div className="ico" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>W</div>
          <div className="body">
            <h2>Chat en tu web</h2>
            <p>Pega este código antes de &lt;/body&gt; en tu web, o pásaselo a quien te lleve la web.</p>
            <div className="code" id="widget-code">{snippet}</div>
            <button className="btn primary" onClick={copy}>{copied ? "¡Copiado!" : "Copiar código"}</button>
          </div>
        </div>

        <div className="card chan">
          <div className="ico" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>F</div>
          <div className="body">
            <h2>Formularios</h2>
            <p>Los leads de los formularios de tu web y de Meta llegan a Conversaciones con todos sus datos.</p>
            {formLeads.length ? (
              <span className="pill p-good"><span className="dot" />{formLeadsMonth} leads de formulario en los últimos 30 días</span>
            ) : (
              <span className="pill p-muted">Todavía no ha llegado ninguno · tu agencia los conecta</span>
            )}
          </div>
        </div>

        <div className="card chan">
          <div className="ico" style={{ background: "var(--surface-2)", color: "var(--fg)" }}>31</div>
          <div className="body">
            <h2>Calendario</h2>
            {calendarConnected ? (
              <>
                <p>Tu asistente reserva videollamadas en {calendar?.google_connected_email} · {hours(config.agent?.meeting)}</p>
                <span className="pill p-good"><span className="dot" />Conectado</span>{" "}
                <button className="btn ghost small" onClick={connectCalendar}>Volver a conectar</button>
              </>
            ) : (
              <>
                <p>Conecta tu Google Calendar y tu asistente ofrecerá huecos libres y reservará videollamadas solo.</p>
                <button className="btn primary" onClick={connectCalendar}>Conectar Google Calendar</button>
              </>
            )}
            {calendarError && <p className="alert error" role="alert" style={{ marginTop: 10 }}>{calendarError}</p>}
          </div>
        </div>
      </div>

      <div className="card agency">
        <span>¿Necesitas conectar o cambiar algo técnico? Tu agencia se encarga.</span>
        <a className="btn" href="mailto:info@t-mediaglobal.com?subject=Ayuda%20con%20mis%20canales">Escribir a T-Media</a>
      </div>
    </section>
  );
}
