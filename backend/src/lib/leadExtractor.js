// backend/src/lib/leadExtractor.js

const SERVICE_ALIASES = [
  {
    key: "Google Ads",
    patterns: [
      /google\s*ads/i,
      /\bsem\b/i,
      /campañ(a|as)\s+google/i,
      /anuncios\s+en\s+google/i,
    ],
  },
  {
    key: "SEO",
    patterns: [
      /\bseo\b/i,
      /posicionamiento/i,
      /org[aá]nico/i,
      /salir\s+en\s+google/i,
    ],
  },
  {
    key: "Publicidad en Redes Sociales",
    patterns: [
      /publicidad\s+en\s+redes/i,
      /redes\s+sociales/i,
      /meta\s*ads/i,
      /facebook\s*ads/i,
      /instagram\s*ads/i,
    ],
  },
  {
    key: "Diseño Web",
    patterns: [
      /diseñ(o|ar)\s+web/i,
      /hacer\s+(una\s+)?web/i,
      /crear\s+(una\s+)?web/i,
      /p[aá]gina\s+web/i,
      /web\s+corporativa/i,
      /\bwordpress\b/i,
      /\bshopify\b/i,
      /\bwoocommerce\b/i,
      /\bprestashop\b/i,
      /\bmagento\b/i,
      /tienda\s+online/i,
      /\becommerce\b/i,
      /\be-commerce\b/i,
    ],
  },
  {
    key: "Consultoría Digital",
    patterns: [
      /consultor(í|i)a\s+digital/i,
      /estrategia\s+digital/i,
    ],
  },
  {
    key: "Automatización",
    patterns: [
      /automatiz/i,
      /\bzapier\b/i,
      /\bn8n\b/i,
      /\bmake\b/i,
      /\bcrm\b/i,
    ],
  },
  {
    key: "IA",
    patterns: [
      /\bia\b/i,
      /chatbot/i,
      /agente\s+ia/i,
      /inteligencia\s+artificial/i,
    ],
  },
  {
    key: "Diseño Web",
    patterns: [
      /diseñar\s+(una\s+)?p[aá]gina\s+web/i,
      /diseñar\s+(una\s+)?tienda\s+online/i,
      /paginas?\s+web/i,
      /tienda\s+online/i,
      /\becommerce\b/i,
      /\be-commerce\b/i,
    ],
  },
];

const GENERIC_SERVICES = new Set(["IA", "Automatización"]);

const NAME_STOPWORDS = new Set([
  "si",
  "sí",
  "prefiero",
  "hola",
  "buenas",
  "gracias",
  "favor",
  "por",
  "vale",
  "ok",
  "perfecto",
  "genial",
  "declaras",
  "hacienda",
  "quiero",
  "necesito",
  "busco",
  "pregunta",
  "presupuesto",
  "urgencia",
  "prioridad",
  "alta",
  "media",
  "baja",
  "servicio",
  "email",
  "correo",
  "mail",
  "whatsapp",
  "wasap",
  "whats",
  "telefono",
  "teléfono",
  "numero",
  "número",
  "mi",
  "me",
  "llamo",
  "soy",
  "somos",
  "nombre",
  "es",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "para",
  "con",
  "sin",
  "ads",
  "seo",
  "web",
  "google",
  "meta",
  "instagram",
  "facebook",
  "ia",
  "chatbot",
  "empresa",
  "negocio",
  "autonomo",
  "autónomo",
  "proyecto",
  "tienda",
  "online",
  "ropa",
  "catalogo",
  "catálogo",
  "mantenimiento",
  "soporte",
  "pasarela",
  "pago",
  "pagos",
  "emailing",
  "ecommerce",
  "e-commerce",
  "shopify",
  "woocommerce",
  "prestashop",
  "magento",
  "wordpress",
  "plugin",
  "plugins",
  "cms",
  "tengo",
  "tenemos",
  "dedico",
  "dedicamos",
]);

export function isGenericService(service) {
  return GENERIC_SERVICES.has(String(service || ""));
}

function cleanText(text = "") {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeText(text = "") {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toTitleCase(str = "") {
  return String(str || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLocaleLowerCase("es-ES");
      return lower.charAt(0).toLocaleUpperCase("es-ES") + lower.slice(1);
    })
    .join(" ");
}

function isNegativeResponse(text = "") {
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

function isUnknownResponse(text = "") {
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

export function looksLikeValidName(name = "") {
  const value = cleanText(name);
  const normalized = normalizeText(value);

  if (!value) return false;
  if (value.length < 2 || value.length > 40) return false;
  if (/\d/.test(value)) return false;
  if (/[?!=@#$%^&*()_+=[\]{};:"\\|<>/]/.test(value)) return false;
  if (isLikelyQuestion(value)) return false;
  if (isNegativeResponse(value) || isUnknownResponse(value)) return false;
  if (isLikelyServiceIntent(value)) return false;

  const blockedPhrases = [
    "si por favor",
    "sí por favor",
    "por favor",
    "si gracias",
    "sí gracias",
    "prefiero por whatsapp",
    "prefiero whatsapp",
    "por whatsapp",
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
    "e-commerce",
    "tengo una",
    "tenemos una",
    "me dedico",
    "nos dedicamos",
    "soy autonomo",
    "soy autónomo",
  ];

  if (blockedPhrases.some((p) => normalized.includes(p))) return false;

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 3) return false;

  for (const word of words) {
    const w = normalizeText(word);
    if (w.length < 2) return false;
    if (NAME_STOPWORDS.has(w)) return false;
  }

  return /^[\p{L}]+(?:[\s'-][\p{L}]+){0,2}$/u.test(value);
}

function extractEmail(text = "") {
  const m = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].trim().toLowerCase() : null;
}

function extractPhone(text = "") {
  const cleaned = String(text).replace(/[().-]/g, " ").replace(/\s+/g, " ");
  const m = cleaned.match(/(\+?\d{1,3}\s*)?(\d[\d\s]{7,14}\d)/);
  if (!m) return null;

  const digits = m[0].replace(/\D/g, "");
  return digits.length >= 9 ? digits : null;
}

function isLikelyQuestion(text = "") {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;
  if (t.includes("?")) return true;

  return /^(que|qué|como|cómo|cuando|cuándo|donde|dónde|por que|por qué|cuanto|cuánto|declaras|puedes|tienes|ofreces)\b/i.test(
    t
  );
}

function isLikelyServiceIntent(text = "") {
  const t = normalizeText(text);

  return (
    t.includes("google ads") ||
    t.includes("seo") ||
    t.includes("meta ads") ||
    t.includes("facebook ads") ||
    t.includes("instagram ads") ||
    t.includes("redes sociales") ||
    t.includes("publicidad") ||
    t.includes("diseno web") ||
    t.includes("diseño web") ||
    t.includes("pagina web") ||
    t.includes("página web") ||
    t.includes("consultoria") ||
    t.includes("consultoría") ||
    t.includes("automatiz") ||
    t.includes("chatbot") ||
    t.includes("agente ia") ||
    t.includes("inteligencia artificial")
  );
}

function extractNameFromPhrases(text = "") {
  const t = cleanText(text);

  const patterns = [
    /\bme llamo\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,2})\b/i,
    /\bmi nombre es\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,2})\b/i,
    /\bsoy\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,2})\b/i,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1] && looksLikeValidName(m[1])) {
      return toTitleCase(m[1].trim());
    }
  }

  return null;
}

function extractStandaloneName(text = "") {
  const t = cleanText(text).replace(/[.,;:!?]+$/g, "");

  if (!t) return null;
  if (isLikelyQuestion(t)) return null;
  if (t.includes("@")) return null;
  if (/\d/.test(t)) return null;
  if (!looksLikeValidName(t)) return null;

  return toTitleCase(t);
}

function shouldAcceptStandaloneName(existingLead = null, text = "") {
  const currentStep = normalizeText(existingLead?.current_step || "");
  if (currentStep === "ask_name" || currentStep === "close_ask_name") return true;

  const normalized = normalizeText(text);
  if (
    normalized.startsWith("me llamo ") ||
    normalized.startsWith("mi nombre es ") ||
    normalized.startsWith("soy ")
  ) {
    return true;
  }

  return false;
}

function extractUrgency(text = "") {
  const t = String(text).toLowerCase();

  if (
    /\b(urgente|muy urgente|inmediato|inmediata|hoy|ya|esta\s+semana|cuanto\s+antes|cuánto\s+antes|lo\s+antes\s+posible|prioridad\s+alta|alta\s+prioridad|mi\s+prioridad\s+es\s+alta|urgencia\s+alta)\b/i.test(
      t
    )
  ) {
    return "alta";
  }

  if (
    /\b(este\s+mes|pronto|en\s+breve|prioridad\s+media|media\s+prioridad|mi\s+prioridad\s+es\s+media|urgencia\s+media)\b/i.test(
      t
    )
  ) {
    return "media";
  }

  if (
    /\b(sin\s+prisa|más\s+adelante|m[aá]s\s+adelante|en\s+unos\s+meses|prioridad\s+baja|baja\s+prioridad|mi\s+prioridad\s+es\s+baja|urgencia\s+baja)\b/i.test(
      t
    )
  ) {
    return "baja";
  }

  const m = t.match(
    /\b(?:mi\s+)?(?:prioridad|urgencia)\s+(?:es\s+)?(alta|media|baja)\b/i
  );
  return m?.[1] ? m[1].toLowerCase() : null;
}

function extractBudget(text = "") {
  const t = String(text);

  const between = t.match(
    /entre\s+(\d{2,6})\s*(€|eur)?\s+y\s+(\d{2,6})\s*(€|eur)?/i
  );
  if (between) return `${between[1]}-${between[3]} €`;

  const simple = t.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(€|eur)\b/i);
  if (simple) {
    const num = Number(String(simple[1]).replace(/[.,](?=\d{3}\b)/g, ""));
    if (Number.isFinite(num) && num >= 10) return `${num} €`;
  }

  const normalized = normalizeText(t);
  if (normalized.includes("menos de 500")) return "menos de 500 €";
  if (normalized.includes("alrededor de 500")) return "500 €";
  if (normalized.includes("alrededor de 1000")) return "1000 €";

  return null;
}

function pickService(text = "", existingService = null) {
  const t = String(text);

  for (const s of SERVICE_ALIASES) {
    if (s.patterns.some((re) => re.test(t))) return s.key;
  }

  return existingService || null;
}

function extractConsent(text = "") {
  const t = String(text).toLowerCase();

  if (
    /(no\s+acepto|no\s+consiento|no\s+me\s+contacten|no\s+contactar)/i.test(t)
  ) {
    return false;
  }

  if (/(acepto|consiento|autorizo|pueden\s+contactarme)/i.test(t)) {
    return true;
  }

  return null;
}

function extractBusinessType(text = "") {
  const raw = cleanText(text);
  const t = normalizeText(raw);

  if (!raw) return null;
  if (isNegativeResponse(raw)) return "proyecto personal";
  if (t.includes("autonom")) return "autonomo";
  if (t.includes("empresa")) return "empresa";
  if (t.includes("negocio")) return "negocio";
  if (t.includes("proyecto")) return "proyecto";
  if (t.includes("tienda online") || t.includes("ecommerce") || t.includes("e-commerce")) {
    return "ecommerce";
  }
  if (t.includes("clinica") || t.includes("clínica")) return "clinica";
  if (t.includes("agencia")) return "agencia";
  if (t.includes("despacho")) return "despacho";

  return null;
}

function extractBusinessActivity(text = "") {
  const raw = cleanText(text);
  const t = normalizeText(raw);

  if (!raw) return null;
  if (isLikelyQuestion(raw)) return null;
  if (looksLikeValidName(raw)) return null;
  if (extractEmail(raw) || extractPhone(raw)) return null;
  if (pickService(raw, null)) return null;

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

  return null;
}

function extractMainGoal(text = "") {
  const raw = cleanText(text);
  const t = normalizeText(raw);

  if (!raw) return null;
  if (isLikelyQuestion(raw)) return null;
  if (looksLikeValidName(raw)) return null;

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

function extractPreferredContactChannel({ text = "", email, phone }) {
  const normalized = normalizeText(text);

  if (
    /\bwhatsapp\b/.test(normalized) ||
    /\bwasap\b/.test(normalized) ||
    /\bwhats\b/.test(normalized)
  ) {
    return "whatsapp";
  }

  if (
    /\bemail\b/.test(normalized) ||
    /\bcorreo\b/.test(normalized) ||
    /\bmail\b/.test(normalized)
  ) {
    return "email";
  }

  return null;
}

function extractLastIntent({ text, interest_service, main_goal }) {
  if (interest_service) {
    return `interes_${interest_service.toLowerCase().replace(/\s+/g, "_")}`;
  }

  if (main_goal) return "objetivo_comercial";
  if (isLikelyQuestion(text)) return "pregunta";

  return null;
}

function calculateLeadScore({
  name,
  email,
  phone,
  interest_service,
  budget_range,
  urgency,
  business_type,
  business_activity,
  main_goal,
}) {
  let lead_score = 0;

  if (name) lead_score += 15;
  if (email) lead_score += 15;
  if (phone) lead_score += 15;
  if (interest_service) lead_score += 15;
  if (business_type) lead_score += 10;
  if (business_activity) lead_score += 10;
  if (main_goal) lead_score += 10;
  if (budget_range) lead_score += 10;
  if (urgency === "alta") lead_score += 10;
  if (urgency === "media") lead_score += 5;

  return Math.min(100, lead_score);
}

export function extractLeadDataFromText(text, existingLead = null) {
  const safeText = String(text || "");

  const email = extractEmail(safeText);
  const phone = extractPhone(safeText);
  const nameFromPhrase = extractNameFromPhrases(safeText);
  const name =
    nameFromPhrase ||
    (shouldAcceptStandaloneName(existingLead, safeText)
      ? extractStandaloneName(safeText)
      : null);
  const interest_service = pickService(safeText, existingLead?.interest_service || null);
  const urgency = extractUrgency(safeText);
  const budget_range = extractBudget(safeText);
  const consent = extractConsent(safeText);
  const business_type = extractBusinessType(safeText);
  const business_activity = extractBusinessActivity(safeText);
  const main_goal = extractMainGoal(safeText);
  const preferred_contact_channel = extractPreferredContactChannel({
    text: safeText,
    email,
    phone,
  });
  const last_intent = extractLastIntent({
    text: safeText,
    interest_service,
    main_goal,
  });

  const lead_score = calculateLeadScore({
    name,
    email,
    phone,
    interest_service,
    budget_range,
    urgency,
    business_type,
    business_activity,
    main_goal,
  });

  return {
    name,
    email,
    phone,
    interest_service,
    urgency,
    budget_range,
    summary: safeText.slice(0, 500),
    lead_score,
    consent,
    consent_at: consent === true ? new Date().toISOString() : null,

    // nuevos campos para el flujo
    business_type,
    business_activity,
    company_name: null,
    main_goal,
    current_situation: null,
    pain_points: null,
    preferred_contact_channel,
    last_intent,
  };
}
