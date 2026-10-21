"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/components/app-shell";
import { api } from "@/lib/api";
import { leadName } from "@/lib/format";

type Content = {
  headline?: string; summary?: string; next_step?: string; recommended_service?: string;
  findings?: unknown[]; quick_wins?: unknown[]; priorities?: unknown[]; [key: string]: unknown;
};
type Analysis = { id?: string; title?: string; status?: string; recommended_service?: string; sent_at?: string | null; content_json?: Content };
type Draft = { title: string; recommended_service: string; headline: string; summary: string; findings: string; quick_wins: string; priorities: string; next_step: string };

// Las listas pueden venir como texto o como {title, detail}; en el editor van una por línea.
const toLines = (rows: unknown[] = []) =>
  rows.map((r) => (typeof r === "string" ? r : [(r as { title?: string })?.title, (r as { detail?: string })?.detail].filter(Boolean).join(": "))).filter(Boolean).join("\n");
const fromLines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

function fromAnalysis(a: Analysis | null, service = ""): Draft {
  const c = a?.content_json || {};
  return {
    title: a?.title || "", recommended_service: a?.recommended_service || c.recommended_service || service,
    headline: c.headline || "", summary: c.summary || "", next_step: c.next_step || "",
    findings: toLines(c.findings), quick_wins: toLines(c.quick_wins), priorities: toLines(c.priorities),
  };
}

export default function AnalisisPage() {
  const params = useSearchParams();
  const leadId = params.get("lead") || "";
  const { leads, account } = useSession();
  const lead = leads?.find((l) => l.id === leadId);
  const [analysis, setAnalysis] = useState<Analysis | null | undefined>(undefined);
  const [d, setD] = useState<Draft>(fromAnalysis(null));
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  const load = (a: Analysis | null) => { setAnalysis(a); setD(fromAnalysis(a, lead?.interest_service || "")); };

  useEffect(() => {
    if (!leadId) return;
    api<{ analysis: Analysis | null }>(`/crm/leads/${leadId}/analysis`)
      .then((r) => { setAnalysis(r.analysis); setD(fromAnalysis(r.analysis)); })
      .catch((err) => { setAnalysis(null); setMsg({ kind: "error", text: (err as Error).message }); });
  }, [leadId]);

  if (!leadId) return <section className="page"><p className="empty">Abre el análisis desde la ficha de un contacto en Conversaciones.</p></section>;
  if (analysis === undefined || !leads) return <p className="loading">Cargando…</p>;

  const set = (part: Partial<Draft>) => setD((prev) => ({ ...prev, ...part }));
  const sent = analysis?.status === "sent";

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy("");
  }

  const generate = () => {
    if (analysis?.id && !window.confirm("¿Generar uno nuevo? Se sustituye el análisis actual.")) return;
    run("generate", async () => {
      const r = await api<{ analysis: Analysis }>(`/crm/leads/${leadId}/analysis/generate`, { method: "POST", body: {} });
      load(r.analysis);
      setMsg({ kind: "ok", text: "Análisis generado. Revísalo antes de enviarlo." });
    });
  };

  const saveRequest = () =>
    api<{ analysis: Analysis }>(`/crm/leads/${leadId}/analysis`, {
      method: "PUT",
      body: {
        title: d.title, recommended_service: d.recommended_service, status: analysis?.status || "draft",
        content_json: {
          headline: d.headline, summary: d.summary, next_step: d.next_step, recommended_service: d.recommended_service,
          findings: fromLines(d.findings), quick_wins: fromLines(d.quick_wins), priorities: fromLines(d.priorities),
        },
      },
    });

  const save = () => run("save", async () => { load((await saveRequest()).analysis); setMsg({ kind: "ok", text: "Análisis guardado." }); });

  const send = () => {
    if (!lead?.email) return setMsg({ kind: "error", text: "Este contacto no tiene email." });
    if (!window.confirm(`¿Enviar el análisis por email a ${lead.email}?`)) return;
    run("send", async () => {
      await saveRequest();
      const r = await api<{ analysis: Analysis }>(`/crm/leads/${leadId}/analysis/send`, { method: "POST", body: {} });
      load(r.analysis);
      setMsg({ kind: "ok", text: "Análisis enviado por email." });
    });
  };

  const field = (key: keyof Draft, label: string, rows = 0, hint = "") => (
    <>
      <label className="f" htmlFor={`a-${key}`}>{label}{hint && <span style={{ fontWeight: 400, color: "var(--muted)" }}> · {hint}</span>}</label>
      {rows ? <textarea id={`a-${key}`} className="i" rows={rows} value={d[key]} onChange={(e) => set({ [key]: e.target.value })} />
        : <input id={`a-${key}`} className="i" value={d[key]} onChange={(e) => set({ [key]: e.target.value })} />}
    </>
  );

  return (
    <section className="page">
      <div className="head">
        <div>
          <p className="sub" style={{ margin: 0 }}><Link href={lead ? `/conversaciones?c=${lead.conversation_id}` : "/conversaciones"}>← {lead ? leadName(lead) : "Volver"}</Link></p>
          <h1>Análisis</h1>
          <p className="sub">{analysis?.id ? <span className={`pill ${sent ? "p-good" : "p-muted"}`}>{sent ? "Enviado" : "Borrador"}</span> : "Todavía no hay análisis"}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" disabled={Boolean(busy)} onClick={generate}>{busy === "generate" ? "Generando… (puede tardar un minuto)" : analysis?.id ? "Generar de nuevo" : "Generar con IA"}</button>
          {analysis?.id && <a className="btn" href={`/crm/analysis/${leadId}/preview?account_id=${encodeURIComponent(account.id)}`} target="_blank" rel="noopener noreferrer">Ver como el cliente</a>}
          {analysis?.id && <button className="btn primary" disabled={Boolean(busy)} onClick={save}>{busy === "save" ? "Guardando…" : "Guardar"}</button>}
        </div>
      </div>
      {msg && <p className={`alert ${msg.kind}`} role="status">{msg.text}</p>}

      {!analysis?.id ? (
        <div className="card block">
          <p className="hint" style={{ margin: 0 }}>
            Tu asistente prepara un análisis comercial con lo que sabe de este contacto{lead?.main_goal ? ` (busca: ${lead.main_goal})` : ""} y, si dejó su web, revisándola. Luego lo revisas aquí y se lo envías.
          </p>
        </div>
      ) : (
        <>
          <div className="card block">
            {field("title", "Título")}
            {field("recommended_service", "Servicio recomendado")}
            {field("headline", "Titular")}
            {field("summary", "Resumen", 4)}
          </div>
          <div className="card block">
            {field("findings", "Qué hemos visto", 5, "uno por línea")}
            {field("quick_wins", "Mejoras rápidas", 4, "una por línea")}
            {field("priorities", "Prioridades", 4, "una por línea")}
            {field("next_step", "Siguiente paso", 2)}
          </div>
          <div className="card block" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <b style={{ marginRight: "auto" }}>{sent && analysis.sent_at ? `Enviado el ${new Date(analysis.sent_at).toLocaleDateString("es-ES")}` : "Cuando esté listo, envíaselo:"}</b>
            <button className="btn primary" disabled={Boolean(busy) || !lead?.email} onClick={send}>{busy === "send" ? "Enviando…" : "Enviar por email"}</button>
          </div>
        </>
      )}
    </section>
  );
}
