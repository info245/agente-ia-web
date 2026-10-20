"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ConfigPending, useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import type { AppConfig, WhatsAppTemplate } from "@/lib/types";

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
  const { account, config, configError, leads } = useSession();
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

  if (!config) return <ConfigPending error={configError} />;

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
            {whatsapp?.configured && <FormFirstWhatsApp config={config} />}
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

// Primer WhatsApp a cada lead de formulario: como nunca te ha escrito, WhatsApp exige una plantilla aprobada.
function FormFirstWhatsApp({ config }: { config: AppConfig }) {
  const { reloadConfig } = useSession();
  const current = config.integrations?.whatsapp || {};
  const [enabled, setEnabled] = useState(Boolean(current.form_autocontact_enabled));
  const [selected, setSelected] = useState(current.intro_template_name ? `${current.intro_template_name}|${current.intro_template_language || "es"}` : "");
  const [templates, setTemplates] = useState<WhatsAppTemplate[] | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = (t: WhatsAppTemplate) => `${t.name}|${t.language}`;
  const preview = templates?.find((t) => key(t) === selected);

  useEffect(() => {
    api<{ templates: WhatsAppTemplate[] }>("/crm/whatsapp/templates")
      .then((d) => setTemplates(d.templates.filter((t) => t.sendable && t.params <= 3)))
      .catch(() => setTemplates([]));
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    const [name, language] = selected.split("|");
    try {
      await api("/crm/channels/form-whatsapp", { method: "POST", body: { enabled, template_name: name || "", template_language: language || "es" } });
      await reloadConfig();
      setMsg({ kind: "ok", text: enabled ? "Activado: cada lead nuevo de formulario recibirá esta plantilla por WhatsApp." : "Guardado. No se enviará WhatsApp automático a los leads de formulario." });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Escribirle por WhatsApp al momento
      </label>
      <span style={{ color: "var(--muted)", fontSize: 13 }}>
        Solo si dejó teléfono y aceptó que le contactéis. Como nunca te ha escrito, WhatsApp exige una plantilla aprobada; cuando conteste, tu asistente sigue la conversación.
      </span>
      <select className="i" aria-label="Plantilla del primer WhatsApp" value={selected} onChange={(e) => setSelected(e.target.value)}>
        <option value="">{templates === null ? "Cargando plantillas…" : templates.length ? "Elige una plantilla" : "No hay plantillas aprobadas"}</option>
        {(templates || []).map((t) => <option key={key(t)} value={key(t)}>{t.name.replace(/_/g, " ")} · {t.language}</option>)}
      </select>
      {preview && <div className="m" style={{ maxWidth: "100%", background: "var(--surface-2)", border: "1px solid var(--line)" }}>{preview.body}</div>}
      <div><button className="btn primary small" disabled={busy || (enabled && !selected)} onClick={save}>{busy ? "Guardando…" : "Guardar"}</button></div>
      {msg && <p className={`alert ${msg.kind}`} role="status" style={{ margin: 0 }}>{msg.text}</p>}
    </div>
  );
}
