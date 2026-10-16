import { extractFirstUrlFromText } from "./lightSiteAnalyzer.js";

const WEBSITE_KEY_RE = /web|site|url|dominio|domain|pagina|página/i;
const EMAIL_RE = /\S+@\S+/g;

function urlFrom(value) {
  const text = Array.isArray(value) ? value.join(" ") : typeof value === "string" ? value : "";
  // Sin emails: "ana@gmail.com" no es la web del cliente.
  return extractFirstUrlFromText(text.replace(EMAIL_RE, " "));
}

// Busca la web del lead: campos de web, custom_fields, datos del formulario, notas, resumen y mensajes.
export function findLeadWebsite(lead = {}, { messages = [], formData = {} } = {}) {
  const custom = { ...(formData || {}), ...(lead?.custom_fields || {}) };
  const entries = Object.entries(custom);
  const sources = [
    lead?.website,
    lead?.website_url,
    lead?.web,
    ...entries.filter(([key]) => WEBSITE_KEY_RE.test(key)).map(([, value]) => value),
    lead?.internal_notes,
    lead?.summary,
    ...entries.map(([, value]) => value),
    ...(messages || []).map((item) => item?.content),
  ];
  for (const source of sources) {
    const url = urlFrom(source);
    if (url) return url;
  }
  return null;
}

// Propuesta por WhatsApp: texto libre dentro de las 24h; fuera, solo plantilla aprobada por Meta.
export function planQuoteWhatsAppSend({ windowOpen, whatsappConfig = {}, body = "", vars = {} } = {}) {
  if (windowOpen) return { type: "text", body };
  const name = String(whatsappConfig?.quote_template_name || "").trim();
  if (!name) return { type: "blocked", reason: "whatsapp-template-required-outside-24h" };
  return {
    type: "template",
    name,
    language: String(whatsappConfig?.quote_template_language || "").trim() || "es",
    // Orden fijo de variables en la plantilla: {{1}} nombre, {{2}} enlace a la propuesta.
    params: [vars.nombre || "hola", vars.link_presupuesto || ""],
  };
}

// Pasos de WhatsApp activos sin plantilla: fuera de 24h se saltan siempre.
export function findWhatsAppStepsWithoutTemplate(appConfig = {}) {
  const missing = [];
  for (const [flowKey, flow] of Object.entries(appConfig?.automation_flows || {})) {
    if (flow?.enabled === false) continue;
    (Array.isArray(flow?.steps) ? flow.steps : []).forEach((step, index) => {
      if (step?.active === false || String(step?.channel || "").toLowerCase() !== "whatsapp") return;
      if (!String(step?.whatsapp_template_name || "").trim()) {
        missing.push({ flow_key: flowKey, step_index: index, template_key: step?.template_key || "" });
      }
    });
  }
  return missing;
}

export function describeStepsWithoutTemplate(missing = []) {
  if (!missing.length) return "";
  const list = missing.map((item) => `${item.flow_key} paso ${item.step_index + 1}`).join(", ");
  return `Sin plantilla de WhatsApp (${list}): fuera de las 24h estos pasos no se envían. Configura whatsapp_template_name con una plantilla aprobada por Meta.`;
}

// Avisos para la respuesta de la API de configuración.
export function buildWhatsAppTemplateWarnings(appConfig = {}) {
  return [
    describeStepsWithoutTemplate(findWhatsAppStepsWithoutTemplate(appConfig)),
    String(appConfig?.integrations?.whatsapp?.quote_template_name || "").trim()
      ? ""
      : "Sin plantilla de WhatsApp para propuestas (integrations.whatsapp.quote_template_name): fuera de las 24h la propuesta solo se puede enviar por email.",
  ].filter(Boolean);
}

// Aviso interno cuando el cliente acepta o rechaza la propuesta.
export function buildQuoteResponseNotice({ action, lead = {}, quote = {}, crmUrl = "" } = {}) {
  const accepted = action === "accepted";
  const who = lead?.name || lead?.company_name || lead?.email || lead?.phone || "Un lead";
  const subject = `${accepted ? "Propuesta aceptada" : "Propuesta rechazada"}: ${who}`;
  const nextAction = accepted
    ? "Contactar para arrancar el proyecto"
    : "Preguntar el motivo y valorar una alternativa";
  const lines = [
    `${who} ha ${accepted ? "aceptado" : "rechazado"} la propuesta${quote?.title ? ` "${quote.title}"` : ""}.`,
    lead?.email ? `Email: ${lead.email}` : null,
    lead?.phone ? `Teléfono: ${lead.phone}` : null,
    lead?.interest_service ? `Servicio: ${lead.interest_service}` : null,
    `Estado CRM: ${accepted ? "ganado" : "perdido"}`,
    `Siguiente paso: ${nextAction}.`,
    crmUrl ? `Ver propuesta: ${crmUrl}` : null,
  ].filter(Boolean);
  return { subject, nextAction, text: lines.join("\n") };
}
