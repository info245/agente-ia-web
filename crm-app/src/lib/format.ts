export const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })
    : "—";

export const CHANNEL_LABELS: Record<string, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  lead_form: "Formulario",
};
