"use client";

import { useState } from "react";
import type { Block } from "@/components/email-editor";
import { useSession } from "@/components/app-shell";
import { WIDGET_SRC } from "@/lib/api";

const BLOCK_LABEL: Record<Block["type"], string> = {
  heading: "Título", text: "Texto", button: "Botón", image: "Imagen", divider: "Separador",
  table: "Tabla", columns: "Columnas", quote: "Testimonio", callout: "Recuadro destacado",
};
const INSERT_TYPES: Block["type"][] = ["heading", "text", "button", "image", "columns", "table", "callout", "quote", "divider"];
const ACCENT = "#6d41f3";
const NEW_BLOCK: Partial<Record<Block["type"], Block>> = {
  button: { type: "button", text: "Ver más", url: "" },
  table: { type: "table", columns: ["Concepto", "Detalle"], rows: [["", ""]] },
  columns: { type: "columns", items: [{ title: "", text: "" }, { title: "", text: "" }] },
  quote: { type: "quote", text: "", author: "" },
  callout: { type: "callout", text: "" },
};
// Fondo suave del color de marca (igual que en el email enviado).
const soft = (color: string, alpha = "14") => `${color}${alpha}`;
const validUrl = (u?: string) => /^https?:\/\/[^\s]+\.[^\s]+/.test(u || "");

function autoGrow(el: HTMLTextAreaElement | null) {
  if (el) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }
}

function InsertBar({ onInsert }: { onInsert: (type: Block["type"]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ec-insert" data-open={open || undefined}>
      <button type="button" className="ec-plus" aria-label="Añadir bloque aquí" onClick={() => setOpen(!open)}>+</button>
      {open && (
        <div className="ec-menu">
          {INSERT_TYPES.map((t) => (
            <button type="button" key={t} className="btn small" onClick={() => { onInsert(t); setOpen(false); }}>{BLOCK_LABEL[t]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// El email se edita sobre su propia maqueta (600 px, tarjeta blanca), igual que llegará.
export function EmailCanvas({ blocks, onChange, header, mobile = false }: { blocks: Block[]; onChange: (b: Block[]) => void; header?: React.ReactNode; mobile?: boolean }) {
  const { config, account } = useSession();
  const brand = config?.brand?.name || account.name;
  const color = /^#[0-9a-f]{6}$/i.test(config?.brand?.primary_color || "") ? config!.brand!.primary_color! : ACCENT;
  const logo = config?.brand?.logo_url || "";
  const logoSrc = logo.startsWith("/") ? new URL(logo, WIDGET_SRC).href : logo;
  const serif = config?.brand?.font === "classic" || config?.brand?.font === "elegant";
  const [selected, setSelected] = useState<number | null>(null);
  const set = (i: number, part: Partial<Block>) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...part } : b)));
  const insert = (at: number, type: Block["type"]) => {
    const next = [...blocks];
    next.splice(at, 0, NEW_BLOCK[type] ? structuredClone(NEW_BLOCK[type]!) : { type });
    onChange(next);
    setSelected(at);
  };
  const move = (i: number, d: number) => {
    const next = [...blocks];
    const [b] = next.splice(i, 1);
    next.splice(i + d, 0, b);
    onChange(next);
    setSelected(i + d);
  };
  return (
    <div className="ec-wrap">
      <div className="ec-paper" style={{ maxWidth: mobile ? 380 : 600, fontFamily: config?.brand?.font === "classic" ? "Georgia, serif" : undefined }}>
        {header}
        {/* Franja de marca, como en el email enviado (Configuración → Marca). */}
        <div style={{ background: color, margin: "0 -26px 18px", padding: logoSrc ? "16px 26px" : 2 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoSrc && <img src={logoSrc} alt={brand} style={{ height: 36, width: "auto", maxWidth: 200, display: "block" }} />}
        </div>
        <InsertBar onInsert={(t) => insert(0, t)} />
        {blocks.map((b, i) => {
          const active = selected === i;
          return (
            <div key={i}>
              <div className={`ec-block${active ? " active" : ""}`} onClick={() => setSelected(i)}>
                {active && (
                  <div className="ec-tools" onClick={(e) => e.stopPropagation()}>
                    <span>{BLOCK_LABEL[b.type]}</span>
                    <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button type="button" aria-label="Bajar" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button type="button" aria-label="Duplicar" onClick={() => { const next = [...blocks]; next.splice(i + 1, 0, { ...b }); onChange(next); }}>⧉</button>
                    <button type="button" aria-label="Quitar" onClick={() => { onChange(blocks.filter((_, j) => j !== i)); setSelected(null); }}>✕</button>
                  </div>
                )}
                {b.type === "heading" && <textarea className="ec-heading" style={serif ? { fontFamily: "Georgia, serif" } : undefined} aria-label="Título" ref={autoGrow} rows={1} value={b.text || ""} placeholder="Escribe un título" onChange={(e) => { set(i, { text: e.target.value.replace(/\n/g, " ") }); autoGrow(e.target); }} />}
                {b.type === "text" && (
                  <textarea className="ec-text" aria-label="Texto" ref={autoGrow} rows={2} value={b.text || ""} placeholder="Escribe aquí. Enlaces: [texto](https://…)" onChange={(e) => { set(i, { text: e.target.value }); autoGrow(e.target); }} />
                )}
                {b.type === "button" && (
                  <div>
                    <input className="ec-button" aria-label="Texto del botón" size={Math.max(6, (b.text || "").length + 1)} style={{ background: color, width: "auto" }} value={b.text || ""} placeholder="Botón" onChange={(e) => set(i, { text: e.target.value })} />
                    {(active || !validUrl(b.url)) && <input className="ec-field" aria-label="Enlace del botón" value={b.url || ""} placeholder="Enlace del botón: https://…" onChange={(e) => set(i, { url: e.target.value })} />}
                    {!validUrl(b.url) && <small className="ec-warn">Falta el enlace: sin él, el botón no se enviará.</small>}
                  </div>
                )}
                {b.type === "image" && (
                  <div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {b.url ? <img src={b.url} alt={b.alt || ""} style={{ maxWidth: "100%", borderRadius: 8, display: "block" }} /> : <div className="ec-img-empty">Pulsa para poner una imagen</div>}
                    {active && (
                      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                        <input className="ec-field" aria-label="Dirección de la imagen" value={b.url || ""} placeholder="Dirección de la imagen: https://…" onChange={(e) => set(i, { url: e.target.value })} />
                        <input className="ec-field" aria-label="Descripción de la imagen" value={b.alt || ""} placeholder="Descripción" onChange={(e) => set(i, { alt: e.target.value })} />
                        <input className="ec-field" aria-label="Enlace de la imagen" value={b.link || ""} placeholder="Enlace al pulsar (opcional)" onChange={(e) => set(i, { link: e.target.value })} />
                      </div>
                    )}
                  </div>
                )}
                {b.type === "divider" && <hr style={{ border: 0, borderTop: "1px solid #e6e3ee", margin: "8px 0" }} />}
                {b.type === "callout" && (
                  <div style={{ background: soft(color), border: `1px solid ${soft(color, "4d")}`, borderRadius: 12, padding: "12px 16px" }}>
                    <textarea className="ec-text" aria-label="Texto destacado" ref={autoGrow} rows={2} value={b.text || ""} placeholder="Oferta, aviso o dato importante" onChange={(e) => { set(i, { text: e.target.value }); autoGrow(e.target); }} />
                  </div>
                )}
                {b.type === "quote" && (
                  <div style={{ borderLeft: `4px solid ${color}`, background: soft(color), borderRadius: "0 10px 10px 0", padding: "12px 16px" }}>
                    <textarea className="ec-text" style={{ fontStyle: "italic" }} aria-label="Testimonio" ref={autoGrow} rows={2} value={b.text || ""} placeholder="Lo que dijo el cliente" onChange={(e) => { set(i, { text: e.target.value }); autoGrow(e.target); }} />
                    <input className="ec-field" style={{ fontWeight: 700, color }} aria-label="Autor" value={b.author || ""} placeholder="Quién lo dice" onChange={(e) => set(i, { author: e.target.value })} />
                  </div>
                )}
                {b.type === "columns" && (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : `repeat(${(b.items || []).length || 1}, minmax(0, 1fr))`, gap: 12 }}>
                      {(b.items || []).map((it, k) => {
                        const setItem = (part: Partial<typeof it>) => set(i, { items: (b.items || []).map((x, m) => (m === k ? { ...x, ...part } : x)) });
                        return (
                          <div key={k}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {it.image && <img src={it.image} alt="" style={{ width: "100%", borderRadius: 8, display: "block", marginBottom: 6 }} />}
                            <input className="ec-heading" style={{ fontSize: 17 }} aria-label={`Título de la columna ${k + 1}`} value={it.title} placeholder="Título" onChange={(e) => setItem({ title: e.target.value })} />
                            <textarea className="ec-text" style={{ fontSize: 15 }} aria-label={`Texto de la columna ${k + 1}`} ref={autoGrow} rows={2} value={it.text} placeholder="Texto" onChange={(e) => { setItem({ text: e.target.value }); autoGrow(e.target); }} />
                            {active && <input className="ec-field" aria-label={`Imagen de la columna ${k + 1}`} value={it.image || ""} placeholder="Imagen (opcional): https://…" onChange={(e) => setItem({ image: e.target.value })} />}
                          </div>
                        );
                      })}
                    </div>
                    {active && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        {(b.items || []).length < 3 && <button type="button" className="btn small" onClick={() => set(i, { items: [...(b.items || []), { title: "", text: "" }] })}>+ Columna</button>}
                        {(b.items || []).length > 1 && <button type="button" className="btn ghost small" onClick={() => set(i, { items: (b.items || []).slice(0, -1) })}>Quitar columna</button>}
                      </div>
                    )}
                  </div>
                )}
                {b.type === "table" && (
                  <div>
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, border: "1px solid #ebe9f1", borderRadius: 10, overflow: "hidden" }}>
                      <thead>
                        <tr>
                          {(b.columns || []).map((c, k) => (
                            <th key={k} style={{ background: color, padding: 0 }}>
                              <input className="ec-field" style={{ background: "transparent", border: 0, color: "#fff", fontWeight: 700, margin: 0 }} aria-label={`Columna ${k + 1}`} value={c} onChange={(e) => set(i, { columns: (b.columns || []).map((x, m) => (m === k ? e.target.value : x)) })} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(b.rows || []).map((r, ri) => (
                          <tr key={ri}>
                            {(b.columns || []).map((_, k) => (
                              <td key={k} style={{ borderTop: "1px solid #ebe9f1", padding: 0, background: ri % 2 ? soft(color, "0d") : "#fff" }}>
                                <input className="ec-field" style={{ background: "transparent", border: 0, margin: 0, fontWeight: k ? 400 : 700, color: k ? undefined : color }} aria-label={`Fila ${ri + 1}, columna ${k + 1}`} value={r[k] || ""} onChange={(e) => set(i, { rows: (b.rows || []).map((x, m) => (m === ri ? (b.columns || []).map((__, n) => (n === k ? e.target.value : x[n] || "")) : x)) })} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {active && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        <button type="button" className="btn small" onClick={() => set(i, { rows: [...(b.rows || []), (b.columns || []).map(() => "")] })}>+ Fila</button>
                        {(b.rows || []).length > 1 && <button type="button" className="btn ghost small" onClick={() => set(i, { rows: (b.rows || []).slice(0, -1) })}>Quitar fila</button>}
                        {(b.columns || []).length < 4 && <button type="button" className="btn small" onClick={() => set(i, { columns: [...(b.columns || []), ""], rows: (b.rows || []).map((r) => [...r, ""]) })}>+ Columna</button>}
                        {(b.columns || []).length > 1 && <button type="button" className="btn ghost small" onClick={() => set(i, { columns: (b.columns || []).slice(0, -1), rows: (b.rows || []).map((r) => r.slice(0, -1)) })}>Quitar columna</button>}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <InsertBar onInsert={(t) => insert(i + 1, t)} />
            </div>
          );
        })}
        <p className="ec-footer">{brand || "Tu negocio"} · <u>Darme de baja</u></p>
      </div>
      <p style={{ textAlign: "center", fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
        Pulsa un bloque para editarlo · <b>{"{nombre}"}</b> <b>{"{empresa}"}</b> <b>{"{servicio}"}</b> personalizan · <b>{"{nombre|amigo}"}</b> si falta el dato
      </p>
    </div>
  );
}

// Miniatura de una plantilla con la misma maqueta, a escala.
export function TemplateThumb({ blocks }: { blocks: Block[] }) {
  return (
    <div className="ec-thumb" aria-hidden>
      <div className="ec-thumb-inner">
        {blocks.slice(0, 6).map((b, i) => (
          <div key={i}>
            {b.type === "heading" && <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 10 }}>{b.text || "Título"}</div>}
            {b.type === "text" && <div style={{ fontSize: 15, color: "#55525f", marginBottom: 10, whiteSpace: "pre-wrap" }}>{(b.text || "Texto…").slice(0, 160)}</div>}
            {b.type === "button" && <div style={{ display: "inline-block", background: ACCENT, color: "#fff", padding: "10px 18px", borderRadius: 8, marginBottom: 10, fontWeight: 600 }}>{b.text || "Botón"}</div>}
            {b.type === "image" && <div style={{ height: 90, background: "#ece9f6", borderRadius: 8, marginBottom: 10 }} />}
            {b.type === "divider" && <hr style={{ border: 0, borderTop: "1px solid #ddd", margin: "10px 0" }} />}
            {b.type === "callout" && <div style={{ background: "#efeafe", borderRadius: 10, padding: 14, marginBottom: 10, fontSize: 15 }}>{(b.text || "Destacado").slice(0, 120)}</div>}
            {b.type === "quote" && <div style={{ borderLeft: `4px solid ${ACCENT}`, padding: "8px 14px", marginBottom: 10, fontStyle: "italic" }}>“{(b.text || "Testimonio").slice(0, 120)}”</div>}
            {b.type === "columns" && <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>{(b.items || []).map((it, k) => <div key={k} style={{ flex: 1, background: "#f5f4f8", borderRadius: 8, padding: 10 }}><b>{it.title || "Columna"}</b></div>)}</div>}
            {b.type === "table" && <div style={{ height: 70, borderRadius: 8, marginBottom: 10, border: "1px solid #ddd", borderTop: `22px solid ${ACCENT}` }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export type PickableTemplate = { id: string; name: string; description?: string; subject: string; preheader: string; blocks: Block[]; builtin?: boolean };

export function TemplatePicker({ templates, onPick, onClose }: { templates: PickableTemplate[]; onPick: (t: PickableTemplate) => void; onClose?: () => void }) {
  return (
    <div className="card block">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Elige una plantilla</h2>
        {onClose && <button className="btn ghost small" onClick={onClose}>Cerrar</button>}
      </div>
      <p className="hint">Después la cambias a tu gusto directamente sobre el email.</p>
      <div className="ec-gallery">
        {templates.map((t) => (
          <button key={t.id} type="button" className="ec-card" onClick={() => onPick(t)}>
            <TemplateThumb blocks={t.blocks} />
            <b>{t.name}</b>
            <span>{t.builtin ? t.description : "Guardada por ti"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
