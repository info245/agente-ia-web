// Plantillas aprobadas de WhatsApp que el CRM puede enviar fuera de la ventana de 24 h.
// Solo admite plantillas cuyo único hueco variable es el cuerpo ({{1}}, {{2}}…): sin imagen,
// documento o vídeo en la cabecera, sin variables en la cabecera y sin botones con URL variable.

const PLACEHOLDER = /\{\{\s*(\d+)\s*\}\}/g;

function countParams(text = "") {
  const numbers = [...String(text).matchAll(PLACEHOLDER)].map((m) => Number(m[1]));
  return numbers.length ? Math.max(...numbers) : 0;
}

export function describeTemplate(template = {}) {
  const components = Array.isArray(template.components) ? template.components : [];
  const body = components.find((c) => c.type === "BODY")?.text || "";
  const header = components.find((c) => c.type === "HEADER");
  const footer = components.find((c) => c.type === "FOOTER")?.text || "";
  const buttons = components.find((c) => c.type === "BUTTONS")?.buttons || [];

  const blockers = [];
  if (header && header.format && header.format !== "TEXT") blockers.push("cabecera con archivo");
  if (header?.format === "TEXT" && countParams(header.text)) blockers.push("variables en la cabecera");
  if (buttons.some((b) => b.type === "URL" && countParams(b.url))) blockers.push("botón con enlace variable");
  if (buttons.some((b) => ["COPY_CODE", "OTP", "FLOW", "CATALOG", "MPM"].includes(b.type))) blockers.push("botón especial");

  return {
    name: template.name,
    language: template.language || "es",
    category: template.category || "",
    header: header?.format === "TEXT" ? header.text || "" : "",
    body,
    footer,
    params: countParams(body),
    sendable: Boolean(body) && blockers.length === 0,
    reason: blockers.join(", "),
  };
}

// Texto tal y como lo verá el cliente; es lo que se guarda en la conversación.
export function renderTemplate(template, params = []) {
  const fill = (text) => String(text || "").replace(PLACEHOLDER, (_, n) => String(params[Number(n) - 1] ?? "").trim());
  return [fill(template.header), fill(template.body), template.footer].filter((part) => part && part.trim()).join("\n\n");
}

export function validateTemplateParams(template, params = []) {
  if (!Array.isArray(params)) return "Faltan los datos de la plantilla.";
  for (let i = 0; i < template.params; i += 1) {
    const value = String(params[i] ?? "").trim();
    if (!value) return `Rellena el dato {{${i + 1}}} de la plantilla.`;
    // Meta rechaza saltos de línea, tabuladores y más de 4 espacios seguidos en las variables.
    if (/[\n\t]| {5,}/.test(value)) return `El dato {{${i + 1}}} no puede tener saltos de línea ni muchos espacios seguidos.`;
  }
  return "";
}
