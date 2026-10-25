"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Check = { key: string; label: string; status: "ok" | "warn" | "error" | "off"; detail: string; action?: { label: string; href: string } };
type Health = { checks: Check[]; errors: number; warnings: number; checked_at: string };

const STATUS: Record<Check["status"], { cls: string; label: string }> = {
  ok: { cls: "p-good", label: "Funciona" },
  warn: { cls: "p-warn", label: "Revisar" },
  error: { cls: "p-bad", label: "No funciona" },
  off: { cls: "p-muted", label: "Sin activar" },
};

function useHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const load = () => api<Health>("/crm/channels/health").then(setHealth).catch((e) => setError((e as Error).message));
  useEffect(() => {
    load();
  }, []);
  return { health, error, reload: load };
}

function ActionLink({ action }: { action: NonNullable<Check["action"]> }) {
  return /^(https?:|mailto:)/.test(action.href)
    ? <a className="btn ghost small" href={action.href} target="_blank" rel="noopener noreferrer">{action.label}</a>
    : <Link className="btn ghost small" href={action.href}>{action.label}</Link>;
}

// Configuración → Canales: de un vistazo, qué funciona y qué hay que arreglar.
export function ChannelHealthCard() {
  const { health, error, reload } = useHealth();
  const summary = !health ? "" : health.errors ? `${health.errors} canal${health.errors === 1 ? "" : "es"} no funciona${health.errors === 1 ? "" : "n"}` : health.warnings ? `${health.warnings} cosa${health.warnings === 1 ? "" : "s"} que revisar` : "Todo funciona";
  return (
    <div className="card block health">
      <div className="panel-head">
        <h2>Estado de los canales {health && <span className={`pill ${health.errors ? "p-bad" : health.warnings ? "p-warn" : "p-good"}`}>{summary}</span>}</h2>
        <button className="btn ghost small" onClick={reload}>Comprobar ahora</button>
      </div>
      {error && <p className="alert error">{error}</p>}
      {!health && !error && <p className="loading">Comprobando…</p>}
      {health && (
        <ul className="health-list">
          {health.checks.map((c) => (
            <li key={c.key} className={`health-${c.status}`}>
              <span className="health-dot" aria-hidden />
              <div>
                <b>{c.label}</b> <span className={`pill ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
                <p>{c.detail}</p>
              </div>
              {c.action && c.status !== "ok" && <ActionLink action={c.action} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Inicio: solo aparece si algún canal no funciona (para no ensuciar la pantalla).
export function ChannelHealthBanner() {
  const { health } = useHealth();
  const broken = health?.checks.filter((c) => c.status === "error") || [];
  if (!broken.length) return null;
  return (
    <div className="alert error health-banner" role="alert">
      <b>{broken.map((c) => c.label).join(" y ")} no funciona{broken.length === 1 ? "" : "n"}.</b> {broken[0].detail}{" "}
      <Link href="/canales">Ver estado de los canales</Link>
    </div>
  );
}
