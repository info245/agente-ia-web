"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { QuoteBlock } from "@/lib/types";

const NEW_BLOCK: Record<QuoteBlock["type"], [string, () => QuoteBlock]> = {
  text: ["Texto", () => ({ type: "text", title: "", text: "" })],
  table: ["Tabla", () => ({ type: "table", title: "", columns: ["Columna 1", "Columna 2"], rows: [["", ""]] })],
  packs: ["Comparativa de packs", () => ({ type: "packs", title: "Elige tu plan", packs: [{ name: "Básico", price: "", features: "" }, { name: "Pro", price: "", features: "", highlight: true }, { name: "Premium", price: "", features: "" }] })],
  steps: ["Fases / calendario", () => ({ type: "steps", title: "Cómo trabajamos", steps: [{ name: "", text: "" }] })],
  image: ["Imagen", () => ({ type: "image", title: "", url: "", caption: "" })],
  testimonial: ["Testimonio", () => ({ type: "testimonial", title: "", text: "", author: "" })],
};

// Bloques extra de propuestas y plantillas; se pintan entre «Alcance» y «Partidas».
export function QuoteBlocksEditor({ blocks, onChange }: { blocks: QuoteBlock[]; onChange: (blocks: QuoteBlock[]) => void }) {
  const [uploading, setUploading] = useState(-1);
  const setBlock = (i: number, b: QuoteBlock) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const move = (i: number, d: number) => {
    const next = [...blocks];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  async function upload(i: number, b: Extract<QuoteBlock, { type: "image" }>, file?: File) {
    if (!file) return;
    setUploading(i);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await api<{ asset: { public_url: string } }>("/crm/assets/logo", { method: "POST", body: { file_name: file.name, content_type: file.type, data_url: dataUrl, brand_name: "propuesta" } });
      setBlock(i, { ...b, url: res.asset.public_url });
    } catch (err) {
      window.alert((err as Error).message);
    }
    setUploading(-1);
  }

  return (
    <div>
      {blocks.map((b, i) => (
        <div key={i} className="card" style={{ padding: 14, marginBottom: 10, background: "var(--surface-2)" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
            <b style={{ marginRight: "auto" }}>{NEW_BLOCK[b.type][0]}</b>
            <button className="btn ghost small" disabled={i === 0} aria-label="Subir bloque" onClick={() => move(i, -1)}>↑</button>
            <button className="btn ghost small" disabled={i === blocks.length - 1} aria-label="Bajar bloque" onClick={() => move(i, 1)}>↓</button>
            <button className="btn ghost small" onClick={() => onChange(blocks.filter((_, j) => j !== i))}>Quitar</button>
          </div>
          <input className="i" aria-label="Título del bloque" placeholder="Título (opcional)" value={b.title} onChange={(e) => setBlock(i, { ...b, title: e.target.value })} />

          {(b.type === "text" || b.type === "testimonial") && (
            <textarea className="i" rows={b.type === "text" ? 4 : 2} style={{ marginTop: 8 }} aria-label="Texto" placeholder={b.type === "text" ? "Texto" : "Lo que dijo el cliente"} value={b.text} onChange={(e) => setBlock(i, { ...b, text: e.target.value })} />
          )}
          {b.type === "testimonial" && (
            <input className="i" style={{ marginTop: 8 }} aria-label="Autor" placeholder="Quién lo dice (empresa o nombre)" value={b.author} onChange={(e) => setBlock(i, { ...b, author: e.target.value })} />
          )}

          {b.type === "table" && (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table className="table">
                <thead>
                  <tr>
                    {b.columns.map((c, ci) => (
                      <th key={ci}><input className="i" aria-label={`Columna ${ci + 1}`} value={c} onChange={(e) => setBlock(i, { ...b, columns: b.columns.map((x, k) => (k === ci ? e.target.value : x)) })} /></th>
                    ))}
                    <th>{b.columns.length < 6 && <button className="btn ghost small" onClick={() => setBlock(i, { ...b, columns: [...b.columns, ""], rows: b.rows.map((r) => [...r, ""]) })}>+ Col</button>}</th>
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, ri) => (
                    <tr key={ri} style={{ cursor: "default" }}>
                      {b.columns.map((_, ci) => (
                        <td key={ci}><input className="i" aria-label={`Fila ${ri + 1}, columna ${ci + 1}`} value={r[ci] || ""} onChange={(e) => setBlock(i, { ...b, rows: b.rows.map((x, k) => (k === ri ? b.columns.map((__, m) => (m === ci ? e.target.value : x[m] || "")) : x)) })} /></td>
                      ))}
                      <td><button className="btn ghost small" onClick={() => setBlock(i, { ...b, rows: b.rows.filter((_, k) => k !== ri) })}>Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn small" onClick={() => setBlock(i, { ...b, rows: [...b.rows, b.columns.map(() => "")] })}>+ Fila</button>
                {b.columns.length > 1 && <button className="btn ghost small" onClick={() => setBlock(i, { ...b, columns: b.columns.slice(0, -1), rows: b.rows.map((r) => r.slice(0, b.columns.length - 1)) })}>Quitar última columna</button>}
              </div>
            </div>
          )}

          {b.type === "packs" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 8 }}>
              {b.packs.map((p, pi) => {
                const setPack = (part: Partial<typeof p>) => setBlock(i, { ...b, packs: b.packs.map((x, k) => (k === pi ? { ...x, ...part } : x)) });
                return (
                  <div key={pi} style={{ display: "grid", gap: 6 }}>
                    <input className="i" aria-label="Nombre del pack" placeholder="Nombre" value={p.name} onChange={(e) => setPack({ name: e.target.value })} />
                    <input className="i" aria-label="Precio del pack" placeholder="490 €/mes" value={p.price} onChange={(e) => setPack({ price: e.target.value })} />
                    <textarea className="i" rows={4} aria-label="Qué incluye el pack" placeholder={"Una línea por punto"} value={p.features} onChange={(e) => setPack({ features: e.target.value })} />
                    <label style={{ fontSize: 13 }}><input type="checkbox" checked={Boolean(p.highlight)} onChange={(e) => setBlock(i, { ...b, packs: b.packs.map((x, k) => ({ ...x, highlight: k === pi ? e.target.checked : false })) })} /> Recomendado</label>
                    <button className="btn ghost small" onClick={() => setBlock(i, { ...b, packs: b.packs.filter((_, k) => k !== pi) })}>Quitar pack</button>
                  </div>
                );
              })}
              {b.packs.length < 4 && <button className="btn small" style={{ alignSelf: "start" }} onClick={() => setBlock(i, { ...b, packs: [...b.packs, { name: "", price: "", features: "" }] })}>+ Pack</button>}
            </div>
          )}

          {b.type === "steps" && (
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              {b.steps.map((s, si) => (
                <div key={si} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr) auto", gap: 6 }}>
                  <input className="i" aria-label={`Fase ${si + 1}`} placeholder={`Fase ${si + 1}`} value={s.name} onChange={(e) => setBlock(i, { ...b, steps: b.steps.map((x, k) => (k === si ? { ...x, name: e.target.value } : x)) })} />
                  <input className="i" aria-label={`Detalle de la fase ${si + 1}`} placeholder="Cuándo o qué incluye" value={s.text} onChange={(e) => setBlock(i, { ...b, steps: b.steps.map((x, k) => (k === si ? { ...x, text: e.target.value } : x)) })} />
                  <button className="btn ghost small" onClick={() => setBlock(i, { ...b, steps: b.steps.filter((_, k) => k !== si) })}>Quitar</button>
                </div>
              ))}
              <div><button className="btn small" onClick={() => setBlock(i, { ...b, steps: [...b.steps, { name: "", text: "" }] })}>+ Fase</button></div>
            </div>
          )}

          {b.type === "image" && (
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              <input className="i" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading === i} onChange={(e) => upload(i, b, e.target.files?.[0])} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.url && <img src={b.url} alt="" style={{ maxWidth: 240, borderRadius: 8 }} />}
              <input className="i" aria-label="Pie de foto" placeholder="Pie de foto (opcional)" value={b.caption} onChange={(e) => setBlock(i, { ...b, caption: e.target.value })} />
            </div>
          )}
        </div>
      ))}
      <select className="i" style={{ maxWidth: 280 }} aria-label="Añadir bloque" value="" onChange={(e) => e.target.value && onChange([...blocks, NEW_BLOCK[e.target.value as QuoteBlock["type"]][1]()])}>
        <option value="">+ Añadir bloque…</option>
        {Object.entries(NEW_BLOCK).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
      </select>
    </div>
  );
}
