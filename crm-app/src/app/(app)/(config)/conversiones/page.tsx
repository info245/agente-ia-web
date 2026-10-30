"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { SettingsTabs } from "@/components/settings-tabs";
import { api } from "@/lib/api";

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
type Data = { settings: Settings; can_edit: boolean; google_oauth_ready: boolean; google_redirect_uri: string };

const EVENTS: { key: EventKey; label: string; help: string; googleName: string }[] = [
  { key: "qualified_lead", label: "Lead cualificado", help: "Cuando el contacto pasa a una de estas etapas.", googleName: "CRM · Lead cualificado" },
  { key: "booking", label: "Cita reservada", help: "Cuando se reserva una videollamada en tu calendario.", googleName: "CRM · Cita" },
  { key: "sale", label: "Venta", help: "Cuando pasa a una de estas etapas o acepta la propuesta.", googleName: "CRM · Venta" },
];
const STATE: Record<LogEntry["state"], { label: string; cls: string }> = {
  sent: { label: "Enviada", cls: "p-good" },
  skipped: { label: "Omitida", cls: "p-muted" },
  failed: { label: "Falló", cls: "p-bad" },
  retrying: { label: "Reintentando", cls: "p-warn" },
  pending: { label: "En cola", cls: "p-muted" },
};
const PLATFORM = { google: "Google Ads", meta: "Meta" };
const LINKS = {
  googleAds: "https://ads.google.com/aw/overview",
  googleConversions: "https://ads.google.com/aw/conversions",
  googleEnhancedHelp: "https://support.google.com/google-ads/answer/11021502",
  googleImportHelp: "https://support.google.com/google-ads/answer/2998031",
  cloudLibrary: "https://console.cloud.google.com/apis/library/datamanager.googleapis.com",
  cloudCredentials: "https://console.cloud.google.com/apis/credentials",
  cloudConsent: "https://console.cloud.google.com/apis/credentials/consent",
  metaEvents: "https://business.facebook.com/events_manager2",
  metaCapiHelp: "https://www.facebook.com/business/help/2041148702652965",
};
const FLOW = [
  { icon: "👆", title: "Clic en tu anuncio", text: "Google o Meta añade a la web un código del clic (gclid o fbclid)." },
  { icon: "📝", title: "Deja sus datos", text: "El formulario o el chat guardan ese código en el contacto." },
  { icon: "📈", title: "Avanza en el CRM", text: "Se cualifica, reserva una cita o compra." },
  { icon: "📣", title: "Avisamos a Google y Meta", text: "Les decimos qué clic acabó en cliente y cuánto valía." },
  { icon: "🎯", title: "Tus anuncios aprenden", text: "Pujan por más gente parecida a tus clientes, no por curiosos." },
];

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function ConversionesPage() {
  const params = useSearchParams();
  const { config } = useSession();
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [metaToken, setMetaToken] = useState("");
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [tab, setTab] = useState<"google" | "meta" | "eventos" | "historial">("google");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const oauthResult = params.get("ads_oauth");

  const loadLog = useCallback(() => {
    api<{ entries: LogEntry[] }>("/crm/integrations/conversions/log").then((d) => setLog(d.entries)).catch(() => setLog([]));
  }, []);

  useEffect(() => {
    api<Data>("/crm/integrations/conversions")
      .then((d) => {
        setData(d);
        setForm(d.settings);
      })
      .catch((err) => setError((err as Error).message));
    loadLog();
  }, [loadLog]);

  const head = (
    <>
      <div className="head">
        <div>
          <h1>Configuración</h1>
          <p className="sub">Conversiones: enseña a Google Ads y a Meta qué anuncios te traen clientes de verdad.</p>
        </div>
      </div>
      <SettingsTabs />
    </>
  );
  if (error) return <section className="page">{head}<p className="alert error" role="alert">{error}</p></section>;
  if (!data || !form) return <section className="page">{head}<p className="loading">Cargando…</p></section>;

  const s = data.settings;
  const stages = (config?.pipeline?.stages || []).filter((stage) => stage.is_active !== false);
  const setEvent = (key: EventKey, patch: Partial<EventSettings>) => setForm({ ...form, events: { ...form.events, [key]: { ...form.events[key], ...patch } } });
  const setGoogle = (patch: Partial<Settings["google"]>) => setForm({ ...form, google: { ...form.google, ...patch } });
  const setMeta = (patch: Partial<Settings["meta"]>) => setForm({ ...form, meta: { ...form.meta, ...patch } });
  const edit = data.can_edit;

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
      const body = { ...form, ...extra, meta: { ...form.meta, access_token: metaToken, ...((extra.meta as object) || {}) } };
      const d = await api<{ settings: Settings }>("/crm/integrations/conversions", { method: "PUT", body: { settings: body } });
      setData({ ...data, settings: d.settings });
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

  // Lo que falta en cada plataforma, calculado con lo guardado (no con lo que se está escribiendo).
  const googleChecks = [
    { ok: s.google.connected, label: "Cuenta de Google Ads conectada" },
    { ok: Boolean(s.google.customer_id), label: "ID de cliente puesto" },
    { ok: EVENTS.some((e) => s.events[e.key]?.enabled && s.events[e.key]?.google_conversion_action_id), label: "Al menos una acción de conversión" },
    { ok: s.google.enabled && s.enabled, label: "Envío activado" },
  ];
  const metaChecks = [
    { ok: Boolean(s.meta.pixel_id), label: "Pixel ID puesto" },
    { ok: s.meta.access_token_configured, label: "Token de la API de conversiones" },
    { ok: s.meta.enabled && s.enabled, label: "Envío activado" },
  ];
  const sentCount = (log || []).filter((e) => e.state === "sent").length;

  return (
    <section className="page">
      {head}
      {oauthResult === "connected" && <p className="alert ok" role="status">Google Ads conectado con {params.get("ads_oauth_message")}. Sigue con el paso 2.</p>}
      {oauthResult === "error" && <p className="alert error" role="alert">No se pudo conectar Google Ads: {params.get("ads_oauth_message")}</p>}

      <div className="card block">
        <h2>Cómo funciona</h2>
        <ol className="conv-flow">
          {FLOW.map((f, i) => (
            <li key={f.title}>
              <span className="conv-ico" aria-hidden>{f.icon}</span>
              <b>{i + 1}. {f.title}</b>
              <span>{f.text}</span>
            </li>
          ))}
        </ol>
        <p className="hint" style={{ margin: "12px 0 0" }}>
          Resultado: Google y Meta dejan de optimizar por «rellenó un formulario» y empiezan a optimizar por «se hizo cliente». Suele bajar el coste por venta en pocas semanas.
        </p>
      </div>

      <div className="conv-status">
        <StatusCard title="Google Ads" checks={googleChecks} onOpen={() => setTab("google")} />
        <StatusCard title="Meta (Facebook e Instagram)" checks={metaChecks} onOpen={() => setTab("meta")} />
        <div className="card conv-card">
          <div className="conv-card-head"><b>Envíos</b><span className={`pill ${s.enabled ? "p-good" : "p-muted"}`}><span className="dot" />{s.enabled ? "Activado" : "Desactivado"}</span></div>
          <div className="kpi" style={{ padding: 0 }}><div className="n">{sentCount}</div><div className="d">conversiones enviadas (últimas)</div></div>
          {edit && (
            <label className="conv-switch">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              Enviar conversiones de esta cuenta
            </label>
          )}
          <button className="btn ghost small" onClick={() => setTab("historial")}>Ver historial</button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Conversiones" style={{ marginTop: 18 }}>
        {([["google", "1 · Google Ads"], ["meta", "2 · Meta"], ["eventos", "3 · Qué cuenta como conversión"], ["historial", "Historial"]] as const).map(([key, label]) => (
          <button key={key} role="tab" className="chip" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {!edit && tab !== "historial" && <p className="alert warn">Tu agencia configura esta conexión. Aquí puedes ver cómo está y qué se ha enviado.</p>}

      {tab === "google" && (
        <div className="conv-steps">
          {!data.google_oauth_ready && (
            <Step n={0} title="Solo la agencia, una vez: preparar Google Cloud" done={false}>
              <p>Sin esto no aparece el botón de conectar. Se hace en el mismo proyecto de Google Cloud que el Gmail y el Calendar.</p>
              <ol>
                <li>Activa la <b>Data Manager API</b>. <Ext href={LINKS.cloudLibrary}>Abrir la API</Ext></li>
                <li>En tu cliente OAuth, añade este URI de redirección: <code>{data.google_redirect_uri}</code> <Ext href={LINKS.cloudCredentials}>Abrir credenciales</Ext></li>
                <li>En la pantalla de consentimiento, añade el permiso <code>…/auth/datamanager</code>. <Ext href={LINKS.cloudConsent}>Abrir consentimiento</Ext></li>
              </ol>
            </Step>
          )}
          <Step n={1} title="Conecta tu cuenta de Google Ads" done={s.google.connected}>
            <p>Entra con un usuario que tenga acceso a la cuenta de Google Ads del negocio. Solo pedimos permiso para subir conversiones.</p>
            {s.google.connected && <p className="pill p-good" style={{ display: "inline-flex" }}>Conectado con {s.google.connected_email || "Google"}</p>}
            {edit && (
              <div className="row-actions">
                <button className="btn primary" disabled={!!busy || !data.google_oauth_ready} onClick={connectGoogle}>{s.google.connected ? "Volver a conectar" : "Conectar Google Ads"}</button>
                {s.google.connected && <button className="btn ghost small" disabled={!!busy} onClick={() => save({ google: { ...form.google, disconnect: true } })}>Desconectar</button>}
              </div>
            )}
          </Step>
          <Step n={2} title="Copia el ID de cliente" done={Boolean(s.google.customer_id)}>
            <p>Es el número de 10 cifras que sale <b>arriba a la derecha</b> en Google Ads (123-456-7890). <Ext href={LINKS.googleAds}>Abrir Google Ads</Ext></p>
            <div className="conv-fields">
              <Field label="ID de cliente"><input className="i" disabled={!edit} value={form.google.customer_id} placeholder="123-456-7890" onChange={(e) => setGoogle({ customer_id: e.target.value })} /></Field>
              <Field label="ID de la MCC (solo si entras desde una cuenta de agencia)"><input className="i" disabled={!edit} value={form.google.login_customer_id} placeholder="Opcional" onChange={(e) => setGoogle({ login_customer_id: e.target.value })} /></Field>
            </div>
          </Step>
          <Step n={3} title="Crea una acción de conversión por cada evento" done={EVENTS.some((e) => s.events[e.key]?.google_conversion_action_id)}>
            <ol>
              <li>Abre <b>Objetivos → Conversiones → Resumen</b> y pulsa <b>«+ Crear acción de conversión»</b>. <Ext href={LINKS.googleConversions}>Abrir conversiones</Ext></li>
              <li>Elige <b>«Importar»</b> → <b>«CRM, archivos u otras fuentes de datos»</b> → <b>«Seguimiento de conversiones a partir de clics»</b>.</li>
              <li>Ponle el nombre que te sugerimos abajo, guarda y ábrela: en la dirección del navegador verás <code>ctId=123456789</code>. Ese número va en su casilla.</li>
            </ol>
            <div className="conv-events">
              {EVENTS.map((e) => (
                <div key={e.key} className="conv-event">
                  <b>{e.label}</b>
                  <span className="hint" style={{ margin: 0 }}>Nombre en Google Ads: <code>{e.googleName}</code></span>
                  <input className="i" disabled={!edit} inputMode="numeric" aria-label={`ID de la acción ${e.label}`} value={form.events[e.key].google_conversion_action_id} placeholder="ctId, p. ej. 6543210987" onChange={(ev) => setEvent(e.key, { google_conversion_action_id: ev.target.value })} />
                </div>
              ))}
            </div>
            <p className="hint" style={{ margin: "8px 0 0" }}>¿Más detalle? <Ext href={LINKS.googleImportHelp}>Guía oficial de Google</Ext></p>
          </Step>
          <Step n={4} title="Activa las conversiones mejoradas para leads" done={false} optional>
            <p>En <b>Objetivos → Conversiones → Configuración</b>, activa <b>«Conversiones mejoradas para clientes potenciales»</b> y acepta las condiciones de datos de clientes. Así Google reconoce al cliente aunque no haya código de clic (por ejemplo, si llegó por WhatsApp). <Ext href={LINKS.googleEnhancedHelp}>Cómo hacerlo</Ext></p>
          </Step>
          <Step n={5} title="Activa el envío y pruébalo" done={s.google.enabled && s.enabled}>
            {edit && (
              <>
                <label className="conv-switch"><input type="checkbox" checked={form.google.enabled} onChange={(e) => setGoogle({ enabled: e.target.checked })} /> Enviar a Google Ads</label>
                <div className="row-actions">
                  <button className="btn primary" disabled={!!busy} onClick={() => save()}>{busy === "save" ? "Guardando…" : "Guardar"}</button>
                  {s.google.connected && <button className="btn" disabled={!!busy} onClick={() => test("google")}>{busy === "test-google" ? "Probando…" : "Probar conexión"}</button>}
                </div>
              </>
            )}
            <p className="hint" style={{ margin: "8px 0 0" }}>Las conversiones tardan unas horas en verse en Google Ads (columna «Conversiones» de la acción).</p>
          </Step>
        </div>
      )}

      {tab === "meta" && (
        <div className="conv-steps">
          <Step n={1} title="Copia el Pixel ID (conjunto de datos)" done={Boolean(s.meta.pixel_id)}>
            <p>En el <b>Administrador de eventos</b>, elige el píxel del negocio. Su número aparece debajo del nombre. <Ext href={LINKS.metaEvents}>Abrir Administrador de eventos</Ext></p>
            <div className="conv-fields"><Field label="Pixel ID"><input className="i" disabled={!edit} inputMode="numeric" autoComplete="off" value={form.meta.pixel_id} placeholder="Ej. 1234567890123456" onChange={(e) => setMeta({ pixel_id: e.target.value })} /></Field></div>
          </Step>
          <Step n={2} title="Genera el token de la API de conversiones" done={s.meta.access_token_configured}>
            <p>En ese píxel: <b>Configuración → API de conversiones → «Generar token de acceso»</b>. Cópialo y pégalo aquí: Meta no lo vuelve a enseñar. <Ext href={LINKS.metaCapiHelp}>Guía de Meta</Ext></p>
            <div className="conv-fields">
              <Field label="Token">
                <input className="i" disabled={!edit} type="password" autoComplete="new-password" value={metaToken} placeholder={s.meta.access_token_configured ? "Guardado · pega otro para cambiarlo" : "Pega aquí el token"} onChange={(e) => setMetaToken(e.target.value)} />
              </Field>
            </div>
            {edit && s.meta.access_token_configured && <button className="btn ghost small" disabled={!!busy} onClick={() => save({ meta: { clear_access_token: true } })}>Borrar token</button>}
          </Step>
          <Step n={3} title="Prueba sin ensuciar tus datos" done={false} optional>
            <p>En el Administrador de eventos, pestaña <b>«Probar eventos»</b>, copia el código que empieza por <code>TEST</code> y pégalo aquí. Pulsa «Probar» y verás el evento llegar en directo. <b>Bórralo cuando funcione</b>.</p>
            <div className="conv-fields"><Field label="Código de prueba"><input className="i" disabled={!edit} value={form.meta.test_event_code} placeholder="TEST12345" onChange={(e) => setMeta({ test_event_code: e.target.value })} /></Field></div>
          </Step>
          <Step n={4} title="Activa el envío" done={s.meta.enabled && s.enabled}>
            {edit && (
              <>
                <label className="conv-switch"><input type="checkbox" checked={form.meta.enabled} onChange={(e) => setMeta({ enabled: e.target.checked })} /> Enviar a Meta</label>
                <div className="row-actions">
                  <button className="btn primary" disabled={!!busy} onClick={() => save()}>{busy === "save" ? "Guardando…" : "Guardar"}</button>
                  {s.meta.access_token_configured && <button className="btn" disabled={!!busy} onClick={() => test("meta")}>{busy === "test-meta" ? "Probando…" : "Probar"}</button>}
                </div>
              </>
            )}
          </Step>
        </div>
      )}

      {tab === "eventos" && (
        <div className="conv-steps">
          <div className="card block">
            <h2>Qué avisamos y cuándo</h2>
            <p className="hint">Marca las etapas de tu embudo que cuentan para cada evento. Con valor, Google y Meta saben qué clientes valen más.</p>
            <div className="conv-fields">
              <Field label="Moneda"><input className="i" disabled={!edit} value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></Field>
              <Field label="Prefijo de país por defecto"><input className="i" disabled={!edit} value={form.default_country_code} inputMode="numeric" onChange={(e) => setForm({ ...form, default_country_code: e.target.value })} /></Field>
            </div>
          </div>
          {EVENTS.map(({ key, label, help }) => {
            const ev = form.events[key];
            return (
              <div key={key} className="card block conv-rule">
                <label className="conv-switch" style={{ fontWeight: 700, fontSize: 16 }}>
                  <input type="checkbox" disabled={!edit} checked={ev.enabled} onChange={(e) => setEvent(key, { enabled: e.target.checked })} /> {label}
                </label>
                <p className="hint" style={{ margin: "2px 0 8px" }}>{help}</p>
                {ev.stages && (
                  <div className="conv-stages">
                    {stages.map((stage) => {
                      const on = ev.stages!.includes(stage.key);
                      return (
                        <button key={stage.key} type="button" className="chip" disabled={!edit} aria-pressed={on} onClick={() => setEvent(key, { stages: on ? ev.stages!.filter((k) => k !== stage.key) : [...ev.stages!, stage.key] })}>
                          {on ? "✓ " : ""}{stage.label || stage.key}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="conv-fields">
                  <Field label={key === "sale" ? "Valor si no hay propuesta" : "Valor"}><input className="i" disabled={!edit} type="number" min={0} step="0.01" value={ev.value || ""} placeholder="0" onChange={(e) => setEvent(key, { value: Number(e.target.value) || 0 })} /></Field>
                  <Field label="ID acción (Google)"><input className="i" disabled={!edit} inputMode="numeric" value={ev.google_conversion_action_id} placeholder="Paso 3 de Google Ads" onChange={(e) => setEvent(key, { google_conversion_action_id: e.target.value })} /></Field>
                  <Field label="Nombre del evento (Meta)"><input className="i" disabled={!edit} value={ev.meta_event_name} onChange={(e) => setEvent(key, { meta_event_name: e.target.value })} /></Field>
                </div>
                {key === "sale" && (
                  <label className="conv-switch" style={{ fontSize: 13 }}>
                    <input type="checkbox" disabled={!edit} checked={Boolean(ev.use_quote_value)} onChange={(e) => setEvent(key, { use_quote_value: e.target.checked })} />
                    Usar el importe de la propuesta aceptada como valor de la venta
                  </label>
                )}
              </div>
            );
          })}
          <div className="card block">
            <h2>Que tus formularios guarden el clic</h2>
            <p style={{ margin: 0 }}>
              Con el chat instalado en la web, se rellenan solos los campos ocultos <code>gclid</code>, <code>fbclid</code>, <code>utm_source</code>, <code>utm_medium</code> y <code>utm_campaign</code>. Añade esos campos ocultos a tus formularios (en WPForms, valor por defecto <code>{"{query_var key=\"gclid\"}"}</code>). Los leads de formularios de Meta ya llegan con su identificador.
            </p>
            <p className="hint" style={{ margin: "8px 0 0" }}>Privacidad: el email y el teléfono solo se envían cifrados (SHA-256) y solo si el contacto aceptó la política.</p>
          </div>
          {edit && <div><button className="btn primary" disabled={!!busy} onClick={() => save()}>{busy === "save" ? "Guardando…" : "Guardar"}</button></div>}
        </div>
      )}

      {tab === "historial" && (
        <div className="card block">
          <h2>Últimos envíos</h2>
          {log === null ? <p className="loading">Cargando…</p> : !log.length ? (
            <p className="empty">Todavía no se ha enviado ninguna conversión. Cuando un contacto con clic de anuncio avance en el embudo, aparecerá aquí.</p>
          ) : (
            <div className="table-scroll">
              <table className="table" style={{ minWidth: 640 }}>
                <thead><tr><th>Fecha</th><th>Contacto</th><th>Evento</th><th>Destino</th><th>Estado</th><th>Detalle</th></tr></thead>
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
                        {edit && (entry.state === "failed" || entry.state === "skipped") && <> <button className="btn ghost small" disabled={!!busy} onClick={() => retry(entry.id)}>Reintentar</button></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {msg && <p className={`alert ${msg.kind}`} role="status" style={{ marginTop: 12 }}>{msg.text}</p>}
    </section>
  );
}

function StatusCard({ title, checks, onOpen }: { title: string; checks: { ok: boolean; label: string }[]; onOpen: () => void }) {
  const done = checks.filter((c) => c.ok).length;
  const ready = done === checks.length;
  return (
    <div className="card conv-card">
      <div className="conv-card-head"><b>{title}</b><span className={`pill ${ready ? "p-good" : done ? "p-warn" : "p-muted"}`}>{ready ? "Listo" : `${done}/${checks.length}`}</span></div>
      <div className="conv-bar" aria-hidden><i style={{ width: `${(done / checks.length) * 100}%` }} /></div>
      <ul className="conv-checks">
        {checks.map((c) => <li key={c.label} className={c.ok ? "ok" : ""}>{c.ok ? "✓" : "○"} {c.label}</li>)}
      </ul>
      <button className="btn ghost small" onClick={onOpen}>{ready ? "Revisar" : "Configurar"}</button>
    </div>
  );
}

function Step({ n, title, done, optional, children }: { n: number; title: string; done: boolean; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className={`card conv-step${done ? " done" : ""}`}>
      <span className="conv-n" aria-hidden>{done ? "✓" : n}</span>
      <div style={{ minWidth: 0 }}>
        <h3>{title}{optional && <span className="pill p-muted" style={{ marginLeft: 8 }}>Recomendado</span>}</h3>
        {children}
      </div>
    </div>
  );
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="conv-link" href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--muted)", minWidth: 0 }}>
      {label}
      {children}
    </label>
  );
}
