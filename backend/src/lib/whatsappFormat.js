// Formato de WhatsApp: *negrita* con un asterisco, viñetas «•» y URLs a la vista.
// Red de seguridad por si el modelo responde con markdown (**negrita**, [texto](url), # títulos, - listas).
export function toWhatsAppFormat(text = "") {
  return String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "*$1*")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => (label.trim() === url ? url : `${label}: ${url}`))
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Recordatorio al cliente. lead.summary es una nota interna del CRM: nunca debe salir en un mensaje.
export function buildWhatsAppReminder({ name = "", service = "" } = {}) {
  const firstName = String(name || "").trim().split(/\s+/)[0];
  const topic = String(service || "").trim();
  const about = topic && topic !== "unknown" ? topic : "tu caso";
  return [
    `Hola${firstName ? ` ${firstName}` : ""}, te escribo por si quieres retomar lo que dejamos pendiente sobre ${about}.`,
    "Si te va bien, dime y te doy una recomendación concreta.",
  ].join("\n\n");
}
