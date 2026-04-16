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
  findConversationEventByHandoffCode,
  listCrmLeads,
  getCrmAnalytics,
  listWhatsAppLeadsForFollowUp,
  updateLeadCrmFields,
  getLatestQuoteByLeadId,
  upsertLatestQuoteForLead,
  markLatestQuoteAsSent,
  markLatestQuoteResponse,
} from "./lib/chatStore.js";

import { mergeLeadData } from "./lib/leadMerge.js";

import { openai } from "./lib/openaiClient.js";
import { getAgentSystemPrompt } from "./lib/agentPrompt.js";
import { getAppConfig, saveAppConfig } from "./lib/appConfigStore.js";
import { listAccounts, resolveAccount } from "./lib/accountStore.js";
import { uploadBrandLogo } from "./lib/storageStore.js";

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
import {
  renderQuotePreviewHtml,
  renderQuoteResponseHtml,
} from "./lib/quoteTemplate.js";
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
    limit: "5mb",
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
const TASK_SECRET = process.env.TASK_SECRET || "";
const INTEGRATIONS_SECRET = process.env.INTEGRATIONS_SECRET || "";
const QUOTE_RESPONSE_SECRET =
  process.env.QUOTE_RESPONSE_SECRET || TASK_SECRET || INTEGRATIONS_SECRET || "";
const WHATSAPP_FOLLOWUP_HOURS = Number(process.env.WHATSAPP_FOLLOWUP_HOURS || 10);
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

async function resolveRequestAccount(req) {
  const accountInput =
    req.query?.account_id ||
    req.query?.account_slug ||
    req.body?.account_id ||
    req.body?.account_slug ||
    null;

  return resolveAccount(accountInput);
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

function isGreeting(text) {
  const t = normalizeText(text);
  return (
    t === "hola" ||
    t === "buenas" ||
    t === "buenas tardes" ||
    t === "buenos dias" ||
    t === "buenos días" ||
    t === "buenas noches" ||
    t === "hey" ||
    t === "hello"
  );
}

function isLikelyValidName(value) {
  const raw = String(value || "").trim();
  const t = normalizeText(raw);

  if (!raw) return false;
  if (raw.length < 2 || raw.length > 40) return false;
  if (/\d/.test(raw)) return false;
  if (/[?@]/.test(raw)) return false;
  if (isGreeting(raw)) return false;

  const blockedPhrases = [
    "si",
    "sí",
    "si si",
    "sí sí",
    "si por favor",
    "sí por favor",
    "por favor",
    "si gracias",
    "sí gracias",
    "prefiero por whatsapp",
    "prefiero whatsapp",
    "por whatsapp",
    "whatsapp",
    "email",
    "correo",
    "mail",
    "hola",
    "buenas",
    "buenas tardes",
    "buenos dias",
    "buenos días",
    "buenas noches",
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

function createHandoffCode() {
  return `TM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function buildWhatsAppHandoff({
  conversationId,
  lead,
  analysisSnapshot,
  handoffCode,
  appConfig = null,
}) {
  const publicNumber = String(
    appConfig?.contact?.public_whatsapp_number || WHATSAPP_PUBLIC_NUMBER || ""
  ).replace(/\D/g, "");
  if (!publicNumber || !conversationId || !handoffCode) return null;

  const intro = "Hola, vengo desde el chat web y quiero seguir por aquí.";
  const text = `${intro}\nRef: ${handoffCode}`;
  const whatsappUrl = `https://wa.me/${publicNumber}?text=${encodeURIComponent(text)}`;

  return {
    channel: "whatsapp",
    whatsapp_url: whatsappUrl,
    handoff_code: handoffCode,
    prefill_text: intro,
    label:
      String(appConfig?.agent?.final_cta_label || "").trim() ||
      "Continuar en WhatsApp",
  };
}

function extractHandoffContext(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/\bref(?:erencia)?[: ]+([A-Z0-9-]{4,20})\b/i);
  if (!match) return { sanitizedText: raw, handoff: null };

  const code = String(match[1] || "").toUpperCase();
  const sanitizedText = raw
    .replace(match[0], "")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return {
    sanitizedText,
    handoff: code
      ? {
          code,
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
  if (!hasAnalysisSnapshot(snapshot)) return false;
  if (!hasName(lead)) return false;

  const preferredChannel = normalizeText(lead?.preferred_contact_channel || "");
  return preferredChannel.includes("whatsapp");
}

function cleanReplyForWebHandoff(reply, { handoffAvailable = false, channel = "web" } = {}) {
  let text = String(reply || "").trim();
  if (!text) return text;

  if (channel === "web" && handoffAvailable) {
    text = text
      .replace(/te escribir[eé]\s+por whatsapp[^.]*\./gi, "Si te va bien, abre WhatsApp y te sigo por ahí con el contexto de este análisis.")
      .replace(/te contactar[eé]\s+por whatsapp[^.]*\./gi, "Si te va bien, abre WhatsApp y te sigo por ahí con el contexto de este análisis.")
      .replace(/te enviar[eé]\s+[^.]*por whatsapp[^.]*\./gi, "Si te va bien, abre WhatsApp y te sigo por ahí con el contexto de este análisis.")
      .replace(/mientras tanto,\s*preparo la propuesta y te la envío pronto\./gi, "Cuando me escribas por WhatsApp, continúo desde este punto sin empezar de cero.");
  }

  return text;
}

function cleanReplyForChannelChoice(reply, { channel = "web", lead = null } = {}) {
  let text = String(reply || "").trim();
  if (!text) return text;
  if (channel !== "web") return text;

  const preferredChannel = normalizeText(lead?.preferred_contact_channel || "");
  if (preferredChannel || hasContact(lead)) return text;

  const asksForEmailDirectly =
    /me facilitas un email/i.test(text) ||
    /me dejas tu email/i.test(text) ||
    /comparteme tu email/i.test(text) ||
    /compárteme tu email/i.test(text) ||
    /pasame tu email/i.test(text) ||
    /pásame tu email/i.test(text) ||
    /por email/i.test(text);

  if (!asksForEmailDirectly) return text;

  const safeName = getSafeLeadName(lead);
  return safeName
    ? `Perfecto, ${safeName}. ¿Cómo prefieres que te mande la propuesta: por WhatsApp o por email?`
    : "Perfecto. ¿Cómo prefieres que te mande la propuesta: por WhatsApp o por email?";
}

function isShortAffirmativeResponse(text) {
  const t = normalizeText(text);
  return (
    t === "si" ||
    t === "sí" ||
    t === "si por favor" ||
    t === "sí por favor" ||
    t === "vale" ||
    t === "ok" ||
    t === "perfecto" ||
    t === "genial"
  );
}

function buildValueThenAskNameReply(analysisSnapshot) {
  const focus = norm(analysisSnapshot?.recommended_focus);
  const topPriority = Array.isArray(analysisSnapshot?.priorities)
    ? norm(analysisSnapshot.priorities[0])
    : "";
  const summary = norm(analysisSnapshot?.summary);

  const valueLine =
    focus
      ? `Perfecto. El siguiente paso con más impacto sería trabajar primero ${focus}.`
      : topPriority
      ? `Perfecto. La prioridad más clara ahora mismo sería ${topPriority}.`
      : summary
      ? `Perfecto. Viendo lo detectado, hay margen real para mejorar captación y conversión con unos ajustes bien enfocados.`
      : `Perfecto. Con lo que ya he visto, sí tiene sentido profundizar un poco más antes de plantearte el siguiente paso.`;

  return `${valueLine}\n\nAntes de seguir, ¿cómo te llamas?`;
}

function buildWhatsAppContinuationReply({
  lead,
  analysisSnapshot,
}) {
  const safeName = getSafeLeadName(lead);
  const service = norm(lead?.interest_service) || "nuestro servicio";
  const summary =
    norm(lead?.summary) ||
    norm(analysisSnapshot?.summary) ||
    "";
  const topPriority = Array.isArray(analysisSnapshot?.priorities)
    ? norm(analysisSnapshot.priorities[0])
    : "";
  const serviceFacts = getServiceFacts(service);
  const serviceDescription = norm(serviceFacts?.description);
  const feeText = norm(serviceFacts?.min_monthly_fee || serviceFacts?.min_project_fee);

  const intro = safeName
    ? `Hola ${safeName}, continúo por aquí con el contexto de lo que vimos en la web.`
    : "Hola, continúo por aquí con el contexto de lo que vimos en la web.";

  const summaryLine = summary
    ? `He visto que te interesa ${service} y que tu caso va orientado a ${summary}.`
    : `He visto que te interesa ${service} y ya tengo el contexto previo del análisis.`;

  const serviceLine = serviceDescription
    ? `Nuestro servicio de ${service} consiste en ${serviceDescription.charAt(0).toLowerCase()}${serviceDescription.slice(1)}`
    : `Nuestro servicio de ${service} está orientado a mejorar visibilidad, captación y resultados de forma sostenida.`;

  const priorityLine = topPriority
    ? `La primera prioridad que trabajaría sería ${topPriority}.`
    : null;

  const budgetLine = feeText
    ? `Para orientarte bien, solemos partir desde ${feeText}. ¿Con qué presupuesto te gustaría plantearlo?`
    : "Para orientarte bien, ¿con qué presupuesto te gustaría plantearlo?";

  return [intro, summaryLine, serviceLine, priorityLine, budgetLine]
    .filter(Boolean)
    .join("\n\n");
}

function buildWhatsAppReminderHook(lead = {}) {
  const safeName = getSafeLeadName(lead);
  const service = norm(lead?.interest_service) || "tu caso";
  const summary = norm(lead?.summary);

  const intro = safeName
    ? `Hola ${safeName}, te escribo por aquí por si quieres retomar lo que dejamos pendiente.`
    : "Hola, te escribo por aquí por si quieres retomar lo que dejamos pendiente.";

  const contextLine = summary
    ? `Por lo que vimos, tu interés principal va orientado a ${summary}.`
    : `Teníamos pendiente avanzar con ${service}.`;

  return [
    intro,
    contextLine,
    `Si te va bien, te doy una recomendación concreta para avanzar con ${service} o ajustamos el siguiente paso según tu presupuesto.`,
  ].join("\n\n");
}

function isAuthorizedTaskRequest(req) {
  if (!TASK_SECRET) return false;
  const headerSecret =
    req.get("x-task-secret") ||
    req.get("x-cron-secret") ||
    req.query?.secret;
  return String(headerSecret || "") === String(TASK_SECRET);
}

function isAuthorizedIntegrationRequest(req) {
  if (!INTEGRATIONS_SECRET) return false;
  const headerSecret =
    req.get("x-integrations-secret") ||
    req.get("x-integration-secret") ||
    req.query?.secret;
  return String(headerSecret || "") === String(INTEGRATIONS_SECRET);
}

function buildExternalLeadSummary(payload = {}) {
  const parts = [];
  if (payload?.interest_service) parts.push(`interesado en ${payload.interest_service}`);
  if (payload?.business_activity) parts.push(`actividad: ${payload.business_activity}`);
  if (payload?.main_goal) parts.push(`objetivo: ${payload.main_goal}`);
  if (payload?.budget_range) parts.push(`presupuesto: ${payload.budget_range}`);
  if (payload?.source_platform) parts.push(`origen: ${payload.source_platform}`);
  return parts.length ? parts.join(" | ") : "Lead importado desde formulario externo.";
}

function buildExternalLeadIntroMessage(lead = {}) {
  const safeName = getSafeLeadName(lead);
  const service = norm(lead?.interest_service) || "nuestros servicios";
  const goal = norm(lead?.main_goal);

  return [
    safeName
      ? `Hola ${safeName}, hemos recibido tu solicitud en TMedia Global.`
      : "Hola, hemos recibido tu solicitud en TMedia Global.",
    goal
      ? `Vemos que te interesa ${service} y que tu objetivo va orientado a ${goal}.`
      : `Vemos que te interesa ${service}.`,
    "Si quieres, seguimos por aquí y te doy una primera orientación para tu caso.",
  ].join("\n\n");
}

function buildStructuredCloseReply({
  channel,
  lead,
  text,
  handoff,
  analysisSnapshot,
  allowCloseAdvance = true,
}) {
  if (channel !== "web") return null;
  if (isGreeting(text)) return null;

  const wantsWhatsapp = prefersWhatsAppChannel(text);
  const wantsEmail = prefersEmailChannel(text);
  const safeName = getSafeLeadName(lead);
  const preferredChannel = normalizeText(lead?.preferred_contact_channel || "");
  const hasValueDelivered = hasAnalysisSnapshot(analysisSnapshot);
  const hasExplicitCloseIntent =
    detectStrongCommercialIntent(text) || wantsWhatsapp || wantsEmail;
  const shouldStartCloseSequence =
    hasExplicitCloseIntent || !!preferredChannel || hasContact(lead);
  const readyToAdvance =
    shouldStartCloseSequence && (hasExplicitCloseIntent || (hasValueDelivered && allowCloseAdvance));

  if (
    hasValueDelivered &&
    !safeName &&
    !hasExplicitCloseIntent &&
    isShortAffirmativeResponse(text)
  ) {
    return buildValueThenAskNameReply(analysisSnapshot);
  }

  if (!readyToAdvance) {
    return null;
  }

  if (!safeName) {
    return "Antes de seguir, ¿cómo te llamas?";
  }

  if (!preferredChannel) {
    return `Perfecto, ${safeName}. ¿Prefieres que sigamos por email o por WhatsApp?`;
  }

  if (preferredChannel.includes("whatsapp") && handoff?.whatsapp_url) {
    return `Perfecto${safeName ? `, ${safeName}` : ""}. Si te va bien, abre WhatsApp y te sigo por ahí con el contexto de este análisis.\n\nCuando me escribas por WhatsApp, continúo desde este punto sin empezar de cero.`;
  }

  if (preferredChannel.includes("email") && !lead?.email) {
    return `Perfecto${safeName ? `, ${safeName}` : ""}. Si prefieres email, compárteme tu correo y te lo preparo por ahí.`;
  }

  if (preferredChannel.includes("email") && lead?.email) {
    return `Perfecto, ${safeName}. Te lo preparo por email con lo que ya hemos revisado.`;
  }

  return null;
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

function prefersWhatsAppChannel(text) {
  const t = normalizeText(text);
  return (
    t.includes("whatsapp") ||
    t.includes("wasap") ||
    t.includes("whats") ||
    t.includes("por whatsapp") ||
    t.includes("mejor por whatsapp")
  );
}

function prefersEmailChannel(text) {
  const t = normalizeText(text);
  return (
    t.includes("email") ||
    t.includes("correo") ||
    t.includes("mail") ||
    t.includes("por email") ||
    t.includes("por correo")
  );
}

function hasPhone(lead) {
  return norm(lead?.phone).length >= 6;
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

  if (hasSnapshot && !detectStrongCommercialIntent(text) && !hasContact(lead)) {
    return "deepen";
  }

  if (hasSnapshot && hasName(lead) && !hasContact(lead)) {
    return detectStrongCommercialIntent(text) ? "close" : "deepen";
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
    ? ["name", "preferred_channel", "email_or_phone"]
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
      case "preferred_channel":
        if (hasName(lead) && !normalizeText(lead?.preferred_contact_channel || "")) {
          return `Perfecto, ${getSafeLeadName(lead) || ""}. ¿Prefieres que sigamos por email o por WhatsApp?`;
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
          const preferredChannel = normalizeText(lead?.preferred_contact_channel || "");
          if (!preferredChannel) {
            return hasName(lead)
              ? `Perfecto, ${getSafeLeadName(lead) || ""}. ¿Prefieres que sigamos por email o por WhatsApp?`
              : "Antes de seguir por un canal externo, dime tu nombre y te guío con el siguiente paso.";
          }
          if (preferredChannel.includes("whatsapp")) {
            return hasName(lead)
              ? `Perfecto, ${getSafeLeadName(lead) || ""}. Compárteme tu número de WhatsApp y te dejo el paso preparado por ahí.`
              : "Si prefieres WhatsApp, antes dime tu nombre y luego tu número.";
          }
          if (preferredChannel.includes("email")) {
            return hasName(lead)
              ? `Perfecto, ${getSafeLeadName(lead) || ""}. Compárteme tu email y te lo preparo por ahí.`
              : "Si prefieres email, antes dime tu nombre y seguimos.";
          }
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

function buildHumanAgentWhatsAppUrl(service = "", appConfig = null) {
  const humanNumber = String(
    appConfig?.contact?.human_agent_whatsapp_number || "34614149270"
  ).replace(/\D/g, "");
  const text = [
    `Hola, vengo de la propuesta${service ? ` de ${service}` : ""}.`,
    "Quiero hablar con un agente humano.",
  ].join(" ");

  return `https://wa.me/${humanNumber}?text=${encodeURIComponent(text)}`;
}

function buildQuoteFileName(lead, quote) {
  const safeTitle =
    `${String(quote?.title || "propuesta")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "propuesta"}-${String(lead?.id || "lead").slice(0, 8)}`;
  return `${safeTitle}.pdf`;
}

function getQuoteResponseSigningSecret() {
  return QUOTE_RESPONSE_SECRET || "tmglobal-quote-response-fallback";
}

function buildQuoteResponseToken({ leadId, quoteId, quoteUpdatedAt }) {
  const base = [String(leadId || ""), String(quoteId || ""), String(quoteUpdatedAt || "")].join(":");
  return crypto
    .createHmac("sha256", getQuoteResponseSigningSecret())
    .update(base)
    .digest("hex");
}

function isValidQuoteResponseToken({ leadId, quoteId, quoteUpdatedAt, token }) {
  const safeToken = String(token || "").trim();
  if (!safeToken) return false;

  const expected = buildQuoteResponseToken({ leadId, quoteId, quoteUpdatedAt });
  const expectedBuffer = Buffer.from(expected, "utf8");
  const tokenBuffer = Buffer.from(safeToken, "utf8");

  if (expectedBuffer.length !== tokenBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
}

function buildQuoteResponseUrl({ baseUrl, leadId, action, token }) {
  const params = new URLSearchParams({
    action: String(action || ""),
    token: String(token || ""),
  });
  return `${baseUrl}/crm/quotes/${leadId}/respond?${params.toString()}`;
}

function inferBrandNameFromSnapshot(snapshot = {}) {
  const candidates = [snapshot?.title, snapshot?.h1]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const first = candidate.split(/[\|\-·]/)[0]?.trim();
    if (first && first.length >= 3) return first;
  }

  return "";
}

function inferServicesFromSnapshot(snapshot = {}, appConfig = null) {
  const defaultServices =
    appConfig?.services && Object.keys(appConfig.services).length
      ? appConfig.services
      : {};

  const blob = [
    snapshot?.title,
    snapshot?.h1,
    snapshot?.summary,
    snapshot?.hero_text,
    ...(snapshot?.findings || []),
    ...(snapshot?.priorities || []),
  ]
    .join(" ")
    .toLowerCase();

  const selected = {};
  const maybeAdd = (serviceName, patterns) => {
    if (!defaultServices[serviceName]) return;
    if (patterns.some((pattern) => blob.includes(pattern))) {
      selected[serviceName] = defaultServices[serviceName];
    }
  };

  maybeAdd("SEO", ["seo", "posicionamiento", "google organic", "buscadores"]);
  maybeAdd("Google Ads", ["google ads", "sem", "ppc", "campanas de google", "campañas de google"]);
  maybeAdd("Redes Sociales", [
    "facebook ads",
    "instagram ads",
    "meta ads",
    "redes sociales",
    "instagram",
    "facebook",
  ]);
  maybeAdd("Diseño Web", ["diseno web", "diseño web", "web corporativa", "landing page", "pagina web", "página web"]);
  maybeAdd("Consultoría Digital", ["consultoria", "consultoría", "estrategia digital", "consultor"]);

  return Object.keys(selected).length ? selected : defaultServices;
}

function resolvePublicAssetUrl(baseUrl, assetUrl) {
  const raw = String(assetUrl || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  if (raw.startsWith("/")) return `${baseUrl}${raw}`;
  return `${baseUrl}/${raw.replace(/^\.?\//, "")}`;
}

function buildValidationResult(status = "pending", message = "", checkedAt = new Date().toISOString()) {
  return {
    status,
    last_validated_at: checkedAt,
    message,
  };
}

function validateIntegrationConfig(type, config = {}) {
  const checkedAt = new Date().toISOString();
  const integrations = config?.integrations || {};

  if (type === "whatsapp") {
    const item = integrations.whatsapp || {};
    if (item.provider === "manual") {
      return buildValidationResult("warning", "Canal manual: sin comprobacion automatica.", checkedAt);
    }
    if (!item.phone_number_id || !item.business_account_id) {
      return buildValidationResult("pending", "Faltan Phone Number ID o Business Account ID.", checkedAt);
    }
    return buildValidationResult("connected", `WhatsApp listo con ${item.provider || "provider"}.`, checkedAt);
  }

  if (type === "lead_forms") {
    const item = integrations.lead_forms || {};
    if (!item.meta_source && !item.google_source) {
      return buildValidationResult("pending", "No hay fuentes de leads definidas.", checkedAt);
    }
    if (!item.sheet_document && !item.webhook_url) {
      return buildValidationResult("pending", "Falta documento de Sheets o webhook principal.", checkedAt);
    }
    return buildValidationResult("connected", "Lead forms configurados para entrada unificada.", checkedAt);
  }

  if (type === "email") {
    const item = integrations.email || {};
    if (!item.from_email) {
      return buildValidationResult("pending", "Falta el email de salida.", checkedAt);
    }
    return buildValidationResult("connected", `Email listo con proveedor ${item.provider || "smtp"}.`, checkedAt);
  }

  if (type === "automations") {
    const item = integrations.automations || {};
    if (!item.workspace_url) {
      return buildValidationResult("pending", "Falta la URL del workspace de automatizacion.", checkedAt);
    }
    return buildValidationResult("connected", `Automatizaciones listas en ${item.platform || "n8n"}.`, checkedAt);
  }

  return buildValidationResult("pending", "Tipo de integracion no reconocido.", checkedAt);
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
  const prefersWhatsapp = prefersWhatsAppChannel(text);
  const prefersEmail = prefersEmailChannel(text);

  if (detectedEmail && !lead?.email) patch.email = detectedEmail;
  if (detectedPhone && !lead?.phone) patch.phone = detectedPhone;
  if (detectedService && !lead?.interest_service) patch.interest_service = detectedService;
  if (prefersWhatsapp) patch.preferred_contact_channel = "whatsapp";
  if (!prefersWhatsapp && prefersEmail) patch.preferred_contact_channel = "email";
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
  account_id = null,
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
  const scopedAccountId = String(account_id || "").trim() || null;
  const loadLeadForConversation = () =>
    getLeadByConversationId(currentConversationId, { accountId: scopedAccountId });
  const trackEventScoped = (params = {}) =>
    trackConversationEvent({
      ...params,
      account_id: scopedAccountId,
    });

  if (!currentConversationId) {
    const conversation = await createConversation({
      channel: channel || "web",
      external_user_id: external_user_id || null,
      account_id: scopedAccountId,
    });
    currentConversationId = conversation.id;
    createdConversation = true;
  }

  if (createdConversation) {
    await trackEventScoped({
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
    account_id: scopedAccountId,
  });

  await trackEventScoped({
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
  const leadBefore = await loadLeadForConversation();
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

  let leadAfter = await loadLeadForConversation();

  if (!isLikelyValidName(leadAfter?.name) && leadAfter?.name) {
    await upsertLeadFromConversation({
      ...leadAfter,
      conversation_id: currentConversationId,
      name: null,
    });

    leadAfter = await loadLeadForConversation();
  }

  let relatedWebLead = null;
  let relatedWebAnalysis = null;

  if (channel === "whatsapp") {
    try {
      if (handoffContext?.code) {
        const handoffEvent = await findConversationEventByHandoffCode(
          handoffContext.code
        );

        if (handoffEvent?.conversation_id) {
          relatedWebLead = await getLeadByConversationId(
            handoffEvent.conversation_id,
            { accountId: scopedAccountId }
          );
          handoffContext.payload = handoffEvent.payload || null;
        }
      }

      if (!relatedWebLead) {
        relatedWebLead = await findLatestWebLeadByContact({
          email: leadAfter?.email,
          phone: whatsappPhone || leadAfter?.phone,
          accountId: scopedAccountId,
        });
      }

      if (relatedWebLead?.conversation_id) {
        relatedWebAnalysis = await getLatestConversationEvent(
          relatedWebLead.conversation_id,
          "analysis_snapshot"
        );
      }

      if (handoffContext?.code && relatedWebLead?.conversation_id) {
        await trackEventScoped({
          conversation_id: currentConversationId,
          event_type: "channel_handoff",
          channel: channel || "whatsapp",
          external_user_id: external_user_id || null,
          payload: {
            source_channel: "web",
            source_conversation_id: relatedWebLead.conversation_id,
            handoff_code: handoffContext.code,
          },
        });
      }
    } catch (e) {
      console.log("related web context error", e.message);
    }
  }

  if (channel === "whatsapp" && relatedWebLead) {
    const hydratedLead = mergeLeadData({
      currentLead: relatedWebLead,
      extractedLead: {
        name: leadAfter?.name || relatedWebLead?.name,
        email: leadAfter?.email || relatedWebLead?.email,
        phone: leadAfter?.phone || whatsappPhone || relatedWebLead?.phone,
        interest_service:
          leadAfter?.interest_service || relatedWebLead?.interest_service,
        urgency: leadAfter?.urgency || relatedWebLead?.urgency,
        budget_range: leadAfter?.budget_range || relatedWebLead?.budget_range,
        summary: leadAfter?.summary || relatedWebLead?.summary,
        business_type: leadAfter?.business_type || relatedWebLead?.business_type,
        business_activity:
          leadAfter?.business_activity || relatedWebLead?.business_activity,
        main_goal: leadAfter?.main_goal || relatedWebLead?.main_goal,
        current_situation:
          leadAfter?.current_situation || relatedWebLead?.current_situation,
        pain_points: leadAfter?.pain_points || relatedWebLead?.pain_points,
        preferred_contact_channel:
          leadAfter?.preferred_contact_channel ||
          relatedWebLead?.preferred_contact_channel ||
          "whatsapp",
        last_intent: leadAfter?.last_intent || relatedWebLead?.last_intent,
      },
      lastUserMessage: userText,
    });

    await upsertLeadFromConversation({
      ...hydratedLead,
      conversation_id: currentConversationId,
      summary: leadAfter?.summary || relatedWebLead?.summary || null,
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

    leadAfter = await loadLeadForConversation();
  }

  const currentAnalysisEvent =
    (await getLatestConversationEvent(currentConversationId, "analysis_snapshot").catch(
      () => null
    )) || null;
  let analysisSnapshot = currentAnalysisEvent?.payload || null;
  const hadAnalysisSnapshotBeforeTurn =
    hasAnalysisSnapshot(analysisSnapshot) ||
    hasAnalysisSnapshot(relatedWebAnalysis?.payload || null);

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
        await trackEventScoped({
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

    leadAfter = await loadLeadForConversation();
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

    leadAfter = await loadLeadForConversation();
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
  const appConfig = await getAppConfig({ accountId: scopedAccountId }).catch(() => null);
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
      ? (() => {
          const handoffCode = createHandoffCode();
          return buildWhatsAppHandoff({
            conversationId: currentConversationId,
            lead: leadAfter || {},
            analysisSnapshot,
            handoffCode,
            appConfig,
          });
        })()
      : null;
  const conversationPhase = getConversationPhase({
    mode: conversationMode,
    lead: leadAfter || {},
    analysisSnapshot,
    text: userText,
  });
  const isWhatsAppWebContinuation =
    channel === "whatsapp" &&
    !!relatedWebLead &&
    !!handoffContext?.code &&
    createdConversation;

  if (isWhatsAppWebContinuation) {
    reply = buildWhatsAppContinuationReply({
      lead: leadAfter || relatedWebLead || {},
      analysisSnapshot,
    });
  }

  if (!reply) {
    const serviceFacts = getServiceFacts(leadAfter.interest_service, appConfig);

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
${getAgentSystemPrompt(appConfig)}

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
21. SI TODAVÍA NO SE HA ELEGIDO CANAL DE CONTACTO, NO PIDAS EMAIL DIRECTAMENTE: PRIMERO PREGUNTA SI PREFIERE WHATSAPP O EMAIL PARA RECIBIR LA PROPUESTA

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

    const structuredCloseReply = buildStructuredCloseReply({
      channel: channel || "web",
      lead: leadAfter || {},
      text: userText,
      handoff: handoffCandidate,
      analysisSnapshot,
      allowCloseAdvance: hadAnalysisSnapshotBeforeTurn,
    });

    if (structuredCloseReply) {
      reply = structuredCloseReply;
    }

    reply = cleanReply(reply);
    reply = cleanReplyForChannelChoice(reply, {
      channel: channel || "web",
      lead: leadAfter || {},
    });
    reply = cleanReplyForWebHandoff(reply, {
      handoffAvailable: !!handoffCandidate,
      channel: channel || "web",
    });
  }

  await saveMessage({
    conversation_id: currentConversationId,
    role: "assistant",
    content: reply,
    account_id: scopedAccountId,
  });

  await trackEventScoped({
    conversation_id: currentConversationId,
    event_type: "message_sent",
    channel: channel || "web",
    external_user_id: external_user_id || null,
    payload: {
      role: "assistant",
      text: String(reply || "").slice(0, 500),
    },
  });

    leadAfter = await loadLeadForConversation();
  const leadSignatureAfter = buildLeadSignature(leadAfter || {});

  if (leadSignatureBefore !== leadSignatureAfter) {
    await trackEventScoped({
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

        leadAfter = await loadLeadForConversation();
      }
    } catch (e) {
      console.log("final summary error", e.message);
    }
  }

  if (chatCompleted) {
    await trackEventScoped({
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
    const latestLead = await loadLeadForConversation();
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
    const latestLead = await loadLeadForConversation();

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

  if (handoffCandidate?.handoff_code) {
    await trackEventScoped({
      conversation_id: currentConversationId,
      event_type: "channel_handoff_offer",
      channel: channel || "web",
      external_user_id: external_user_id || null,
      payload: {
        handoff_code: handoffCandidate.handoff_code,
        target_channel: "whatsapp",
        analysis_url: analysisSnapshot?.url || null,
        service: leadAfter?.interest_service || null,
        goal: leadAfter?.main_goal || null,
      },
    });
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
    const account = await resolveRequestAccount(req);
    const lead = await getLeadByConversationId(req.params.conversationId, {
      accountId: account.id,
    });
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
    const account = await resolveRequestAccount(req);
    const leads = await listCrmLeads({ limit: 200, accountId: account.id });

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

app.get("/api/crm/analytics", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const analytics = await getCrmAnalytics({
      accountId: account.id,
      channel: req.query.channel || "all",
      dateRange: req.query.date_range || "all",
      service: req.query.service || "all",
      limit: 2000,
    });

    res.json({ ok: true, analytics });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/admin/accounts", async (req, res) => {
  try {
    const accounts = await listAccounts();
    const activeAccount = await resolveRequestAccount(req);
    res.json({ ok: true, accounts, active_account: activeAccount });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/admin/overview", async (req, res) => {
  try {
    const accounts = await listAccounts();

    const overview = await Promise.all(
      accounts.map(async (account) => {
        const [config, leads] = await Promise.all([
          getAppConfig({ accountId: account.id }).catch(() => null),
          listCrmLeads({ limit: 500, accountId: account.id }).catch(() => []),
        ]);

        const quotesSent = (leads || []).filter((lead) =>
          ["sent", "accepted", "rejected"].includes(String(lead?.quote_status || ""))
        ).length;
        const quotesAccepted = (leads || []).filter(
          (lead) => String(lead?.quote_status || "") === "accepted"
        ).length;
        const lastLeadAt = (leads || [])
          .map((lead) => lead?.created_at)
          .filter(Boolean)
          .sort()
          .slice(-1)[0] || null;

        return {
          ...account,
          brand_name: config?.brand?.name || account.name,
          brand_logo_url: config?.brand?.logo_url || "",
          primary_color: config?.brand?.primary_color || "#6d41f3",
          totals: {
            leads: leads.length,
            quotes_sent: quotesSent,
            quotes_accepted: quotesAccepted,
          },
          last_activity_at: lastLeadAt,
        };
      })
    );

    res.json({ ok: true, accounts: overview });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/crm/config", async (_req, res) => {
  try {
    const account = await resolveRequestAccount(_req);
    const config = await getAppConfig({ accountId: account.id });
    res.json({ ok: true, config, account });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/widget/config", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const config = await getAppConfig({ accountId: account.id });
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const publicConfig = {
      account: {
        id: account.id,
        slug: account.slug,
        name: account.name,
      },
      brand: {
        name: config?.brand?.name || "Agente IA",
        logo_url: resolvePublicAssetUrl(baseUrl, config?.brand?.logo_url),
        primary_color: config?.brand?.primary_color || "#6d41f3",
        accent_color: config?.brand?.accent_color || "#8d58ff",
      },
      contact: {
        public_whatsapp_number: config?.contact?.public_whatsapp_number || "",
      },
      agent: {
        final_cta_label: config?.agent?.final_cta_label || "Continuar en WhatsApp",
      },
    };

    res.json({ ok: true, config: publicConfig });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/crm/config", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const config = await saveAppConfig(req.body || {}, { accountId: account.id });
    res.json({ ok: true, config, account });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/crm/assets/logo", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const fileName = String(req.body?.file_name || "logo").trim();
    const contentType = String(req.body?.content_type || "").trim();
    const rawData = String(req.body?.data_url || req.body?.data_base64 || "").trim();

    if (!rawData) {
      return res.status(400).json({ ok: false, error: "Falta la imagen del logo." });
    }

    const base64Payload = rawData.includes(",")
      ? rawData.split(",").slice(1).join(",")
      : rawData;

    const uploaded = await uploadBrandLogo({
      accountId: account.id,
      brandName: req.body?.brand_name || account.name,
      fileName,
      contentType,
      dataBase64: base64Payload,
    });

    res.json({
      ok: true,
      asset: {
        bucket: uploaded.bucket,
        path: uploaded.path,
        public_url: uploaded.publicUrl,
      },
      account,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/crm/config/bootstrap-site", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const websiteUrl = String(req.body?.website_url || "").trim();
    if (!websiteUrl) {
      return res.status(400).json({ ok: false, error: "website_url es obligatorio" });
    }

    const currentConfig = await getAppConfig({ accountId: account.id });
    const snapshot = await runLightSiteAnalysis(websiteUrl);

    if (!snapshot) {
      return res.status(400).json({
        ok: false,
        error: "No se pudo analizar la web indicada",
      });
    }

    const inferredBrandName =
      inferBrandNameFromSnapshot(snapshot) || currentConfig?.brand?.name || "";
    const inferredServices = inferServicesFromSnapshot(snapshot, currentConfig);

    const suggestedConfig = {
      ...currentConfig,
      brand: {
        ...currentConfig?.brand,
        name: inferredBrandName || currentConfig?.brand?.name || "Marca",
        website_url: snapshot?.final_url || websiteUrl,
      },
      services: inferredServices,
    };

    res.json({
      ok: true,
      snapshot,
      suggested_config: suggestedConfig,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/crm/integrations/validate", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const type = String(req.body?.type || "").trim();
    if (!type) {
      return res.status(400).json({ ok: false, error: "type es obligatorio" });
    }

    const currentConfig = await getAppConfig({ accountId: account.id });
    const validation = validateIntegrationConfig(type, currentConfig);

    const nextConfig = {
      ...currentConfig,
      integrations: {
        ...(currentConfig?.integrations || {}),
        [type]: {
          ...(currentConfig?.integrations?.[type] || {}),
          validation,
        },
      },
    };

    const saved = await saveAppConfig(nextConfig, { accountId: account.id });

    res.json({
      ok: true,
      type,
      validation,
      config: saved,
      account,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/crm/conversations/:conversationId/messages", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const messages = await getConversationMessages(req.params.conversationId, 200);
    const lead = await getLeadByConversationId(req.params.conversationId, {
      accountId: account.id,
    });
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
      const account = await resolveRequestAccount(req);
      const appConfig = await getAppConfig({ accountId: account.id });
      const facts = getServiceFacts(serviceName, appConfig);
      res.json({ ok: true, facts: facts || null });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

app.get("/crm/quotes/:leadId/preview", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
      const appConfig = await getAppConfig({ accountId: account.id });
      const leads = await listCrmLeads({ limit: 500, accountId: account.id });
    const lead =
      leads.find((item) => String(item.id) === String(req.params.leadId)) || null;

    if (!lead) {
      return res.status(404).send("Lead no encontrado");
    }

    const quote = await getLatestQuoteByLeadId(req.params.leadId);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const responseToken = quote
      ? buildQuoteResponseToken({
          leadId: lead.id,
          quoteId: quote.id,
          quoteUpdatedAt: quote.updated_at || quote.created_at || "",
        })
      : "";
    const acceptUrl = quote
      ? buildQuoteResponseUrl({
          baseUrl,
          leadId: lead.id,
          action: "accept",
          token: responseToken,
        })
      : "";
    const rejectUrl = quote
      ? buildQuoteResponseUrl({
          baseUrl,
          leadId: lead.id,
          action: "reject",
          token: responseToken,
        })
      : "";
    const humanAgentUrl = quote
      ? buildQuoteResponseUrl({
          baseUrl,
          leadId: lead.id,
          action: "human",
          token: responseToken,
        })
      : buildHumanAgentWhatsAppUrl(lead?.interest_service || "", appConfig);
    const configuredLogoUrl = String(appConfig?.brand?.logo_url || "").trim();
    const resolvedLogoUrl = configuredLogoUrl
      ? configuredLogoUrl.startsWith("http")
        ? configuredLogoUrl
        : `${baseUrl}${configuredLogoUrl.startsWith("/") ? "" : "/"}${configuredLogoUrl}`
      : `${baseUrl}/crm/assets/tmedia-global-logo.png`;
    const html = renderQuotePreviewHtml({
      lead,
      quote,
      logoUrl: resolvedLogoUrl,
      brandName: appConfig?.brand?.name || "TMedia Global",
      autoPrint: req.query.print === "1",
      acceptUrl,
      rejectUrl,
      humanAgentUrl,
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/crm/quotes/:leadId/respond", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const appConfig = await getAppConfig({ accountId: account.id });
    const action = String(req.query.action || "").trim().toLowerCase();
    if (!["accept", "reject", "human"].includes(action)) {
      return res.status(400).send("Accion no valida");
    }

    const leads = await listCrmLeads({ limit: 500, accountId: account.id });
    const lead =
      leads.find((item) => String(item.id) === String(req.params.leadId)) || null;

    if (!lead) {
      return res.status(404).send("Lead no encontrado");
    }

    const quote = await getLatestQuoteByLeadId(req.params.leadId);
    if (!quote) {
      return res.status(404).send("No hay propuesta disponible");
    }

    const token = String(req.query.token || "").trim();
    const validToken = isValidQuoteResponseToken({
      leadId: lead.id,
      quoteId: quote.id,
      quoteUpdatedAt: quote.updated_at || quote.created_at || "",
      token,
    });

    if (!validToken) {
      return res.status(403).send("Token de propuesta no valido");
    }

    const humanAgentUrl = buildHumanAgentWhatsAppUrl(
      lead?.interest_service || "",
      appConfig
    );
    const previewUrl = `${req.protocol}://${req.get("host")}/crm/quotes/${lead.id}/preview`;

    if (action === "human") {
      await trackConversationEvent({
        conversation_id: lead.conversation_id,
        event_type: "quote_human_agent_requested",
        channel: lead?.conversations?.channel || "crm_quote",
        external_user_id: lead?.conversations?.external_user_id || lead?.email || lead?.phone || null,
        payload: {
          quote_id: quote.id,
          quote_status: quote.status || null,
        },
      });

      return res.redirect(humanAgentUrl);
    }

    const response = await markLatestQuoteResponse(
      lead.id,
      action === "accept" ? "accepted" : "rejected"
    );

    await trackConversationEvent({
      conversation_id: lead.conversation_id,
      event_type: "quote_response_received",
      channel: lead?.conversations?.channel || "crm_quote",
      external_user_id: lead?.conversations?.external_user_id || lead?.email || lead?.phone || null,
      payload: {
        action: response.action,
        quote_id: quote.id,
        lead_id: lead.id,
      },
    });

    const updatedLead = {
      ...lead,
      quote_status: response.lead?.quote_status || lead.quote_status,
      crm_status: response.lead?.crm_status || lead.crm_status,
    };

    const html = renderQuoteResponseHtml({
      action: response.action,
      lead: updatedLead,
      quote: response.quote,
      brandName: appConfig?.brand?.name || "TMedia Global",
      humanAgentUrl,
      redirectUrl: previewUrl,
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (error) {
    console.log("crm quote respond error", error);
    return res.status(500).send(error.message);
  }
});

app.get("/crm/quotes/:leadId/pdf", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const leads = await listCrmLeads({ limit: 500, accountId: account.id });
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
      const account = await resolveRequestAccount(req);
      const leads = await listCrmLeads({ limit: 500, accountId: account.id });
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
      const account = await resolveRequestAccount(req);
      const appConfig = await getAppConfig({ accountId: account.id });
      const leads = await listCrmLeads({ limit: 500, accountId: account.id });
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
      const humanAgentUrl = buildHumanAgentWhatsAppUrl(
        lead?.interest_service || "",
        appConfig
      );
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
        `Si prefieres hablar con un agente humano, puedes escribir aquí: ${humanAgentUrl}`,
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
    const account = await resolveRequestAccount(req);
    const { text, conversation_id, external_user_id, channel } = req.body || {};

    const result = await processIncomingMessage({
      text,
      conversation_id,
      external_user_id,
      channel,
      account_id: account.id,
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

app.post("/api/integrations/external-lead", async (req, res) => {
  try {
    if (!isAuthorizedIntegrationRequest(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized integration request" });
    }

    const account = await resolveRequestAccount(req);
    const payload = req.body || {};
    const sourcePlatform = norm(payload.source_platform || payload.platform || "external_form");
    const sourceCampaign = norm(payload.source_campaign || payload.campaign || "");
    const sourceFormName = norm(payload.source_form_name || payload.form_name || "");
    const sourceAdName = norm(payload.source_ad_name || payload.ad_name || "");
    const sourceAdsetName = norm(payload.source_adset_name || payload.adset_name || "");
    const preferredContactChannel = normalizeText(
      payload.preferred_contact_channel || payload.contact_channel || ""
    );

    const conversation = await createConversation({
      channel: "lead_form",
      external_user_id: norm(payload.external_user_id || `${sourcePlatform}:${Date.now()}`),
      account_id: account.id,
    });

    const leadPayload = {
      conversation_id: conversation.id,
      name: norm(payload.name || ""),
      email: norm(payload.email || ""),
      phone: norm(payload.phone || ""),
      interest_service: norm(payload.interest_service || payload.service || ""),
      urgency: norm(payload.urgency || ""),
      budget_range: norm(payload.budget_range || payload.budget || ""),
      summary: norm(payload.summary || buildExternalLeadSummary(payload)),
      lead_score: Number.isFinite(Number(payload.lead_score))
        ? Number(payload.lead_score)
        : 0,
      consent:
        typeof payload.consent === "boolean"
          ? payload.consent
          : normalizeText(payload.consent) === "true",
      consent_at:
        payload.consent_at ||
        ((typeof payload.consent === "boolean" && payload.consent) ||
        normalizeText(payload.consent) === "true"
          ? new Date().toISOString()
          : null),
      business_type: norm(payload.business_type || ""),
      business_activity: norm(payload.business_activity || ""),
      company_name: norm(payload.company_name || ""),
      main_goal: norm(payload.main_goal || ""),
      current_situation: norm(payload.current_situation || ""),
      pain_points: norm(payload.pain_points || ""),
      preferred_contact_channel: preferredContactChannel || null,
      last_intent: norm(payload.last_intent || "external_lead"),
      crm_status: "nuevo",
      quote_status: "sin_presupuesto",
      source_platform: sourcePlatform,
      source_campaign: sourceCampaign,
      source_form_name: sourceFormName,
      source_ad_name: sourceAdName,
      source_adset_name: sourceAdsetName,
      account_id: account.id,
    };

    const lead = await upsertLeadFromConversation(leadPayload);
    await updateLeadCrmFields(lead.id, {
      crm_status: "nuevo",
      quote_status: "sin_presupuesto",
      assigned_to: null,
      next_action: sourcePlatform === "google_ads" || sourcePlatform === "meta_ads"
        ? "Revisar lead ads y primer contacto"
        : "Revisar lead entrante",
      follow_up_at: null,
      internal_notes: [
        `Lead importado desde ${sourcePlatform}`,
        sourceCampaign ? `Campaña: ${sourceCampaign}` : null,
        sourceFormName ? `Formulario: ${sourceFormName}` : null,
      ].filter(Boolean).join(" | "),
    }).catch((error) => {
      console.log("external lead crm patch error", error.message);
    });

    await trackConversationEvent({
      conversation_id: conversation.id,
      event_type: "conversation_started",
      channel: "lead_form",
      external_user_id: conversation.external_user_id,
      account_id: account.id,
      payload: {
        source_platform: sourcePlatform,
        source_campaign: sourceCampaign,
        source_form_name: sourceFormName,
      },
    });

    await trackConversationEvent({
      conversation_id: conversation.id,
      event_type: "external_lead_imported",
      channel: "lead_form",
      external_user_id: conversation.external_user_id,
      account_id: account.id,
      payload: {
        source_platform: sourcePlatform,
        source_campaign: sourceCampaign,
        source_form_name: sourceFormName,
        source_ad_name: sourceAdName,
        source_adset_name: sourceAdsetName,
        preferred_contact_channel: preferredContactChannel || null,
      },
    });

    await saveMessage({
      conversation_id: conversation.id,
      role: "tool",
      content: `Lead importado desde ${sourcePlatform}${sourceCampaign ? ` | ${sourceCampaign}` : ""}. ${leadPayload.summary}`,
      account_id: account.id,
    });

    if (payload.notify_internal !== false) {
      await sendLeadEmail({
        lead: {
          ...lead,
          summary: leadPayload.summary,
        },
        conversation_id: conversation.id,
        type: "new",
      }).catch((error) => {
        console.log("external lead internal email error", error.message);
      });
    }

    const autoStart = normalizeText(payload.auto_start || payload.auto_contact || "");
    const shouldAutoStart =
      autoStart === "true" ||
      autoStart === "1" ||
      autoStart === "yes" ||
      autoStart === "si" ||
      autoStart === "sí";

    let autoContact = null;

    if (shouldAutoStart && preferredContactChannel.includes("whatsapp")) {
      const phone = normalizeLeadPhoneForWhatsApp({
        ...lead,
        phone: lead.phone || payload.phone,
      });

      if (phone) {
        const introMessage = buildExternalLeadIntroMessage({
          ...lead,
          ...leadPayload,
        });
        await sendWhatsAppText(phone, introMessage);
        await saveMessage({
          conversation_id: conversation.id,
          role: "assistant",
          content: introMessage,
          account_id: account.id,
        });
        await trackConversationEvent({
          conversation_id: conversation.id,
          event_type: "external_lead_autostart",
          channel: "whatsapp",
          external_user_id: phone,
          account_id: account.id,
          payload: {
            via: "whatsapp",
            source_platform: sourcePlatform,
          },
        });
        autoContact = "whatsapp";
      }
    } else if (shouldAutoStart && preferredContactChannel.includes("email")) {
      await sendClientConfirmationEmail({
        lead: {
          ...lead,
          ...leadPayload,
        },
        conversation_id: conversation.id,
      }).catch((error) => {
        console.log("external lead client email error", error.message);
      });
      await trackConversationEvent({
        conversation_id: conversation.id,
        event_type: "external_lead_autostart",
        channel: "email",
        external_user_id: lead.email || payload.email || null,
        account_id: account.id,
        payload: {
          via: "email",
          source_platform: sourcePlatform,
        },
      });
      autoContact = "email";
    }

    return res.json({
      ok: true,
      conversation_id: conversation.id,
      lead_id: lead.id,
      auto_contact: autoContact,
    });
  } catch (error) {
    console.log("external lead intake error", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/tasks/whatsapp-followups", async (req, res) => {
  try {
    if (!isAuthorizedTaskRequest(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized task request" });
    }

    const candidates = await listWhatsAppLeadsForFollowUp(200);
    const now = Date.now();
    const followupMs = Math.max(1, WHATSAPP_FOLLOWUP_HOURS) * 60 * 60 * 1000;
    const processed = [];

    for (const lead of candidates) {
      const conversationId = lead?.conversation_id;
      if (!conversationId) continue;

      const messages = await getConversationMessages(conversationId, 10);
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || lastMessage.role !== "assistant") continue;

      const lastMessageAt = new Date(lastMessage.created_at).getTime();
      if (!Number.isFinite(lastMessageAt)) continue;
      if (now - lastMessageAt < followupMs) continue;

      const latestFollowup = await getLatestConversationEvent(
        conversationId,
        "whatsapp_followup_sent"
      ).catch(() => null);

      const latestFollowupAt = latestFollowup?.created_at
        ? new Date(latestFollowup.created_at).getTime()
        : 0;

      if (latestFollowupAt && latestFollowupAt >= lastMessageAt) continue;

      const phone = normalizeLeadPhoneForWhatsApp(lead);
      if (!phone) continue;

      const reminderText = buildWhatsAppReminderHook(lead);
      await sendWhatsAppText(phone, reminderText);

      await trackConversationEvent({
        conversation_id: conversationId,
        event_type: "whatsapp_followup_sent",
        channel: "whatsapp",
        external_user_id: lead?.conversations?.external_user_id || phone,
        account_id: lead?.account_id || null,
        payload: {
          hours_since_last_assistant_message: Math.round((now - lastMessageAt) / 3600000),
          phone,
          text: reminderText.slice(0, 500),
        },
      });

      await saveMessage({
        conversation_id: conversationId,
        role: "assistant",
        content: reminderText,
        account_id: lead?.account_id || null,
      });

      processed.push({
        lead_id: lead.id,
        conversation_id: conversationId,
        phone,
      });
    }

    return res.json({
      ok: true,
      hours_threshold: WHATSAPP_FOLLOWUP_HOURS,
      processed_count: processed.length,
      processed,
    });
  } catch (error) {
    console.log("whatsapp followup task error", error);
    return res.status(500).json({ ok: false, error: error.message });
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
