"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { billingSummary } from "@/components/billing-banner";
import type { Billing, BillingPlan } from "@/lib/types";

type BillingData = { billing: Billing; plans: BillingPlan[]; stripe_configured: boolean; can_manage: boolean };

export default function FacturacionPage() {
  const params = useSearchParams();
  const [data, setData] = useState<BillingData | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<BillingData>("/crm/billing").then(setData).catch((err) => setError(err.message));
  }, []);

  async function go(path: string, body: object, key: string) {
    setBusy(key);
    setError("");
    try {
      const r = await api<{ url: string }>(path, { method: "POST", body });
      window.location.href = r.url;
    } catch (err) {
      setError((err as Error).message);
      setBusy("");
    }
  }

  if (!data) return error ? <section className="page"><p className="alert error">{error}</p></section> : <p className="loading">Cargando…</p>;
  const { billing, plans } = data;
  const summary = billingSummary(billing);
  const subscribed = billing.has_customer && (billing.status === "active" || billing.status === "past_due" || billing.subscribed);

  return (
    <section className="page">
      <div className="head">
        <div>
          <h1>Plan y pago</h1>
          <p className="sub">Tu plan, tus facturas y tu tarjeta</p>
        </div>
      </div>
      {params.get("pago") === "ok" && <p className="alert ok" role="status" style={{ marginBottom: 14 }}>¡Gracias! Estamos confirmando el pago; en unos segundos verás tu plan activo.</p>}
      <p className={`alert ${summary.kind}`} role="status" style={{ marginBottom: 18 }}>{summary.text}</p>
      {error && <p className="alert error" role="alert" style={{ marginBottom: 14 }}>{error}</p>}

      {billing.status !== "managed" && (
        <>
          {!data.can_manage && <p className="hint">Solo el administrador de la cuenta puede contratar o cambiar el plan.</p>}
          {data.can_manage && billing.has_customer && (
            <div className="card block">
              <h2>Gestionar pago y facturas</h2>
              <p className="hint">Cambia de tarjeta o de plan, descarga facturas o cancela la suscripción.</p>
              <button className="btn primary" disabled={busy !== ""} onClick={() => go("/crm/billing/portal", {}, "portal")}>{busy === "portal" ? "Abriendo…" : "Gestionar pago y facturas"}</button>
            </div>
          )}
          {data.can_manage && !subscribed && (
            !data.stripe_configured || !plans.length ? (
              <p className="alert warn">El pago online todavía no está activado. <a href="mailto:info@t-mediaglobal.com?subject=Contratar%20plan">Escríbenos</a> para contratar.</p>
            ) : (
              <div className="plans">
                {plans.map((plan) => (
                  <div className="card plan" key={plan.key}>
                    <h2>{plan.name}</h2>
                    {plan.price_label && <div className="price">{plan.price_label}</div>}
                    {plan.description && <p className="hint" style={{ margin: 0 }}>{plan.description}</p>}
                    <button className="btn primary" style={{ marginTop: "auto" }} disabled={busy !== ""} onClick={() => go("/crm/billing/checkout", { plan: plan.key }, plan.key)}>
                      {busy === plan.key ? "Abriendo el pago…" : "Elegir este plan"}
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}
