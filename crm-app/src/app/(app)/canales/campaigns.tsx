"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PipelineStage } from "@/lib/types";

// Conversiones offline: el CRM avisa a Google Ads y Meta de qué leads se cualifican, reservan o compran.
type EventKey = "qualified_lead" | "booking" | "sale";
type EventSettings = {
  enabled: boolean;
  stages?: string[];
  value: number;
  use_quote_value?: boolean;
  google_conversion_action_id: string;
  meta_event_name: string;
};
type Settings = {
  enabled: boolean;
  currency: string;
  default_country_code: string;
  events: Record<EventKey, EventSettings>;
  google: { enabled: boolean; customer_id: string; login_customer_id: string; connected: boolean; connected_email: string };
  meta: { enabled: boolean; pixel_id: string; test_event_code: string; access_token_configured: boolean };
};
type LogEntry = {
  id: string;
  state: "sent" | "skipped" | "failed" | "retrying" | "pending";
  platform: "google" | "meta";
  event: EventKey;
  lead_name?: string;
  value: number;
  currency: string;
  detail: string;
  attempts: number;
  created_at: string;
  next_attempt_at?: string | null;
};

const EVENTS: { key: EventKey; label: string; help: string }[] = [
  { key: "qualified_lead", label: "Lead cualificado", help: "Cuando el contacto pasa a una de estas etapas." },
  { key: "booking", label: "Cita reservada", help: "Cuando se reserva una videollamada en tu calendario." },
  { key: "sale", label: "Venta", help: "Cuando pasa a una de estas etapas o acepta la propuesta." },
];
const STATE: Record<LogEntry["state"], { label: string; cls: string }> = {
  sent: { label: "Enviada", cls: "p-good" },
  skipped: { label: "Omitida", cls: "p-muted" },
  failed: { label: "Falló", cls: "p-bad" },
  retrying: { label: "Reintentando", cls: "p-warn" },
  pending: { label: "En cola", cls: "p-muted" },
};
const PLATFORM = { google: "Google Ads", meta: "Meta" };

function when(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
}

export function CampaignsCard({ stages, oauthResult, oauthMessage }: { stages: PipelineStage[]; oauthResult: string | null; oauthMessage: string | null }) {
  const [data, setData] = useState<{ settings: Settings; can_edit: boolean; google_oauth_ready: boolean; google_redirect_uri: string } | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [metaToken, setMetaToken] = useState("");
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadLog = useCallback(() => {
    api<{ entries: LogEntry[] }>("/crm/integrations/conversions/log")
      .then((d) => setLog(d.entries))
      .catch(() => setLog([]));
  }, []);

  useEffect(() => {
    api<{ settings: Settings; can_edit: boolean; google_oauth_ready: boolean; google_redirect_uri: string }>("/crm/integrations/conversions")
      .then((d) => {
        setData(d);
        setForm(d.settings);
      })
      .catch((err) => setError((err as Error).message));
    loadLog();
  }, [loadLog]);

  if (error) return <Shell><p className="alert error" role="alert" style={{ margin: 0 }}>{error}</p></Shell>;
  if (!data || !form) return <Shell><p>Cargando…</p></Shell>;

  const s = data.settings;
  const activeStages = stages.filter((stage) => stage.is_active !== false);
  const setEvent = (key: EventKey, patch: Partial<EventSettings>) => setForm({ ...form, events: { ...form.events, [key]: { ...form.events[key], ...patch } } });

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ kind: "ok", text });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy("");
  }

  const save = (extra: Record<string, unknown> = {}) =>
    run("save", async () => {
      const body = { ...form, ...extra, meta: { ...form!.meta, access_token: metaToken, ...((extra.meta as object) || {}) } };
      const d = await api<{ settings: Settings }>("/crm/integrations/conversions", { method: "PUT", body: { settings: body } });
      setData({ ...data!, settings: d.settings });
      setForm(d.settings);
      setMetaToken("");
      return "Guardado.";
    });

  const connectGoogle = () =>
    run("google", async () => {
      const d = await api<{ auth_url: string }>("/crm/integrations/conversions/google/connect-url", { method: "POST", body: {} });
      window.location.href = d.auth_url;
    });

  const test = (platform: "google" | "meta") =>
    run(`test-${platform}`, async () => (await api<{ message: string }>("/crm/integrations/conversions/test", { method: "POST", body: { platform } })).message);

  const retry = (id: string) =>
    run(`retry-${id}`, async () => {
      await api(`/crm/integrations/conversions/jobs/${id}/retry`, { method: "POST", body: {} });
      loadLog();
      return "Vuelve a la cola: se enviará en unos segundos.";
    });

  return (
    <Shell>
      <p>Avisa a Google Ads y a Meta de qué contactos se convierten en clientes, para que tus anuncios busquen más personas como ellos.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        <span className={`pill ${s.enabled ? "p-good" : "p-muted"}`}><span className="dot" />{s.enabled ? "Enviando conversiones" : "Desactivado"}</span>
        <span className={`pill ${s.google.enabled && s.google.connected ? "p-good" : "p-muted"}`}>Google Ads {s.google.connected ? `· ${s.google.connected_email || "conectado"}` : "· sin conectar"}</span>
        <span className={`pill ${s.meta.enabled && s.meta.access_token_configured ? "p-good" : "p-muted"}`}>Meta {s.meta.access_token_configured ? `· píxel ${s.meta.pixel_id}` : "· sin conectar"}</span>
      </div>
      {oauthResult === "connected" && <p className="alert ok" role="status">Google Ads conectado con {oauthMessage}. Pon los IDs y pulsa «Probar».</p>}
      {oauthResult === "error" && <p className="alert error" role="alert">No se pudo conectar Google Ads: {oauthMessage}</p>}

      {data.can_edit ? (
        <div style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Enviar conversiones de esta cuenta
          </label>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <Field label="Moneda"><input className="i" value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></Field>
            <Field label="Prefijo de país por defecto"><input className="i" value={form.default_country_code} inputMode="numeric" onChange={(e) => setForm({ ...form, default_country_code: e.target.value })} /></Field>
          </div>

          <h3 style={{ margin: "6px 0 0", fontSize: 15 }}>Qué cuenta como conversión</h3>
          {EVENTS.map(({ key, label, help }) => {
            const ev = form.events[key];
            return (
              <fieldset key={key} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, display: "grid", gap: 8, minWidth: 0 }}>
                <legend style={{ padding: "0 4px" }}>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 600 }}>
                    <input type="checkbox" checked={ev.enabled} onChange={(e) => setEvent(key, { enabled: e.target.checked })} />
                    {label}
                  </label>
                </legend>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>{help}</span>
                {ev.stages && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
                    {activeStages.map((stage) => (
                      <label key={stage.key} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={ev.stages!.includes(stage.key)}
                          onChange={(e) => setEvent(key, { stages: e.target.checked ? [...ev.stages!, stage.key] : ev.stages!.filter((k) => k !== stage.key) })}
                        />
                        {stage.label || stage.key}
                      </label>
                    ))}
                  </div>
                )}
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                  <Field label={key === "sale" ? "Valor fijo si no hay propuesta" : "Valor"}>
                    <input className="i" type="number" min={0} step="0.01" value={ev.value || ""} placeholder="0" onChange={(e) => setEvent(key, { value: Number(e.target.value) || 0 })} />
                  </Field>
                  <Field label="ID acción de conversión (Google)">
                    <input className="i" inputMode="numeric" value={ev.google_conversion_action_id} placeholder="Ej. 6543210987" onChange={(e) => setEvent(key, { google_conversion_action_id: e.target.value })} />
                  </Field>
                  <Field label="Nombre del evento (Meta)">
                    <input className="i" value={ev.meta_event_name} onChange={(e) => setEvent(key, { meta_event_name: e.target.value })} />
                  </Field>
                </div>
                {key === "sale" && (
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                    <input type="checkbox" checked={Boolean(ev.use_quote_value)} onChange={(e) => setEvent(key, { use_quote_value: e.target.checked })} />
                    Usar el importe total de la propuesta como valor de la venta
                  </label>
                )}
              </fieldset>
            );
          })}

          <h3 style={{ margin: "6px 0 0", fontSize: 15 }}>Google Ads</h3>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={form.google.enabled} onChange={(e) => setForm({ ...form, google: { ...form.google, enabled: e.target.checked } })} />
            Enviar a Google Ads
          </label>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <Field label="ID de cliente de Google Ads"><input className="i" value={form.google.customer_id} placeholder="123-456-7890" onChange={(e) => setForm({ ...form, google: { ...form.google, customer_id: e.target.value } })} /></Field>
            <Field label="ID de la MCC (si accedes desde una)"><input className="i" value={form.google.login_customer_id} placeholder="Opcional" onChange={(e) => setForm({ ...form, google: { ...form.google, login_customer_id: e.target.value } })} /></Field>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button className="btn" disabled={!!busy || !data.google_oauth_ready} onClick={connectGoogle}>{s.google.connected ? "Volver a conectar Google Ads" : "Conectar Google Ads"}</button>
            {s.google.connected && <button className="btn ghost small" disabled={!!busy} onClick={() => test("google")}>{busy === "test-google" ? "Probando…" : "Probar"}</button>}
            {s.google.connected && <button className="btn ghost small" disabled={!!busy} onClick={() => save({ google: { ...form.google, disconnect: true } })}>Desconectar</button>}
          </div>
          {!data.google_oauth_ready && <p className="alert warn" style={{ margin: 0 }}>Falta configurar Google OAuth en el servidor (GOOGLE_OAUTH_CLIENT_ID).</p>}

          <h3 style={{ margin: "6px 0 0", fontSize: 15 }}>Meta (Conversions API)</h3>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={form.meta.enabled} onChange={(e) => setForm({ ...form, meta: { ...form.meta, enabled: e.target.checked } })} />
            Enviar a Meta
          </label>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <Field label="Pixel ID (conjunto de datos)"><input className="i" inputMode="numeric" value={form.meta.pixel_id} onChange={(e) => setForm({ ...form, meta: { ...form.meta, pixel_id: e.target.value } })} /></Field>
            <Field label="Token de Conversions API">
              <input className="i" type="password" autoComplete="off" value={metaToken} placeholder={s.meta.access_token_configured ? "Guardado · pega otro para cambiarlo" : "Pega aquí el token"} onChange={(e) => setMetaToken(e.target.value)} />
            </Field>
            <Field label="Código de prueba (opcional)"><input className="i" value={form.meta.test_event_code} placeholder="TEST12345" onChange={(e) => setForm({ ...form, meta: { ...form.meta, test_event_code: e.target.value } })} /></Field>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {s.meta.access_token_configured && <button className="btn ghost small" disabled={!!busy} onClick={() => test("meta")}>{busy === "test-meta" ? "Probando…" : "Probar"}</button>}
            {s.meta.access_token_configured && <button className="btn ghost small" disabled={!!busy} onClick={() => save({ meta: { clear_access_token: true } })}>Borrar token</button>}
          </div>

          <div><button className="btn primary" disabled={!!busy} onClick={() => save()}>{busy === "save" ? "Guardando…" : "Guardar"}</button></div>
          {msg && <p className={`alert ${msg.kind}`} role="status" style={{ margin: 0 }}>{msg.text}</p>}
          <Guide redirectUri={data.google_redirect_uri} />
        </div>
      ) : (
        <p style={{ margin: 0 }}>Tu agencia configura esta conexión. Aquí ves qué se ha enviado.</p>
      )}

      <h3 style={{ margin: "18px 0 6px", fontSize: 15 }}>Últimos envíos</h3>
      {log === null ? <p>Cargando…</p> : !log.length ? (
        <p style={{ margin: 0 }}>Todavía no se ha enviado ninguna conversión.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 640 }}>
            <thead>
              <tr><th>Fecha</th><th>Contacto</th><th>Evento</th><th>Destino</th><th>Estado</th><th>Detalle</th></tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr key={entry.id} style={{ cursor: "default" }}>
                  <td>{when(entry.created_at)}</td>
                  <td>{entry.lead_name || "—"}</td>
                  <td>{EVENTS.find((e) => e.key === entry.event)?.label || entry.event}{entry.value ? ` · ${entry.value.toLocaleString("es-ES")} ${entry.currency}` : ""}</td>
                  <td>{PLATFORM[entry.platform] || entry.platform}</td>
                  <td><span className={`pill ${STATE[entry.state].cls}`}>{STATE[entry.state].label}</span></td>
                  <td style={{ fontSize: 13, color: "var(--muted)" }}>
                    {entry.detail}
                    {entry.state === "retrying" && entry.next_attempt_at ? ` · nuevo intento ${when(entry.next_attempt_at)}` : ""}
                    {data.can_edit && (entry.state === "failed" || entry.state === "skipped") && (
                      <> <button className="btn ghost small" disabled={!!busy} onClick={() => retry(entry.id)}>Reintentar</button></>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="card chan" style={{ gridColumn: "1 / -1" }}>
      <div className="ico" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>Ads</div>
      <div className="body">
        <h2>Campañas</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--muted)", minWidth: 0 }}>
      {label}
      {children}
    </label>
  );
}

function Guide({ redirectUri }: { redirectUri: string }) {
  return (
    <details style={{ fontSize: 14 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Cómo conseguir cada dato, paso a paso</summary>
      <div style={{ display: "grid", gap: 10, marginTop: 10, color: "var(--fg)" }}>
        <div>
          <b>Google Ads (una sola vez para la agencia)</b>
          <ol style={{ margin: "4px 0", paddingLeft: 20 }}>
            <li>En Google Cloud Console, en el mismo proyecto del OAuth de Gmail/Calendar: «APIs y servicios» → «Biblioteca» → busca <b>Data Manager API</b> → «Habilitar».</li>
            <li>«APIs y servicios» → «Credenciales» → tu cliente OAuth → añade este URI de redirección autorizado: <code>{redirectUri}</code></li>
            <li>«Pantalla de consentimiento de OAuth» → «Permisos» → añade <code>…/auth/datamanager</code>. Si la app está en modo prueba, añade tu email como usuario de prueba.</li>
          </ol>
        </div>
        <div>
          <b>Google Ads (por cada cliente)</b>
          <ol style={{ margin: "4px 0", paddingLeft: 20 }}>
            <li>En Google Ads del cliente: «Objetivos» → «Conversiones» → «Nueva acción de conversión» → «Importar» → «Otras fuentes o CRM» → «Seguimiento de conversiones a partir de clics». Crea una por evento (Lead cualificado, Cita, Venta).</li>
            <li>Abre cada acción: el número que sale en la URL como <code>ctId=</code> es el «ID acción de conversión». Pégalo en su evento.</li>
            <li>En «Configuración» → «Conversiones mejoradas para clientes potenciales», actívalas y acepta las condiciones de datos de clientes.</li>
            <li>El «ID de cliente» es el número de arriba a la derecha (123-456-7890). Si entras desde vuestra MCC, pon también el ID de la MCC.</li>
            <li>Pulsa «Conectar Google Ads» con un usuario que tenga acceso a esa cuenta, guarda y pulsa «Probar».</li>
          </ol>
        </div>
        <div>
          <b>Meta</b>
          <ol style={{ margin: "4px 0", paddingLeft: 20 }}>
            <li>En el Administrador de eventos de Meta, elige el píxel (conjunto de datos) del cliente: su número es el «Pixel ID».</li>
            <li>«Configuración» → «API de conversiones» → «Generar token de acceso». Cópialo y pégalo aquí; no se vuelve a mostrar.</li>
            <li>Para probar sin ensuciar datos: pestaña «Probar eventos», copia el código (TEST…) y pégalo en «Código de prueba». Bórralo cuando funcione.</li>
          </ol>
        </div>
        <div>
          <b>Formularios de la web</b>
          <p style={{ margin: "4px 0" }}>
            Con el chat instalado, el código rellena solo los campos ocultos llamados <code>gclid</code>, <code>fbclid</code>, <code>utm_source</code>, <code>utm_medium</code>, <code>utm_campaign</code>. Añade esos campos ocultos a los formularios que envían leads al CRM. En WPForms también puedes usar el valor por defecto <code>{"{query_var key=\"gclid\"}"}</code>.
          </p>
        </div>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          Privacidad: el email y el teléfono solo se envían (cifrados con SHA-256) si el contacto aceptó la política. Sin ese consentimiento solo se envía el identificador del clic.
        </p>
      </div>
    </details>
  );
}
