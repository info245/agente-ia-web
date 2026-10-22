"use client";

import Link from "next/link";
import type { Billing } from "@/lib/types";

const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "");

export function billingSummary(b: Billing): { kind: "ok" | "warn" | "error"; text: string } {
  if (b.status === "managed") return { kind: "ok", text: "Tu cuenta la gestiona tu agencia. No tienes que pagar nada aquí." };
  if (b.status === "active") {
    return b.cancel_at_period_end
      ? { kind: "warn", text: `Tu suscripción termina el ${date(b.period_end)}. Después tu asistente se pausará.` }
      : { kind: "ok", text: `Suscripción activa${b.period_end ? `. Próxima renovación: ${date(b.period_end)}` : ""}.` };
  }
  if (b.status === "trial") {
    return b.subscribed
      ? { kind: "ok", text: `Periodo de prueba hasta el ${date(b.trial_ends_at)}. Después se cobrará tu plan.` }
      : { kind: "warn", text: `Te quedan ${b.days_left} días de prueba gratis. Elige un plan para que tu asistente siga atendiendo.` };
  }
  if (b.status === "past_due") {
    return { kind: "error", text: `No hemos podido cobrar tu plan. Actualiza tu tarjeta antes del ${date(b.grace_ends_at)} o tu asistente se pausará.` };
  }
  const why = b.reason === "trial_ended" ? "Tu prueba gratis ha terminado" : b.reason === "unpaid" ? "Hay un pago pendiente" : "Tu suscripción ha terminado";
  return { kind: "error", text: `${why}: tu asistente está en pausa. Tus datos siguen aquí; en cuanto pagues vuelve a funcionar.` };
}

// Aviso en todas las pantallas cuando la prueba acaba pronto, hay un impago o el asistente está en pausa.
export function BillingBanner({ billing }: { billing: Billing | null }) {
  if (!billing) return null;
  const soon = billing.status === "trial" && !billing.subscribed && (billing.days_left ?? 99) <= 3;
  if (!soon && billing.status !== "past_due" && billing.status !== "paused") return null;
  const summary = billingSummary(billing);
  return (
    <div className={`alert ${summary.kind} billing-banner`} role="status">
      <span>{summary.text}</span>
      <Link className="btn small" href="/facturacion">{billing.status === "past_due" ? "Actualizar tarjeta" : "Elegir plan"}</Link>
    </div>
  );
}
