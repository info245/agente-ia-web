// Email marketing: lógica pura (sin base de datos) de segmentos, permiso de envío, maquetación
// de los emails por bloques, enlaces firmados y el motor de pasos de las automatizaciones.
import crypto from "node:crypto";
import { emailBodyToHtml, emailBodyToText } from "./emailLinks.js";

export const BLOCK_TYPES = ["heading", "text", "button", "image", "divider"];
export const STEP_TYPES = ["wait", "email", "whatsapp", "notify_team", "condition", "add_tag", "set_stage"];
export const TRIGGER_TYPES = ["lead_created", "stage", "tag", "no_reply", "quote_sent"];
// Seguimientos de una solicitud (no son publicidad): usan el permiso de contacto, no el de novedades.
export const isFollowUpTrigger = (type) => type === "no_reply" || type === "quote_sent";

const clean = (v, max = 2000) => String(v ?? "").trim().slice(0, max);
const isHttpUrl = (v) => /^https?:\/\/[^\s<>"']+$/i.test(String(v || ""));
const escape = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function normalizeEmail(value) {
  const email = clean(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function normalizeTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map((t) => clean(t, 40).toLowerCase()).filter(Boolean))].slice(0, 30);
}

// {nombre}, {empresa}, {servicio}: con alternativa si el contacto no tiene el dato.
export function personalize(text, lead = {}) {
  const first = clean(lead.name).split(/\s+/)[0] || "";
  const vars = { nombre: first, empresa: clean(lead.company_name), servicio: clean(lead.interest_service) };
  return String(text || "")
    .replace(/\{(nombre|empresa|servicio)\|([^}]*)\}/g, (_, k, fallback) => vars[k] || fallback)
    .replace(/\{(nombre|empresa|servicio)\}/g, (_, k) => vars[k] || "")
    .replace(/[ \t]+([,.!?])/g, "$1");
}

export function sanitizeSegment(segment = {}) {
  const list = (v) => (Array.isArray(v) ? v.map((x) => clean(x, 80)).filter(Boolean).slice(0, 50) : []);
  return {
    stages: list(segment.stages),
    services: list(segment.services),
    sources: list(segment.sources),
    tags: normalizeTags(segment.tags),
    exclude_tags: normalizeTags(segment.exclude_tags),
    created_from: clean(segment.created_from, 30),
    created_to: clean(segment.created_to, 30),
  };
}

export function leadSource(lead = {}) {
  return clean(lead.source_platform || lead.conversations?.channel || lead.channel || "", 80);
}

export function matchesSegment(lead = {}, segment = {}) {
  const s = sanitizeSegment(segment);
  const tags = normalizeTags(lead.tags);
  if (s.stages.length && !s.stages.includes(clean(lead.crm_status))) return false;
  if (s.services.length && !s.services.includes(clean(lead.interest_service))) return false;
  if (s.sources.length && !s.sources.includes(leadSource(lead))) return false;
  if (s.tags.length && !s.tags.some((t) => tags.includes(t))) return false;
  if (s.exclude_tags.some((t) => tags.includes(t))) return false;
  const created = Date.parse(lead.created_at || "");
  if (s.created_from && !(created >= Date.parse(s.created_from))) return false;
  if (s.created_to && !(created <= Date.parse(s.created_to) + 86_399_999)) return false;
  return true;
}

// LSSI art. 21: comunicaciones comerciales solo con consentimiento previo o a clientes actuales.
// Manda el permiso de novedades (marketing_consent). Si el formulario no lo preguntó (null,
// contactos antiguos), vale el consentimiento general como hasta ahora.
export function eligibility(lead = {}, suppressed = new Set()) {
  const email = normalizeEmail(lead.email);
  if (!email) return { ok: false, reason: "sin_email" };
  if (suppressed.has(email)) return { ok: false, reason: "baja" };
  if (lead.marketing_consent === false || lead.consent === false) return { ok: false, reason: "sin_consentimiento" };
  if (lead.marketing_consent === true) return { ok: true, email };
  const legacyConsent = lead.marketing_consent == null && lead.consent === true;
  if (!legacyConsent && clean(lead.crm_status) !== "ganado") return { ok: false, reason: "sin_consentimiento" };
  return { ok: true, email };
}

// Mensajes de WhatsApp que no son respuesta: no si rechazó WhatsApp o las comunicaciones comerciales.
export function canWhatsApp(lead = {}) {
  return lead.consent !== false && lead.whatsapp_consent !== false && lead.marketing_consent !== false;
}

export function sanitizeBlocks(blocks = []) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .slice(0, 60)
    .map((b) => {
      const type = BLOCK_TYPES.includes(b?.type) ? b.type : null;
      if (!type) return null;
      if (type === "divider") return { type };
      if (type === "button") return { type, text: clean(b.text, 80), url: isHttpUrl(b.url) ? clean(b.url) : "" };
      if (type === "image") return { type, url: isHttpUrl(b.url) ? clean(b.url) : "", alt: clean(b.alt, 200), link: isHttpUrl(b.link) ? clean(b.link) : "" };
      return { type, text: clean(b.text, type === "heading" ? 200 : 10000) };
    })
    .filter(Boolean);
}

// HTML del email. mapUrl permite cambiar cada enlace por su versión con seguimiento de clics.
export function renderEmail({ blocks = [], subject = "", preheader = "", lead = {}, brand = {}, unsubscribeUrl = "", pixelUrl = "", mapUrl = (u) => u } = {}) {
  const color = /^#[0-9a-f]{6}$/i.test(brand.color || "") ? brand.color : "#6d41f3";
  const body = sanitizeBlocks(blocks)
    .map((b) => {
      if (b.type === "heading") return `<h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;color:#1d1b26;">${escape(personalize(b.text, lead))}</h1>`;
      if (b.type === "text") return `<div style="font-size:16px;line-height:1.6;margin:0 0 16px;color:#33313d;">${emailBodyToHtml(personalize(b.text, lead), { mapUrl })}</div>`;
      if (b.type === "button")
        return b.url
          ? `<p style="margin:8px 0 24px;"><a href="${escape(mapUrl(b.url))}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">${escape(personalize(b.text || "Ver más", lead))}</a></p>`
          : "";
      if (b.type === "image") {
        if (!b.url) return "";
        const img = `<img src="${escape(b.url)}" alt="${escape(b.alt)}" style="max-width:100%;height:auto;border:0;display:block;margin:0 0 16px;border-radius:8px;" />`;
        return b.link ? `<a href="${escape(mapUrl(b.link))}">${img}</a>` : img;
      }
      return `<hr style="border:0;border-top:1px solid #e6e3ee;margin:24px 0;" />`;
    })
    .join("\n");
  const footer = [
    brand.name ? escape(brand.name) : "",
    brand.address ? escape(brand.address) : "",
    unsubscribeUrl ? `<a href="${escape(unsubscribeUrl)}" style="color:#6b6878;">Darme de baja</a>` : "",
  ].filter(Boolean).join(" · ");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f4f8;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(personalize(preheader, lead))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f8;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;"><tr><td style="padding:32px 28px;">
${body}
</td></tr></table>
<p style="font-size:12px;color:#6b6878;margin:16px 0 0;">${footer}</p>
</td></tr></table>
${pixelUrl ? `<img src="${escape(pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;" />` : ""}
</body></html>`;
}

export function renderEmailText({ blocks = [], lead = {}, unsubscribeUrl = "" } = {}) {
  const parts = sanitizeBlocks(blocks).map((b) => {
    if (b.type === "divider") return "—";
    if (b.type === "button") return b.url ? `${personalize(b.text || "Ver más", lead)}: ${b.url}` : "";
    if (b.type === "image") return b.link ? b.link : "";
    return emailBodyToText(personalize(b.text, lead));
  });
  if (unsubscribeUrl) parts.push(`Darme de baja: ${unsubscribeUrl}`);
  return parts.filter(Boolean).join("\n\n");
}

// Enlaces de clic firmados: sin la firma no se redirige (evita usar el dominio como redirector abierto).
export function signLink(messageId, url, secret) {
  return crypto.createHmac("sha256", String(secret)).update(`${messageId}|${url}`).digest("base64url").slice(0, 22);
}

export function verifyLink(messageId, url, signature, secret) {
  const expected = signLink(messageId, url, secret);
  const a = Buffer.from(String(signature || ""));
  const b = Buffer.from(expected);
  return isHttpUrl(url) && a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Automatización = mapa de nodos. Cada nodo tiene id y apunta al siguiente (next); una condición
// apunta a dos caminos (yes / no). El primer nodo de la lista es el inicio. null = fin.
// Las automatizaciones antiguas (lista sin ids) se convierten: s0 → s1 → …; condición sin «no» = fin.
function sanitizeStep(s) {
  if (!STEP_TYPES.includes(s?.type)) return null;
  if (s.type === "wait") return { type: "wait", amount: Math.max(1, Math.min(365, Number(s.amount) || 1)), unit: ["hours", "days"].includes(s.unit) ? s.unit : "days" };
  if (s.type === "email") return { type: "email", subject: clean(s.subject, 200), preheader: clean(s.preheader, 200), blocks: sanitizeBlocks(s.blocks), template_id: clean(s.template_id, 60) };
  if (s.type === "condition") return { type: "condition", check: ["opened_last", "clicked_last", "has_tag", "stage"].includes(s.check) ? s.check : "opened_last", value: clean(s.value, 80) };
  if (s.type === "whatsapp") return { type: "whatsapp", template_name: clean(s.template_name, 120), language: clean(s.language, 12) || "es", params: (Array.isArray(s.params) ? s.params : []).slice(0, 3).map((p) => clean(p, 200)), text: clean(s.text, 1000) };
  if (s.type === "notify_team") return { type: "notify_team", message: clean(s.message, 500) };
  if (s.type === "add_tag") return { type: "add_tag", tag: normalizeTags([s.tag])[0] || "" };
  return { type: "set_stage", stage: clean(s.stage, 80) };
}

export function sanitizeSteps(input = []) {
  const raw = (Array.isArray(input) ? input : []).slice(0, 60);
  const legacy = raw.length > 0 && raw.every((s) => !s?.id);
  const ids = raw.map((s, i) => (legacy ? `s${i}` : clean(s?.id, 40).replace(/[^\w-]/g, "") || `n${i}`));
  const known = new Set(ids);
  const ref = (v) => (v && known.has(String(v)) ? String(v) : null);
  return raw
    .map((s, i) => {
      const step = sanitizeStep(s);
      if (!step) return null;
      const id = ids[i];
      if (legacy) {
        const after = ids[i + 1] || null;
        return step.type === "condition" ? { id, ...step, yes: after, no: null } : { id, ...step, next: after };
      }
      return step.type === "condition" ? { id, ...step, yes: ref(s.yes), no: ref(s.no) } : { id, ...step, next: ref(s.next) };
    })
    .filter(Boolean);
}

export function sanitizeAutomation(input = {}) {
  const t = input.trigger || {};
  const trigger = {
    type: TRIGGER_TYPES.includes(t.type) ? t.type : "lead_created",
    stage: clean(t.stage, 80),
    tag: normalizeTags([t.tag])[0] || "",
    hours: Math.max(1, Math.min(720, Number(t.hours) || 24)),
    contact_chat_leads: t.contact_chat_leads === true,
    segment: sanitizeSegment(t.segment || {}),
  };
  return { name: clean(input.name, 120), trigger, steps: sanitizeSteps(input.steps) };
}

// ¿Este contacto entra en la automatización? Solo cuenta lo ocurrido después de activarla.
export function triggerMatches(trigger = {}, lead = {}, { activatedAt } = {}) {
  const since = Date.parse(activatedAt || "");
  if (!Number.isFinite(since)) return false;
  if (!matchesSegment(lead, trigger.segment || {})) return false;
  if (trigger.type === "lead_created") return Date.parse(lead.created_at || "") >= since;
  const touched = Date.parse(lead.updated_at || lead.created_at || "") >= since;
  if (trigger.type === "stage") return touched && Boolean(trigger.stage) && clean(lead.crm_status) === trigger.stage;
  if (trigger.type === "tag") return touched && Boolean(trigger.tag) && normalizeTags(lead.tags).includes(trigger.tag);
  return false;
}

const UNIT_MS = { hours: 3_600_000, days: 86_400_000 };

// Nodo en el que está una ejecución (las antiguas guardaban la posición: step_index → s<n>).
export function currentStepId(run = {}, steps = []) {
  if (run.step_id) return run.step_id;
  if (run.step_index && steps.some((s) => s.id === `s${run.step_index}`)) return `s${run.step_index}`;
  return steps[0]?.id || null;
}

// Qué hacer con el nodo actual de una ejecución. ctx: { now, lead, lastEmail: {opened_at, clicked_at} }.
// Devuelve step_id (el siguiente nodo, null = fin) y next_at.
export function nextAction(run = {}, steps = [], ctx = {}) {
  const now = ctx.now ?? Date.now();
  const id = currentStepId(run, steps);
  const step = steps.find((s) => s.id === id);
  if (!step) return { kind: "done" };
  const go = (to, at = now) => ({ step_id: to || null, next_at: new Date(at).toISOString() });
  if (step.type === "wait") return { kind: "wait", step, ...go(step.next, now + step.amount * UNIT_MS[step.unit]) };
  if (step.type === "condition") {
    const lead = ctx.lead || {};
    const passed =
      step.check === "opened_last" ? Boolean(ctx.lastEmail?.opened_at)
      : step.check === "clicked_last" ? Boolean(ctx.lastEmail?.clicked_at)
      : step.check === "has_tag" ? normalizeTags(lead.tags).includes(normalizeTags([step.value])[0])
      : clean(lead.crm_status) === step.value;
    return { kind: "branch", step, passed, ...go(passed ? step.yes : step.no) };
  }
  return { kind: step.type, step, ...go(step.next) };
}

// Seguimientos: ¿toca empezar? «no_reply» cuenta desde nuestro último mensaje sin respuesta;
// «quote_sent», desde que se envió la propuesta. Solo lo ocurrido después de activar la automatización.
export function followUpReady(trigger = {}, { baseAt, activatedAt, now = Date.now() } = {}) {
  const base = Date.parse(baseAt || "");
  const since = Date.parse(activatedAt || "");
  if (!Number.isFinite(base) || !Number.isFinite(since) || base < since) return false;
  return now - base >= (Number(trigger.hours) || 24) * 3_600_000;
}
