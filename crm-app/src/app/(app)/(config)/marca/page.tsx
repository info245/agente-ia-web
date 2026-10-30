"use client";

import { useState } from "react";
import { ConfigPending, useSession } from "@/components/app-shell";
import { SettingsTabs } from "@/components/settings-tabs";
import { api } from "@/lib/api";
import type { AppConfig } from "@/lib/types";

type Brand = NonNullable<AppConfig["brand"]>;

const FONTS: [string, string, string][] = [
  ["modern", "Moderna", "Inter, Arial, sans-serif"],
  ["classic", "Clásica", "Lora, Georgia, serif"],
  ["elegant", "Elegante", "'Playfair Display', Georgia, serif"],
];

function initial(brand: Brand = {}): Brand {
  return {
    name: brand.name || "",
    logo_url: brand.logo_url || "",
    primary_color: brand.primary_color || "#6d41f3",
    accent_color: brand.accent_color || "#8d58ff",
    font: brand.font || "modern",
    legal_name: brand.legal_name || "",
    tax_id: brand.tax_id || "",
    address: brand.address || "",
  };
}

export default function MarcaPage() {
  const { config, configError, reloadConfig } = useSession();
  const [draft, setDraft] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  if (!config) return <ConfigPending error={configError} />;
  const b = draft || initial(config.brand);
  const set = (part: Partial<Brand>) => setDraft({ ...b, ...part });
  const fontFamily = FONTS.find(([k]) => k === b.font)?.[2];

  async function uploadLogo(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setMsg({ kind: "error", text: "El logo no puede pasar de 2 MB." });
    setBusy(true);
    setMsg(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await api<{ asset: { public_url: string } }>("/crm/assets/logo", {
        method: "POST",
        body: { file_name: file.name, content_type: file.type, data_url: dataUrl, brand_name: b.name },
      });
      set({ logo_url: r.asset.public_url });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/crm/brand", { method: "POST", body: { brand: b } });
      await reloadConfig();
      setDraft(null);
      setMsg({ kind: "ok", text: "Guardado. Las propuestas y análisis que abras a partir de ahora ya salen con tu marca." });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Configuración</h1>
          <p className="sub">Marca: el logo, los colores y los datos que salen en tus propuestas y análisis.</p>
        </div>
      </div>
      <SettingsTabs />

      <div className="card block">
        <h2>Identidad</h2>
        <div className="conv-fields">
          <label className="f">Nombre comercial
            <input className="i" value={b.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="f">Logo (PNG, JPG o SVG, fondo transparente mejor)
            <input className="i" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" disabled={busy} onChange={(e) => uploadLogo(e.target.files?.[0])} />
          </label>
          <label className="f">Color principal
            <input className="i" type="color" value={b.primary_color} onChange={(e) => set({ primary_color: e.target.value })} />
          </label>
          <label className="f">Color secundario
            <input className="i" type="color" value={b.accent_color} onChange={(e) => set({ accent_color: e.target.value })} />
          </label>
          <label className="f">Tipografía
            <select className="i" value={b.font} onChange={(e) => set({ font: e.target.value })}>
              {FONTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
        </div>

        <label className="f" style={{ marginTop: 14 }}>Vista previa</label>
        <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--line)", maxWidth: 560 }}>
          <div style={{ background: b.primary_color, color: "#fff", padding: "22px 24px", fontFamily }}>
            {b.logo_url && <img src={b.logo_url} alt="" style={{ maxHeight: 44, maxWidth: 180, display: "block", marginBottom: 12 }} />}
            <div style={{ fontSize: 12, opacity: 0.85, textTransform: "uppercase", letterSpacing: 1 }}>{b.name || "Tu negocio"}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>Propuesta comercial</div>
          </div>
          <div style={{ padding: "16px 24px", background: "#fff", color: "#1d1d22", fontFamily }}>
            <span style={{ display: "inline-block", padding: "6px 12px", borderRadius: 999, background: `color-mix(in srgb, ${b.accent_color} 12%, #fff)`, color: b.accent_color, fontWeight: 700 }}>Precio mensual</span>
          </div>
        </div>
      </div>

      <div className="card block">
        <h2>Datos de empresa</h2>
        <p className="hint">Salen en el pie de cada propuesta. Déjalos vacíos si no quieres mostrarlos.</p>
        <div className="conv-fields">
          <label className="f">Razón social
            <input className="i" value={b.legal_name} onChange={(e) => set({ legal_name: e.target.value })} />
          </label>
          <label className="f">CIF / NIF
            <input className="i" value={b.tax_id} onChange={(e) => set({ tax_id: e.target.value })} />
          </label>
          <label className="f">Dirección
            <input className="i" value={b.address} onChange={(e) => set({ address: e.target.value })} />
          </label>
        </div>
      </div>

      {msg && <p className={`alert ${msg.kind}`} role="status">{msg.text}</p>}
      <button className="btn primary" disabled={busy || !draft} onClick={save}>{busy ? "Guardando…" : "Guardar"}</button>
    </section>
  );
}
