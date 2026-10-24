"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Block = { type: "heading" | "text" | "button" | "image" | "divider"; text?: string; url?: string; alt?: string; link?: string };
export type Segment = { stages?: string[]; services?: string[]; sources?: string[]; tags?: string[]; exclude_tags?: string[]; created_from?: string; created_to?: string };
export type EmailOptions = { tags: string[]; services: string[]; sources: string[] };

const BLOCK_LABEL: Record<Block["type"], string> = { heading: "Título", text: "Texto", button: "Botón", image: "Imagen", divider: "Separador" };
const SOURCE_LABEL: Record<string, string> = { whatsapp: "WhatsApp", web: "Chat web", lead_form: "Formulario", meta_ads: "Meta Ads", meta: "Meta", import: "Importados" };

// Pausa los cambios rápidos (teclear) antes de pedir algo al servidor.
export function useDebounced<T>(value: T, ms = 500) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function BlockEditor({ blocks, onChange }: { blocks: Block[]; onChange: (b: Block[]) => void }) {
  const set = (i: number, part: Partial<Block>) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...part } : b)));
  const move = (i: number, d: number) => {
    const next = [...blocks];
    const [b] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + d)), 0, b);
    onChange(next);
  };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {blocks.map((b, i) => (
        <div key={i} className="faq-row">
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <b style={{ fontSize: 13, marginRight: "auto" }}>{BLOCK_LABEL[b.type]}</b>
            <button className="btn ghost small" aria-label="Subir bloque" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="btn ghost small" aria-label="Bajar bloque" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button className="btn ghost small" onClick={() => onChange(blocks.filter((_, j) => j !== i))}>Quitar</button>
          </div>
          {b.type === "heading" && <input className="i" value={b.text || ""} placeholder="Hola {nombre|}" onChange={(e) => set(i, { text: e.target.value })} />}
          {b.type === "text" && <textarea className="i" rows={5} value={b.text || ""} placeholder="Texto. Enlaces: [texto](https://…)" onChange={(e) => set(i, { text: e.target.value })} />}
          {b.type === "button" && (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)", gap: 6 }}>
              <input className="i" value={b.text || ""} placeholder="Texto del botón" onChange={(e) => set(i, { text: e.target.value })} />
              <input className="i" value={b.url || ""} placeholder="https://…" onChange={(e) => set(i, { url: e.target.value })} />
            </div>
          )}
          {b.type === "image" && (
            <div style={{ display: "grid", gap: 6 }}>
              <input className="i" value={b.url || ""} placeholder="Dirección de la imagen (https://…)" onChange={(e) => set(i, { url: e.target.value })} />
              <input className="i" value={b.alt || ""} placeholder="Descripción (por si no se ve la imagen)" onChange={(e) => set(i, { alt: e.target.value })} />
              <input className="i" value={b.link || ""} placeholder="Enlace al pulsar la imagen (opcional)" onChange={(e) => set(i, { link: e.target.value })} />
            </div>
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(Object.keys(BLOCK_LABEL) as Block["type"][]).map((type) => (
          <button key={type} className="btn small" onClick={() => onChange([...blocks, { type }])}>+ {BLOCK_LABEL[type]}</button>
        ))}
      </div>
      <p className="hint" style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
        Personaliza con <b>{"{nombre}"}</b>, <b>{"{empresa}"}</b> o <b>{"{servicio}"}</b>. Con alternativa si falta el dato: <b>{"{nombre|amigo}"}</b>.
      </p>
    </div>
  );
}

function Chips({ label, values, selected, onChange, labelOf = (v: string) => v }: { label: string; values: string[]; selected: string[]; onChange: (v: string[]) => void; labelOf?: (v: string) => string }) {
  if (!values.length) return null;
  return (
    <>
      <label className="f">{label}</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {values.map((v) => (
          <button key={v} className="chip" aria-pressed={selected.includes(v)} onClick={() => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])}>
            {labelOf(v)}
          </button>
        ))}
      </div>
    </>
  );
}

export function SegmentEditor({ segment, onChange, stages, options }: { segment: Segment; onChange: (s: Segment) => void; stages: { key: string; label?: string }[]; options: EmailOptions | null }) {
  const [audience, setAudience] = useState<{ count: number; in_segment: number; excluded: Record<string, number> } | null>(null);
  const debounced = useDebounced(segment);
  useEffect(() => {
    api<{ count: number; in_segment: number; excluded: Record<string, number> }>("/crm/email/audience", { method: "POST", body: { segment: debounced } })
      .then(setAudience)
      .catch(() => setAudience(null));
  }, [debounced]);
  const set = (part: Partial<Segment>) => onChange({ ...segment, ...part });
  const excluded = audience?.excluded || {};
  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>Sin filtros, se envía a todos los contactos que pueden recibirlo.</p>
      <Chips label="Etapa" values={stages.map((s) => s.key)} selected={segment.stages || []} onChange={(v) => set({ stages: v })} labelOf={(k) => stages.find((s) => s.key === k)?.label || k} />
      <Chips label="Servicio" values={options?.services || []} selected={segment.services || []} onChange={(v) => set({ services: v })} />
      <Chips label="Origen" values={options?.sources || []} selected={segment.sources || []} onChange={(v) => set({ sources: v })} labelOf={(v) => SOURCE_LABEL[v] || v} />
      <Chips label="Con alguna de estas etiquetas" values={options?.tags || []} selected={segment.tags || []} onChange={(v) => set({ tags: v })} />
      <Chips label="Excluir etiquetas" values={options?.tags || []} selected={segment.exclude_tags || []} onChange={(v) => set({ exclude_tags: v })} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
        <div>
          <label className="f" htmlFor="seg-from">Entraron desde</label>
          <input id="seg-from" className="i" type="date" value={segment.created_from || ""} onChange={(e) => set({ created_from: e.target.value })} />
        </div>
        <div>
          <label className="f" htmlFor="seg-to">Hasta</label>
          <input id="seg-to" className="i" type="date" value={segment.created_to || ""} onChange={(e) => set({ created_to: e.target.value })} />
        </div>
      </div>
      <p className="alert ok" style={{ margin: "14px 0 0" }} role="status">
        {audience ? (
          <>
            <b>{audience.count}</b> contacto{audience.count === 1 ? "" : "s"} recibirá{audience.count === 1 ? "" : "n"} este email
            {audience.in_segment > audience.count && (
              <> · se excluyen {[excluded.sin_consentimiento && `${excluded.sin_consentimiento} sin consentimiento`, excluded.baja && `${excluded.baja} dados de baja`, excluded.sin_email && `${excluded.sin_email} sin email`].filter(Boolean).join(", ")}</>
            )}
          </>
        ) : "Calculando destinatarios…"}
      </p>
    </div>
  );
}

export function EmailPreview({ subject, preheader, blocks }: { subject: string; preheader: string; blocks: Block[] }) {
  const [html, setHtml] = useState("");
  const debounced = useDebounced({ subject, preheader, blocks }, 600);
  useEffect(() => {
    api<{ html: string }>("/crm/email/preview", { method: "POST", body: debounced }).then((r) => setHtml(r.html)).catch(() => setHtml(""));
  }, [debounced]);
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
        <b>{subject || "Sin asunto"}</b>
        <div style={{ color: "var(--muted)" }}>{preheader || "Texto de vista previa"}</div>
      </div>
      <iframe title="Vista previa del email" sandbox="" srcDoc={html} style={{ width: "100%", height: 560, border: 0, background: "#f5f4f8" }} />
    </div>
  );
}

// CSV con comas o punto y coma, comillas y cabecera (email, nombre, teléfono, empresa, etiquetas).
export function parseCsv(text: string) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = (rows.shift() || []).map((h) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const idx = { email: col("email", "correo", "e-mail"), name: col("nombre", "name"), phone: col("telefono", "phone", "movil"), company: col("empresa", "company"), tags: col("etiqueta", "tag") };
  return rows
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => ({
      email: idx.email >= 0 ? r[idx.email]?.trim() : "",
      name: idx.name >= 0 ? r[idx.name]?.trim() : "",
      phone: idx.phone >= 0 ? r[idx.phone]?.trim() : "",
      company: idx.company >= 0 ? r[idx.company]?.trim() : "",
      tags: idx.tags >= 0 ? r[idx.tags]?.split(/[|,]/).map((t) => t.trim()).filter(Boolean) : [],
    }));
}
