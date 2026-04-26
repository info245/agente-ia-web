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
  listConversationEventsByType,
  findLatestWebLeadByContact,
  findConversationEventByHandoffCode,
  listCrmLeads,
  getCrmAnalytics,
  listWhatsAppLeadsForFollowUp,
  updateLeadCrmFields,
  deleteCrmLeadById,
  getLatestQuoteByLeadId,
  upsertLatestQuoteForLead,
  markLatestQuoteAsSent,
  markLatestQuoteResponse,
  getLatestAnalysisByLeadId,
  upsertLatestAnalysisForLead,
  markLatestAnalysisAsSent,
} from "./lib/chatStore.js";

import { mergeLeadData } from "./lib/leadMerge.js";
import {
  detectStrongCommercialIntent,
  getCommercialCloseStep,
  getExplicitPreferredChannel,
  isCloseFlowStep,
  isShortAffirmativeResponse,
  prefersEmailChannel,
  prefersWhatsAppChannel,
} from "./lib/closeFlow.js";

import { openai } from "./lib/openaiClient.js";
import { getAgentSystemPrompt } from "./lib/agentPrompt.js";
import { getAppConfig, saveAppConfig } from "./lib/appConfigStore.js";
import { getBlankAppConfig, mergeAppConfig } from "./lib/appConfig.js";
import {
  listAccounts,
  resolveAccount,
  createAccount,
  updateAccount,
  deleteAccount,
} from "./lib/accountStore.js";
import {
  countCrmUsers,
  createCrmUser,
  getCrmUserById,
  verifyCrmUserCredentials,
} from "./lib/authStore.js";
import { uploadBrandLogo } from "./lib/storageStore.js";

import { retrieveWebsiteContext } from "./lib/kbRetriever.js";
import { buildKnowledgeContext, getServiceFacts, getWebsiteFacts } from "./lib/websiteFacts.js";
import {
  sendLeadEmail,
  sendClientConfirmationEmail,
  sendQuoteEmailToLead,
  sendTransactionalEmail,
  verifyEmailTransport,
} from "./lib/emailService.js";

import {
  buildMemoryPatch,
  buildLeadMemoryContext,
} from "./lib/memoryUtils.js";
import {
  renderQuotePreviewHtml,
  renderQuoteResponseHtml,
} from "./lib/quoteTemplate.js";
import {
  renderAnalysisPreviewHtml,
  renderAnalysisEmailHtml,
} from "./lib/analysisTemplate.js";
import { renderHtmlToPdfBuffer } from "./lib/htmlPdf.js";
import {
  extractFirstUrlFromText,
  runLightSiteAnalysis,
} from "./lib/lightSiteAnalyzer.js";

const app = express();
const crmPublicDir = fileURLToPath(new URL("../public-crm", import.meta.url));
const widgetPublicFile = fileURLToPath(new URL("../../public-widget/widget.js", import.meta.url));

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
app.use(attachCrmUser);
app.use("/crm", express.static(crmPublicDir));
app.get("/widget.js", (_req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.sendFile(widgetPublicFile);
});
app.get("/crm", (_req, res) => {
  res.sendFile(path.join(crmPublicDir, "index.html"));
});
app.use("/api/crm", requireCrmAuth());

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "memory-v14-channel-funnel-router";
const CRM_AUTH_COOKIE = "crm_session";
const CRM_AUTH_SECRET =
  process.env.CRM_AUTH_SECRET ||
  process.env.INTEGRATIONS_SECRET ||
  "tmedia-dev-auth-secret";
const CRM_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

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
const ENABLE_INTERNAL_SCHEDULER =
  String(process.env.ENABLE_INTERNAL_SCHEDULER || "").toLowerCase() === "true";
const SCHEDULER_AUTOMATION_INTERVAL_MINUTES = Math.max(
  5,
  Number(process.env.SCHEDULER_AUTOMATION_INTERVAL_MINUTES || 30)
);
const SCHEDULER_WHATSAPP_INTERVAL_MINUTES = Math.max(
  5,
  Number(process.env.SCHEDULER_WHATSAPP_INTERVAL_MINUTES || 30)
);
const SCHEDULER_STARTUP_DELAY_MS = Math.max(
  1_000,
  Number(process.env.SCHEDULER_STARTUP_DELAY_MS || 15_000)
);
const lastLeadEmailSent = new Map();
const clientConfirmationSent = new Map();
const processedWhatsAppMessages = new Map();
const schedulerState = {
  automationRunning: false,
  whatsappRunning: false,
};
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
  if (req.crmUser?.role && req.crmUser.role !== "super_admin") {
    return resolveAccount(req.crmUser.account_id);
  }

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

  return /^(que|quÃ©|como|cÃ³mo|cuanto|cuÃ¡nto|cual|cuÃ¡l|precio|precios|presupuesto|coste|costes|tarifa|tarifas)\b/i.test(
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
    t.includes("diseÃ±o web") ||
    t.includes("consultoria") ||
    t.includes("consultorÃ­a") ||
    t.includes("web") ||
    t.includes("campanas") ||
    t.includes("campaÃ±as")
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
    t.includes("cuÃ¡nto cuesta") ||
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
    t === "no lo sÃ©" ||
    t === "ni idea" ||
    t === "depende" ||
    t === "aun no lo se" ||
    t === "aÃºn no lo sÃ©"
  );
}

function isGreeting(text) {
  const t = normalizeText(text);
  return (
    t === "hola" ||
    t === "buenas" ||
    t === "buenas tardes" ||
    t === "buenos dias" ||
    t === "buenos dÃ­as" ||
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
    "sÃ­",
    "si si",
    "sÃ­ sÃ­",
    "si por favor",
    "sÃ­ por favor",
    "por favor",
    "si gracias",
    "sÃ­ gracias",
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
    "buenos dÃ­as",
    "buenas noches",
    "quiero",
    "necesito",
    "google ads",
    "seo",
    "diseno web",
    "diseÃ±o web",
    "consultoria",
    "consultorÃ­a",
    "publicidad",
    "redes sociales",
    "meta ads",
    "declaras a hacienda",
    "precio",
    "presupuesto",
    "cuanto cuesta",
    "cuÃ¡nto cuesta",
    "tienda online",
    "ecommerce",
    "emailing",
    "soporte",
    "mantenimiento",
    "pasarela de pago",
    "pasarela",
    "catalogo",
    "catálogo",
    "ropa",
    "shopify",
    "woocommerce",
    "prestashop",
    "magento",
    "wordpress",
    "plugin",
    "plugins",
    "cms",
    "soy autonomo",
    "soy autÃ³nomo",
    "captar",
    "captar nuevos usuarios",
    "captar nuevos ususarios",
    "nuevos usuarios",
    "nuevos ususarios",
    "usuarios",
    "ususarios",
    "leads",
    "ventas",
    "trafico",
    "tráfico",
    "captacion",
    "captación",
    "confianza",
    "home",
    "mejorar posiciones",
    "conseguir mas leads",
    "conseguir más leads",
  ];

  if (blockedPhrases.some((p) => t.includes(p))) return false;
  if (isLikelyServiceIntent(raw)) return false;

  const words = raw
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  if (!words.length || words.length > 4) return false;

  const allowedWord = /^[\p{L}'-]+$/u;
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
    hasService(lead) &&
    (
      hasContact(lead) ||
      normalizeText(lead?.preferred_contact_channel || "").includes("whatsapp") ||
      normalizeText(lead?.preferred_contact_channel || "").includes("email")
    )
  );
}

function isClosingReply(reply) {
  const t = String(reply || "").toLowerCase();

  if (!t) return false;

  return (
    /te contactar[Ã©e]/i.test(t) ||
    /gracias por confiar/i.test(t) ||
    /quedo atento/i.test(t) ||
    /te escribir[Ã©e]/i.test(t) ||
    /nos pondremos en contacto/i.test(t) ||
    /hemos recibido/i.test(t) ||
    /en breve recibirÃ¡s/i.test(t) ||
    /te enviaremos/i.test(t) ||
    /recibirÃ¡s la propuesta/i.test(t)
  );
}

function shouldMarkChatCompleted(lead, reply) {
  return isCompletedLeadData(lead) && isClosingReply(reply);
}

function isFarewellOrThanks(text = "") {
  const t = normalizeText(text);
  return (
    t === "gracias" ||
    t === "muchas gracias" ||
    t === "ok gracias" ||
    t === "vale gracias" ||
    t === "perfecto gracias" ||
    t === "genial gracias" ||
    t === "no gracias" ||
    t === "gracias de momento" ||
    t === "eso es todo" ||
    t === "nada mas" ||
    t === "nada más" ||
    t === "hasta luego"
  );
}

function looksLikeExplicitBudgetMessage(text = "", lead = null) {
  const raw = String(text || "").trim();
  const t = normalizeText(raw);
  if (!raw) return false;
  if (raw.replace(/\D/g, "").length >= 8) return false;

  if (/^\d{2,6}$/.test(raw)) {
    return normalizeText(lead?.current_step || "") === "ask_budget";
  }

  return (
    /€|eur|euro/i.test(raw) ||
    t.includes("presupuesto") ||
    t.includes("precio") ||
    t.includes("inversion") ||
    t.includes("inversión") ||
    t.includes("al mes") ||
    t.includes("/mes") ||
    t.includes("mensual") ||
    t.includes("cuanto cuesta") ||
    t.includes("cuánto cuesta") ||
    t.includes("entre ")
  );
}

function normalizeBudget(text) {
  const t = String(text || "").trim();
  if (!looksLikeExplicitBudgetMessage(t, null)) return null;

  const m1 = t.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(â‚¬|eur)\b/i);
  if (m1) {
    const n = Number(String(m1[1]).replace(/[.,](?=\d{3}\b)/g, ""));
    if (Number.isFinite(n) && n >= 10) return `${n} â‚¬`;
  }

  const m2 = t.match(/\b(\d{2,6})\b/);
  if (m2) {
    const n = Number(m2[1]);
    if (Number.isFinite(n) && n >= 10) return `${n} â‚¬`;
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
    t.includes("diseÃ±o web") ||
    t.includes("disenar pagina web") ||
    t.includes("diseñar página web") ||
    t.includes("paginas web") ||
    t.includes("páginas web") ||
    t.includes("pagina web") ||
    t.includes("pÃ¡gina web") ||
    t.includes("tienda online") ||
    t.includes("ecommerce") ||
    t.includes("e-commerce") ||
    t === "web"
  ) {
    return "DiseÃ±o Web";
  }
  if (t.includes("consultoria") || t.includes("consultorÃ­a")) {
    return "ConsultorÃ­a Digital";
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
  if (t.includes("clinica") || t.includes("clÃ­nica")) return "clinica";
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
  if (t.includes("clinica") || t.includes("clÃ­nica")) return raw;
  if (t.includes("abogado") || t.includes("bufete")) return raw;
  if (t.includes("dental") || t.includes("dentista")) return raw;
  if (
    /\b(venta|ventas|fabricacion|fabricaciÃƒÂ³n|distribucion|distribuciÃƒÂ³n|comercio|tienda|negocio|servicio|servicios|consultoria|consultorÃƒÂ­a|asesoria|asesorÃƒÂ­a|reparacion|reparaciÃƒÂ³n|instalacion|instalaciÃƒÂ³n|alquiler|formacion|formaciÃƒÂ³n|marketing|publicidad|helados|ropa|comida|restauracion|restauraciÃƒÂ³n|cafeteria|cafeterÃƒÂ­a)\b/i.test(
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
    "me gustarÃ­a",
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
    case "close_ask_name":
      return "Antes de seguir, ¿cómo te llamas?";
    case "close_ask_channel":
      return safeName
        ? `Perfecto, ${safeName}. ¿Cómo prefieres que te mande la propuesta: por WhatsApp o por email?`
        : "Perfecto. ¿Cómo prefieres que te mande la propuesta: por WhatsApp o por email?";
    case "close_ask_phone":
      return safeName
        ? `Perfecto, ${safeName}. Compárteme tu número de WhatsApp y te dejo el siguiente paso preparado por ahí.`
        : "Perfecto. Compárteme tu número de WhatsApp y te dejo el siguiente paso preparado por ahí.";
    case "close_ask_email":
      return safeName
        ? `Perfecto, ${safeName}. Compárteme tu email y te lo preparo por ahí.`
        : "Perfecto. Compárteme tu email y te lo preparo por ahí.";
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

function fixCommonMojibakeText(value = "") {
  return String(value || "")
    .replace(/Â¿/g, "¿")
    .replace(/Â¡/g, "¡")
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ")
    .replace(/Ã/g, "Á")
    .replace(/Ã‰/g, "É")
    .replace(/Ã/g, "Í")
    .replace(/Ã“/g, "Ó")
    .replace(/Ãš/g, "Ú")
    .replace(/Ã‘/g, "Ñ")
    .replace(/mÃ¡s/g, "más")
    .replace(/sÃ­/g, "sí")
    .replace(/anÃ¡lisis/g, "análisis")
    .replace(/cÃ³mo/g, "cómo")
    .replace(/serÃ­a/g, "sería")
    .replace(/aquÃ­/g, "aquí")
    .replace(/ahÃ­/g, "ahí")
    .replace(/nÃºmero/g, "número");
}

function cleanReply(reply) {
  let text = fixCommonMojibakeText(String(reply || "").trim());
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

function hasUsefulLeadDataForNotification(lead) {
  return !!(
    norm(lead?.name) ||
    norm(lead?.email) ||
    norm(lead?.phone) ||
    norm(lead?.interest_service) ||
    norm(lead?.budget_range) ||
    norm(lead?.urgency) ||
    norm(lead?.company_name) ||
    norm(lead?.business_type) ||
    norm(lead?.business_activity) ||
    norm(lead?.main_goal) ||
    norm(lead?.current_situation) ||
    norm(lead?.pain_points) ||
    norm(lead?.preferred_contact_channel)
  );
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
SNAPSHOT DEL ANÃLISIS
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

  const intro = hasAnalysisSnapshot(analysisSnapshot)
    ? "Hola, vengo desde el chat web y quiero seguir por ahí."
    : "Hola, vengo desde el chat web y quiero seguir por WhatsApp.";
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
  if (!hasName(lead)) return false;

  const preferredChannel = normalizeText(lead?.preferred_contact_channel || "");
  if (!preferredChannel.includes("whatsapp")) return false;
  if (!hasPhone(lead)) return false;

  return (
    hasAnalysisSnapshot(snapshot) ||
    hasService(lead) ||
    hasMainGoal(lead) ||
    hasBusinessActivity(lead) ||
    detectStrongCommercialIntent(text)
  );
}

function cleanReplyForWebHandoff(reply, { handoffAvailable = false, channel = "web" } = {}) {
  let text = String(reply || "").trim();
  if (!text) return text;

  if (channel === "web" && handoffAvailable) {
    text = text
      .replace(/te escribir[eÃ©]\s+por whatsapp[^.]*\./gi, "Si te va bien, abre WhatsApp y te sigo por ahí con el contexto de este análisis.")
      .replace(/te contactar[eÃ©]\s+por whatsapp[^.]*\./gi, "Si te va bien, abre WhatsApp y te sigo por ahí con el contexto de este análisis.")
      .replace(/te enviar[eÃ©]\s+[^.]*por whatsapp[^.]*\./gi, "Si te va bien, abre WhatsApp y te sigo por ahí con el contexto de este análisis.")
      .replace(/mientras tanto,\s*preparo la propuesta y te la envÃ­o pronto\./gi, "Cuando me escribas por WhatsApp, continúo desde este punto sin empezar de cero.");
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
    /compÃ¡rteme tu email/i.test(text) ||
    /pasame tu email/i.test(text) ||
    /pÃ¡same tu email/i.test(text) ||
    /por email/i.test(text);

  if (!asksForEmailDirectly) return text;

  const safeName = getSafeLeadName(lead);
  return safeName
    ? `Perfecto, ${safeName}. ¿Cómo prefieres que te mande la propuesta: por WhatsApp o por email?`
    : "Perfecto. ¿Cómo prefieres que te mande la propuesta: por WhatsApp o por email?";
}

function hasGoogleAdsCampaignContext(lead, text = "") {
  const combined = normalizeText(
    [
      lead?.current_situation,
      lead?.summary,
      lead?.pain_points,
      text,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return /(campan|anuncios|cuenta de google ads|conversiones|roas|cpc|cpa|rendimiento|resultado)/i.test(
    combined
  );
}

function sanitizeGoogleAdsWebReply(reply, { lead = null, text = "" } = {}) {
  const service = normalizeText(lead?.interest_service || "");
  if (!service.includes("google ads")) return String(reply || "");
  if (hasGoogleAdsCampaignContext(lead, text)) return String(reply || "");

  const currentReply = String(reply || "").trim();
  if (!currentReply) return currentReply;

  if (
    /diagnostic/i.test(currentReply) ||
    /campa[nñ]a actual/i.test(currentReply) ||
    /como esta funcionando tu campa/i.test(normalizeText(currentReply))
  ) {
    return "Si te va bien, cuéntame si ya tienes campañas activas en Google Ads y qué resultado estás viendo, o si partes de cero y prefieres que te oriente desde ahí.";
  }

  return currentReply;
}

function buildValueThenAskNameReply(analysisSnapshot, lead = null) {
  const focus = norm(analysisSnapshot?.recommended_focus);
  const topPriority = Array.isArray(analysisSnapshot?.priorities)
    ? norm(analysisSnapshot.priorities[0])
    : "";
  const summary = norm(analysisSnapshot?.summary);

  const valueLine =
    focus
      ? `Perfecto. El siguiente paso con mÃ¡s impacto serÃ­a trabajar primero ${focus}.`
      : topPriority
      ? `Perfecto. La prioridad mÃ¡s clara ahora mismo serÃ­a ${topPriority}.`
      : summary
      ? `Perfecto. Viendo lo detectado, hay margen real para mejorar captaciÃ³n y conversiÃ³n con unos ajustes bien enfocados.`
      : `Perfecto. Con lo que ya he visto, sÃ­ tiene sentido profundizar un poco mÃ¡s antes de plantearte el siguiente paso.`;

  if (hasContact(lead) || norm(lead?.preferred_contact_channel)) {
    return `${valueLine}\n\nSi te va bien, sigo contigo desde aquí y te preparo el siguiente paso sin pedirte de nuevo los datos básicos.`;
  }

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
    ? `Hola ${safeName}, continÃºo por aquÃ­ con el contexto de lo que vimos en la web.`
    : "Hola, continÃºo por aquÃ­ con el contexto de lo que vimos en la web.";

  const summaryLine = summary
    ? `He visto que te interesa ${service} y que tu caso va orientado a ${summary}.`
    : `He visto que te interesa ${service} y ya tengo el contexto previo del anÃ¡lisis.`;

  const serviceLine = serviceDescription
    ? `Nuestro servicio de ${service} consiste en ${serviceDescription.charAt(0).toLowerCase()}${serviceDescription.slice(1)}`
    : `Nuestro servicio de ${service} estÃ¡ orientado a mejorar visibilidad, captaciÃ³n y resultados de forma sostenida.`;

  const priorityLine = topPriority
    ? `La primera prioridad que trabajarÃ­a serÃ­a ${topPriority}.`
    : null;

  const budgetLine = feeText
    ? `Para orientarte bien, solemos partir desde ${feeText}. Â¿Con quÃ© presupuesto te gustarÃ­a plantearlo?`
    : "Para orientarte bien, Â¿con quÃ© presupuesto te gustarÃ­a plantearlo?";

  return [intro, summaryLine, serviceLine, priorityLine, budgetLine]
    .filter(Boolean)
    .join("\n\n");
}

function buildWhatsAppReminderHook(lead = {}) {
  const safeName = getSafeLeadName(lead);
  const service = norm(lead?.interest_service) || "tu caso";
  const summary = norm(lead?.summary);

  const intro = safeName
    ? `Hola ${safeName}, te escribo por aquÃ­ por si quieres retomar lo que dejamos pendiente.`
    : "Hola, te escribo por aquÃ­ por si quieres retomar lo que dejamos pendiente.";

  const contextLine = summary
    ? `Por lo que vimos, tu interÃ©s principal va orientado a ${summary}.`
    : `TenÃ­amos pendiente avanzar con ${service}.`;

  return [
    intro,
    contextLine,
    `Si te va bien, te doy una recomendaciÃ³n concreta para avanzar con ${service} o ajustamos el siguiente paso segÃºn tu presupuesto.`,
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
    "Si quieres, seguimos por aquÃ­ y te doy una primera orientaciÃ³n para tu caso.",
  ].join("\n\n");
}

function extractJsonObject(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fencedMatch =
    raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] || raw;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) return null;

  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch (_error) {
    return null;
  }
}

function buildAnalysisFallback({ lead = {}, snapshot = null, messages = [] } = {}) {
  const topUserMessages = (messages || [])
    .filter((item) => item?.role === "user")
    .map((item) => String(item?.content || "").trim())
    .filter(Boolean)
    .slice(-3);

  const summaryParts = [];
  if (lead?.main_goal) summaryParts.push(`Objetivo declarado: ${lead.main_goal}.`);
  if (lead?.current_situation) summaryParts.push(`Situacion actual: ${lead.current_situation}.`);
  if (snapshot?.summary) summaryParts.push(snapshot.summary);
  if (!summaryParts.length && topUserMessages.length) {
    summaryParts.push(`Conversacion reciente: ${topUserMessages.join(" | ")}`);
  }

  return {
    title: `Analisis inicial de ${lead?.interest_service || "oportunidad comercial"}`,
    headline:
      "Diagnostico inicial con foco en claridad comercial, captacion y siguiente accion.",
    summary:
      summaryParts.join(" ") ||
      "Hemos preparado una lectura inicial del caso para detectar prioridades y siguiente paso comercial.",
    findings:
      Array.isArray(snapshot?.findings) && snapshot.findings.length
        ? snapshot.findings.map((item) => ({ title: "Hallazgo", detail: item }))
        : [
            {
              title: "Contexto",
              detail:
                "Ya existe suficiente conversacion para plantear una primera lectura comercial del caso.",
            },
          ],
    quick_wins:
      Array.isArray(snapshot?.priorities) && snapshot.priorities.length
        ? snapshot.priorities.slice(0, 3)
        : [
            "Alinear el mensaje principal con la propuesta de valor.",
            "Hacer mas visible la captacion o siguiente paso.",
          ],
    priorities:
      Array.isArray(snapshot?.priorities) && snapshot.priorities.length
        ? snapshot.priorities.slice(0, 3)
        : [
            "Definir el enfoque con mas impacto comercial.",
            "Convertir el interes en una accion concreta.",
          ],
    next_step:
      lead?.interest_service
        ? `Convertir este analisis en una propuesta priorizada para ${lead.interest_service}.`
        : "Convertir este analisis en una propuesta comercial accionable.",
    source_summary: topUserMessages.join(" | "),
    recommended_service:
      lead?.interest_service || snapshot?.recommended_focus || "",
    source_url: snapshot?.final_url || snapshot?.url || "",
  };
}

async function generateStructuredAnalysisResult({
  lead = {},
  messages = [],
  snapshot = null,
  appConfig = null,
} = {}) {
  const transcript = buildTranscript(messages);
  const prompt = `
Eres un estratega comercial senior de ${appConfig?.brand?.name || "TMedia Global"}.

Devuelve SOLO JSON valido con esta estructura exacta:
{
  "title": string,
  "headline": string,
  "summary": string,
  "findings": [{"title": string, "detail": string}],
  "quick_wins": [string],
  "priorities": [string],
  "next_step": string,
  "source_summary": string,
  "recommended_service": string,
  "source_url": string
}

REGLAS:
- Espanol claro, comercial y profesional.
- El texto final debe poder enviarse al cliente tal cual.
- No menciones CRM, lead, origen del lead, canal preferido, WhatsApp interno, email interno ni instrucciones operativas para el equipo.
- No inventes datos.
- findings: 2 a 4 elementos.
- quick_wins: 2 a 4 elementos.
- priorities: 2 a 4 elementos.
- summary: 3 a 5 frases.
- next_step: una recomendacion accionable y concreta.
- recommended_service debe ser uno de los servicios detectados o una recomendacion razonable.

Lead estructurado:
${JSON.stringify(lead || {}, null, 2)}

Snapshot web:
${JSON.stringify(snapshot || {}, null, 2)}

Conversacion:
${transcript}
`;

  try {
    const result = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const parsed = extractJsonObject(result?.output_text || "");
    if (parsed && typeof parsed === "object") {
      return {
        ...buildAnalysisFallback({ lead, snapshot, messages }),
        ...parsed,
      };
    }
  } catch (error) {
    console.log("analysis generation error", error?.message || error);
  }

  return buildAnalysisFallback({ lead, snapshot, messages });
}

async function buildAnalysisForLead({ lead, account }) {
  const [messages, analysisEvent] = await Promise.all([
    getConversationMessages(lead.conversation_id, 50).catch(() => []),
    getLatestConversationEvent(lead.conversation_id, "analysis_snapshot").catch(
      () => null
    ),
  ]);

  let snapshot = analysisEvent?.payload || null;
  if (!hasAnalysisSnapshot(snapshot)) {
    const urlCandidate =
      extractFirstUrlFromText(lead?.internal_notes || "") ||
      extractFirstUrlFromText(lead?.summary || "") ||
      extractFirstUrlFromText(
        (messages || []).map((item) => String(item?.content || "")).join("\n")
      );

    if (urlCandidate) {
      snapshot = await runLightSiteAnalysis(urlCandidate).catch(() => null);
      if (snapshot) {
        await trackConversationEvent({
          conversation_id: lead.conversation_id,
          event_type: "analysis_snapshot",
          channel: lead?.conversations?.channel || "crm",
          external_user_id:
            lead?.conversations?.external_user_id ||
            lead?.email ||
            lead?.phone ||
            null,
          payload: snapshot,
          account_id: account.id,
        });
      }
    }
  }

  const appConfig = await getAppConfig({ accountId: account.id });
  const structured = sanitizeAnalysisForClient(
    await generateStructuredAnalysisResult({
      lead,
      messages,
      snapshot,
      appConfig,
    }),
    lead
  );

  return {
    analysis: structured,
    snapshot,
    messages,
    appConfig,
  };
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

  const safeName = getSafeLeadName(lead);
  const hasValueDelivered = hasAnalysisSnapshot(analysisSnapshot);
  const hasCommercialContext =
    hasService(lead) || hasMainGoal(lead) || hasBusinessActivity(lead);
  const closeStep = getCommercialCloseStep({
    lead,
    text,
    channel,
    analysisReady: hasAnalysisSnapshot(analysisSnapshot),
    isGreeting: isGreeting(text),
  });

  if (
    !safeName &&
    !detectStrongCommercialIntent(text) &&
    isShortAffirmativeResponse(text) &&
    (hasValueDelivered || hasCommercialContext)
  ) {
    return buildValueThenAskNameReply(analysisSnapshot, lead);
  }

  if (!closeStep) {
    return null;
  }

  if (closeStep === "close_ask_name") {
    return "Antes de seguir, ¿cómo te llamas?";
  }

  if (closeStep === "close_ask_channel") {
    return safeName
      ? `Perfecto, ${safeName}. ¿Cómo prefieres que te mande la propuesta: por WhatsApp o por email?`
      : "Perfecto. ¿Cómo prefieres que te mande la propuesta: por WhatsApp o por email?";
  }

  if (closeStep === "close_ask_phone") {
    return safeName
      ? `Perfecto, ${safeName}. Compárteme tu número de WhatsApp y te dejo el siguiente paso preparado por ahí.`
      : "Perfecto. Compárteme tu número de WhatsApp y te dejo el siguiente paso preparado por ahí.";
  }

  if (closeStep === "close_ask_email") {
    return safeName
      ? `Perfecto, ${safeName}. Compárteme tu email y te lo preparo por ahí.`
      : "Perfecto. Compárteme tu email y te lo preparo por ahí.";
  }

  const preferredChannel = normalizeText(lead?.preferred_contact_channel || "");

  if (closeStep === "close_ready" && isFarewellOrThanks(text)) {
    if (preferredChannel.includes("whatsapp") && hasPhone(lead)) {
      return `Perfecto, ${safeName}. Queda todo preparado para seguir por WhatsApp con el contexto de lo que hemos visto.`;
    }
    if (preferredChannel.includes("email") && lead?.email) {
      return `Perfecto, ${safeName}. Queda todo preparado y te lo envío por email con lo que hemos revisado.`;
    }
    return safeName
      ? `Perfecto, ${safeName}. Queda todo preparado y seguimos desde aquí cuando quieras.`
      : "Perfecto. Queda todo preparado y seguimos desde aquí cuando quieras.";
  }

  if (preferredChannel.includes("whatsapp") && handoff?.whatsapp_url) {
    return hasAnalysisSnapshot(analysisSnapshot)
      ? `Perfecto${safeName ? `, ${safeName}` : ""}. Si te va bien, abre WhatsApp y te sigo por ahí con el contexto de este análisis.\n\nCuando me escribas por WhatsApp, continúo desde este punto sin empezar de cero.`
      : `Perfecto${safeName ? `, ${safeName}` : ""}. Si te va bien, abre WhatsApp y seguimos por ahí con tu propuesta y el siguiente paso ya preparado.`;
  }

  if (preferredChannel.includes("whatsapp") && hasPhone(lead)) {
    return `Perfecto, ${safeName}. Te sigo por WhatsApp con la propuesta y el siguiente paso ya preparado.`;
  }

  if (preferredChannel.includes("email") && lead?.email) {
    return `Perfecto, ${safeName}. Te lo preparo por email con lo que ya hemos revisado.`;
  }

  return null;
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
  const closeStep = isCloseFlowStep(lead?.current_step)
    ? lead.current_step
    : null;
  if (closeStep && closeStep !== "close_ready") {
    return getQuestionForStep(closeStep, lead);
  }

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
              : "Si prefieres WhatsApp, antes dime tu nombre y luego tu nÃºmero.";
          }
          if (preferredChannel.includes("email")) {
            return hasName(lead)
              ? `Perfecto, ${getSafeLeadName(lead) || ""}. Compárteme tu email y te lo preparo por ahí.`
              : "Si prefieres email, antes dime tu nombre y seguimos.";
          }
          return hasName(lead)
            ? `Perfecto, ${getSafeLeadName(lead) || ""}. Si quieres que te deje esto preparado o seguir por un canal más cómodo, compárteme email o WhatsApp y seguimos por ahí.`
            : "Si quieres que te deje esto preparado o seguir por un canal mÃ¡s cÃ³modo, antes dime tu nombre y seguimos.";
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
- Este chat web debe reducir fricciÃ³n.
- Empieza ayudando, no interrogando.
- Ofrece caminos claros: revisar web, SEO, Google Ads o captaciÃ³n.
- Si hay URL o anÃ¡lisis, entrega un mini diagnÃ³stico Ãºtil y breve.
- Si el servicio es Google Ads y todavÃ­a no has visto campaÃ±as ni datos reales, no hables de diagnosticar campaÃ±as como si ya las hubieras analizado.
- En Google Ads, si aÃºn no hay contexto suficiente, pregunta si ya tienen campaÃ±as activas o si parten de cero.
- Solo pide un dato de lead si el usuario ya recibiÃ³ valor o quiere seguir.
${suggestWhatsApp ? "- Si encaja, propone seguir por WhatsApp como continuaciÃ³n cÃ³moda del anÃ¡lisis." : ""}
`,
    closer_whatsapp: `
MODO: closer_whatsapp
- Esto es una continuaciÃ³n natural de un contexto previo, normalmente desde web.
- No reinicies la conversaciÃ³n ni repitas preguntas ya resueltas.
- Usa el anÃ¡lisis previo como punto de partida.
- Resuelve dudas, profundiza solo lo necesario y orienta a cierre o siguiente paso.
- Si falta un dato clave para avanzar, pide solo uno.
`,
    hybrid_whatsapp: `
MODO: hybrid_whatsapp
- Este usuario ha llegado directo a WhatsApp o no hay contexto previo fiable.
- WhatsApp debe descubrir y diagnosticar con tono cercano.
- Puedes ofrecer opciones guiadas, pedir URL o problema y dar un mini diagnÃ³stico si hay material.
- No dependas del chat web para ayudarle.
`,
  };

  const phaseGuidance = {
    discover: `
FASE: descubrimiento
- Tu prioridad es captar atenciÃ³n y orientar.
- No pidas nombre, empresa, urgencia ni contacto al inicio.
- Si aÃºn no hay URL ni problema claro, guÃ­a con opciones muy concretas.
- Haz como mÃ¡ximo una pregunta clara al final.
`,
    diagnose: `
FASE: diagnÃ³stico ligero
- Resume quÃ© has detectado.
- Explica por quÃ© puede afectar a captaciÃ³n, conversiÃ³n o visibilidad.
- SeÃ±ala 2 o 3 prioridades.
- Invita a profundizar o a seguir por un canal cÃ³modo.
- No inventes datos ni exageres.
`,
    deepen: `
FASE: profundizaciÃ³n
- Ya puedes afinar el problema y recoger informaciÃ³n comercial de forma progresiva.
- Pide solo el dato que mÃ¡s desbloquee el siguiente paso.
- No conviertas el mensaje en un formulario.
- No entregues anÃ¡lisis largos adicionales si ya has dado un primer diagnÃ³stico Ãºtil.
- Si todavÃ­a no tienes el nombre, pÃ­delo antes de plantear contacto o continuidad formal.
${missingLeadQuestion ? `- Si necesitas pedir un dato, la mejor pregunta ahora es: "${missingLeadQuestion}"` : ""}
`,
    close: `
FASE: cierre o transiciÃ³n
- Orienta a siguiente paso claro: WhatsApp, email, llamada o propuesta.
- Si faltan datos mÃ­nimos para avanzar, pide solo uno.
- En WhatsApp, cierra por ahÃ­ si el usuario ya viene con intenciÃ³n.
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

Tu tarea es redactar un resumen final Ãºnico de todo el lead usando TODA la conversaciÃ³n, no solo el Ãºltimo tramo.

REGLAS:
- Escribe el resumen en espaÃ±ol.
- Haz un resumen comercial Ãºtil, claro y breve.
- Longitud: 4 a 7 frases.
- Incluye solo informaciÃ³n Ãºtil para ventas.
- Si falta un dato, no lo inventes.
- Prioriza: servicio de interÃ©s, necesidad principal, urgencia, presupuesto, datos de contacto, contexto del negocio, actividad y siguiente paso comercial.
- No pongas etiquetas tipo "Nombre:", "Email:", etc.
- No repitas literalmente frases vacÃ­as como "gracias" o "ok".
- Devuelve solo el resumen final, sin introducciones ni viÃ±etas.

Lead estructurado actual:
${JSON.stringify(lead || {}, null, 2)}

ConversaciÃ³n completa:
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

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nl2brHtml(value = "") {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function buildAutomationBaseUrl(req) {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_BASE_URL ||
    `${req.protocol}://${req.get("host")}`
  );
}

function buildAutomationTemplateVars({ lead, appConfig, previewUrl }) {
  return {
    nombre: getSafeLeadName(lead) || lead?.name || "hola",
    marca: appConfig?.brand?.name || "TMedia Global",
    servicio: lead?.interest_service || "nuestros servicios",
    empresa: lead?.company_name || lead?.business_activity || "tu proyecto",
    presupuesto: lead?.budget_range || "",
    email: lead?.email || "",
    telefono: lead?.phone || "",
    link_presupuesto: previewUrl || "",
    whatsapp_humano: buildHumanAgentWhatsAppUrl(
      lead?.interest_service || "",
      appConfig
    ),
    web_principal: appConfig?.brand?.website_url || "",
  };
}

function renderTemplateString(template = "", vars = {}) {
  return String(template || "").replace(/\{([a-z0-9_]+)\}/gi, (_match, key) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function buildAutomationEmailHtml({ subject, body }) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <h2 style="margin-bottom: 12px;">${escapeHtml(subject || "Seguimos en contacto")}</h2>
      <div style="font-size: 14px; background: #f7f7f7; border: 1px solid #ddd; padding: 14px; border-radius: 8px;">
        ${nl2brHtml(body || "")}
      </div>
    </div>
  `;
}

function getAutomationBaseTimestamp({ flowKey, lead, quote }) {
  if (flowKey === "quote_followup") {
    return quote?.sent_at || quote?.updated_at || null;
  }

  return lead?.created_at || null;
}

function leadEligibleForFlow(flowKey, lead, quote) {
  const crmStatus = normalizeText(lead?.crm_status || "");
  const quoteStatus = normalizeText(lead?.quote_status || "");

  if (["ganado", "perdido"].includes(crmStatus)) return false;

  if (flowKey === "lead_recovery") {
    return !["sent", "accepted", "rejected"].includes(quoteStatus);
  }

  if (flowKey === "quote_followup") {
    return !!quote && quoteStatus === "sent" && quote?.status === "sent";
  }

  return false;
}

function getFlowStepSignature(flowKey, stepIndex) {
  return `${String(flowKey || "")}:${Number(stepIndex)}`;
}

function wasAutomationStepAlreadySent(events = [], flowKey, stepIndex) {
  const signature = getFlowStepSignature(flowKey, stepIndex);
  return events.some(
    (event) => String(event?.payload?.step_signature || "") === signature
  );
}

async function sendAutomationStep({
  lead,
  step,
  template,
  vars,
  accountId,
  conversationId,
}) {
  const channel = String(step?.channel || template?.channel || "").trim().toLowerCase();
  const subject = renderTemplateString(template?.subject || "", vars).trim();
  const body = renderTemplateString(template?.body || "", vars).trim();

  if (!body) {
    throw new Error("La plantilla no tiene cuerpo de mensaje.");
  }

  if (channel === "whatsapp") {
    const phone = normalizeLeadPhoneForWhatsApp(lead);
    if (!phone) {
      return { skipped: true, reason: "no-whatsapp-phone" };
    }

    const sendResult = await sendWhatsAppText(phone, body);
    await saveMessage({
      conversation_id: conversationId,
      role: "assistant",
      content: body,
      account_id: accountId,
    });

    return {
      ok: true,
      via: "whatsapp",
      external_user_id: phone,
      provider_message_id:
        sendResult?.messages?.[0]?.id || sendResult?.contacts?.[0]?.wa_id || null,
      body,
      subject: "",
    };
  }

  if (channel === "email") {
    if (!lead?.email) {
      return { skipped: true, reason: "no-email" };
    }

    const sendResult = await sendTransactionalEmail({
      to: lead.email,
      subject: subject || "Seguimos en contacto",
      text: body,
      html: buildAutomationEmailHtml({
        subject: subject || "Seguimos en contacto",
        body,
      }),
    });

    await saveMessage({
      conversation_id: conversationId,
      role: "tool",
      content: `Email automatico enviado${subject ? ` | ${subject}` : ""}\n\n${body}`,
      account_id: accountId,
    });

    return {
      ok: true,
      via: "email",
      external_user_id: lead.email,
      provider_message_id: sendResult?.messageId || null,
      body,
      subject,
    };
  }

  return { skipped: true, reason: "unsupported-channel" };
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
    const first = candidate.split(/[\|\-Â·]/)[0]?.trim();
    if (first && first.length >= 3) return first;
  }

  return "";
}

function inferServicesFromSnapshot(snapshot = {}, appConfig = null) {
  const defaultServices = getWebsiteFacts(appConfig).services || {};

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
  maybeAdd("Google Ads", ["google ads", "sem", "ppc", "campanas de google", "campaÃ±as de google"]);
  maybeAdd("Redes Sociales", [
    "facebook ads",
    "instagram ads",
    "meta ads",
    "redes sociales",
    "instagram",
    "facebook",
  ]);
  maybeAdd("DiseÃ±o Web", ["diseno web", "diseÃ±o web", "web corporativa", "landing page", "pagina web", "pÃ¡gina web"]);
  maybeAdd("ConsultorÃ­a Digital", ["consultoria", "consultorÃ­a", "estrategia digital", "consultor"]);

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

function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  return raw.split(";").reduce((acc, chunk) => {
    const [key, ...rest] = chunk.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("=") || "");
    return acc;
  }, {});
}

function signSessionToken(payload = {}) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", CRM_AUTH_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", CRM_AUTH_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload?.exp || Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch (_error) {
    return null;
  }
}

function writeSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${CRM_AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(CRM_SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${CRM_AUTH_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

async function attachCrmUser(req, _res, next) {
  try {
    const token = parseCookies(req)[CRM_AUTH_COOKIE];
    const session = verifySessionToken(token);
    if (!session?.user_id) {
      req.crmUser = null;
      return next();
    }

    const user = await getCrmUserById(session.user_id);
    req.crmUser = user;
    return next();
  } catch (_error) {
    req.crmUser = null;
    return next();
  }
}

function requireCrmAuth(role = null) {
  return async function crmAuthMiddleware(req, res, next) {
    if (!req.crmUser) {
      return res.status(401).json({ ok: false, error: "Auth required" });
    }
    if (role && req.crmUser.role !== role) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    return next();
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function probeUrlReachability(url, { method = "GET", timeoutMs = 7000 } = {}) {
  const safeUrl = String(url || "").trim();
  if (!safeUrl) {
    return { ok: false, status: 0, message: "URL vacia" };
  }

  try {
    new URL(safeUrl);
  } catch (_error) {
    return { ok: false, status: 0, message: "URL no valida" };
  }

  try {
    const response = await fetchWithTimeout(
      safeUrl,
      {
        method,
        redirect: "manual",
      },
      timeoutMs
    );

    return {
      ok: response.status > 0 && response.status < 500,
      status: response.status,
      message: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message:
        error?.name === "AbortError"
          ? "Timeout al validar la URL"
          : error?.message || "No se pudo conectar",
    };
  }
}

async function validateIntegrationConfig(type, config = {}) {
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
    if (!WHATSAPP_TOKEN) {
      return buildValidationResult("pending", "Falta WHATSAPP_TOKEN en el backend.", checkedAt);
    }
    if (
      WHATSAPP_PHONE_NUMBER_ID &&
      String(item.phone_number_id).trim() !== String(WHATSAPP_PHONE_NUMBER_ID).trim()
    ) {
      return buildValidationResult(
        "warning",
        "El Phone Number ID configurado no coincide con el activo en backend.",
        checkedAt
      );
    }

    try {
      const response = await fetchWithTimeout(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${item.phone_number_id}?fields=id,display_phone_number,verified_name`,
        {
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          },
        },
        7000
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return buildValidationResult(
          "warning",
          data?.error?.message || `WhatsApp respondio con HTTP ${response.status}.`,
          checkedAt
        );
      }

      return buildValidationResult(
        "connected",
        `WhatsApp validado con ${data?.display_phone_number || item.phone_number_id}.`,
        checkedAt
      );
    } catch (error) {
      return buildValidationResult(
        "warning",
        error?.message || "No se pudo validar WhatsApp contra Meta.",
        checkedAt
      );
    }
  }

  if (type === "lead_forms") {
    const item = integrations.lead_forms || {};
    if (!item.meta_source && !item.google_source) {
      return buildValidationResult("pending", "No hay fuentes de leads definidas.", checkedAt);
    }
    if (!item.sheet_document && !item.webhook_url) {
      return buildValidationResult("pending", "Falta documento de Sheets o webhook principal.", checkedAt);
    }

    const messages = [];
    let hasHardCheck = false;

    if (item.sheet_document) {
      messages.push(`Sheets configurado: ${item.sheet_document}`);
    }

    if (item.webhook_url) {
      const probe = await probeUrlReachability(item.webhook_url, { method: "GET", timeoutMs: 5000 });
      hasHardCheck = true;
      if (probe.ok) {
        messages.push(`Webhook accesible (${probe.message})`);
      } else {
        return buildValidationResult(
          "warning",
          `Webhook principal no accesible: ${probe.message}.`,
          checkedAt
        );
      }
    }

    if (!hasHardCheck && !item.sheet_tabs) {
      return buildValidationResult(
        "warning",
        "La integracion existe, pero falta validar hojas o webhook principal.",
        checkedAt
      );
    }

    return buildValidationResult(
      "connected",
      messages.join(" Â· ") || "Lead forms configurados para entrada unificada.",
      checkedAt
    );
  }

  if (type === "email") {
    const item = integrations.email || {};
    if (!item.from_email) {
      return buildValidationResult("pending", "Falta el email de salida.", checkedAt);
    }
    try {
      await verifyEmailTransport();
      return buildValidationResult(
        "connected",
        `Email validado con proveedor ${item.provider || "smtp"}.`,
        checkedAt
      );
    } catch (error) {
      return buildValidationResult(
        "warning",
        error?.message || "No se pudo validar el transporte SMTP.",
        checkedAt
      );
    }
  }

  if (type === "automations") {
    const item = integrations.automations || {};
    if (!item.workspace_url) {
      return buildValidationResult("pending", "Falta la URL del workspace de automatizacion.", checkedAt);
    }

    const workspaceProbe = await probeUrlReachability(item.workspace_url, {
      method: "GET",
      timeoutMs: 5000,
    });
    if (!workspaceProbe.ok) {
      return buildValidationResult(
        "warning",
        `Workspace no accesible: ${workspaceProbe.message}.`,
        checkedAt
      );
    }

    if (!TASK_SECRET) {
      return buildValidationResult(
        "warning",
        "El workspace responde, pero falta TASK_SECRET para ejecutar tareas automÃ¡ticas.",
        checkedAt
      );
    }

    return buildValidationResult(
      "connected",
      `Automatizaciones listas en ${item.platform || "n8n"} (${workspaceProbe.message}).`,
      checkedAt
    );
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

function applyFlowPatch(
  lead,
  text,
  { channel = "web", analysisSnapshot = null } = {}
) {
  const closeStep = getCommercialCloseStep({
    lead: lead || {},
    text,
    channel,
    analysisReady: hasAnalysisSnapshot(analysisSnapshot),
    isGreeting: isGreeting(text),
  });
  const step = closeStep || lead?.current_step || getCurrentStep(lead || {});
  const patch = {};

  const detectedEmail = detectEmail(text);
  const detectedPhone = detectPhone(text);
  const detectedService = detectService(text);
  const detectedBudget = normalizeBudget(text);
  const detectedBusinessType = detectBusinessType(text);
  const detectedBusinessActivity = detectBusinessActivity(text);
  const detectedGoal = detectMainGoal(text);
  const explicitPreferredChannel = getExplicitPreferredChannel(text);

  if (detectedEmail && !lead?.email) patch.email = detectedEmail;
  if (detectedPhone && !lead?.phone) patch.phone = detectedPhone;
  if (detectedService && !lead?.interest_service) patch.interest_service = detectedService;
  if (explicitPreferredChannel) patch.preferred_contact_channel = explicitPreferredChannel;
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
      normalizeText(text).includes("cuÃ¡nto antes") ||
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
      normalizeText(text).includes("mÃ¡s adelante") ||
      isUnknownResponse(text)
    )
  ) {
    patch.urgency = "baja";
  }

  switch (step) {
    case "ask_name":
    case "close_ask_name":
      if (isLikelyValidName(text)) {
        patch.name = norm(text);
      }
      break;

    case "close_ask_channel":
      if (explicitPreferredChannel) {
        patch.preferred_contact_channel = explicitPreferredChannel;
      }
      break;

    case "close_ask_phone":
      if (detectedPhone) {
        patch.phone = detectedPhone;
        patch.preferred_contact_channel = "whatsapp";
      } else if (explicitPreferredChannel === "email") {
        patch.preferred_contact_channel = "email";
      }
      break;

    case "close_ask_email":
      if (detectedEmail) {
        patch.email = detectedEmail;
        patch.preferred_contact_channel = "email";
      } else if (explicitPreferredChannel === "whatsapp") {
        patch.preferred_contact_channel = "whatsapp";
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
        normalizeText(text).includes("cuÃ¡nto antes") ||
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
        normalizeText(text).includes("mÃ¡s adelante") ||
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
  const nextStep =
    getCommercialCloseStep({
      lead: merged,
      text,
      channel,
      analysisReady: hasAnalysisSnapshot(analysisSnapshot),
      isGreeting: isGreeting(text),
    }) || getCurrentStep(merged);

  return {
    patch,
    nextStep,
    nextQuestion:
      nextStep === "ready_for_ai" || nextStep === "close_ready"
        ? null
        : getQuestionForStep(nextStep, merged),
  };
}

function renderWidgetPreviewHtml({ account, config, baseUrl }) {
  const accountSlug = String(account?.slug || "").trim();
  const brandName = String(config?.brand?.name || account?.name || "Chat IA").trim();

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview widget · ${brandName}</title>
  <style>
    body{margin:0;font-family:Inter,system-ui,sans-serif;background:linear-gradient(180deg,#eef3ff,#f8fbff);color:#172554}
    .wrap{max-width:960px;margin:0 auto;padding:40px 20px 120px}
    .card{padding:28px;border-radius:28px;background:#fff;border:1px solid #d6e1ff;box-shadow:0 24px 60px rgba(37,54,110,.12)}
    .eyebrow{display:inline-block;margin-bottom:10px;color:#6d41f3;font-size:.76rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
    h1{margin:0 0 12px;font-size:2rem}
    p{margin:0;color:#5c6b92;line-height:1.65}
    code{display:block;margin-top:18px;padding:14px 16px;border-radius:18px;background:#f6f9ff;border:1px solid #d6e1ff;white-space:pre-wrap}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <span class="eyebrow">Preview del chat</span>
      <h1>${brandName}</h1>
      <p>Vista rápida para comprobar branding, posición y carga del widget antes de insertarlo en la web del cliente.</p>
      <code>&lt;script src="${baseUrl}/widget.js" data-backend="${baseUrl}" data-account-slug="${accountSlug}" data-position="right"&gt;&lt;/script&gt;</code>
    </section>
  </div>
  <script src="${baseUrl}/widget.js" data-backend="${baseUrl}" data-account-slug="${accountSlug}" data-position="right"></script>
</body>
</html>`;
}

function getAnalysisClientLabel(lead = {}) {
  return lead?.company_name || lead?.business_activity || lead?.name || "la oportunidad";
}

function buildClientFacingAnalysisNextStep(lead = {}, fallback = "") {
  const service = String(lead?.interest_service || "").trim();
  if (service) {
    return `Aterrizar una propuesta inicial y un plan priorizado de ${service} con foco en impacto, claridad y siguiente paso.`;
  }
  return (
    String(fallback || "").trim() ||
    "Aterrizar una propuesta inicial con prioridades claras y siguiente paso accionable."
  );
}

function sanitizeClientFacingAnalysisText(value, lead = {}, { nextStep = false } = {}) {
  let text = String(value || "").trim();
  if (!text) return "";

  const clientLabel = getAnalysisClientLabel(lead);
  text = text
    .replace(/\b[Ee]l lead proveniente de [^.]+\.?\s*/g, `${clientLabel} `)
    .replace(/\b[Ll]ead proveniente de [^.]+\.?\s*/g, `${clientLabel} `)
    .replace(/\b[Ee]l lead\b/g, clientLabel)
    .replace(/\b[Cc]ontactar al cliente(?:\s+v[ií]a|\s+por)?\s+WhatsApp[^.]*\.?/g, "")
    .replace(/\b[Cc]ontactar al cliente(?:\s+v[ií]a|\s+por)?\s+email[^.]*\.?/g, "")
    .replace(/\b[Cc]ontactar al cliente\b[^.]*\.?/g, "")
    .replace(/\b[Ee]scribir por WhatsApp\b/g, "")
    .replace(/\b[Vv][ií]a WhatsApp\b/g, "")
    .replace(/\b[Pp]or WhatsApp\b/g, "")
    .replace(/\b[Pp]or email\b/g, "")
    .replace(/\b[Ee]n CRM\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (nextStep && /(contactar al cliente|whatsapp|email)/i.test(String(value || ""))) {
    return buildClientFacingAnalysisNextStep(lead, text);
  }

  return text;
}

function sanitizeClientFacingAnalysisList(items = [], lead = {}, { objectItems = false } = {}) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") {
        return sanitizeClientFacingAnalysisText(item, lead);
      }
      if (!item || typeof item !== "object") return null;
      const title = sanitizeClientFacingAnalysisText(item.title || "", lead);
      const detail = sanitizeClientFacingAnalysisText(item.detail || item.text || "", lead);
      if (!title && !detail) return null;
      return objectItems ? { title, detail } : detail || title;
    })
    .filter(Boolean);
}

function sanitizeAnalysisForClient(analysis = {}, lead = {}) {
  const source = analysis && typeof analysis === "object" ? analysis : {};
  return {
    ...source,
    title: sanitizeClientFacingAnalysisText(source.title || "", lead),
    headline: sanitizeClientFacingAnalysisText(source.headline || "", lead),
    summary: sanitizeClientFacingAnalysisText(source.summary || "", lead),
    findings: sanitizeClientFacingAnalysisList(source.findings, lead, { objectItems: true }),
    quick_wins: sanitizeClientFacingAnalysisList(source.quick_wins, lead),
    priorities: sanitizeClientFacingAnalysisList(source.priorities, lead),
    next_step: sanitizeClientFacingAnalysisText(source.next_step || "", lead, {
      nextStep: true,
    }),
    source_summary: sanitizeClientFacingAnalysisText(source.source_summary || "", lead),
    recommended_service:
      sanitizeClientFacingAnalysisText(source.recommended_service || "", lead) ||
      lead?.interest_service ||
      "",
    source_url: String(source.source_url || "").trim(),
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

  if (
    incoming.budget_range &&
    !looksLikeExplicitBudgetMessage(userText, leadBefore)
  ) {
    incoming.budget_range = null;
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
    account_id: scopedAccountId,
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
      account_id: scopedAccountId,
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
      account_id: scopedAccountId,
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

  const flow = applyFlowPatch(leadAfter || {}, userText, {
    channel: channel || "web",
    analysisSnapshot,
  });

  if (Object.keys(flow.patch || {}).length > 0) {
    const updatedLead = {
      ...leadAfter,
      ...flow.patch,
      current_step: flow.nextStep,
      last_question: flow.nextQuestion,
    };

    await upsertLeadFromConversation({
      ...updatedLead,
      account_id: scopedAccountId,
      conversation_id: currentConversationId,
    });

    leadAfter = await loadLeadForConversation();
  } else {
    await upsertLeadFromConversation({
      ...leadAfter,
      account_id: scopedAccountId,
      conversation_id: currentConversationId,
      current_step: flow.nextStep,
      last_question: flow.nextQuestion,
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
    const leadForAi = leadAfter || relatedWebLead || {};
    const serviceFacts = getServiceFacts(leadForAi.interest_service, appConfig);

    let factsBlock = "";

    if (serviceFacts) {
      factsBlock = `
INFORMACIÃ“N VERIFICADA DE LA WEB

Servicio: ${leadForAi.interest_service}

Precio mÃ­nimo: ${serviceFacts.min_monthly_fee || serviceFacts.min_project_fee}

PÃ¡gina oficial:
${serviceFacts.url}

Notas:
${serviceFacts.notes}
`;
    }

    let ragContext = "";

    if (
      conversationPhase !== "discover" &&
      (leadForAi.interest_service ||
        hasAnalysisSnapshot(analysisSnapshot) ||
        detectStrongCommercialIntent(userText))
    ) {
      try {
        const docs = await retrieveWebsiteContext(
          `
Servicio: ${leadForAi.interest_service || ""}
Pregunta usuario: ${userText}
Presupuesto: ${leadForAi.budget_range || ""}
Objetivo: ${leadForAi.main_goal || ""}
Negocio: ${leadForAi.business_type || ""}
Actividad: ${leadForAi.business_activity || ""}
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
2. USA INFORMACIÃ“N DE LA WEB Y DEL SNAPSHOT SI ESTÃ DISPONIBLE
3. LOS PRECIOS SIEMPRE DEBEN INCLUIR "+ IVA"
4. NO INVENTES PRECIOS
5. USA LA MEMORIA DEL LEAD PARA DAR CONTINUIDAD
6. SI EL USUARIO HACE UNA PREGUNTA DIRECTA, RESPÃ“NDELA PRIMERO
7. DESPUÃ‰S DE RESPONDER, HAZ COMO MÃXIMO UNA PREGUNTA COMERCIAL
8. SI EXISTE INFORMACIÃ“N VERIFICADA DE LA WEB, USA SOLO ESA INFORMACIÃ“N PARA HABLAR DE PRECIOS
9. NO DES RANGOS DE PRECIOS SI NO ESTÃN EXPLÃCITAMENTE EN LA INFORMACIÃ“N VERIFICADA
10. RESPUESTAS BREVES: MÃXIMO 2 PÃRRAFOS CORTOS
11. NO HAGAS VARIAS PREGUNTAS SEGUIDAS EN EL MISMO MENSAJE
12. NO EMPIECES COMO FORMULARIO
13. DA VALOR ANTES DE PEDIR DATOS
14. SI EL CANAL ES WEB, PRIORIZA DIAGNÃ“STICO Y REDUCCIÃ“N DE FRICCIÃ“N
15. SI EL CANAL ES WHATSAPP CON CONTEXTO PREVIO, CONTINÃšA SIN REINICIAR
16. SI EL CANAL ES WHATSAPP SIN CONTEXTO, COMBINA DESCUBRIMIENTO Y DIAGNÃ“STICO
17. NO PREGUNTES NOMBRE, EMPRESA, URGENCIA O CONTACTO AL PRINCIPIO SI TODAVÃA NO HAS APORTADO VALOR
18. NO SOBRESCRIBAS DATOS CONFIRMADOS CON SUPOSICIONES DÃ‰BILES
19. SI ESTÃS EN WEB, NO DIGAS "TE ESCRIBIRÃ‰ POR WHATSAPP" NI PROMETAS UN CONTACTO SALIENTE MANUAL
20. SI EL USUARIO QUIERE SEGUIR POR WHATSAPP DESDE WEB, PLANTÃ‰ALO COMO CONTINUACIÃ“N POR UN BOTÃ“N O ENLACE
21. SI TODAVÃA NO SE HA ELEGIDO CANAL DE CONTACTO, NO PIDAS EMAIL DIRECTAMENTE: PRIMERO PREGUNTA SI PREFIERE WHATSAPP O EMAIL PARA RECIBIR LA PROPUESTA

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
          ? "Puedo ayudarte a revisar tu web, SEO, Google Ads o captaciÃ³n. Si quieres, pÃ¡same tu URL o dime quÃ© te preocupa mÃ¡s y te doy una primera orientaciÃ³n."
          : "Si quieres, sigo contigo sobre ese punto y te digo cuÃ¡l serÃ­a la prioridad mÃ¡s sensata.";
    }

    reply = sanitizeGoogleAdsWebReply(reply, {
      lead: leadAfter || {},
      text: userText,
    });

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

  const chatCompleted =
    shouldMarkChatCompleted(leadAfter, reply) ||
    (
      isCompletedLeadData(leadAfter) &&
      normalizeText(leadAfter?.current_step || "") === "close_ready" &&
      isFarewellOrThanks(userText)
    );

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
          account_id: scopedAccountId,
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
    const shouldNotify =
      hasUsefulLeadDataForNotification(latestLead) ||
      (chatCompleted && !previousSignature);

    if (shouldNotify && signature !== previousSignature) {
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

app.get("/api/crm/accounts", async (req, res) => {
  try {
    const allAccounts = await listAccounts();
    const activeAccount = await resolveRequestAccount(req);
    const accounts =
      req.crmUser?.role === "super_admin"
        ? allAccounts
        : allAccounts.filter((account) => String(account.id) === String(activeAccount.id));

    res.json({ ok: true, accounts, active_account: activeAccount });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/auth/bootstrap-status", async (_req, res) => {
  try {
    const userCount = await countCrmUsers();
    res.json({ ok: true, needs_bootstrap: userCount === 0 });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/auth/bootstrap-admin", async (req, res) => {
  try {
    const userCount = await countCrmUsers();
    if (userCount > 0) {
      return res.status(400).json({ ok: false, error: "Ya existe al menos un usuario admin." });
    }

    const user = await createCrmUser({
      email: req.body?.email,
      password: req.body?.password,
      display_name: req.body?.display_name,
      role: "super_admin",
      status: "active",
    });

    const token = signSessionToken({
      user_id: user.id,
      role: user.role,
      exp: Date.now() + CRM_SESSION_TTL_MS,
    });
    writeSessionCookie(res, token);

    res.json({ ok: true, user });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const user = await verifyCrmUserCredentials(req.body?.email, req.body?.password);
    if (!user) {
      return res.status(401).json({ ok: false, error: "Credenciales invalidas" });
    }

    const token = signSessionToken({
      user_id: user.id,
      role: user.role,
      exp: Date.now() + CRM_SESSION_TTL_MS,
    });
    writeSessionCookie(res, token);

    res.json({ ok: true, user });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/auth/logout", async (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  try {
    if (!req.crmUser) {
      return res.status(401).json({ ok: false, error: "No authenticated user" });
    }

    const account = req.crmUser.account_id
      ? await resolveAccount(req.crmUser.account_id)
      : null;

    res.json({
      ok: true,
      user: {
        ...req.crmUser,
        account,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/admin/accounts", requireCrmAuth("super_admin"), async (req, res) => {
  try {
    const accounts = await listAccounts();
    const activeAccount = await resolveRequestAccount(req);
    res.json({ ok: true, accounts, active_account: activeAccount });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/admin/accounts", requireCrmAuth("super_admin"), async (req, res) => {
  try {
    const account = await createAccount(req.body || {});
    const requestedProductMode =
      String(req.body?.product_mode || "").trim() === "chat_only"
        ? "chat_only"
        : "full_crm";
    try {
      await saveAppConfig(
        getBlankAppConfig({ productMode: requestedProductMode }),
        { accountId: account.id }
      );
    } catch (_error) {
      // No bloqueamos la creacion de la cuenta si falla el seed inicial de config.
    }
    const adminEmail = String(req.body?.admin_email || "").trim();
    const adminPassword = String(req.body?.admin_password || "").trim();

    let clientAdmin = null;
    if (adminEmail && adminPassword) {
      clientAdmin = await createCrmUser({
        email: adminEmail,
        password: adminPassword,
        display_name: req.body?.admin_display_name || account.name,
        role: "client_admin",
        account_id: account.id,
        status: "active",
      });
    }
    res.json({
      ok: true,
      account: {
        ...account,
        product_mode: requestedProductMode,
      },
      client_admin: clientAdmin,
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("accounts_pkey") || message.includes("accounts_slug_key")) {
      return res.status(400).json({
        ok: false,
        error: "Ya existe una cuenta con ese slug. Usa otro o abre la cuenta ya creada.",
      });
    }
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.patch("/api/admin/accounts/:accountId", requireCrmAuth("super_admin"), async (req, res) => {
  try {
    const account = await updateAccount(req.params.accountId, req.body || {});
    res.json({ ok: true, account });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.delete("/api/admin/accounts/:accountId", requireCrmAuth("super_admin"), async (req, res) => {
  try {
    const activeAccount = await resolveRequestAccount(req);
    if (String(activeAccount?.id || "") === String(req.params.accountId || "")) {
      return res.status(400).json({
        ok: false,
        error: "No puedes borrar la cuenta activa desde esta misma sesion.",
      });
    }

    const result = await deleteAccount(req.params.accountId);
    res.json({ ok: true, deleted: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/admin/overview", requireCrmAuth("super_admin"), async (req, res) => {
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

        const servicesCount = Object.keys(config?.services || {}).length;
        const websiteUrlsCount = Array.isArray(config?.knowledge_sources?.website_urls)
          ? config.knowledge_sources.website_urls.filter(Boolean).length
          : 0;
        const hasSpreadsheetSource =
          Boolean(String(config?.knowledge_sources?.spreadsheet_url || "").trim()) ||
          Boolean(String(config?.knowledge_sources?.spreadsheet_data || "").trim());
        const hasInternalNotes = Boolean(
          String(config?.knowledge_sources?.internal_notes || "").trim()
        );
        const hasBrandIdentity =
          Boolean(String(config?.brand?.name || "").trim()) &&
          (Boolean(String(config?.brand?.website_url || "").trim()) ||
            Boolean(String(config?.brand?.logo_url || "").trim()));
        const hasDeliveryChannels =
          Boolean(String(config?.contact?.public_whatsapp_number || "").trim()) ||
          Boolean(String(config?.contact?.support_email || "").trim()) ||
          Boolean(String(config?.integrations?.whatsapp?.phone_number_id || "").trim()) ||
          Boolean(String(config?.integrations?.email?.from_email || "").trim()) ||
          Boolean(String(config?.integrations?.lead_forms?.webhook_url || "").trim()) ||
          Boolean(String(config?.integrations?.automations?.workspace_url || "").trim());

        const setupChecks = [
          {
            key: "brand",
            label: "Marca",
            ready: hasBrandIdentity,
            hint: hasBrandIdentity ? "Lista" : "Falta marca base",
          },
          {
            key: "offer",
            label: "Oferta",
            ready: servicesCount > 0,
            hint: servicesCount > 0 ? `${servicesCount} servicios` : "Sin servicios",
          },
          {
            key: "context",
            label: "Contexto",
            ready: websiteUrlsCount > 0 || hasSpreadsheetSource || hasInternalNotes,
            hint:
              websiteUrlsCount > 0 || hasSpreadsheetSource || hasInternalNotes
                ? "Fuentes cargadas"
                : "Sin fuentes",
          },
          {
            key: "delivery",
            label: "Entrega",
            ready: hasDeliveryChannels,
            hint: hasDeliveryChannels ? "Canales listos" : "Falta canal",
          },
        ];

        const setupReadyCount = setupChecks.filter((item) => item.ready).length;
        const nextSetupStep =
          setupChecks.find((item) => !item.ready)?.label || "Listo para publicar";
        const setupStatus =
          setupReadyCount === setupChecks.length
            ? "ready"
            : setupReadyCount >= 2
              ? "in_progress"
              : "starting";

        return {
          ...account,
          brand_name: config?.brand?.name || account.name,
          brand_logo_url: config?.brand?.logo_url || "",
          primary_color: config?.brand?.primary_color || "#6d41f3",
          product_mode: config?.product?.mode || "full_crm",
          totals: {
            leads: leads.length,
            quotes_sent: quotesSent,
            quotes_accepted: quotesAccepted,
          },
          setup_health: {
            status: setupStatus,
            progress: `${setupReadyCount}/${setupChecks.length}`,
            ready_count: setupReadyCount,
            total_count: setupChecks.length,
            next_step: nextSetupStep,
            checks: setupChecks,
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

app.get("/crm/widget-preview", async (req, res) => {
  try {
    if (!req.crmUser) {
      return res.status(401).send("Acceso no autorizado");
    }
    const account = await resolveRequestAccount(req);
    const config = await getAppConfig({ accountId: account.id });
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const html = renderWidgetPreviewHtml({ account, config, baseUrl });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.post("/api/crm/config/context-preview", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const currentConfig = await getAppConfig({ accountId: account.id });
    const mergedConfig = mergeAppConfig({
      ...currentConfig,
      ...(req.body || {}),
    });
    const context = buildKnowledgeContext(mergedConfig);
    const websiteUrls = Array.isArray(mergedConfig?.knowledge_sources?.website_urls)
      ? mergedConfig.knowledge_sources.website_urls.filter(Boolean)
      : [];

    res.json({
      ok: true,
      preview: {
        brand_name: mergedConfig?.brand?.name || account.name,
        service_count: Object.keys(getWebsiteFacts(mergedConfig).services || {}).length,
        website_url_count: websiteUrls.length,
        has_spreadsheet_data: Boolean(
          String(mergedConfig?.knowledge_sources?.spreadsheet_data || "").trim()
        ),
        has_internal_notes: Boolean(
          String(mergedConfig?.knowledge_sources?.internal_notes || "").trim()
        ),
        context,
      },
    });
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
    const validation = await validateIntegrationConfig(type, currentConfig);

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
    const account = await resolveRequestAccount(req);
    const updated = await updateLeadCrmFields(req.params.leadId, req.body || {}, {
      accountId: account.id,
    });
    res.json({ ok: true, lead: updated });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

app.patch("/api/crm/leads/:leadId", handleCrmLeadUpdate);
app.post("/api/crm/leads/:leadId", handleCrmLeadUpdate);
app.delete("/api/crm/leads/:leadId", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const deleted = await deleteCrmLeadById(req.params.leadId, {
      accountId: account.id,
    });
    res.json({ ok: true, deleted });
  } catch (error) {
    const message = String(error.message || "");
    const status = message.toLowerCase().includes("no encontrado") ? 404 : 500;
    res.status(status).json({ ok: false, error: error.message });
  }
});

app.get("/api/crm/leads/:leadId/quote", async (req, res) => {
  try {
    const quote = await getLatestQuoteByLeadId(req.params.leadId);
    res.json({ ok: true, quote });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/crm/leads/:leadId/analysis", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const leads = await listCrmLeads({ limit: 500, accountId: account.id });
    const lead =
      leads.find((item) => String(item.id) === String(req.params.leadId)) || null;

    if (!lead) {
      return res.status(404).json({ ok: false, error: "Lead no encontrado" });
    }

    const analysisRaw = await getLatestAnalysisByLeadId(req.params.leadId);
    const analysis = analysisRaw
      ? {
          ...analysisRaw,
          content_json: sanitizeAnalysisForClient(analysisRaw.content_json || {}, lead),
        }
      : null;
    res.json({ ok: true, analysis });
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

app.get("/crm/analysis/:leadId/preview", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const appConfig = await getAppConfig({ accountId: account.id });
    const leads = await listCrmLeads({ limit: 500, accountId: account.id });
    const lead =
      leads.find((item) => String(item.id) === String(req.params.leadId)) || null;

    if (!lead) {
      return res.status(404).send("Lead no encontrado");
    }

    const analysisRaw = await getLatestAnalysisByLeadId(req.params.leadId);
    const analysis = analysisRaw
      ? {
          ...analysisRaw,
          content_json: sanitizeAnalysisForClient(analysisRaw.content_json || {}, lead),
        }
      : null;
    if (!analysis) {
      return res.status(404).send("No hay analisis disponible");
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const configuredLogoUrl = String(appConfig?.brand?.logo_url || "").trim();
    const resolvedLogoUrl = configuredLogoUrl
      ? configuredLogoUrl.startsWith("http")
        ? configuredLogoUrl
        : `${baseUrl}${configuredLogoUrl.startsWith("/") ? "" : "/"}${configuredLogoUrl}`
      : `${baseUrl}/crm/assets/tmedia-global-logo.png`;

    const html = renderAnalysisPreviewHtml({
      lead,
      analysis,
      logoUrl: resolvedLogoUrl,
      brandName: appConfig?.brand?.name || "TMedia Global",
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

app.post("/api/crm/leads/:leadId/analysis/generate", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const leads = await listCrmLeads({ limit: 500, accountId: account.id });
    const lead =
      leads.find((item) => String(item.id) === String(req.params.leadId)) || null;

    if (!lead) {
      return res.status(404).json({ ok: false, error: "Lead no encontrado" });
    }

    const result = await buildAnalysisForLead({ lead, account });
    const saved = await upsertLatestAnalysisForLead(lead, {
      title:
        result.analysis?.title ||
        `Analisis inicial de ${lead?.interest_service || "la oportunidad"}`,
      recommended_service:
        result.analysis?.recommended_service || lead?.interest_service || "",
      source_url:
        result.analysis?.source_url ||
        result.snapshot?.final_url ||
        result.snapshot?.url ||
        "",
      content_json: result.analysis,
      status: "draft",
    });

    await trackConversationEvent({
      conversation_id: lead.conversation_id,
      event_type: "analysis_generated",
      channel: lead?.conversations?.channel || "crm",
      external_user_id:
        lead?.conversations?.external_user_id || lead?.email || lead?.phone || null,
      payload: {
        analysis_id: saved.id,
        lead_id: lead.id,
        recommended_service: saved.recommended_service || null,
      },
      account_id: account.id,
    });

    res.json({ ok: true, analysis: saved });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.put("/api/crm/leads/:leadId/analysis", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const leads = await listCrmLeads({ limit: 500, accountId: account.id });
    const lead =
      leads.find((item) => String(item.id) === String(req.params.leadId)) || null;

    if (!lead) {
      return res.status(404).json({ ok: false, error: "Lead no encontrado" });
    }

    const current = (await getLatestAnalysisByLeadId(req.params.leadId)) || {};
    const nextContent = sanitizeAnalysisForClient(
      {
        ...(current?.content_json || {}),
        ...(req.body?.content_json || {}),
      },
      lead
    );

    const saved = await upsertLatestAnalysisForLead(lead, {
      title: req.body?.title || current?.title || nextContent?.title || "Analisis comercial",
      status: req.body?.status || current?.status || "draft",
      recommended_service:
        req.body?.recommended_service ||
        current?.recommended_service ||
        nextContent?.recommended_service ||
        lead?.interest_service ||
        "",
      source_url: req.body?.source_url || current?.source_url || nextContent?.source_url || "",
      sent_via: current?.sent_via || null,
      sent_at: current?.sent_at || null,
      content_json: nextContent,
    });

    return res.json({ ok: true, analysis: saved });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

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
      return res.status(400).json({ ok: false, error: "Canal de envÃ­o no vÃ¡lido" });
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
        return res.status(400).json({ ok: false, error: "Este lead no tiene telÃ©fono vÃ¡lido para WhatsApp" });
      }

      const message = [
        `Hola${lead?.name ? ` ${lead.name}` : ""}, te compartimos tu propuesta de ${lead?.interest_service || "TMedia Global"}.`,
        quote?.title ? `Propuesta: ${quote.title}` : null,
        `Puedes revisarla aquÃ­: ${previewUrl}`,
        "Si quieres, la comentamos contigo y la ajustamos antes de cerrarla.",
        `Si prefieres hablar con un agente humano, puedes escribir aquÃ­: ${humanAgentUrl}`,
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

app.post("/api/crm/leads/:leadId/analysis/send", async (req, res) => {
  try {
    const account = await resolveRequestAccount(req);
    const appConfig = await getAppConfig({ accountId: account.id });
    const leads = await listCrmLeads({ limit: 500, accountId: account.id });
    const lead =
      leads.find((item) => String(item.id) === String(req.params.leadId)) || null;

    if (!lead) {
      return res.status(404).json({ ok: false, error: "Lead no encontrado" });
    }

    if (!lead.email) {
      return res.status(400).json({ ok: false, error: "Este lead no tiene email" });
    }

    let analysis = await getLatestAnalysisByLeadId(req.params.leadId);
    if (!analysis) {
      const result = await buildAnalysisForLead({ lead, account });
      analysis = await upsertLatestAnalysisForLead(lead, {
        title:
          result.analysis?.title ||
          `Analisis inicial de ${lead?.interest_service || "la oportunidad"}`,
        recommended_service:
          result.analysis?.recommended_service || lead?.interest_service || "",
        source_url:
          result.analysis?.source_url ||
          result.snapshot?.final_url ||
          result.snapshot?.url ||
          "",
        content_json: result.analysis,
        status: "draft",
      });
    }

    analysis = {
      ...analysis,
      content_json: sanitizeAnalysisForClient(analysis.content_json || {}, lead),
    };

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const previewUrl = `${baseUrl}/crm/analysis/${lead.id}/preview`;
    const humanAgentUrl = buildHumanAgentWhatsAppUrl(
      lead?.interest_service || "",
      appConfig
    );

    const subject = analysis?.title
      ? `${analysis.title} - ${appConfig?.brand?.name || "TMedia Global"}`
      : `Analisis inicial - ${appConfig?.brand?.name || "TMedia Global"}`;

    const html = renderAnalysisEmailHtml({
      lead,
      analysis,
      previewUrl,
      humanAgentUrl,
      brandName: appConfig?.brand?.name || "TMedia Global",
    });

    const text = [
      `Hola${lead?.name ? ` ${lead.name}` : ""},`,
      "",
      `Te compartimos tu analisis inicial sobre ${analysis?.recommended_service || lead?.interest_service || "tu caso"}.`,
      "",
      `Abrir analisis: ${previewUrl}`,
      humanAgentUrl ? `Hablar con un agente: ${humanAgentUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    await sendTransactionalEmail({
      to: lead.email,
      subject,
      text,
      html,
    });

    const updated = await markLatestAnalysisAsSent(lead.id, "email");

    await trackConversationEvent({
      conversation_id: lead.conversation_id,
      event_type: "analysis_sent",
      channel: lead?.conversations?.channel || "crm",
      external_user_id:
        lead?.conversations?.external_user_id || lead?.email || lead?.phone || null,
      payload: {
        analysis_id: updated.id,
        lead_id: lead.id,
        sent_via: "email",
      },
      account_id: account.id,
    });

    res.json({ ok: true, analysis: updated });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
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
      name: leadPayload.name,
      email: leadPayload.email,
      phone: leadPayload.phone,
      company_name: leadPayload.company_name,
      interest_service: leadPayload.interest_service,
      summary: leadPayload.summary,
      main_goal: leadPayload.main_goal,
      current_situation: leadPayload.current_situation,
      pain_points: leadPayload.pain_points,
      preferred_contact_channel: leadPayload.preferred_contact_channel,
      source_platform: sourcePlatform,
      source_campaign: sourceCampaign,
      source_form_name: sourceFormName,
      source_ad_name: sourceAdName,
      source_adset_name: sourceAdsetName,
      crm_status: "nuevo",
      quote_status: "sin_presupuesto",
      assigned_to: null,
      next_action: sourcePlatform === "google_ads" || sourcePlatform === "meta_ads"
        ? "Revisar lead ads y primer contacto"
        : "Revisar lead entrante",
      follow_up_at: null,
      internal_notes: [
        `Lead importado desde ${sourcePlatform}`,
        sourceCampaign ? `CampaÃ±a: ${sourceCampaign}` : null,
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
      autoStart === "sÃ­";

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

async function runAutomationFlowsForAccount({
  account,
  appConfig,
  baseUrl,
  limit = 500,
}) {
  const leads = await listCrmLeads({ limit, accountId: account.id });
  const processed = [];

  for (const lead of leads) {
    const conversationId = lead?.conversation_id;
    if (!conversationId) continue;

    const automationEvents = await listConversationEventsByType(
      conversationId,
      "automation_step_sent",
      100,
      account.id
    );

    const flowEntries = Object.entries(appConfig?.automation_flows || {});

    for (const [flowKey, flow] of flowEntries) {
      if (flow?.enabled === false) continue;

      const needsQuote = flowKey === "quote_followup";
      const quote = needsQuote ? await getLatestQuoteByLeadId(lead.id).catch(() => null) : null;
      if (!leadEligibleForFlow(flowKey, lead, quote)) continue;

      const baseTimestamp = getAutomationBaseTimestamp({ flowKey, lead, quote });
      const baseDate = baseTimestamp ? new Date(baseTimestamp) : null;
      if (!baseDate || Number.isNaN(baseDate.getTime())) continue;

      const previewUrl = quote
        ? `${baseUrl}/crm/quotes/${lead.id}/preview?account_id=${encodeURIComponent(account.id)}`
        : "";
      const vars = buildAutomationTemplateVars({
        lead,
        appConfig,
        previewUrl,
      });

      const steps = Array.isArray(flow?.steps) ? flow.steps : [];
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        if (!step || step.active === false) continue;
        if (wasAutomationStepAlreadySent(automationEvents, flowKey, index)) continue;

        const delayValue = Number(step.delay_value || 0);
        const delayUnit = String(step.delay_unit || "hours").trim().toLowerCase();
        const multiplier =
          delayUnit === "minutes" ? 60_000 : delayUnit === "days" ? 86_400_000 : 3_600_000;
        const dueAt = baseDate.getTime() + Math.max(0, delayValue) * multiplier;
        if (Date.now() < dueAt) continue;

        const template = appConfig?.message_templates?.[step.template_key] || null;
        if (!template) continue;

        const sendResult = await sendAutomationStep({
          lead,
          step,
          template,
          vars,
          accountId: account.id,
          conversationId,
        });

        if (sendResult?.ok) {
          const eventPayload = {
            flow_key: flowKey,
            flow_label: flow?.label || flowKey,
            step_index: index,
            step_signature: getFlowStepSignature(flowKey, index),
            template_key: step.template_key,
            channel: sendResult.via,
            provider_message_id: sendResult.provider_message_id || null,
            scheduled_from: baseDate.toISOString(),
            delay_value: step.delay_value,
            delay_unit: step.delay_unit,
            subject: sendResult.subject || null,
            body_preview: String(sendResult.body || "").slice(0, 500),
          };

          await trackConversationEvent({
            conversation_id: conversationId,
            event_type: "automation_step_sent",
            channel: sendResult.via,
            external_user_id: sendResult.external_user_id,
            account_id: account.id,
            payload: eventPayload,
          });

          processed.push({
            account_id: account.id,
            lead_id: lead.id,
            conversation_id: conversationId,
            flow_key: flowKey,
            step_index: index,
            via: sendResult.via,
          });
        }
      }
    }
  }

  return processed;
}

async function runAutomationFlowsTask({
  accountInput = null,
  baseUrl,
  limit = 500,
} = {}) {
  const accounts = accountInput
    ? [await resolveAccount(accountInput)]
    : await listAccounts();

  const processed = [];
  for (const account of accounts) {
    if (!account?.id) continue;
    const appConfig = await getAppConfig({ accountId: account.id });
    const accountProcessed = await runAutomationFlowsForAccount({
      account,
      appConfig,
      baseUrl,
      limit,
    });
    processed.push(...accountProcessed);
  }

  return {
    ok: true,
    processed_count: processed.length,
    processed,
    accounts_checked: accounts.map((account) => account.id),
  };
}

async function runWhatsAppFollowupsTask() {
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

  return {
    ok: true,
    hours_threshold: WHATSAPP_FOLLOWUP_HOURS,
    processed_count: processed.length,
    processed,
  };
}

async function runSchedulerJob(jobName, fn) {
  const runningKey = jobName === "automation" ? "automationRunning" : "whatsappRunning";
  if (schedulerState[runningKey]) {
    console.log(`[scheduler] skip ${jobName}: previous run still active`);
    return;
  }

  schedulerState[runningKey] = true;
  const startedAt = Date.now();

  try {
    const result = await fn();
    console.log(`[scheduler] ${jobName} ok`, {
      processed_count: result?.processed_count || 0,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (error) {
    console.log(`[scheduler] ${jobName} error`, error);
  } finally {
    schedulerState[runningKey] = false;
  }
}

function startInternalScheduler() {
  if (!ENABLE_INTERNAL_SCHEDULER) {
    console.log("[scheduler] internal scheduler disabled");
    return;
  }

  console.log("[scheduler] internal scheduler enabled", {
    automation_interval_minutes: SCHEDULER_AUTOMATION_INTERVAL_MINUTES,
    whatsapp_interval_minutes: SCHEDULER_WHATSAPP_INTERVAL_MINUTES,
    startup_delay_ms: SCHEDULER_STARTUP_DELAY_MS,
  });

  setTimeout(() => {
    runSchedulerJob("automation", () =>
      runAutomationFlowsTask({
        baseUrl: process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || `http://localhost:${PORT}`,
        limit: 500,
      })
    );
    runSchedulerJob("whatsapp", () => runWhatsAppFollowupsTask());
  }, SCHEDULER_STARTUP_DELAY_MS);

  setInterval(() => {
    runSchedulerJob("automation", () =>
      runAutomationFlowsTask({
        baseUrl: process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || `http://localhost:${PORT}`,
        limit: 500,
      })
    );
  }, SCHEDULER_AUTOMATION_INTERVAL_MINUTES * 60 * 1000);

  setInterval(() => {
    runSchedulerJob("whatsapp", () => runWhatsAppFollowupsTask());
  }, SCHEDULER_WHATSAPP_INTERVAL_MINUTES * 60 * 1000);
}

app.post("/tasks/automation-flows", async (req, res) => {
  try {
    if (!isAuthorizedTaskRequest(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized task request" });
    }

    const result = await runAutomationFlowsTask({
      accountInput: req.query?.account_id || req.body?.account_id || null,
      baseUrl: buildAutomationBaseUrl(req),
      limit: Number(req.body?.limit || req.query?.limit || 500),
    });

    return res.json(result);
  } catch (error) {
    console.log("automation flows task error", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/tasks/whatsapp-followups", async (req, res) => {
  try {
    if (!isAuthorizedTaskRequest(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized task request" });
    }

    const result = await runWhatsAppFollowupsTask();
    return res.json(result);
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
  startInternalScheduler();
});

