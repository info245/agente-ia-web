import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { extractLeadDataFromText } from "./lib/leadExtractor.js";
import {
  createConversation,
  saveMessage,
  saveConversationEvent,
  upsertLeadFromConversation,
  getConversationMessages,
  getLeadByConversationId,
  getLatestConversationEvent,
  findLatestWebLeadByContact,
  listCrmLeads,
  updateLeadCrmFields,
  getLatestQuoteByLeadId,
  upsertLatestQuoteForLead,
  markLatestQuoteAsSent,
} from "./lib/chatStore.js";

import { mergeLeadData } from "./lib/leadMerge.js";

import { openai } from "./lib/openaiClient.js";
import { getAgentSystemPrompt } from "./lib/agentPrompt.js";

import { retrieveWebsiteContext } from "./lib/kbRetriever.js";
import { getServiceFacts } from "./lib/websiteFacts.js";
import {
  sendLeadEmail,
  sendClientConfirmationEmail,
  sendQuoteEmailToLead,
} from "./lib/emailService.js";

import {
  buildMemoryPatch,
  buildLeadMemoryContext,
} from "./lib/memoryUtils.js";
import { renderQuotePreviewHtml } from "./lib/quoteTemplate.js";
import { renderHtmlToPdfBuffer } from "./lib/htmlPdf.js";
import {
  extractFirstUrlFromText,
  runLightSiteAnalysis,
} from "./lib/lightSiteAnalyzer.js";

const app = express();
const crmPublicDir = fileURLToPath(new URL("../public-crm", import.meta.url));

app.use(cors());
app.options("*", cors());
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use("/crm", express.static(crmPublicDir));
app.get("/crm", (_req, res) => {
  res.sendFile(path.join(crmPublicDir, "index.html"));
});

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "memory-v14-channel-funnel-router";

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_PUBLIC_NUMBER = process.env.WHATSAPP_PUBLIC_NUMBER || "";
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v25.0";
const WHATSAPP_APP_SECRET =
  process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || "";
const HANDOFF_SECRET =
  process.env.CHAT_HANDOFF_SECRET ||
  WHATSAPP_APP_SECRET ||
  WHATSAPP_VERIFY_TOKEN ||
  "tmedia-handoff-dev";

const lastLeadEmailSent = new Map();
const clientConfirmationSent = new Map();
const processedWhatsAppMessages = new Map();
const PROCESSED_MESSAGE_TTL_MS = 1000 * 60 * 60;

function cleanupProcessedMessages() {
  const now = Date.now();
  for (const [id, ts] of processedWhatsAppMessages.entries()) {
    if (now - ts > PROCESSED_MESSAGE_TTL_MS) {
      processedWhatsAppMessages.delete(id);
    }
  }
}

function markWhatsAppMessageProcessed(messageId) {
  if (!messageId) return;
  cleanupProcessedMessages();
  processedWhatsAppMessages.set(messageId, Date.now());
}

function hasProcessedWhatsAppMessage(messageId) {
  if (!messageId) return false;
  cleanupProcessedMessages();
  return processedWhatsAppMessages.has(messageId);
}

function norm(v) {
  return String(v || "").trim();
}

function getLogoDataUrl() {
  try {
    const logoPath = path.join(crmPublicDir, "assets", "tmedia-global-logo.png");
    const ext = path.extname(logoPath).toLowerCase();
    const mime = ext === ".png" ? "image/png" : "image/jpeg";
    const base64 = fs.readFileSync(logoPath).toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch (_error) {
    return "";
  }
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isUserQuestion(text) {
  const t = String(text || "").trim().toLowerCase();

  if (!t) return false;
  if (t.includes("?")) return true;

  return /^(que|qué|como|cómo|cuanto|cuánto|cual|cuál|precio|precios|presupuesto|coste|costes|tarifa|tarifas)\b/i.test(
    t
  );
}

function isLikelyServiceIntent(text) {
  const t = normalizeText(text);

  return (
    t.includes("google ads") ||
    t.includes("seo") ||
    t.includes("meta ads") ||
    t.includes("redes sociales") ||
    t.includes("publicidad") ||
    t.includes("diseno web") ||
    t.includes("diseño web") ||
    t.includes("consultoria") ||
    t.includes("consultoría") ||
    t.includes("web") ||
    t.includes("campanas") ||
    t.includes("campañas")
  );
}

function isLikelyQuestionOrIntent(text) {
  const t = normalizeText(text);

  return (
    isUserQuestion(text) ||
    t.includes("quiero") ||
    t.includes("necesito") ||
    t.includes("busco") ||
    t.includes("me interesa") ||
    t.includes("cuanto cuesta") ||
    t.includes("cuánto cuesta") ||
    t.includes("precio") ||
    t.includes("presupuesto")
  );
}

function isNegativeResponse(text) {
  const t = normalizeText(text);

  return (
    t === "no" ||
    t === "nop" ||
    t === "nope" ||
    t === "no tengo" ||
    t === "no tengo empresa" ||
    t === "no empresa" ||
    t === "no tengo negocio"
  );
}

function isUnknownResponse(text) {
  const t = normalizeText(text);

  return (
    t === "no lo se" ||
    t === "no lo sé" ||
    t === "ni idea" ||
    t === "depende" ||
    t === "aun no lo se" ||
    t === "aún no lo sé"
  );
}

function isLikelyValidName(value) {
  const raw = String(value || "").trim();
  const t = normalizeText(raw);

  if (!raw) return false;
  if (raw.length < 2 || raw.length > 40) return false;
  if (/\d/.test(raw)) return false;
  if (/[?@]/.test(raw)) return false;

  const blockedPhrases = [
    "quiero",
    "necesito",
    "google ads",
    "seo",
    "diseno web",
    "diseño web",
    "consultoria",
    "consultoría",
    "publicidad",
    "redes sociales",
    "meta ads",
    "declaras a hacienda",
    "precio",
    "presupuesto",
    "cuanto cuesta",
    "cuánto cuesta",
    "tienda online",
    "ecommerce",
    "soy autonomo",
    "soy autónomo",
  ];

  if (blockedPhrases.some((p) => t.includes(p))) return false;
  if (isLikelyServiceIntent(raw)) return false;

  const words = raw
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  if (!words.length || words.length > 4) return false;

  const allowedWord = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü'-]+$/;
  if (!words.every((w) => allowedWord.test(w))) return false;

  return true;
}

function getSafeLeadName(lead) {
  const candidate = lead?.name;
  return isLikelyValidName(candidate) ? String(candidate).trim() : null;
}

function hasName(lead) {
  return !!getSafeLeadName(lead);
}

function hasService(lead) {
  return norm(lead?.interest_service).length >= 2;
}

function hasBudget(lead) {
  return norm(lead?.budget_range).length >= 2;
}

function hasContact(lead) {
  return norm(lead?.email).length >= 3 || norm(lead?.phone).length >= 6;
}

function hasBusinessType(lead) {
  return norm(lead?.business_type).length >= 2;
}

function hasBusinessActivity(lead) {
  return norm(lead?.business_activity).length >= 4;
}

function hasMainGoal(lead) {
  return norm(lead?.main_goal).length >= 4;
}

function hasUrgency(lead) {
  return norm(lead?.urgency).length >= 2;
}

function isCompletedLeadData(lead) {
  return (
    hasName(lead) &&
    hasBusinessType(lead) &&
    hasBusinessActivity(lead) &&
    hasService(lead) &&
    hasContact(lead)
  );
}

function isClosingReply(reply) {
  const t = String(reply || "").toLowerCase();

  if (!t) return false;

  return (
    /te contactar[ée]/i.test(t) ||
    /gracias por confiar/i.test(t) ||
    /quedo atento/i.test(t) ||
    /te escribir[ée]/i.test(t) ||
    /nos pondremos en contacto/i.test(t) ||
    /hemos recibido/i.test(t) ||
    /en breve recibirás/i.test(t) ||
    /te enviaremos/i.test(t) ||
    /recibirás la propuesta/i.test(t)
  );
}

function shouldMarkChatCompleted(lead, reply) {
  return isCompletedLeadData(lead) && isClosingReply(reply);
}

function normalizeBudget(text) {
  const t = String(text || "").trim();

  const m1 = t.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(€|eur)\b/i);
  if (m1) {
    const n = Number(String(m1[1]).replace(/[.,](?=\d{3}\b)/g, ""));
    if (Number.isFinite(n) && n >= 10) return `${n} €`;
  }

  const m2 = t.match(/\b(\d{2,6})\b/);
  if (m2) {
    const n = Number(m2[1]);
    if (Number.isFinite(n) && n >= 10) return `${n} €`;
  }

  return null;
}

function detectService(text) {
  const t = normalizeText(text);

  if (t.includes("google ads") || t === "ads") return "Google Ads";
  if (t.includes("seo")) return "SEO";
  if (
    t.includes("meta ads") ||
    t.includes("facebook ads") ||
    t.includes("instagram ads") ||
    t.includes("redes sociales")
  ) {
    return "Publicidad en Redes Sociales";
  }
  if (
    t.includes("diseno web") ||
    t.includes("diseño web") ||
    t.includes("pagina web") ||
    t.includes("página web") ||
    t === "web"
  ) {
    return "Diseño Web";
  }
  if (t.includes("consultoria") || t.includes("consultoría")) {
    return "Consultoría Digital";
  }

  return null;
}

function detectBusinessType(text) {
  const raw = norm(text);
  const t = normalizeText(text);

  if (!raw) return null;
  if (isNegativeResponse(text)) return "proyecto personal";
  if (t.includes("autonom")) return "autonomo";
  if (t.includes("empresa")) return "empresa";
  if (t.includes("negocio")) return "negocio";
  if (t.includes("proyecto")) return "proyecto";
  if (t.includes("tienda online") || t.includes("ecommerce")) return "ecommerce";
  if (t.includes("clinica") || t.includes("clínica")) return "clinica";
  if (t.includes("agencia")) return "agencia";
  if (t.includes("despacho")) return "despacho";

  return null;
}

function detectBusinessActivity(text) {
  const raw = norm(text);
  const t = normalizeText(text);

  if (!raw) return null;
  if (isUserQuestion(text)) return null;
  if (isLikelyValidName(text)) return null;
  if (detectService(text)) return null;
  if (detectEmail(text) || detectPhone(text)) return null;

  const triggers = [
    "tengo una",
    "tenemos una",
    "soy ",
    "somos ",
    "me dedico a",
    "nos dedicamos a",
    "vendo",
    "vendemos",
    "ofrezco",
    "ofrecemos",
    "trabajo en",
    "trabajamos en",
  ];

  if (triggers.some((x) => t.includes(x))) return raw;
  if (t.includes("tienda online")) return raw;
  if (t.includes("ecommerce")) return raw;
  if (t.includes("clinica") || t.includes("clínica")) return raw;
  if (t.includes("abogado") || t.includes("bufete")) return raw;
  if (t.includes("dental") || t.includes("dentista")) return raw;
  if (
    /\b(venta|ventas|fabricacion|fabricaciÃ³n|distribucion|distribuciÃ³n|comercio|tienda|negocio|servicio|servicios|consultoria|consultorÃ­a|asesoria|asesorÃ­a|reparacion|reparaciÃ³n|instalacion|instalaciÃ³n|alquiler|formacion|formaciÃ³n|marketing|publicidad|helados|ropa|comida|restauracion|restauraciÃ³n|cafeteria|cafeterÃ­a)\b/i.test(
      t
    )
  ) {
    return raw;
  }
  if (raw.split(/\s+/).filter(Boolean).length >= 2 && raw.length >= 8) {
    return raw;
  }

  return null;
}

function detectMainGoal(text) {
  const raw = norm(text);
  const t = normalizeText(text);

  if (!raw) return null;
  if (isUserQuestion(text)) return null;

  const triggers = [
    "quiero",
    "necesito",
    "busco",
    "me gustaria",
    "me gustaría",
    "mi objetivo",
    "captar",
    "conseguir",
    "vender",
    "aumentar",
    "mejorar",
    "generar",
  ];

  if (triggers.some((x) => t.includes(x))) return raw;

  return null;
}

function detectEmail(text) {
  const m = String(text || "").match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  );
  return m ? m[0] : null;
}

function detectPhone(text) {
  const digits = String(text || "").replace(/[^\d+]/g, "");
  if (digits.length >= 6) return digits;
  return null;
  if (
    /\b(venta|ventas|fabricacion|fabricación|distribucion|distribución|comercio|tienda|negocio|servicio|servicios|consultoria|consultoría|asesoria|asesoría|reparacion|reparación|instalacion|instalación|alquiler|formacion|formación|marketing|publicidad|helados|ropa|comida|restauracion|restauración|cafeteria|cafetería)\b/i.test(
      t
    )
  ) {
    return raw;
  }

  if (raw.split(/\s+/).filter(Boolean).length >= 2 && raw.length >= 8) {
    return raw;
  }

  return null;
}

function normalizeWhatsAppPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

function hasRepeatedSameQuestion(lead, expectedStep) {
  return lead?.current_step === expectedStep && norm(lead?.last_question).length > 0;
}

function looksLikeUsefulFreeTextAnswer(text) {
  const raw = norm(text);
  if (!raw) return false;
  if (isUserQuestion(raw)) return false;
  if (detectEmail(raw) || detectPhone(raw)) return false;
  return raw.length >= 3;
}

function validateMetaSignature(req) {
  if (!WHATSAPP_APP_SECRET) {
    return { ok: true, skipped: true };
  }

  const signatureHeader =
    req.get("x-hub-signature-256") || req.get("X-Hub-Signature-256");
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return { ok: false, reason: "missing-signature" };
  }

  const rawBody = req.rawBody;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    return { ok: false, reason: "missing-raw-body" };
  }

  const expected = crypto
    .createHmac("sha256", WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return { ok: false, reason: "signature-length-mismatch" };
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ? { ok: true }
    : { ok: false, reason: "signature-mismatch" };
}

function getCurrentStep(lead) {
  if (!hasName(lead)) return "ask_name";
  if (!hasBusinessType(lead)) return "ask_business_type";
  if (!hasBusinessActivity(lead)) return "ask_business_activity";
  if (!hasService(lead)) return "ask_service";
  if (!hasMainGoal(lead)) return "ask_goal";
  if (!hasBudget(lead)) return "ask_budget";
  if (!hasUrgency(lead)) return "ask_urgency";
  if (!hasContact(lead)) return "ask_contact";
  return "ready_for_ai";
}

function getQuestionForStep(step, lead) {
  const safeName = getSafeLeadName(lead);

  switch (step) {
    case "ask_name":
      return "Antes de seguir, ¿cómo te llamas?";
    case "ask_business_type":
      return safeName
        ? `Encantado, ${safeName}. ¿Tienes una empresa, eres autónomo o es un proyecto que estás empezando?`
        : "¿Tienes una empresa, eres autónomo o es un proyecto que estás empezando?";
    case "ask_business_activity":
      return "Perfecto. ¿A qué te dedicas exactamente o cuál es vuestra actividad principal?";
    case "ask_service":
      return "Gracias. ¿Qué servicio te interesa ahora mismo: SEO, Google Ads, Redes Sociales, Diseño Web o Consultoría Digital?";
    case "ask_goal":
      return "Entendido. ¿Cuál es tu objetivo principal ahora mismo?";
    case "ask_budget":
      return lead?.interest_service
        ? `Para ${lead.interest_service}, ¿con qué presupuesto aproximado te gustaría trabajar?`
        : "¿Con qué presupuesto aproximado te gustaría trabajar?";
    case "ask_urgency":
      return "Perfecto. ¿Qué prioridad tiene para ti? ¿Te gustaría empezar cuanto antes o lo estás valorando a medio plazo?";
    case "ask_contact":
      return "Genial. Para poder enviarte una propuesta orientativa o contactarte, ¿me dejas tu email o tu teléfono?";
    default:
      return null;
  }
}

function cleanReply(reply) {
  let text = String(reply || "").trim();
  text = text.replace(/\n{3,}/g, "\n\n");

  const paragraphs = text
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length <= 2) return text;

  return paragraphs.slice(0, 2).join("\n\n");
}

function buildOpenAIInput(systemPrompt, history) {
  const input = [{ role: "system", content: systemPrompt }];

  for (const msg of history) {
    if (msg.role === "user" || msg.role === "assistant") {
      input.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  return input;
}

function buildLeadSignature(lead) {
  return JSON.stringify({
    name: lead?.name || null,
    email: lead?.email || null,
    phone: lead?.phone || null,
    interest_service: lead?.interest_service || null,
    urgency: lead?.urgency || null,
    budget_range: lead?.budget_range || null,
    business_type: lead?.business_type || null,
    business_activity: lead?.business_activity || null,
    company_name: lead?.company_name || null,
    main_goal: lead?.main_goal || null,
    current_situation: lead?.current_situation || null,
    pain_points: lead?.pain_points || null,
    preferred_contact_channel: lead?.preferred_contact_channel || null,
    last_intent: lead?.last_intent || null,
    current_step: lead?.current_step || null,
    last_question: lead?.last_question || null,
    summary: lead?.summary || null,
  });
}

function hasAnalysisSnapshot(snapshot) {
  return !!(
    snapshot?.url &&
    (snapshot?.summary ||
      (Array.isArray(snapshot?.findings) && snapshot.findings.length) ||
      (Array.isArray(snapshot?.priorities) && snapshot.priorities.length))
  );
}

function summarizeAnalysisSnapshot(snapshot) {
  if (!hasAnalysisSnapshot(snapshot)) return "";

  const findings = Array.isArray(snapshot?.findings)
    ? snapshot.findings.slice(0, 3).map((x) => `- ${x}`).join("\n")
    : "";
  const priorities = Array.isArray(snapshot?.priorities)
    ? snapshot.priorities.slice(0, 3).map((x) => `- ${x}`).join("\n")
    : "";

  return `
SNAPSHOT DEL ANÁLISIS
URL: ${snapshot.url}
Title: ${snapshot.title || "N/D"}
Meta description: ${snapshot.meta_description || "N/D"}
H1: ${snapshot.h1 || "N/D"}
Hero: ${snapshot.hero_text || "N/D"}
Resumen: ${snapshot.summary || "N/D"}
Hallazgos:
${findings || "- N/D"}
Prioridades:
${priorities || "- N/D"}
Foco recomendado: ${snapshot.recommended_focus || "N/D"}
`.trim();
}

function toBase64Url(value) {
  return Buffer.from(String(value || ""), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signHandoffPayload(payloadText) {
  return crypto
    .createHmac("sha256", HANDOFF_SECRET)
    .update(payloadText)
    .digest("base64url");
}

function createHandoffToken(payload) {
  const body = toBase64Url(JSON.stringify(payload));
  const signature = signHandoffPayload(body);
  return `${body}.${signature}`;
}

function parseHandoffToken(token) {
  const raw = String(token || "").trim();
  if (!raw || !raw.includes(".")) return null;

  const [body, signature] = raw.split(".");
  if (!body || !signature) return null;
  if (signHandoffPayload(body) !== signature) return null;

  try {
    const payload = JSON.parse(fromBase64Url(body));
    return payload || null;
  } catch {
    return null;
  }
}

function buildWhatsAppHandoff({
  conversationId,
  lead,
  analysisSnapshot,
}) {
  const publicNumber = String(WHATSAPP_PUBLIC_NUMBER || "").replace(/\D/g, "");
  if (!publicNumber || !conversationId) return null;

  const payload = {
    v: 1,
    source: "web",
    conversation_id: conversationId,
    analysis_url: analysisSnapshot?.url || null,
    service: lead?.interest_service || null,
    goal: lead?.main_goal || null,
    ts: Date.now(),
  };

  const token = createHandoffToken(payload);
  const intro = "Hola, vengo desde el chat web y quiero seguir por aquí.";
  const text = `TMCTX:${token}\n${intro}`;
  const whatsappUrl = `https://wa.me/${publicNumber}?text=${encodeURIComponent(text)}`;

  return {
    channel: "whatsapp",
    whatsapp_url: whatsappUrl,
    handoff_token: token,
    prefill_text: intro,
  };
}

function extractHandoffContext(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/TMCTX:([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)/);
  if (!match) return { sanitizedText: raw, handoff: null };

  const token = match[1];
  const payload = parseHandoffToken(token);
  const sanitizedText = raw
    .replace(match[0], "")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return {
    sanitizedText,
    handoff: payload
      ? {
          token,
          payload,
        }
      : null,
  };
}

function shouldOfferWhatsAppTransition({
  channel,
  snapshot,
  lead,
  text,
}) {
  if (channel !== "web") return false;
  if (!hasName(lead)) return false;

  const t = normalizeText(text);
  const explicitlyAskedForWhatsapp =
    t.includes("whatsapp") ||
    t.includes("por whatsapp") ||
    t.includes("por wasap") ||
    t.includes("por whassap");

  if (explicitlyAskedForWhatsapp) return true;
  if (!hasAnalysisSnapshot(snapshot)) return false;

  return (
    t.includes("quiero") ||
    t.includes("me interesa") ||
    t.includes("explic") ||
    t.includes("profund") ||
    t.includes("presupuesto") ||
    t.includes("precio") ||
    t.includes("analisis") ||
    t.includes("análisis")
  );
}

function cleanReplyForWebHandoff(reply, { handoffAvailable = false, channel = "web" } = {}) {
  let text = String(reply || "").trim();
  if (!text) return text;

  if (channel === "web" && handoffAvailable) {
    text = text
      .replace(/te escribir[eé]\s+por whatsapp[^.]*\./gi, "Si te va mejor, seguimos por WhatsApp desde el botón que te dejo abajo.")
      .replace(/te contactar[eé]\s+por whatsapp[^.]*\./gi, "Si prefieres WhatsApp, puedes pasar directamente desde el botón que te dejo abajo.")
      .replace(/te enviar[eé]\s+[^.]*por whatsapp[^.]*\./gi, "Si quieres verlo por WhatsApp, te dejo el acceso directo aquí debajo.")
      .replace(/mientras tanto,\s*preparo la propuesta y te la envío pronto\./gi, "Si quieres, seguimos ya por WhatsApp y te lo explico ahí con el contexto de esta conversación.");
  }

  return text;
}

function detectStrongCommercialIntent(text) {
  const t = normalizeText(text);
  return (
    t.includes("precio") ||
    t.includes("presupuesto") ||
    t.includes("cuanto cuesta") ||
    t.includes("cuánto cuesta") ||
    t.includes("trabajar contigo") ||
    t.includes("trabajar con vosotros") ||
    t.includes("empezar") ||
    t.includes("llamada") ||
    t.includes("contactar") ||
    t.includes("whatsapp")
  );
}

function getConversationMode({
  channel,
  currentAnalysis,
  relatedWebLead,
  relatedWebAnalysis,
}) {
  if (channel === "web") return "diagnostic_web";
  if (
    channel === "whatsapp" &&
    (hasAnalysisSnapshot(currentAnalysis) ||
      !!relatedWebLead ||
      hasAnalysisSnapshot(relatedWebAnalysis))
  ) {
    return "closer_whatsapp";
  }
  return "hybrid_whatsapp";
}

function getConversationPhase({ mode, lead, analysisSnapshot, text }) {
  const hasSnapshot = hasAnalysisSnapshot(analysisSnapshot);
  const hasAnyLeadSignal =
    hasService(lead) ||
    hasBudget(lead) ||
    hasMainGoal(lead) ||
    hasContact(lead) ||
    hasBusinessActivity(lead);

  if (mode === "closer_whatsapp") {
    if (hasContact(lead) && (hasService(lead) || hasSnapshot)) return "close";
    return "deepen";
  }

  if (!hasSnapshot && !extractFirstUrlFromText(text) && !hasAnyLeadSignal) {
    return "discover";
  }

  if (
    hasSnapshot &&
    !hasName(lead) &&
    !detectStrongCommercialIntent(text)
  ) {
    return "diagnose";
  }

  if (
    hasSnapshot &&
    hasName(lead) &&
    (!hasContact(lead) || !hasService(lead) || !hasMainGoal(lead))
  ) {
    return "deepen";
  }

  if (hasSnapshot || hasAnyLeadSignal) {
    return detectStrongCommercialIntent(text) || hasContact(lead)
      ? "close"
      : "deepen";
  }

  return "discover";
}

function getMissingLeadQuestion(lead, { lateOnly = true } = {}) {
  const sequence = lateOnly
    ? ["name", "interest_service", "main_goal", "budget_range", "urgency", "email_or_phone"]
    : ["name", "business_type", "business_activity", "interest_service", "main_goal", "budget_range", "urgency", "email_or_phone"];

  for (const item of sequence) {
    switch (item) {
      case "name":
        if (!hasName(lead)) return "Si te encaja, ¿cómo te llamas?";
        break;
      case "business_type":
        if (!hasBusinessType(lead)) {
          return "¿Esto es para una empresa en marcha, un negocio local o un proyecto que estás arrancando?";
        }
        break;
      case "business_activity":
        if (!hasBusinessActivity(lead)) {
          return "¿A qué os dedicáis exactamente?";
        }
        break;
      case "interest_service":
        if (!hasService(lead)) {
          return "¿Qué quieres revisar primero: web, SEO, Google Ads o captación?";
        }
        break;
      case "main_goal":
        if (!hasMainGoal(lead)) {
          return "¿Qué te preocupa más ahora mismo: captar más contactos, vender más o mejorar la conversión?";
        }
        break;
      case "budget_range":
        if (!hasBudget(lead)) {
          return "Si quieres, te oriento mejor si me dices con qué presupuesto aproximado te gustaría moverte.";
        }
        break;
      case "urgency":
        if (!hasUrgency(lead)) {
          return "¿Esto te corre ahora o es algo que quieres mover más adelante?";
        }
        break;
      case "email_or_phone":
        if (!hasContact(lead)) {
          return hasName(lead)
            ? `Perfecto, ${getSafeLeadName(lead) || ""}. Si quieres que te deje esto preparado o seguir por un canal más cómodo, compárteme email o WhatsApp y seguimos por ahí.`
            : "Si quieres que te deje esto preparado o seguir por un canal más cómodo, antes dime tu nombre y seguimos.";
        }
        break;
    }
  }

  return null;
}

function buildModeInstructions({ mode, phase, lead, analysisSnapshot, channel, text }) {
  const analysisBlock = summarizeAnalysisSnapshot(analysisSnapshot);
  const missingLeadQuestion =
    phase === "deepen" || phase === "close"
      ? getMissingLeadQuestion(lead, { lateOnly: true })
      : null;
  const suggestWhatsApp = shouldOfferWhatsAppTransition({
    channel,
    snapshot: analysisSnapshot,
    lead,
    text,
  });

  const modeGuidance = {
    diagnostic_web: `
MODO: diagnostic_web
- Este chat web debe reducir fricción.
- Empieza ayudando, no interrogando.
- Ofrece caminos claros: revisar web, SEO, Google Ads o captación.
- Si hay URL o análisis, entrega un mini diagnóstico útil y breve.
- Solo pide un dato de lead si el usuario ya recibió valor o quiere seguir.
${suggestWhatsApp ? "- Si encaja, propone seguir por WhatsApp como continuación cómoda del análisis." : ""}
`,
    closer_whatsapp: `
MODO: closer_whatsapp
- Esto es una continuación natural de un contexto previo, normalmente desde web.
- No reinicies la conversación ni repitas preguntas ya resueltas.
- Usa el análisis previo como punto de partida.
- Resuelve dudas, profundiza solo lo necesario y orienta a cierre o siguiente paso.
- Si falta un dato clave para avanzar, pide solo uno.
`,
    hybrid_whatsapp: `
MODO: hybrid_whatsapp
- Este usuario ha llegado directo a WhatsApp o no hay contexto previo fiable.
- WhatsApp debe descubrir y diagnosticar con tono cercano.
- Puedes ofrecer opciones guiadas, pedir URL o problema y dar un mini diagnóstico si hay material.
- No dependas del chat web para ayudarle.
`,
  };

  const phaseGuidance = {
    discover: `
FASE: descubrimiento
- Tu prioridad es captar atención y orientar.
- No pidas nombre, empresa, urgencia ni contacto al inicio.
- Si aún no hay URL ni problema claro, guía con opciones muy concretas.
- Haz como máximo una pregunta clara al final.
`,
    diagnose: `
FASE: diagnóstico ligero
- Resume qué has detectado.
- Explica por qué puede afectar a captación, conversión o visibilidad.
- Señala 2 o 3 prioridades.
- Invita a profundizar o a seguir por un canal cómodo.
- No inventes datos ni exageres.
`,
    deepen: `
FASE: profundización
- Ya puedes afinar el problema y recoger información comercial de forma progresiva.
- Pide solo el dato que más desbloquee el siguiente paso.
- No conviertas el mensaje en un formulario.
- No entregues análisis largos adicionales si ya has dado un primer diagnóstico útil.
- Si todavía no tienes el nombre, pídelo antes de plantear contacto o continuidad formal.
${missingLeadQuestion ? `- Si necesitas pedir un dato, la mejor pregunta ahora es: "${missingLeadQuestion}"` : ""}
`,
    close: `
FASE: cierre o transición
- Orienta a siguiente paso claro: WhatsApp, email, llamada o propuesta.
- Si faltan datos mínimos para avanzar, pide solo uno.
- En WhatsApp, cierra por ahí si el usuario ya viene con intención.
- Antes de pedir contacto o proponer seguimiento, intenta tener al menos el nombre.
${missingLeadQuestion ? `- Si necesitas pedir un dato, la mejor pregunta ahora es: "${missingLeadQuestion}"` : ""}
`,
  };

  return `
${modeGuidance[mode] || ""}
${phaseGuidance[phase] || ""}
${analysisBlock ? `${analysisBlock}\n` : ""}
`.trim();
}

async function trackConversationEvent(params) {
  try {
    await saveConversationEvent(params);
  } catch (e) {
    console.log("conversation event error", e.message);
  }
}

function buildTranscript(messages = []) {
  return messages
    .filter((m) => m?.role === "user" || m?.role === "assistant")
    .map(
      (m) =>
        `${m.role === "user" ? "Usuario" : "Asistente"}: ${String(
          m.content || ""
        ).trim()}`
    )
    .join("\n");
}

async function generateFinalConversationSummary({ lead, messages }) {
  const transcript = buildTranscript(messages);

  const prompt = `
Eres un asistente comercial de TMedia Global.

Tu tarea es redactar un resumen final único de todo el lead usando TODA la conversación, no solo el último tramo.

REGLAS:
- Escribe el resumen en español.
- Haz un resumen comercial útil, claro y breve.
- Longitud: 4 a 7 frases.
- Incluye solo información útil para ventas.
- Si falta un dato, no lo inventes.
- Prioriza: servicio de interés, necesidad principal, urgencia, presupuesto, datos de contacto, contexto del negocio, actividad y siguiente paso comercial.
- No pongas etiquetas tipo "Nombre:", "Email:", etc.
- No repitas literalmente frases vacías como "gracias" o "ok".
- Devuelve solo el resumen final, sin introducciones ni viñetas.

Lead estructurado actual:
${JSON.stringify(lead || {}, null, 2)}

Conversación completa:
${transcript}
`;

  const result = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  return result.output_text?.trim() || "";
}

async function sendWhatsAppText(to, bodyText) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error(
      `Faltan variables WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID. TOKEN=${!!WHATSAPP_TOKEN} PHONE_ID=${!!WHATSAPP_PHONE_NUMBER_ID}`
    );
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      body: String(bodyText || "").slice(0, 4096),
    },
  };

  const response = await fetch(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.log("whatsapp send error", data);
    throw new Error(data?.error?.message || "Error enviando mensaje por WhatsApp");
  }

  return data;
}

function normalizeLeadPhoneForWhatsApp(lead = {}) {
  const externalFlat = normalizeWhatsAppPhone(lead?.external_user_id);
  if ((lead?.channel === "whatsapp" || lead?.conversations?.channel === "whatsapp") && externalFlat) {
    return externalFlat;
  }

  const external = normalizeWhatsAppPhone(lead?.conversations?.external_user_id);
  if (lead?.conversations?.channel === "whatsapp" && external) return external;

  const fromPhone = normalizeWhatsAppPhone(lead?.phone);
  if (!fromPhone) return null;
  if (fromPhone.startsWith("34") || fromPhone.startsWith("1")) return fromPhone;
  if (fromPhone.length === 9) return `34${fromPhone}`;
  return fromPhone;
}

function buildQuoteFileName(lead, quote) {
  const safeTitle =
    `${String(quote?.title || "propuesta")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "propuesta"}-${String(lead?.id || "lead").slice(0, 8)}`;
  return `${safeTitle}.pdf`;
}

function getWhatsAppTextFromMessage(message) {
  if (!message) return null;

  if (message.type === "text") {
    return String(message?.text?.body || "").trim() || null;
  }

  if (message.type === "interactive") {
    const buttonReply = message?.interactive?.button_reply?.title;
    const listReply = message?.interactive?.list_reply?.title;
    const value = String(buttonReply || listReply || "").trim();
    return value || null;
  }

  return null;
}

function applyFlowPatch(lead, text) {
  const step = lead?.current_step || getCurrentStep(lead || {});
  const patch = {};

  const detectedEmail = detectEmail(text);
  const detectedPhone = detectPhone(text);
  const detectedService = detectService(text);
  const detectedBudget = normalizeBudget(text);
  const detectedBusinessType = detectBusinessType(text);
  const detectedBusinessActivity = detectBusinessActivity(text);
  const detectedGoal = detectMainGoal(text);

  if (detectedEmail && !lead?.email) patch.email = detectedEmail;
  if (detectedPhone && !lead?.phone) patch.phone = detectedPhone;
  if (detectedService && !lead?.interest_service) patch.interest_service = detectedService;
  if (detectedBusinessType && !lead?.business_type) patch.business_type = detectedBusinessType;
  if (detectedBusinessActivity && !lead?.business_activity) {
    patch.business_activity = detectedBusinessActivity;
  }
  if (detectedGoal && !lead?.main_goal) patch.main_goal = detectedGoal;
  if (detectedBudget && !lead?.budget_range) patch.budget_range = detectedBudget;

  if (
    !lead?.urgency &&
    (
      normalizeText(text).includes("urgente") ||
      normalizeText(text).includes("cuanto antes") ||
      normalizeText(text).includes("cuánto antes") ||
      normalizeText(text).includes("ya") ||
      normalizeText(text).includes("esta semana")
    )
  ) {
    patch.urgency = "alta";
  } else if (
    !lead?.urgency &&
    (
      normalizeText(text).includes("este mes") ||
      normalizeText(text).includes("en breve") ||
      normalizeText(text).includes("pronto")
    )
  ) {
    patch.urgency = "media";
  } else if (
    !lead?.urgency &&
    (
      normalizeText(text).includes("sin prisa") ||
      normalizeText(text).includes("mas adelante") ||
      normalizeText(text).includes("más adelante") ||
      isUnknownResponse(text)
    )
  ) {
    patch.urgency = "baja";
  }

  switch (step) {
    case "ask_name":
      if (isLikelyValidName(text)) {
        patch.name = norm(text);
      }
      break;

    case "ask_business_type":
      if (detectedBusinessType) {
        patch.business_type = detectedBusinessType;
      } else if (isUnknownResponse(text)) {
        patch.business_type = "pendiente_definir";
      }
      break;

    case "ask_business_activity":
      if (detectedBusinessActivity) {
        patch.business_activity = detectedBusinessActivity;
      } else if (isUnknownResponse(text)) {
        patch.business_activity = "pendiente";
      } else if (detectedService) {
        patch.business_activity = "pendiente";
      } else if (
        hasRepeatedSameQuestion(lead, "ask_business_activity") &&
        looksLikeUsefulFreeTextAnswer(text)
      ) {
        patch.business_activity = norm(text);
      }
      break;

    case "ask_service":
      if (detectedService) {
        patch.interest_service = detectedService;
      }
      break;

    case "ask_goal":
      if (detectedGoal) {
        patch.main_goal = detectedGoal;
      } else if (isUnknownResponse(text)) {
        patch.main_goal = "pendiente_definir";
      } else if (
        hasRepeatedSameQuestion(lead, "ask_goal") &&
        looksLikeUsefulFreeTextAnswer(text)
      ) {
        patch.main_goal = norm(text);
      }
      break;

    case "ask_budget":
      if (detectedBudget) {
        patch.budget_range = detectedBudget;
      } else if (isUnknownResponse(text)) {
        patch.budget_range = "pendiente";
      }
      break;

    case "ask_urgency":
      if (
        normalizeText(text).includes("urgente") ||
        normalizeText(text).includes("cuanto antes") ||
        normalizeText(text).includes("cuánto antes") ||
        normalizeText(text).includes("ya") ||
        normalizeText(text).includes("esta semana")
      ) {
        patch.urgency = "alta";
      } else if (
        normalizeText(text).includes("este mes") ||
        normalizeText(text).includes("en breve") ||
        normalizeText(text).includes("pronto")
      ) {
        patch.urgency = "media";
      } else if (
        normalizeText(text).includes("sin prisa") ||
        normalizeText(text).includes("mas adelante") ||
        normalizeText(text).includes("más adelante") ||
        isUnknownResponse(text)
      ) {
        patch.urgency = "baja";
      }
      break;

    case "ask_contact":
      if (detectedEmail) patch.email = detectedEmail;
      if (detectedPhone) patch.phone = detectedPhone;
      break;
  }

  const merged = { ...(lead || {}), ...patch };
  const nextStep = getCurrentStep(merged);

  return {
    patch,
    nextStep,
    nextQuestion: nextStep === "ready_for_ai" ? null : getQuestionForStep(nextStep, merged),
  };
}

async function processIncomingMessage({
  text,
  conversation_id,
  external_user_id,
  channel,
}) {
  if (!text || typeof text !== "string") {
    throw new Error("El campo 'text' es obligatorio y debe ser texto.");
  }

  const handoffExtraction =
    channel === "whatsapp"
      ? extractHandoffContext(text)
      : { sanitizedText: text, handoff: null };
  const userText =
    String(handoffExtraction?.sanitizedText || "").trim() || String(text).trim();
  const handoffContext = handoffExtraction?.handoff || null;

  let currentConversationId = conversation_id;
  let createdConversation = false;

  if (!currentConversationId) {
    const conversation = await createConversation({
      channel: channel || "web",
      external_user_id: external_user_id || null,
    });
    currentConversationId = conversation.id;
    createdConversation = true;
  }

  if (createdConversation) {
    await trackConversationEvent({
      conversation_id: currentConversationId,
      event_type: "conversation_started",
      channel: channel || "web",
      external_user_id: external_user_id || null,
      payload: {
        first_message: String(userText || "").slice(0, 500),
      },
    });
  }

  await saveMessage({
    conversation_id: currentConversationId,
    role: "user",
    content: userText,
  });

  await trackConversationEvent({
    conversation_id: currentConversationId,
    event_type: "message_received",
    channel: channel || "web",
    external_user_id: external_user_id || null,
    payload: {
      role: "user",
      text: String(userText || "").slice(0, 500),
      handoff_source: handoffContext?.payload?.source || null,
    },
  });

  const history = await getConversationMessages(currentConversationId, 30);
  const leadBefore = await getLeadByConversationId(currentConversationId);
  const leadSignatureBefore = buildLeadSignature(leadBefore || {});
  const whatsappPhone =
    channel === "whatsapp"
      ? normalizeWhatsAppPhone(external_user_id)
      : null;

  const extracted = extractLeadDataFromText(userText, leadBefore);

  const incoming = {
    conversation_id: currentConversationId,
    name: extracted?.name ?? null,
    email: extracted?.email ?? null,
    phone: extracted?.phone ?? whatsappPhone ?? leadBefore?.phone ?? null,
    interest_service: extracted?.interest_service ?? null,
    urgency: extracted?.urgency ?? null,
    budget_range: extracted?.budget_range ?? null,
    summary: leadBefore?.summary ?? null,
    lead_score: extracted?.lead_score ?? extracted?.lead_Score ?? null,
    consent: extracted?.consent ?? null,
    consent_at: extracted?.consent_at ?? null,
    business_type: extracted?.business_type ?? null,
    business_activity: extracted?.business_activity ?? null,
    company_name: extracted?.company_name ?? null,
    main_goal: extracted?.main_goal ?? null,
    current_situation: extracted?.current_situation ?? null,
    pain_points: extracted?.pain_points ?? null,
    preferred_contact_channel:
      extracted?.preferred_contact_channel ??
      (channel === "whatsapp" ? "whatsapp" : null),
    last_intent: extracted?.last_intent ?? null,
    current_step: leadBefore?.current_step ?? null,
    last_question: leadBefore?.last_question ?? null,
  };

  if (!incoming.budget_range) {
    const detectedBudget = normalizeBudget(userText);
    if (detectedBudget) {
      incoming.budget_range = detectedBudget;
    }
  }

  const mergedLeadBase = mergeLeadData({
    currentLead: leadBefore || {},
    extractedLead: incoming,
    lastUserMessage: userText,
  });

  const memoryPatch = buildMemoryPatch({
    text: userText,
    leadBefore,
    extracted,
    mergedLead: mergedLeadBase,
  });

  const mergedLead = mergeLeadData({
    currentLead: mergedLeadBase,
    extractedLead: memoryPatch || {},
    lastUserMessage: userText,
  });

  await upsertLeadFromConversation({
    ...mergedLead,
    conversation_id: currentConversationId,
    business_activity:
      mergedLead?.business_activity ?? leadBefore?.business_activity ?? null,
    company_name: mergedLead?.company_name ?? leadBefore?.company_name ?? null,
    current_step: leadBefore?.current_step ?? null,
    last_question: leadBefore?.last_question ?? null,
  });

  let leadAfter = await getLeadByConversationId(currentConversationId);

  if (!isLikelyValidName(leadAfter?.name) && leadAfter?.name) {
    await upsertLeadFromConversation({
      ...leadAfter,
      conversation_id: currentConversationId,
      name: null,
    });

    leadAfter = await getLeadByConversationId(currentConversationId);
  }

  let relatedWebLead = null;
  let relatedWebAnalysis = null;

  if (channel === "whatsapp") {
    try {
      if (handoffContext?.payload?.conversation_id) {
        relatedWebLead = await getLeadByConversationId(
          handoffContext.payload.conversation_id
        );
      }

      if (!relatedWebLead) {
        relatedWebLead = await findLatestWebLeadByContact({
          email: leadAfter?.email,
          phone: whatsappPhone || leadAfter?.phone,
        });
      }

      if (relatedWebLead?.conversation_id) {
        relatedWebAnalysis = await getLatestConversationEvent(
          relatedWebLead.conversation_id,
          "analysis_snapshot"
        );
      }

      if (handoffContext?.payload?.conversation_id && relatedWebLead?.conversation_id) {
        await trackConversationEvent({
          conversation_id: currentConversationId,
          event_type: "channel_handoff",
          channel: channel || "whatsapp",
          external_user_id: external_user_id || null,
          payload: {
            source_channel: "web",
            source_conversation_id: relatedWebLead.conversation_id,
            handoff_token_present: true,
          },
        });
      }
    } catch (e) {
      console.log("related web context error", e.message);
    }
  }

  if (channel === "whatsapp" && relatedWebLead) {
    const hydratedLead = mergeLeadData({
      currentLead: {
        ...relatedWebLead,
        ...leadAfter,
      },
      extractedLead: {
        name: leadAfter?.name,
        email: leadAfter?.email,
        phone: leadAfter?.phone || whatsappPhone,
        interest_service:
          leadAfter?.interest_service || relatedWebLead?.interest_service,
        urgency: leadAfter?.urgency || relatedWebLead?.urgency,
        budget_range: leadAfter?.budget_range || relatedWebLead?.budget_range,
      },
      lastUserMessage: userText,
    });

    await upsertLeadFromConversation({
      ...hydratedLead,
      conversation_id: currentConversationId,
      business_type: leadAfter?.business_type || relatedWebLead?.business_type,
      business_activity:
        leadAfter?.business_activity || relatedWebLead?.business_activity,
      main_goal: leadAfter?.main_goal || relatedWebLead?.main_goal,
      current_situation:
        leadAfter?.current_situation || relatedWebLead?.current_situation,
      pain_points: leadAfter?.pain_points || relatedWebLead?.pain_points,
      current_step: leadAfter?.current_step ?? relatedWebLead?.current_step ?? null,
      last_question: leadAfter?.last_question ?? relatedWebLead?.last_question ?? null,
    });

    leadAfter = await getLeadByConversationId(currentConversationId);
  }

  const currentAnalysisEvent =
    (await getLatestConversationEvent(currentConversationId, "analysis_snapshot").catch(
      () => null
    )) || null;
  let analysisSnapshot = currentAnalysisEvent?.payload || null;

  const detectedUrl = extractFirstUrlFromText(userText);
  const snapshotUrl = analysisSnapshot?.url || relatedWebAnalysis?.payload?.url || null;
  const shouldRunAnalysis =
    !!detectedUrl &&
    (!snapshotUrl ||
      normalizeText(snapshotUrl) !== normalizeText(detectedUrl));

  if (shouldRunAnalysis) {
    try {
      const newSnapshot = await runLightSiteAnalysis(detectedUrl);
      if (newSnapshot) {
        analysisSnapshot = newSnapshot;
        await trackConversationEvent({
          conversation_id: currentConversationId,
          event_type: "analysis_snapshot",
          channel: channel || "web",
          external_user_id: external_user_id || null,
          payload: newSnapshot,
        });
      }
    } catch (e) {
      console.log("light site analysis error", e.message);
    }
  } else if (!analysisSnapshot && relatedWebAnalysis?.payload) {
    analysisSnapshot = relatedWebAnalysis.payload;
  }

  const flow = applyFlowPatch(leadAfter || {}, userText);

  if (Object.keys(flow.patch || {}).length > 0) {
    const updatedLead = {
      ...leadAfter,
      ...flow.patch,
      current_step: flow.nextStep,
      last_question: flow.nextQuestion,
    };

    await upsertLeadFromConversation({
      ...updatedLead,
      conversation_id: currentConversationId,
    });

    leadAfter = await getLeadByConversationId(currentConversationId);
  } else {
    const currentStep = getCurrentStep(leadAfter || {});
    const currentQuestion =
      currentStep === "ready_for_ai"
        ? null
        : getQuestionForStep(currentStep, leadAfter || {});

    await upsertLeadFromConversation({
      ...leadAfter,
      conversation_id: currentConversationId,
      current_step: currentStep,
      last_question: currentQuestion,
    });

    leadAfter = await getLeadByConversationId(currentConversationId);
  }

  console.log("---- LEAD DEBUG ----");
  console.log("text:", userText);
  console.log("leadBefore:", leadBefore);
  console.log("extracted:", extracted);
  console.log("incoming:", incoming);
  console.log("memoryPatch:", memoryPatch);
  console.log("mergedLead:", mergedLead);
  console.log("flowPatch:", flow.patch);
  console.log("flowNextStep:", flow.nextStep);
  console.log("analysisSnapshot:", analysisSnapshot);
  console.log("leadAfter:", leadAfter);
  console.log("--------------------");

  let reply = null;
  const conversationMode = getConversationMode({
    channel: channel || "web",
    currentAnalysis: analysisSnapshot,
    relatedWebLead,
    relatedWebAnalysis: relatedWebAnalysis?.payload || null,
  });
  const handoffCandidate =
    shouldOfferWhatsAppTransition({
      channel: channel || "web",
      snapshot: analysisSnapshot,
      lead: leadAfter || {},
      text: userText,
    })
      ? buildWhatsAppHandoff({
          conversationId: currentConversationId,
          lead: leadAfter || {},
          analysisSnapshot,
        })
      : null;
  const conversationPhase = getConversationPhase({
    mode: conversationMode,
    lead: leadAfter || {},
    analysisSnapshot,
    text: userText,
  });

  {
    const serviceFacts = getServiceFacts(leadAfter.interest_service);

    let factsBlock = "";

    if (serviceFacts) {
      factsBlock = `
INFORMACIÓN VERIFICADA DE LA WEB

Servicio: ${leadAfter.interest_service}

Precio mínimo: ${serviceFacts.min_monthly_fee || serviceFacts.min_project_fee}

Página oficial:
${serviceFacts.url}

Notas:
${serviceFacts.notes}
`;
    }

    let ragContext = "";

    if (
      conversationPhase !== "discover" &&
      (leadAfter.interest_service ||
        hasAnalysisSnapshot(analysisSnapshot) ||
        detectStrongCommercialIntent(userText))
    ) {
      try {
        const docs = await retrieveWebsiteContext(
          `
Servicio: ${leadAfter.interest_service || ""}
Pregunta usuario: ${userText}
Presupuesto: ${leadAfter.budget_range || ""}
Objetivo: ${leadAfter.main_goal || ""}
Negocio: ${leadAfter.business_type || ""}
Actividad: ${leadAfter.business_activity || ""}
`
        );

        ragContext = docs
          .map(
            (d) => `
Fuente: ${d.url}

${d.chunk}
`
          )
          .join("\n");
      } catch (e) {
        console.log("RAG error", e.message);
      }
    }

    const memoryContext = buildLeadMemoryContext(leadAfter);
    const modeInstructions = buildModeInstructions({
      mode: conversationMode,
      phase: conversationPhase,
      lead: leadAfter || {},
      analysisSnapshot,
      channel: channel || "web",
      text: userText,
    });

    const systemPrompt = `
${getAgentSystemPrompt()}

REGLAS IMPORTANTES

1. RESPONDE SIEMPRE LA PREGUNTA DEL USUARIO
2. USA INFORMACIÓN DE LA WEB Y DEL SNAPSHOT SI ESTÁ DISPONIBLE
3. LOS PRECIOS SIEMPRE DEBEN INCLUIR "+ IVA"
4. NO INVENTES PRECIOS
5. USA LA MEMORIA DEL LEAD PARA DAR CONTINUIDAD
6. SI EL USUARIO HACE UNA PREGUNTA DIRECTA, RESPÓNDELA PRIMERO
7. DESPUÉS DE RESPONDER, HAZ COMO MÁXIMO UNA PREGUNTA COMERCIAL
8. SI EXISTE INFORMACIÓN VERIFICADA DE LA WEB, USA SOLO ESA INFORMACIÓN PARA HABLAR DE PRECIOS
9. NO DES RANGOS DE PRECIOS SI NO ESTÁN EXPLÍCITAMENTE EN LA INFORMACIÓN VERIFICADA
10. RESPUESTAS BREVES: MÁXIMO 2 PÁRRAFOS CORTOS
11. NO HAGAS VARIAS PREGUNTAS SEGUIDAS EN EL MISMO MENSAJE
12. NO EMPIECES COMO FORMULARIO
13. DA VALOR ANTES DE PEDIR DATOS
14. SI EL CANAL ES WEB, PRIORIZA DIAGNÓSTICO Y REDUCCIÓN DE FRICCIÓN
15. SI EL CANAL ES WHATSAPP CON CONTEXTO PREVIO, CONTINÚA SIN REINICIAR
16. SI EL CANAL ES WHATSAPP SIN CONTEXTO, COMBINA DESCUBRIMIENTO Y DIAGNÓSTICO
17. NO PREGUNTES NOMBRE, EMPRESA, URGENCIA O CONTACTO AL PRINCIPIO SI TODAVÍA NO HAS APORTADO VALOR
18. NO SOBRESCRIBAS DATOS CONFIRMADOS CON SUPOSICIONES DÉBILES
19. SI ESTÁS EN WEB, NO DIGAS "TE ESCRIBIRÉ POR WHATSAPP" NI PROMETAS UN CONTACTO SALIENTE MANUAL
20. SI EL USUARIO QUIERE SEGUIR POR WHATSAPP DESDE WEB, PLANTÉALO COMO CONTINUACIÓN POR UN BOTÓN O ENLACE

${modeInstructions}

${memoryContext}

${factsBlock}

CONTEXTO WEB

${ragContext}
`;

    const openaiInput = buildOpenAIInput(systemPrompt, history);

    try {
      const ai = await openai.responses.create({
        model: "gpt-4.1-mini",
        input: openaiInput,
      });

      reply = ai.output_text?.trim();
    } catch (e) {
      console.log("openai reply error", e.message);
      reply =
        "He recibido tu mensaje, pero ahora mismo estoy teniendo un problema puntual para responder. Si quieres, vuelve a escribirme en unos segundos.";
    }

    if (!reply) {
      reply =
        conversationPhase === "discover"
          ? "Puedo ayudarte a revisar tu web, SEO, Google Ads o captación. Si quieres, pásame tu URL o dime qué te preocupa más y te doy una primera orientación."
          : "Si quieres, sigo contigo sobre ese punto y te digo cuál sería la prioridad más sensata.";
    }

    reply = cleanReply(reply);
    reply = cleanReplyForWebHandoff(reply, {
      handoffAvailable: !!handoffCandidate,
      channel: channel || "web",
    });
  }

  await saveMessage({
    conversation_id: currentConversationId,
    role: "assistant",
    content: reply,
  });

  await trackConversationEvent({
    conversation_id: currentConversationId,
    event_type: "message_sent",
    channel: channel || "web",
    external_user_id: external_user_id || null,
    payload: {
      role: "assistant",
      text: String(reply || "").slice(0, 500),
    },
  });

  leadAfter = await getLeadByConversationId(currentConversationId);
  const leadSignatureAfter = buildLeadSignature(leadAfter || {});

  if (leadSignatureBefore !== leadSignatureAfter) {
    await trackConversationEvent({
      conversation_id: currentConversationId,
      event_type: "lead_updated",
      channel: channel || "web",
      external_user_id: external_user_id || null,
      payload: {
        lead_score: leadAfter?.lead_score ?? null,
        interest_service: leadAfter?.interest_service || null,
        budget_range: leadAfter?.budget_range || null,
        urgency: leadAfter?.urgency || null,
        has_name: !!leadAfter?.name,
        has_email: !!leadAfter?.email,
        has_phone: !!leadAfter?.phone,
      },
    });
  }

  const chatCompleted = shouldMarkChatCompleted(leadAfter, reply);

  if (chatCompleted) {
    try {
      const fullMessages = await getConversationMessages(currentConversationId, 100);

      const finalSummary = await generateFinalConversationSummary({
        lead: leadAfter,
        messages: fullMessages,
      });

      if (finalSummary) {
        await upsertLeadFromConversation({
          ...leadAfter,
          conversation_id: currentConversationId,
          summary: finalSummary,
        });

        leadAfter = await getLeadByConversationId(currentConversationId);
      }
    } catch (e) {
      console.log("final summary error", e.message);
    }
  }

  if (chatCompleted) {
    await trackConversationEvent({
      conversation_id: currentConversationId,
      event_type: "chat_completed",
      channel: channel || "web",
      external_user_id: external_user_id || null,
      payload: {
        lead_score: leadAfter?.lead_score ?? null,
        interest_service: leadAfter?.interest_service || null,
      },
    });
  }

  try {
    const latestLead = await getLeadByConversationId(currentConversationId);
    const signature = buildLeadSignature(latestLead);
    const previousSignature = lastLeadEmailSent.get(currentConversationId);

    if (signature !== previousSignature) {
      await sendLeadEmail({
        lead: latestLead,
        conversation_id: currentConversationId,
        type: previousSignature ? "update" : "new",
        changedFields: [],
      });

      lastLeadEmailSent.set(currentConversationId, signature);
    }
  } catch (e) {
    console.log("lead email error", e.message);
  }

  try {
    const latestLead = await getLeadByConversationId(currentConversationId);

    if (
      latestLead?.email &&
      chatCompleted &&
      !clientConfirmationSent.get(currentConversationId)
    ) {
      await sendClientConfirmationEmail({
        lead: latestLead,
        conversation_id: currentConversationId,
      });

      clientConfirmationSent.set(currentConversationId, true);
    }
  } catch (e) {
    console.log("client email error", e.message);
  }

  const handoff = handoffCandidate;

  return {
    ok: true,
    build: BUILD_TAG,
    conversation_id: currentConversationId,
    reply,
    lead: leadAfter || null,
    chat_completed: chatCompleted,
    mode: conversationMode,
    phase: conversationPhase,
    handoff,
  };
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    build: BUILD_TAG,
    time: new Date().toISOString(),
  });
});

app.get("/debug/extract", async (req, res) => {
  try {
    const text = String(req.query.text || "");
    const existingLead = null;
    const extracted = extractLeadDataFromText(text, existingLead);

    res.json({
      ok: true,
      build: BUILD_TAG,
      input: text,
      extracted,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

app.get("/debug/lead/:conversationId", async (req, res) => {
  try {
    const lead = await getLeadByConversationId(req.params.conversationId);
    res.json({
      ok: true,
      build: BUILD_TAG,
      lead,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

app.get("/api/crm/leads", async (req, res) => {
  try {
    const leads = await listCrmLeads(200);

    const enriched = await Promise.all(
      leads.map(async (lead) => {
        const conversationId = lead?.conversation_id;
        let lastMessage = null;

        if (conversationId) {
          const messages = await getConversationMessages(conversationId, 1).catch(() => []);
          lastMessage = messages?.[0] || null;
        }

        return {
          ...lead,
          channel: lead?.conversations?.channel || "web",
          external_user_id: lead?.conversations?.external_user_id || null,
          conversation_created_at: lead?.conversations?.created_at || null,
          last_message: lastMessage,
        };
      })
    );

    res.json({ ok: true, leads: enriched });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/crm/conversations/:conversationId/messages", async (req, res) => {
  try {
    const messages = await getConversationMessages(req.params.conversationId, 200);
    const lead = await getLeadByConversationId(req.params.conversationId);
    res.json({ ok: true, messages, lead });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

async function handleCrmLeadUpdate(req, res) {
  try {
    const updated = await updateLeadCrmFields(req.params.leadId, req.body || {});
    res.json({ ok: true, lead: updated });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

app.patch("/api/crm/leads/:leadId", handleCrmLeadUpdate);
app.post("/api/crm/leads/:leadId", handleCrmLeadUpdate);

app.get("/api/crm/leads/:leadId/quote", async (req, res) => {
  try {
    const quote = await getLatestQuoteByLeadId(req.params.leadId);
    res.json({ ok: true, quote });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/crm/service-facts/:serviceName", async (req, res) => {
  try {
    const serviceName = decodeURIComponent(req.params.serviceName || "");
    const facts = getServiceFacts(serviceName);
    res.json({ ok: true, facts: facts || null });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/crm/quotes/:leadId/preview", async (req, res) => {
  try {
    const leads = await listCrmLeads(500);
    const lead =
      leads.find((item) => String(item.id) === String(req.params.leadId)) || null;

    if (!lead) {
      return res.status(404).send("Lead no encontrado");
    }

    const quote = await getLatestQuoteByLeadId(req.params.leadId);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const html = renderQuotePreviewHtml({
      lead,
      quote,
      logoUrl: `${baseUrl}/crm/assets/tmedia-global-logo.png`,
      autoPrint: req.query.print === "1",
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/crm/quotes/:leadId/pdf", async (req, res) => {
  try {
    const leads = await listCrmLeads(500);
    const lead =
      leads.find((item) => String(item.id) === String(req.params.leadId)) || null;

    if (!lead) {
      return res.status(404).send("Lead no encontrado");
    }

    const quote = await getLatestQuoteByLeadId(req.params.leadId);
    const html = renderQuotePreviewHtml({
      lead,
      quote,
      logoUrl: getLogoDataUrl(),
    });
    const pdfBuffer = await renderHtmlToPdfBuffer(html);
    const fileName = buildQuoteFileName(lead, quote);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.log("crm quote pdf error", {
      leadId: req.params.leadId,
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    return res.status(500).send(error.message);
  }
});

async function handleCrmQuoteUpsert(req, res) {
  try {
    const leads = await listCrmLeads(500);
    const lead =
      leads.find((item) => String(item.id) === String(req.params.leadId)) || null;

    if (!lead) {
      return res.status(404).json({ ok: false, error: "Lead no encontrado" });
    }

    const quote = await upsertLatestQuoteForLead(lead, req.body || {});
    res.json({ ok: true, quote });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

app.put("/api/crm/leads/:leadId/quote", handleCrmQuoteUpsert);
app.post("/api/crm/leads/:leadId/quote", handleCrmQuoteUpsert);

app.post("/api/crm/leads/:leadId/quote/send", async (req, res) => {
  try {
    const leads = await listCrmLeads(500);
    const lead =
      leads.find((item) => String(item.id) === String(req.params.leadId)) || null;

    if (!lead) {
      return res.status(404).json({ ok: false, error: "Lead no encontrado" });
    }

    const quote = await getLatestQuoteByLeadId(req.params.leadId);
    if (!quote) {
      return res.status(400).json({ ok: false, error: "No hay presupuesto guardado para este lead" });
    }

    const via = String(req.body?.via || "").trim().toLowerCase();
    if (!["email", "whatsapp"].includes(via)) {
      return res.status(400).json({ ok: false, error: "Canal de envío no válido" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const previewUrl = `${baseUrl}/crm/quotes/${lead.id}/preview`;

    if (via === "email") {
      if (!lead.email) {
        return res.status(400).json({ ok: false, error: "Este lead no tiene email" });
      }

      await sendQuoteEmailToLead({
        lead,
        quote,
        previewUrl,
      });
    }

    if (via === "whatsapp") {
      const phone = normalizeLeadPhoneForWhatsApp(lead);
      console.log("crm quote whatsapp target", {
        leadId: lead.id,
        phone,
        leadPhone: lead?.phone || null,
        externalUserId: lead?.conversations?.external_user_id || null,
        channel: lead?.conversations?.channel || null,
      });
      if (!phone) {
        return res.status(400).json({ ok: false, error: "Este lead no tiene teléfono válido para WhatsApp" });
      }

      const message = [
        `Hola${lead?.name ? ` ${lead.name}` : ""}, te compartimos tu propuesta de ${lead?.interest_service || "TMedia Global"}.`,
        quote?.title ? `Propuesta: ${quote.title}` : null,
        `Puedes revisarla aquí: ${previewUrl}`,
        "Si quieres, la comentamos contigo y la ajustamos antes de cerrarla.",
      ]
        .filter(Boolean)
        .join("\n\n");

      await sendWhatsAppText(phone, message);
    }

    const updatedQuote = await markLatestQuoteAsSent(lead.id, via);
    return res.json({ ok: true, quote: updatedQuote, via });
  } catch (error) {
    console.log("crm quote send error", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/messages", async (req, res) => {
  try {
    const { text, conversation_id, external_user_id, channel } = req.body || {};

    const result = await processIncomingMessage({
      text,
      conversation_id,
      external_user_id,
      channel,
    });

    res.json(result);
  } catch (error) {
    console.log("error", error);

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get("/webhooks/whatsapp", (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
      console.log("whatsapp webhook verified");
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  } catch (error) {
    console.log("whatsapp verify error", error);
    return res.sendStatus(500);
  }
});

app.post("/webhooks/whatsapp", async (req, res) => {
  try {
    const signatureValidation = validateMetaSignature(req);
    if (!signatureValidation.ok) {
      console.log("whatsapp signature validation failed", signatureValidation);
      return res.sendStatus(401);
    }

    res.sendStatus(200);

    const entries = req.body?.entry || [];

    for (const entry of entries) {
      const changes = entry?.changes || [];

      for (const change of changes) {
        const value = change?.value || {};

        if (Array.isArray(value?.statuses) && value.statuses.length > 0) {
          continue;
        }

        const messages = value?.messages || [];
        if (!messages.length) continue;

        for (const message of messages) {
          const messageId = message?.id;

          if (hasProcessedWhatsAppMessage(messageId)) {
            console.log("whatsapp duplicate skipped", { messageId });
            continue;
          }

          markWhatsAppMessageProcessed(messageId);

          const from = message?.from;
          const text = getWhatsAppTextFromMessage(message);

          if (!from) continue;

          if (!text) {
            try {
              await sendWhatsAppText(
                from,
                "Ahora mismo solo puedo procesar mensajes de texto."
              );
            } catch (e) {
              console.log("non-text reply error", e.message);
            }
            continue;
          }

          console.log("incoming whatsapp", {
            from,
            text,
            messageId,
            type: message?.type,
          });

          const result = await processIncomingMessage({
            text,
            conversation_id: null,
            external_user_id: from,
            channel: "whatsapp",
          });

          console.log("whatsapp processed result", {
            from,
            conversation_id: result?.conversation_id || null,
            hasReply: !!result?.reply,
            chat_completed: result?.chat_completed || false,
          });

          if (result?.reply) {
            try {
              const sendResult = await sendWhatsAppText(from, result.reply);
              console.log("whatsapp send ok", {
                from,
                messageId: sendResult?.messages?.[0]?.id || null,
              });
            } catch (e) {
              console.log("whatsapp send failure", {
                from,
                error: e.message,
              });
            }
          } else {
            console.log("whatsapp empty reply skipped", { from });
          }
        }
      }
    }
  } catch (error) {
    console.log("whatsapp webhook error", error);
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
