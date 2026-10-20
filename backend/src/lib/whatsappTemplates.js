// Plantillas aprobadas de WhatsApp que el CRM puede enviar fuera de la ventana de 24 h.
// Solo admite plantillas cuyo único hueco variable es el cuerpo: sin imagen, documento o vídeo
// en la cabecera, sin variables en la cabecera y sin botones con URL variable.
// Meta admite variables numeradas ({{1}}) o con nombre ({{nombre}}); se soportan las dos.

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

// Nombres de las variables en orden de aparición, sin repetir ("1", "2"… o "nombre", "servicio"…).
function paramNames(text = "") {
  const names = [];
  for (const match of String(text).matchAll(PLACEHOLDER)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  const numbered = names.length > 0 && names.every((n) => /^\d+$/.test(n));
  return numbered ? names.map(Number).sort((a, b) => a - b).map(String) : names;
}

export function describeTemplate(template = {}) {
  const components = Array.isArray(template.components) ? template.components : [];
  const body = components.find((c) => c.type === "BODY")?.text || "";
  const header = components.find((c) => c.type === "HEADER");
  const footer = components.find((c) => c.type === "FOOTER")?.text || "";
  const buttons = components.find((c) => c.type === "BUTTONS")?.buttons || [];

  const blockers = [];
  if (header && header.format && header.format !== "TEXT") blockers.push("cabecera con archivo");
  if (header?.format === "TEXT" && paramNames(header.text).length) blockers.push("variables en la cabecera");
  if (buttons.some((b) => b.type === "URL" && paramNames(b.url).length)) blockers.push("botón con enlace variable");
  if (buttons.some((b) => ["COPY_CODE", "OTP", "FLOW", "CATALOG", "MPM"].includes(b.type))) blockers.push("botón especial");

  const names = paramNames(body);
  const named = String(template.parameter_format || "").toUpperCase() === "NAMED" || names.some((n) => !/^\d+$/.test(n));
  return {
    name: template.name,
    language: template.language || "es",
    category: template.category || "",
    header: header?.format === "TEXT" ? header.text || "" : "",
    body,
    footer,
    params: names.length,
    param_names: names,
    named,
    sendable: Boolean(body) && blockers.length === 0,
    reason: blockers.join(", "),
  };
}

// Texto tal y como lo verá el cliente; es lo que se guarda en la conversación.
export function renderTemplate(template, params = []) {
  const names = template.param_names || [];
  const fill = (text) =>
    String(text || "").replace(PLACEHOLDER, (_, key) => String(params[names.indexOf(key)] ?? "").trim());
  return [fill(template.header), fill(template.body), template.footer].filter((part) => part && part.trim()).join("\n\n");
}

export function validateTemplateParams(template, params = []) {
  if (!Array.isArray(params)) return "Faltan los datos de la plantilla.";
  const names = template.param_names || [];
  for (let i = 0; i < template.params; i += 1) {
    const label = names[i] || String(i + 1);
    const value = String(params[i] ?? "").trim();
    if (!value) return `Rellena el dato {{${label}}} de la plantilla.`;
    // Meta rechaza saltos de línea, tabuladores y más de 4 espacios seguidos en las variables.
    if (/[\n\t]| {5,}/.test(value)) return `El dato {{${label}}} no puede tener saltos de línea ni muchos espacios seguidos.`;
  }
  return "";
}

// Parámetros del cuerpo para la API de Meta: posicionales o con parameter_name.
export function bodyParameters(template, params = []) {
  return (template.param_names || []).map((name, i) => ({
    type: "text",
    ...(template.named ? { parameter_name: name } : {}),
    text: String(params[i] ?? "").trim(),
  }));
}
