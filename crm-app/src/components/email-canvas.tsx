"use client";

import { useState } from "react";
import type { Block } from "@/components/email-editor";
import { useSession } from "@/components/app-shell";

const BLOCK_LABEL: Record<Block["type"], string> = { heading: "Título", text: "Texto", button: "Botón", image: "Imagen", divider: "Separador" };
const INSERT_TYPES: Block["type"][] = ["heading", "text", "button", "image", "divider"];
const ACCENT = "#6d41f3";
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
  const [selected, setSelected] = useState<number | null>(null);
  const set = (i: number, part: Partial<Block>) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...part } : b)));
  const insert = (at: number, type: Block["type"]) => {
    const next = [...blocks];
    next.splice(at, 0, type === "button" ? { type, text: "Ver más", url: "" } : { type });
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
      <div className="ec-paper" style={{ maxWidth: mobile ? 380 : 600 }}>
        {header}
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
                {b.type === "heading" && <textarea className="ec-heading" aria-label="Título" ref={autoGrow} rows={1} value={b.text || ""} placeholder="Escribe un título" onChange={(e) => { set(i, { text: e.target.value.replace(/\n/g, " ") }); autoGrow(e.target); }} />}
                {b.type === "text" && (
                  <textarea className="ec-text" aria-label="Texto" ref={autoGrow} rows={2} value={b.text || ""} placeholder="Escribe aquí. Enlaces: [texto](https://…)" onChange={(e) => { set(i, { text: e.target.value }); autoGrow(e.target); }} />
                )}
                {b.type === "button" && (
                  <div>
                    <input className="ec-button" aria-label="Texto del botón" size={Math.max(6, (b.text || "").length + 1)} style={{ background: ACCENT, width: "auto" }} value={b.text || ""} placeholder="Botón" onChange={(e) => set(i, { text: e.target.value })} />
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
