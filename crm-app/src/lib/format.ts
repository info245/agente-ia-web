import type { Lead, Message } from "./types";

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

// "10:42" hoy, "Ayer", "lun" esta semana, "12 oct" antes.
export function shortTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  if (sameDay(date, now)) return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "Ayer";
  if (now.getTime() - date.getTime() < 6 * 864e5) return date.toLocaleDateString("es-ES", { weekday: "short" });
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function relative(value?: string | null) {
  if (!value) return "";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  if (minutes < 24 * 60) return `Hace ${Math.round(minutes / 60)} h`;
  return shortTime(value);
}

export function leadName(lead?: Lead | null) {
  return lead?.name?.trim() || lead?.email || lead?.phone || "Visitante sin nombre";
}

export function initials(text = "") {
  return text.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("") || "?";
}

export const CHANNELS: Record<string, { label: string; short: string; css: string }> = {
  whatsapp: { label: "WhatsApp", short: "WA", css: "wa" },
  web: { label: "Chat de la web", short: "W", css: "web" },
  lead_form: { label: "Formulario", short: "F", css: "form" },
};
export const channelOf = (lead?: Lead | null) => CHANNELS[lead?.channel || ""] || CHANNELS.lead_form;

export const isHumanMessage = (m?: Message | null) => m?.metadata?.sender === "human";

// Quién lleva la conversación ahora mismo, tal y como lo ve el cliente.
export type Owner = "waiting" | "me" | "ai";
export function ownerOf(lead: Lead): Owner {
  if (lead.ai_status !== "paused") return "ai";
  return isHumanMessage(lead.last_message) ? "me" : "waiting";
}
export const OWNER_PILL: Record<Owner, { label: string; css: string }> = {
  waiting: { label: "Te espera", css: "p-new" },
  me: { label: "Atiendes tú", css: "p-me" },
  ai: { label: "IA atendiendo", css: "p-ai" },
};

export function startOfWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
