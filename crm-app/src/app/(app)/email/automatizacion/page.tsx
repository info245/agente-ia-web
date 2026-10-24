"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import { BlockEditor, type Block, type EmailOptions } from "@/components/email-editor";
import type { WhatsAppTemplate } from "@/lib/types";

type Step =
  | { type: "wait"; amount: number; unit: "hours" | "days" }
  | { type: "email"; subject: string; preheader?: string; blocks: Block[] }
  | { type: "whatsapp"; template_name: string; language: string; params: string[] }
  | { type: "condition"; check: "opened_last" | "clicked_last" | "has_tag" | "stage"; value?: string }
  | { type: "add_tag"; tag: string }
  | { type: "set_stage"; stage: string };
type Automation = { id?: string; name: string; status?: string; trigger: { type: "lead_created" | "stage" | "tag"; stage?: string; tag?: string; segment?: { services?: string[] } }; steps: Step[]; stats?: { total: number; active: number; done: number; exited: number } };

const NEW_STEP: Record<Step["type"], Step> = {
  wait: { type: "wait", amount: 2, unit: "days" },
  email: { type: "email", subject: "", blocks: [{ type: "text", text: "Hola {nombre|}," }] },
  whatsapp: { type: "whatsapp", template_name: "", language: "es", params: [] },
  condition: { type: "condition", check: "opened_last" },
  add_tag: { type: "add_tag", tag: "" },
  set_stage: { type: "set_stage", stage: "" },
};
const STEP_LABEL: Record<Step["type"], string> = { wait: "Esperar", email: "Enviar email", whatsapp: "Enviar WhatsApp", condition: "Solo sigue si…", add_tag: "Añadir etiqueta", set_stage: "Cambiar etapa" };

export default function AutomationPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { config } = useSession();
  const [id, setId] = useState(params.get("id") || "");
  const [a, setA] = useState<Automation | null>(id ? null : { name: "", trigger: { type: "lead_created" }, steps: [NEW_STEP.email] });
  const [options, setOptions] = useState<EmailOptions | null>(null);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const stages = (config?.pipeline?.stages || []).filter((s) => s.is_active !== false);

  useEffect(() => {
    api<EmailOptions>("/crm/email/options").then(setOptions).catch(() => {});
    api<{ templates: WhatsAppTemplate[] }>("/crm/whatsapp/templates").then((r) => setTemplates(r.templates.filter((t) => t.sendable))).catch(() => {});
    if (!id) return;
    api<{ automations: Automation[] }>("/crm/email/automations")
      .then((r) => setA(r.automations.find((x) => x.id === id) || null))
      .catch((e) => setMsg({ kind: "error", text: (e as Error).message }));
  }, [id]);

  if (!a) return msg ? <section className="page"><p className="alert error">{msg.text}</p></section> : <p className="loading">Cargando…</p>;
  const set = (part: Partial<Automation>) => setA((prev) => (prev ? { ...prev, ...part } : prev));
  const setStep = (i: number, part: Partial<Step>) => set({ steps: a.steps.map((s, j) => (j === i ? ({ ...s, ...part } as Step) : s)) });
  const move = (i: number, d: number) => {
    const next = [...a.steps];
    const [s] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + d)), 0, s);
    set({ steps: next });
  };

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ kind: "ok", text: await fn() });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }

  const save = async () => {
    const r = await api<{ automation: Automation }>("/crm/email/automations", { method: "POST", body: { ...a, id: id || undefined } });
    if (!id && r.automation.id) {
      setId(r.automation.id);
      router.replace(`/email/automatizacion?id=${r.automation.id}`);
    }
    set({ ...r.automation, stats: a.stats });
    return r.automation.id as string;
  };

  const setStatus = (status: "active" | "paused") => run(async () => {
    if (status === "active" && !window.confirm("Al activarla, entrarán los contactos que cumplan el disparador a partir de ahora (no los anteriores). ¿Activar?")) return "Sin cambios.";
    const automationId = await save();
    const r = await api<{ automation: Automation }>(`/crm/email/automations/${automationId}/status`, { method: "POST", body: { status } });
    set({ status: r.automation.status });
    return status === "active" ? "Activada." : "Pausada. Quien estaba dentro espera a que la reactives.";
  });

  const template = (name: string) => templates.find((t) => t.name === name);

  return (
    <section className="page">
      <div className="head">
        <div>
          <p className="sub" style={{ margin: 0 }}><Link href="/email">← Email marketing</Link></p>
          <h1>{a.name || "Nueva automatización"}</h1>
          {a.stats && <p className="sub">{a.stats.total} contactos han entrado · {a.stats.active} en curso · {a.stats.done} terminaron · {a.stats.exited} salieron</p>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" disabled={busy} onClick={() => run(async () => { await save(); return "Guardada."; })}>Guardar</button>
          {a.status === "active"
            ? <button className="btn" disabled={busy} onClick={() => setStatus("paused")}>Pausar</button>
            : <button className="btn primary" disabled={busy} onClick={() => setStatus("active")}>Guardar y activar</button>}
        </div>
      </div>
      {msg && <p className={`alert ${msg.kind}`} role="status" style={{ marginBottom: 14 }}>{msg.text}</p>}

      <div className="card block">
        <label className="f" htmlFor="a-name">Nombre</label>
        <input id="a-name" className="i" value={a.name} onChange={(e) => set({ name: e.target.value })} placeholder="Bienvenida a leads de formulario" />
        <label className="f" htmlFor="a-trigger">Empieza cuando</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select id="a-trigger" className="i" style={{ maxWidth: 260 }} value={a.trigger.type} onChange={(e) => set({ trigger: { ...a.trigger, type: e.target.value as Automation["trigger"]["type"] } })}>
            <option value="lead_created">Entra un contacto nuevo</option>
            <option value="stage">Un contacto pasa a la etapa…</option>
            <option value="tag">Un contacto recibe la etiqueta…</option>
          </select>
          {a.trigger.type === "stage" && (
            <select className="i" style={{ maxWidth: 220 }} aria-label="Etapa" value={a.trigger.stage || ""} onChange={(e) => set({ trigger: { ...a.trigger, stage: e.target.value } })}>
              <option value="">Elige etapa</option>
              {stages.map((s) => <option key={s.key} value={s.key}>{s.label || s.key}</option>)}
            </select>
          )}
          {a.trigger.type === "tag" && <input className="i" style={{ maxWidth: 220 }} aria-label="Etiqueta" list="tag-list" value={a.trigger.tag || ""} onChange={(e) => set({ trigger: { ...a.trigger, tag: e.target.value } })} placeholder="etiqueta" />}
          {options?.services.length ? (
            <select className="i" style={{ maxWidth: 240 }} aria-label="Solo si le interesa" value={a.trigger.segment?.services?.[0] || ""} onChange={(e) => set({ trigger: { ...a.trigger, segment: { services: e.target.value ? [e.target.value] : [] } } })}>
              <option value="">Cualquier servicio</option>
              {options.services.map((s) => <option key={s} value={s}>Solo si le interesa {s}</option>)}
            </select>
          ) : null}
        </div>
        <datalist id="tag-list">{(options?.tags || []).map((t) => <option key={t} value={t} />)}</datalist>
        <p className="hint" style={{ marginTop: 8 }}>Solo entra quien tiene email y consentimiento (o ya es cliente). Cada contacto entra una sola vez y sale si se da de baja.</p>
      </div>

      {a.steps.map((s, i) => (
        <div key={i} className="card block">
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
            <b style={{ marginRight: "auto" }}>Paso {i + 1} · {STEP_LABEL[s.type]}</b>
            <button className="btn ghost small" aria-label="Subir paso" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="btn ghost small" aria-label="Bajar paso" disabled={i === a.steps.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button className="btn ghost small" onClick={() => set({ steps: a.steps.filter((_, j) => j !== i) })}>Quitar</button>
          </div>
          {s.type === "wait" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input className="i" type="number" min={1} style={{ width: 90 }} aria-label="Cantidad" value={s.amount} onChange={(e) => setStep(i, { amount: Number(e.target.value) })} />
              <select className="i" style={{ width: 120 }} aria-label="Unidad" value={s.unit} onChange={(e) => setStep(i, { unit: e.target.value as "hours" | "days" })}>
                <option value="hours">horas</option>
                <option value="days">días</option>
              </select>
            </div>
          )}
          {s.type === "email" && (
            <>
              <input className="i" value={s.subject} onChange={(e) => setStep(i, { subject: e.target.value })} placeholder="Asunto" aria-label="Asunto" />
              <div style={{ marginTop: 8 }}><BlockEditor blocks={s.blocks} onChange={(blocks) => setStep(i, { blocks })} /></div>
            </>
          )}
          {s.type === "whatsapp" && (
            <>
              <select className="i" aria-label="Plantilla de WhatsApp" value={s.template_name ? `${s.template_name}|${s.language}` : ""} onChange={(e) => { const [name, language] = e.target.value.split("|"); setStep(i, { template_name: name || "", language: language || "es", params: Array.from({ length: template(name)?.params || 0 }, (_, k) => (k === 0 ? "{nombre|}" : "")) }); }}>
                <option value="">{templates.length ? "Elige una plantilla aprobada" : "No hay plantillas aprobadas"}</option>
                {templates.map((t) => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name.replace(/_/g, " ")} · {t.language}</option>)}
              </select>
              {s.params.map((p, k) => (
                <input key={k} className="i" style={{ marginTop: 6 }} aria-label={`Dato ${k + 1}`} value={p} placeholder={`Dato {{${k + 1}}} (puedes usar {nombre}, {servicio})`} onChange={(e) => setStep(i, { params: s.params.map((x, j) => (j === k ? e.target.value : x)) })} />
              ))}
              {template(s.template_name) && <div className="m" style={{ marginTop: 8, maxWidth: "100%", background: "var(--surface-2)", border: "1px solid var(--line)" }}>{template(s.template_name)?.body}</div>}
              <p className="hint" style={{ marginTop: 6 }}>Solo se envía si el contacto tiene teléfono y no ha rechazado el contacto.</p>
            </>
          )}
          {s.type === "condition" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select className="i" style={{ maxWidth: 300 }} aria-label="Condición" value={s.check} onChange={(e) => setStep(i, { check: e.target.value as "opened_last" })}>
                <option value="opened_last">abrió el email anterior</option>
                <option value="clicked_last">hizo clic en el email anterior</option>
                <option value="has_tag">tiene la etiqueta…</option>
                <option value="stage">está en la etapa…</option>
              </select>
              {s.check === "has_tag" && <input className="i" style={{ maxWidth: 200 }} list="tag-list" aria-label="Etiqueta" value={s.value || ""} onChange={(e) => setStep(i, { value: e.target.value })} />}
              {s.check === "stage" && (
                <select className="i" style={{ maxWidth: 200 }} aria-label="Etapa" value={s.value || ""} onChange={(e) => setStep(i, { value: e.target.value })}>
                  <option value="">Elige etapa</option>
                  {stages.map((st) => <option key={st.key} value={st.key}>{st.label || st.key}</option>)}
                </select>
              )}
              <p className="hint" style={{ margin: 0, width: "100%" }}>Si no se cumple, el contacto sale de la automatización. Pon una espera antes para darle tiempo a abrir o hacer clic.</p>
            </div>
          )}
          {s.type === "add_tag" && <input className="i" list="tag-list" aria-label="Etiqueta" value={s.tag} onChange={(e) => setStep(i, { tag: e.target.value })} placeholder="etiqueta" />}
          {s.type === "set_stage" && (
            <select className="i" aria-label="Etapa" value={s.stage} onChange={(e) => setStep(i, { stage: e.target.value })}>
              <option value="">Elige etapa</option>
              {stages.map((st) => <option key={st.key} value={st.key}>{st.label || st.key}</option>)}
            </select>
          )}
        </div>
      ))}

      <div className="card block" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ marginRight: 6 }}>Añadir paso:</b>
        {(Object.keys(NEW_STEP) as Step["type"][]).map((type) => (
          <button key={type} className="btn small" onClick={() => set({ steps: [...a.steps, NEW_STEP[type]] })}>+ {STEP_LABEL[type]}</button>
        ))}
      </div>
    </section>
  );
}
