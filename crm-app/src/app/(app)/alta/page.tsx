"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfigPending, useSession } from "@/components/app-shell";
import { TryPanel } from "@/components/try-panel";
import { api, WIDGET_SRC } from "@/lib/api";
import type { AppConfig, Onboarding } from "@/lib/types";

// Alta guiada: pasos cortos que dejan el asistente listo. Cada paso se guarda como borrador
// (se puede salir y volver); el último publica la configuración y activa el asistente.
const TONES = [
  ["Cercano", "cercano, amable y claro"],
  ["Profesional", "profesional, claro y de confianza"],
  ["Directo", "directo, breve y al grano"],
] as const;

type Service = { name: string; price: string };
type Draft = { name: string; website: string; about: string; services: Service[]; tone: string; greeting: string };

function draftFrom(config: AppConfig, accountName: string): Draft {
  const offers = Object.keys(config.offers || {}).length ? config.offers! : config.services || {};
  const name = config.brand?.name || accountName;
  return {
    name,
    website: config.brand?.website_url || "",
    about: config.business_profile?.value_proposition || "",
    services: Object.keys(offers).length ? Object.entries(offers).map(([n, o]) => ({ name: n, price: String(o.min_monthly_fee || o.min_project_fee || "") })) : [{ name: "", price: "" }],
    tone: config.agent?.tone || "",
    greeting: config.agent?.initial_message || (name ? `¡Hola! Soy el asistente de ${name}. ¿En qué te puedo ayudar?` : ""),
  };
}

const offersOf = (d: Draft) =>
  Object.fromEntries(d.services.filter((s) => s.name.trim()).map((s) => [s.name.trim(), { category: "", description: "", min_monthly_fee: s.price.trim() }]));

export default function AltaPage() {
  const { config, configError } = useSession();
  const [onboarding, setOnboarding] = useState<Onboarding | null | undefined>(undefined);
  useEffect(() => {
    api<{ onboarding: Onboarding | null }>("/crm/onboarding").then((d) => setOnboarding(d.onboarding)).catch(() => setOnboarding(null));
  }, []);
  if (!config || onboarding === undefined) return <ConfigPending error={configError} />;
  return <Wizard config={config} onboarding={onboarding} />;
}

function Wizard({ config, onboarding }: { config: AppConfig; onboarding: Onboarding | null }) {
  const router = useRouter();
  const { account, reloadConfig } = useSession();
  const steps = onboarding?.steps || [];
  const [index, setIndex] = useState(() => Math.max(0, steps.findIndex((s) => !s.done)));
  const [draft, setDraft] = useState(() => draftFrom(config, account.name || ""));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  const update = (part: Partial<Draft>) => setDraft((d) => ({ ...d, ...part }));

  if (!onboarding) {
    return (
      <section className="page">
        <p className="empty">Esta cuenta no tiene alta guiada pendiente. Configura tu asistente en <Link href="/asistente">Mi asistente</Link>.</p>
      </section>
    );
  }
  const step = steps[index] || steps[steps.length - 1];

  // Guarda lo de este paso como borrador, marca el paso y avanza.
  async function next(save?: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    try {
      const notice = save ? await save() : undefined;
      await api("/crm/onboarding", { method: "POST", body: { step: step.key } });
      await reloadConfig();
      if (notice) setMsg({ kind: "warn", text: notice });
      if (step.key === "activar") return router.replace("/inicio?alta=ok");
      setIndex(index + 1);
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }

  const saveDraft = (body: object) => api("/crm/config", { method: "POST", body: { ...body, change_summary: "Alta guiada" } });

  const actions: Record<string, () => Promise<string | void>> = {
    negocio: async () => {
      if (!draft.name.trim()) throw new Error("Escribe el nombre de tu negocio.");
      const web = draft.website.trim();
      await saveDraft({
        brand: { name: draft.name.trim(), website_url: web },
        business_profile: { value_proposition: draft.about.trim() },
        knowledge_sources: { website_urls: web ? [web] : [] },
      });
      if (!web) return;
      // El agente lee la web con el ingestor de conocimiento.
      try {
        const r = await api<{ results: { ok: boolean }[] }>("/crm/knowledge/sync", { method: "POST", body: { urls: [web] } });
        if (r.results.some((x) => !x.ok)) return "No pudimos leer tu web. Puedes añadir páginas más tarde en Mi asistente → Lo que sabe.";
      } catch {
        return "No pudimos leer tu web. Puedes añadir páginas más tarde en Mi asistente → Lo que sabe.";
      }
    },
    servicios: async () => {
      if (!Object.keys(offersOf(draft)).length) throw new Error("Añade al menos un servicio.");
      await saveDraft({ offers: offersOf(draft), services: offersOf(draft) });
    },
    tono: async () => {
      if (!draft.tone.trim()) throw new Error("Elige o escribe un tono.");
      await saveDraft({ agent: { tone: draft.tone.trim(), initial_message: draft.greeting.trim() } });
    },
    activar: async () => {
      await api("/crm/assistant", {
        method: "POST",
        body: { agent: { tone: draft.tone.trim(), initial_message: draft.greeting.trim() }, offers: offersOf(draft) },
      });
    },
  };

  const pct = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Pon en marcha tu asistente</h1>
          <p className="sub">Paso {index + 1} de {steps.length} · {step.label}</p>
        </div>
        <Link className="btn" href="/inicio">Salir y seguir luego</Link>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del alta">
        <i style={{ width: `${pct}%` }} />
      </div>
      <ol className="steps" aria-label="Pasos">
        {steps.map((s, i) => (
          <li key={s.key}>
            <button className="chip" aria-current={i === index ? "step" : undefined} aria-pressed={s.done} onClick={() => setIndex(i)}>
              {s.done ? "✓ " : ""}{s.label}
            </button>
          </li>
        ))}
      </ol>
      {msg && <p className={`alert ${msg.kind}`} role="status" style={{ marginBottom: 14 }}>{msg.text}</p>}

      <div className={step.key === "probar" ? "assist" : undefined}>
        <div className="card block" style={{ maxWidth: step.key === "probar" ? undefined : 720 }}>
          {step.key === "negocio" && (
            <>
              <h2>Tu negocio y tu web</h2>
              <p className="hint">Tu asistente leerá tu web para responder con su contenido.</p>
              <label className="f" htmlFor="ob-name">Nombre del negocio</label>
              <input className="i" id="ob-name" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
              <label className="f" htmlFor="ob-web">Tu web</label>
              <input className="i" id="ob-web" type="url" placeholder="https://tuweb.com" value={draft.website} onChange={(e) => update({ website: e.target.value })} />
              <label className="f" htmlFor="ob-about">Qué hacéis, en una o dos frases</label>
              <textarea className="i" id="ob-about" rows={3} value={draft.about} onChange={(e) => update({ about: e.target.value })} placeholder="Clínica dental familiar en Valencia. Implantes, ortodoncia invisible y limpiezas." />
            </>
          )}
          {step.key === "servicios" && (
            <>
              <h2>Servicios y precios</h2>
              <p className="hint">Tu asistente solo dará estos precios. Lo que no esté aquí, lo consulta contigo.</p>
              {draft.services.map((row, i) => (
                <div className="svc-row" key={i}>
                  <input className="i" aria-label="Servicio" placeholder="Limpieza dental" value={row.name} onChange={(e) => update({ services: draft.services.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)) })} />
                  <input className="i" aria-label={`Precio de ${row.name || "este servicio"}`} placeholder="desde 50 €" value={row.price} onChange={(e) => update({ services: draft.services.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)) })} />
                  <button className="btn" aria-label={`Quitar ${row.name || "servicio"}`} onClick={() => update({ services: draft.services.filter((_, j) => j !== i) })}>×</button>
                </div>
              ))}
              <button className="btn ghost" onClick={() => update({ services: [...draft.services, { name: "", price: "" }] })}>+ Añadir servicio</button>
            </>
          )}
          {step.key === "tono" && (
            <>
              <h2>Tono y saludo</h2>
              <p className="hint">Cómo habla y lo primero que ve tu cliente en el chat.</p>
              <div className="tones">
                {TONES.map(([label, value]) => (
                  <button key={label} className="chip" aria-pressed={draft.tone === value} onClick={() => update({ tone: value })}>{label}</button>
                ))}
              </div>
              <textarea className="i" aria-label="Tono" rows={2} value={draft.tone} onChange={(e) => update({ tone: e.target.value })} placeholder="O escríbelo: cercano y claro, sin tecnicismos" />
              <label className="f" htmlFor="ob-greet">Saludo</label>
              <textarea className="i" id="ob-greet" rows={2} value={draft.greeting} onChange={(e) => update({ greeting: e.target.value })} />
            </>
          )}
          {step.key === "canales" && <ChannelsStep slug={account.slug || account.id} config={config} />}
          {step.key === "probar" && (
            <>
              <h2>Pruébalo</h2>
              <p className="hint">Escribe a la derecha como si fueras un cliente: pregunta por un precio o por lo que haces. Si algo no te gusta, vuelve a un paso anterior y cámbialo.</p>
            </>
          )}
          {step.key === "activar" && (
            <>
              <h2>Activa tu asistente</h2>
              <p className="hint">Al activarlo empezará a responder en tu web y en los canales que hayas conectado. Podrás cambiarlo cuando quieras en Mi asistente.</p>
              <ul className="hint" style={{ paddingLeft: 18 }}>
                <li><b>{draft.name}</b>{draft.website ? ` · ${draft.website}` : ""}</li>
                <li>{Object.keys(offersOf(draft)).length} servicios con precio</li>
                <li>Tono: {draft.tone || "sin elegir"}</li>
              </ul>
            </>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {index > 0 && <button className="btn" onClick={() => { setMsg(null); setIndex(index - 1); }} disabled={busy}>Atrás</button>}
            <button className="btn primary" onClick={() => next(actions[step.key])} disabled={busy}>
              {busy ? (step.key === "negocio" && draft.website ? "Leyendo tu web…" : "Guardando…") : step.key === "activar" ? "Activar mi asistente" : "Guardar y seguir"}
            </button>
          </div>
        </div>
        {step.key === "probar" && <TryPanel greeting={draft.greeting} config={{}} />}
      </div>
    </section>
  );
}

function ChannelsStep({ slug, config }: { slug: string; config: AppConfig }) {
  const [whatsapp, setWhatsapp] = useState<{ configured?: boolean; display_phone_number?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ channel: { configured?: boolean; display_phone_number?: string } }>("/crm/integrations/whatsapp/channel").then((d) => setWhatsapp(d.channel)).catch(() => setWhatsapp({}));
  }, []);
  const snippet = `<script src="${WIDGET_SRC}" data-account-slug="${slug}"></script>`;
  const calendarConnected = Boolean(config.integrations?.calendar?.google_refresh_token_configured);

  async function connectCalendar() {
    setError("");
    try {
      const data = await api<{ auth_url: string }>("/crm/integrations/calendar/google/connect-url", { method: "POST", body: { return_to: "app" } });
      window.location.href = data.auth_url;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h2>Conecta tus canales</h2>
      <p className="hint">Todo es opcional: puedes seguir y hacerlo más tarde desde Canales.</p>
      <h3 className="f">Chat en tu web</h3>
      <p className="hint">Pega este código antes de &lt;/body&gt; en tu web, o pásaselo a quien te lleve la web.</p>
      <div className="code">{snippet}</div>
      <button className="btn" onClick={() => navigator.clipboard.writeText(snippet).then(() => setCopied(true)).catch(() => null)}>{copied ? "¡Copiado!" : "Copiar código"}</button>
      <h3 className="f">WhatsApp</h3>
      {whatsapp?.configured ? (
        <span className="pill p-good"><span className="dot" />Conectado · {whatsapp.display_phone_number}</span>
      ) : (
        <p className="hint">Para conectar tu número de WhatsApp Business, <a href="mailto:info@t-mediaglobal.com?subject=Conectar%20WhatsApp">escríbenos</a> y te lo dejamos listo.</p>
      )}
      <h3 className="f">Calendario</h3>
      {calendarConnected ? (
        <span className="pill p-good"><span className="dot" />Google Calendar conectado</span>
      ) : (
        <>
          <p className="hint">Conecta Google Calendar y tu asistente reservará videollamadas en tus huecos libres. Al volver, entra de nuevo aquí desde Inicio.</p>
          <button className="btn" onClick={connectCalendar}>Conectar Google Calendar</button>
        </>
      )}
      {error && <p className="alert error" role="alert">{error}</p>}
    </>
  );
}
