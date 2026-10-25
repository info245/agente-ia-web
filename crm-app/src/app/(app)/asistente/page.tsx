"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConfigPending, useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import { TryPanel } from "@/components/try-panel";
import type { AppConfig, Faq, Flow, Meeting, MessageTemplate, Offer, Privacy } from "@/lib/types";

const TONES = [
  ["Cercano", "cercano, amable y claro"],
  ["Profesional", "profesional, claro y de confianza"],
  ["Directo", "directo, breve y al grano"],
] as const;

const TABS = [
  ["habla", "Cómo habla"],
  ["negocio", "Tu negocio"],
  ["vende", "Qué vendes"],
  ["sabe", "Lo que sabe"],
  ["actua", "Cuándo actúa"],
  ["privacidad", "Privacidad"],
] as const;
type Tab = (typeof TABS)[number][0];

const DAYS = [[1, "L"], [2, "M"], [3, "X"], [4, "J"], [5, "V"], [6, "S"], [0, "D"]] as const;

type ServiceRow = { name: string; price: string; original: string; field: "min_monthly_fee" | "min_project_fee" };
type Draft = {
  tone: string;
  greeting: string;
  website: string;
  valueProposition: string;
  audience: string;
  team: string;
  supportEmail: string;
  alertsEmail: string;
  services: ServiceRow[];
  websiteUrls: string[];
  notes: string;
  tables: string;
  faq: Faq[];
  handoffWhen: string;
  meetingWhen: string;
  meeting: Meeting;
  flows: Record<string, Flow>;
  templates: Record<string, MessageTemplate>;
  privacy: Privacy;
};

function offersOf(config: AppConfig) {
  return Object.keys(config.offers || {}).length ? config.offers! : config.services || {};
}

function draftFrom(config: AppConfig): Draft {
  return {
    tone: config.agent?.tone || "",
    greeting: config.agent?.initial_message || "",
    website: config.brand?.website_url || "",
    valueProposition: config.business_profile?.value_proposition || "",
    audience: config.business_profile?.audience || "",
    team: config.business_profile?.human_team_label || "",
    supportEmail: config.contact?.support_email || "",
    alertsEmail: config.notifications?.email_to || "",
    services: Object.entries(offersOf(config)).map(([name, offer]) => ({
      name,
      original: name,
      field: offer.min_project_fee && !offer.min_monthly_fee ? "min_project_fee" : "min_monthly_fee",
      price: String(offer.min_monthly_fee || offer.min_project_fee || ""),
    })),
    websiteUrls: config.knowledge_sources?.website_urls || [],
    notes: config.knowledge_sources?.internal_notes || "",
    tables: config.knowledge_sources?.spreadsheet_mapping || "",
    faq: config.agent?.faq || [],
    handoffWhen: config.agent?.handoff_when || "",
    meetingWhen: config.agent?.offer_meeting_when || "",
    meeting: { days: [1, 2, 3, 4, 5], start_hour: 9, end_hour: 18, duration_minutes: 30, ...config.agent?.meeting },
    flows: config.automation_flows || {},
    templates: config.message_templates || {},
    privacy: { notice_text: "", policy_url: "", retention_months: 0, retention_action: "anonymize", ...config.privacy },
  };
}

// Solo se envía lo que se edita aquí; el servidor lo mezcla con el resto de la configuración.
function patchFrom(config: AppConfig, d: Draft) {
  const previous = offersOf(config);
  const offers: Record<string, Offer> = {};
  for (const row of d.services) {
    const name = row.name.trim();
    if (!name) continue;
    offers[name] = { ...(previous[row.original] || { category: "", description: "" }), [row.field]: row.price.trim() };
  }
  const usedTemplates = new Set(Object.values(d.flows).flatMap((f) => (f.steps || []).map((s) => s.template_key || "")));
  return {
    agent: {
      tone: d.tone.trim(),
      initial_message: d.greeting.trim(),
      faq: d.faq.filter((f) => f.question.trim() && f.answer.trim()),
      handoff_when: d.handoffWhen.trim(),
      offer_meeting_when: d.meetingWhen.trim(),
      meeting: d.meeting,
    },
    offers,
    brand: { website_url: d.website.trim() },
    business_profile: { value_proposition: d.valueProposition.trim(), audience: d.audience.trim(), human_team_label: d.team.trim() },
    contact: { support_email: d.supportEmail.trim() },
    notifications: { email_to: d.alertsEmail.trim() },
    knowledge_sources: {
      website_urls: d.websiteUrls.map((u) => u.trim()).filter(Boolean),
      internal_notes: d.notes.trim(),
      spreadsheet_mapping: d.tables.trim(),
    },
    automation_flows: d.flows,
    message_templates: Object.fromEntries(Object.entries(d.templates).filter(([key]) => usedTemplates.has(key))),
    privacy: { ...d.privacy, notice_text: (d.privacy.notice_text || "").trim(), policy_url: (d.privacy.policy_url || "").trim() },
  };
}

// La configuración completa que usa "Probar" (mismo formato que la guardada).
function previewConfig(patch: ReturnType<typeof patchFrom>, config: AppConfig) {
  return {
    agent: { ...config.agent, ...patch.agent },
    offers: patch.offers,
    services: patch.offers,
    brand: { ...config.brand, ...patch.brand },
    business_profile: { ...config.business_profile, ...patch.business_profile },
    contact: { ...config.contact, ...patch.contact },
    knowledge_sources: { ...config.knowledge_sources, ...patch.knowledge_sources },
  };
}

export default function AsistentePage() {
  const { config, configError, reloadConfig } = useSession();
  if (!config) return <ConfigPending error={configError} />;
  return <Editor config={config} reloadConfig={reloadConfig} />;
}

function Editor({ config, reloadConfig }: { config: AppConfig; reloadConfig: () => Promise<void> }) {
  const { account, user } = useSession();
  const accountName = account.name || account.slug || account.id;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(config));
  const [saved, setSaved] = useState(() => JSON.stringify(draftFrom(config)));
  const [tab, setTab] = useState<Tab>("habla");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const patch = useMemo(() => patchFrom(config, draft), [config, draft]);
  const dirty = JSON.stringify(draft) !== saved;
  const update = (part: Partial<Draft>) => setDraft((d) => ({ ...d, ...part }));

  async function save() {
    // La agencia trabaja con varias cuentas: confirmar siempre en cuál se guarda.
    if (user.role === "super_admin" && !window.confirm(`Vas a guardar y activar estos cambios en la cuenta «${accountName}». ¿Es correcto?`)) return;
    setSaving(true);
    setMessage(null);
    try {
      await api("/crm/assistant", { method: "POST", body: patch });
      await reloadConfig();
      setSaved(JSON.stringify(draft));
      setMessage({ kind: "ok", text: "Guardado. Tu asistente ya funciona con estos cambios." });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
    setSaving(false);
  }

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Mi asistente</h1>
          <p className="sub">Cómo atiende a tus clientes, qué sabe y qué hace solo. Pruébalo a la derecha antes de guardar.</p>
        </div>
        <span className="pill p-good"><span className="dot" />Activo en WhatsApp y web</span>
      </div>
      <div className="tabs" role="tablist" aria-label="Secciones del asistente">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" className="chip" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      <div className="assist">
        <div>
          {tab === "habla" && <TalkTab draft={draft} update={update} />}
          {tab === "negocio" && <BusinessTab draft={draft} update={update} />}
          {tab === "vende" && <SellTab draft={draft} update={update} />}
          {tab === "sabe" && <KnowsTab draft={draft} update={update} />}
          {tab === "actua" && <ActsTab draft={draft} update={update} />}
          {tab === "privacidad" && <PrivacyTab draft={draft} update={update} />}
          <div className="card savebar">
            {message ? <span role="status" className={`alert ${message.kind}`}>{message.text}</span> : <span>{dirty ? "Tienes cambios sin guardar" : "Todo guardado"}</span>}
            <button className="btn primary" onClick={save} disabled={!dirty || saving}>{saving ? "Guardando…" : `Guardar y activar en ${accountName}`}</button>
          </div>
        </div>
        <TryPanel greeting={draft.greeting} config={previewConfig(patch, config)} />
      </div>
    </section>
  );
}

type TabProps = { draft: Draft; update: (part: Partial<Draft>) => void };

function TalkTab({ draft, update }: TabProps) {
  return (
    <div className="card block">
      <h2>Cómo habla</h2>
      <p className="hint">Su tono y el primer mensaje que ve el cliente en tu web.</p>
      <label className="f" htmlFor="tone">Tono</label>
      <div className="tones">
        {TONES.map(([label, value]) => (
          <button key={label} className="chip" aria-pressed={draft.tone === value} onClick={() => update({ tone: value })}>{label}</button>
        ))}
      </div>
      <textarea className="i" id="tone" rows={2} value={draft.tone} onChange={(e) => update({ tone: e.target.value })} placeholder="Por ejemplo: cercano y claro, sin tecnicismos" />
      <label className="f" htmlFor="greeting">Saludo</label>
      <textarea className="i" id="greeting" rows={2} value={draft.greeting} onChange={(e) => update({ greeting: e.target.value })} />
    </div>
  );
}

// Aviso del chat y plazos de conservación (RGPD). El texto por defecto lo pone el servidor si se deja vacío.
function PrivacyTab({ draft, update }: TabProps) {
  const p = draft.privacy;
  const set = (part: Partial<Privacy>) => update({ privacy: { ...p, ...part } });
  return (
    <div className="card block">
      <h2>Privacidad</h2>
      <p className="hint">Lo que ve el cliente en el chat antes de escribir y cuánto tiempo guardamos sus datos.</p>
      <label className="f" htmlFor="notice">Aviso del chat</label>
      <textarea className="i" id="notice" rows={3} value={p.notice_text || ""} onChange={(e) => set({ notice_text: e.target.value })}
        placeholder="Este chat lo atiende un asistente con inteligencia artificial. Usaremos los datos que nos des para responder a tu consulta…" />
      <label className="f" htmlFor="policy">Enlace a tu política de privacidad</label>
      <input className="i" id="policy" type="url" value={p.policy_url || ""} onChange={(e) => set({ policy_url: e.target.value })} placeholder="https://tuweb.com/privacidad" />
      <label className="f" htmlFor="retention">Borrar contactos sin actividad después de</label>
      <select className="i" id="retention" value={p.retention_months || 0} onChange={(e) => set({ retention_months: Number(e.target.value) })}>
        <option value={0}>No borrar automáticamente</option>
        {[6, 12, 24, 36, 60].map((m) => <option key={m} value={m}>{m} meses</option>)}
      </select>
      {(p.retention_months || 0) > 0 && (
        <>
          <label className="f" htmlFor="retention-action">Qué hacer con ellos</label>
          <select className="i" id="retention-action" value={p.retention_action || "anonymize"} onChange={(e) => set({ retention_action: e.target.value as Privacy["retention_action"] })}>
            <option value="anonymize">Anonimizar (se borran nombre, contacto y conversación; quedan las cifras)</option>
            <option value="delete">Borrar del todo</option>
          </select>
          <p className="hint" style={{ marginTop: 8 }}>Se revisa una vez al día. Cuenta como actividad cualquier mensaje o cambio en la ficha.</p>
        </>
      )}
    </div>
  );
}

function BusinessTab({ draft, update }: TabProps) {
  return (
    <div className="card block">
      <h2>Tu negocio</h2>
      <p className="hint">El contexto que tu asistente necesita para hablar como alguien de tu equipo.</p>
      <label className="f" htmlFor="vp">Qué hacéis y qué os diferencia</label>
      <textarea className="i" id="vp" rows={3} value={draft.valueProposition} onChange={(e) => update({ valueProposition: e.target.value })} placeholder="Agencia de marketing digital especializada en captar clientes para clínicas y negocios locales…" />
      <label className="f" htmlFor="aud">A quién vendéis</label>
      <textarea className="i" id="aud" rows={2} value={draft.audience} onChange={(e) => update({ audience: e.target.value })} placeholder="Pymes y clínicas que quieren más clientes desde Google" />
      <label className="f" htmlFor="web">Tu web</label>
      <input className="i" id="web" type="url" value={draft.website} onChange={(e) => update({ website: e.target.value })} placeholder="https://tuweb.com" />
      <label className="f" htmlFor="team">Cómo llama tu asistente a tu equipo</label>
      <input className="i" id="team" value={draft.team} onChange={(e) => update({ team: e.target.value })} placeholder="el equipo comercial" />
      <label className="f" htmlFor="support">Email que puede dar a los clientes</label>
      <input className="i" id="support" type="email" value={draft.supportEmail} onChange={(e) => update({ supportEmail: e.target.value })} placeholder="hola@tuweb.com" />
      <label className="f" htmlFor="alerts">Dónde te avisamos de los leads nuevos</label>
      <input className="i" id="alerts" type="text" value={draft.alertsEmail} onChange={(e) => update({ alertsEmail: e.target.value })} placeholder="ventas@tuweb.com (varios separados por comas)" />
    </div>
  );
}

function SellTab({ draft, update }: TabProps) {
  return (
    <div className="card block">
      <h2>Qué vendes y a qué precio</h2>
      <p className="hint">Tu asistente solo dará estos precios. Lo que no esté aquí, lo consulta con tu equipo.</p>
      {draft.services.map((row, i) => (
        <div className="svc-row" key={i}>
          <input className="i" aria-label="Servicio" value={row.name} onChange={(e) => update({ services: draft.services.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)) })} />
          <input className="i" aria-label={`Precio de ${row.name}`} placeholder="desde 300 €/mes" value={row.price} onChange={(e) => update({ services: draft.services.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)) })} />
          <button className="btn" aria-label={`Quitar ${row.name}`} onClick={() => update({ services: draft.services.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <button className="btn ghost" onClick={() => update({ services: [...draft.services, { name: "", price: "", original: "", field: "min_monthly_fee" }] })}>+ Añadir servicio</button>
    </div>
  );
}

type Source = { url: string; title?: string; chunks: number; synced_at?: string };

function KnowsTab({ draft, update }: TabProps) {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSources = () =>
    api<{ sources: Source[] }>("/crm/knowledge/sources").then((d) => setSources(d.sources)).catch(() => setSources([]));
  useEffect(() => {
    loadSources();
  }, []);

  async function syncPages() {
    setBusy("sync");
    setStatus(null);
    try {
      const data = await api<{ results: { ok: boolean; url: string; error?: string }[] }>("/crm/knowledge/sync", {
        method: "POST",
        body: { urls: draft.websiteUrls.filter((u) => u.trim()) },
      });
      const failed = data.results.filter((r) => !r.ok);
      setStatus(failed.length
        ? { kind: "warn", text: `No se pudieron leer: ${failed.map((f) => f.url).join(", ")}` }
        : { kind: "ok", text: "Páginas leídas. Tu asistente ya conoce su contenido." });
    } catch (err) {
      const data = (err as { data?: { results?: { ok: boolean; url: string }[] } }).data;
      setStatus({ kind: "error", text: data?.results ? `No se pudieron leer: ${data.results.filter((r) => !r.ok).map((r) => r.url).join(", ")}` : (err as Error).message });
    }
    await loadSources();
    setBusy("");
  }

  async function upload(file: File) {
    setBusy("upload");
    setStatus(null);
    try {
      let rows: string[][];
      if (/\.csv$/i.test(file.name)) {
        const text = await file.text();
        const sep = (text.split("\n")[0].match(/;/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
        rows = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim()));
      } else {
        const { readSheet } = await import("read-excel-file/browser");
        const sheet = (await readSheet(file)) as unknown as unknown[][];
        rows = sheet.map((r) => r.map((c) => (c instanceof Date ? c.toLocaleDateString("es-ES") : String(c ?? ""))));
      }
      const [headers, ...data] = rows;
      if (!headers || !data.length) throw new Error("El archivo no tiene filas debajo de la cabecera.");
      const name = file.name.replace(/\.(xlsx|csv)$/i, "");
      const result = await api<{ source: { rows: number; title: string } }>("/crm/knowledge/spreadsheet", {
        method: "POST",
        body: { name, headers, rows: data },
      });
      const line = `${result.source.title} (${result.source.rows} filas): ${headers.filter(Boolean).join(", ")}`;
      const others = draft.tables.split("\n").filter((l) => l.trim() && !l.startsWith(`${result.source.title} (`));
      update({ tables: [...others, line].join("\n") });
      setStatus({ kind: "ok", text: `"${result.source.title}" cargada (${result.source.rows} filas). Guarda para que tu asistente sepa que existe.` });
      await loadSources();
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    }
    if (fileRef.current) fileRef.current.value = "";
    setBusy("");
  }

  async function remove(source: Source) {
    setBusy(source.url);
    try {
      await api(`/crm/knowledge/source?url=${encodeURIComponent(source.url)}`, { method: "DELETE" });
      if (source.url.startsWith("tabla://")) {
        update({ tables: draft.tables.split("\n").filter((l) => !l.startsWith(`${source.title} (`)).join("\n") });
      }
      await loadSources();
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    }
    setBusy("");
  }

  const tables = (sources || []).filter((s) => s.url.startsWith("tabla://"));
  const pages = (sources || []).filter((s) => !s.url.startsWith("tabla://"));

  return (
    <>
      <div className="card block">
        <h2>Páginas de tu web</h2>
        <p className="hint">Tu asistente lee estas páginas y responde con su contenido. Actualízalas cuando cambies la web.</p>
        {draft.websiteUrls.map((url, i) => (
          <div className="svc-row" key={i} style={{ gridTemplateColumns: "minmax(0, 1fr) 36px" }}>
            <input className="i" type="url" aria-label="Página" value={url} onChange={(e) => update({ websiteUrls: draft.websiteUrls.map((u, j) => (j === i ? e.target.value : u)) })} />
            <button className="btn" aria-label="Quitar página" onClick={() => update({ websiteUrls: draft.websiteUrls.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn ghost" onClick={() => update({ websiteUrls: [...draft.websiteUrls, ""] })}>+ Añadir página</button>
          <button className="btn" onClick={syncPages} disabled={busy !== "" || !draft.websiteUrls.some((u) => u.trim())}>{busy === "sync" ? "Leyendo páginas…" : "Leer páginas ahora"}</button>
        </div>
        {pages.length > 0 && (
          <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
            Ya conoce {pages.length} {pages.length === 1 ? "página" : "páginas"}: {pages.map((p) => p.title || p.url).join(" · ")}
          </p>
        )}
      </div>

      <div className="card block">
        <h2>Tablas de referencia</h2>
        <p className="hint">Sube un Excel o CSV (productos, tarifas, casos de éxito, centros…). La primera fila debe ser la cabecera. Tu asistente buscará en sus filas cuando le pregunten.</p>
        {tables.map((t) => (
          <div key={t.url} className="faq-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span><b>{t.title}</b> <span style={{ color: "var(--muted)", fontSize: 13 }}>· {draft.tables.split("\n").find((l) => l.startsWith(`${t.title} (`))?.match(/\((\d+) filas\)/)?.[1] || "?"} filas</span></span>
            <button className="btn small" onClick={() => remove(t)} disabled={busy !== ""}>{busy === t.url ? "Quitando…" : "Quitar"}</button>
          </div>
        ))}
        <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy !== ""}>{busy === "upload" ? "Cargando tabla…" : "Subir Excel o CSV"}</button>
      </div>

      {status && <p className={`alert ${status.kind}`} role="status">{status.text}</p>}

      <div className="card block">
        <h2>Preguntas frecuentes</h2>
        <p className="hint">Lo que más te preguntan, con la respuesta exacta que quieres que dé.</p>
        {draft.faq.length === 0 && <p className="empty" style={{ padding: 12 }}>Aún no hay preguntas. Añade las que más te hacen tus clientes.</p>}
        {draft.faq.map((item, i) => (
          <div className="faq-row" key={i}>
            <div className="top">
              <input className="i" aria-label="Pregunta" placeholder="¿Hay permanencia?" value={item.question} onChange={(e) => update({ faq: draft.faq.map((f, j) => (j === i ? { ...f, question: e.target.value } : f)) })} />
              <button className="btn" aria-label="Quitar pregunta" onClick={() => update({ faq: draft.faq.filter((_, j) => j !== i) })}>×</button>
            </div>
            <textarea className="i" aria-label="Respuesta" rows={2} placeholder="No, ningún servicio tiene permanencia." value={item.answer} onChange={(e) => update({ faq: draft.faq.map((f, j) => (j === i ? { ...f, answer: e.target.value } : f)) })} />
          </div>
        ))}
        <button className="btn ghost" onClick={() => update({ faq: [...draft.faq, { question: "", answer: "" }] })}>+ Añadir pregunta</button>
      </div>

      <div className="card block">
        <h2>Otras cosas que debe saber</h2>
        <p className="hint">Horarios, zonas donde trabajas, plazos, lo que no haces… Escríbelo como se lo contarías a alguien nuevo en tu equipo.</p>
        <textarea className="i" rows={5} aria-label="Notas para el asistente" value={draft.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Trabajamos en toda España en remoto. No hacemos campañas de TikTok. Los proyectos web tardan 3-4 semanas…" />
      </div>
    </>
  );
}

function ActsTab({ draft, update }: TabProps) {
  const m = draft.meeting;
  const setMeeting = (part: Partial<Meeting>) => update({ meeting: { ...m, ...part } });
  return (
    <div className="card block">
      <h2>Cuándo actúa</h2>
      <p className="hint">Cuándo ofrece una videollamada y cuándo te pasa la conversación a ti. Los seguimientos automáticos (WhatsApp y email cuando no contestan) están en <a href="/email">Automatizaciones</a>.</p>
      <label className="f" htmlFor="meet-when">Cuándo ofrecer una videollamada</label>
      <textarea className="i" id="meet-when" rows={2} value={draft.meetingWhen} onChange={(e) => update({ meetingWhen: e.target.value })} placeholder="Cuando el cliente ya ha contado su caso y pregunta por precios o quiere avanzar." />
      <label className="f" htmlFor="handoff-when">Cuándo pasarte la conversación</label>
      <textarea className="i" id="handoff-when" rows={2} value={draft.handoffWhen} onChange={(e) => update({ handoffWhen: e.target.value })} placeholder="Cuando pidan hablar con una persona, tengan una queja o pidan un presupuesto cerrado." />
      <label className="f">Días para videollamadas</label>
      <div className="tones">
        {DAYS.map(([day, label]) => {
          const on = (m.days || []).includes(day);
          return (
            <button key={day} className="chip" aria-pressed={on} aria-label={label} onClick={() => setMeeting({ days: on ? (m.days || []).filter((d) => d !== day) : [...(m.days || []), day] })}>{label}</button>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <label className="f">Desde las
          <select className="i" value={m.start_hour ?? 9} onChange={(e) => setMeeting({ start_hour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
          </select>
        </label>
        <label className="f">Hasta las
          <select className="i" value={m.end_hour ?? 18} onChange={(e) => setMeeting({ end_hour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{h}:00</option>)}
          </select>
        </label>
        <label className="f">Duración
          <select className="i" value={m.duration_minutes ?? 30} onChange={(e) => setMeeting({ duration_minutes: Number(e.target.value) })}>
            {[15, 20, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} min</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
