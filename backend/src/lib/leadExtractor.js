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
    patterns: [/\bseo\b/i, /posicionamiento/i, /org[aá]nico/i, /salir\s+en\s+google/i],
  },
  {
    key: "Publicidad en Redes Sociales",
    patterns: [
      /publicidad\s+en\s+redes/i,
      /redes\s+sociales/i,
      /meta\s*ads/i,
      /facebook\s*ads/i,
      /instagram\s*ads/i,
      /anuncios\s+en\s+instagram/i,
      /anuncios\s+en\s+facebook/i,
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
    ],
  },
  {
    key: "Consultoría Digital",
    patterns: [
      /consultor(í|i)a\s+digital/i,
      /consultor(a|ía)\s+de\s+marketing/i,
      /estrategia\s+digital/i,
    ],
  },
  {
    key: "Automatización",
    patterns: [/automatiz/i, /\bzapier\b/i, /\bn8n\b/i, /\bmake\b/i, /\bcrm\b/i],
  },
  {
    key: "IA",
    patterns: [/\bia\b/i, /chatbot/i, /agente\s+ia/i, /inteligencia\s+artificial/i],
  },
];

const GENERIC_SERVICES = new Set(["IA", "Automatización"]);

const NAME_STOPWORDS = new Set([
  "hola",
  "buenas",
  "gracias",
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
  "telefono",
  "teléfono",
  "numero",
  "número",
  "mi",
  "me",
  "llamo",
  "soy",
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
  "consultoría",
  "consultoria",
]);

export function isGenericService(service) {
  return GENERIC_SERVICES.has(String(service || ""));
}

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function toTitleCase(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/\b([a-záéíóúüñ])/gi, (m) => m.toUpperCase());
}

function extractEmail(text) {
  const m = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].trim().toLowerCase() : null;
}

function extractPhone(text) {
  const cleaned = String(text || "")
    .replace(/[().-]/g, " ")
    .replace(/\s+/g, " ");

  const m = cleaned.match(/(\+?\d{1,3}\s*)?(\d[\d\s]{7,14}\d)/);
  if (!m) return null;

  const digits = m[0].replace(/\D/g, "");
  return digits.length >= 9 ? digits : null;
}

function isLikelyQuestion(text) {
  const t = cleanText(text).toLowerCase();

  if (!t) return false;
  if (t.includes("?")) return true;

  return /^(que|qué|como|cómo|cuando|cuándo|donde|dónde|por que|por qué|cuanto|cuánto|declaras|puedes|tienes|ofreces|hacéis|haceis|trabajáis|trabajais)\b/i.test(
    t
  );
}

export function looksLikeValidName(name) {
  const value = cleanText(name);

  if (!value) return false;
  if (value.length < 2 || value.length > 40) return false;
  if (/\d/.test(value)) return false;
  if (/[?!=@#$%^&*()_+=[\]{};:"\\|<>/]/.test(value)) return false;

  const words = value.split(/\s+/).filter(Boolean);

  if (words.length === 0 || words.length > 3) return false;

  for (const word of words) {
    const w = word.toLowerCase();

    if (w.length < 2) return false;
    if (NAME_STOPWORDS.has(w)) return false;
  }

  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,2}$/.test(value);
}

function extractNameFromPhrases(text) {
  const t = cleanText(text);

  if (!t) return null;

  const patterns = [
    /\bme llamo\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,2})\b/i,
    /\bmi nombre es\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,2})\b/i,
    /\bsoy\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,2})\b/i,
    /\bnombre\s*[:\-]\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,2})\b/i,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (m && m[1]) {
      const candidate = m[1].trim().replace(/[.,;:!?]+$/g, "");
      if (looksLikeValidName(candidate)) {
        return toTitleCase(candidate);
      }
    }
  }

  return null;
}

function extractStandaloneName(text) {
  const t = cleanText(text).replace(/[.,;:!?]+$/g, "");

  if (!t) return null;
  if (isLikelyQuestion(t)) return null;
  if (t.includes("@")) return null;
  if (/\d/.test(t)) return null;

  if (!looksLikeValidName(t)) return null;

  return toTitleCase(t);
}

function extractUrgency(text) {
  const t = String(text || "").toLowerCase();

  if (!t) return null;

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
    /\b(sin\s+prisa|más\s+adelante|m[aá]s\s+adelante|en\s+unos\s+meses|prioridad\s+baja|baja\s+prioridad|mi\s+prioridad\s+es\s+baja|urgencia\s+baja|cuando\s+se\s+pueda)\b/i.test(
      t
    )
  ) {
    return "baja";
  }

  const m = t.match(/\b(?:mi\s+)?(?:prioridad|urgencia)\s+(?:es\s+)?(alta|media|baja)\b/i);
  if (m?.[1]) {
    return m[1].toLowerCase();
  }

  return null;
}

function normalizeMoneyNumber(str) {
  return String(str).replace(/[.,](?=\d{3}\b)/g, "");
}

function extractBudget(text) {
  const t = String(text || "");

  const range = t.match(/(\d{2,6})\s*(€|eur)?\s*[-–]\s*(\d{2,6})\s*(€|eur)?/i);
  if (range) return `${range[1]}-${range[3]} €`;

  const between = t.match(/entre\s+(\d{2,6})\s*(€|eur)?\s+y\s+(\d{2,6})\s*(€|eur)?/i);
  if (between) return `${between[1]}-${between[3]} €`;

  const kw = t.match(
    /(presupuesto|inversi[oó]n|gasto|budget)\D{0,25}(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(k)?\s*(€|eur)?\s*(\/\s*mes|al\s+mes|mensual(es)?|mes)?/i
  );

  if (kw) {
    let num = Number(normalizeMoneyNumber(kw[2]));
    if (kw[3]) num *= 1000;

    if (Number.isFinite(num) && num >= 10) {
      const isMonthly = !!kw[5];
      return isMonthly ? `${num} €/mes` : `${num} €`;
    }
  }

  const simple = t.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(€|eur)\b/i);
  if (simple) {
    let num = Number(normalizeMoneyNumber(simple[1]));
    if (Number.isFinite(num) && num >= 10) return `${num} €`;
  }

  return null;
}

function pickService(text, existingService = null) {
  const t = String(text || "");

  if (/(ecommerce|e-commerce|tienda\s+online|shopify|woocommerce)/i.test(t)) {
    return existingService || null;
  }

  for (const s of SERVICE_ALIASES) {
    if (s.patterns.some((re) => re.test(t))) return s.key;
  }

  return existingService || null;
}

function extractConsent(text) {
  const t = String(text || "").toLowerCase();

  if (/(no\s+acepto|no\s+consiento|no\s+me\s+contacten|no\s+contactar)/i.test(t)) {
    return false;
  }

  if (/(acepto|consiento|autorizo|pueden\s+contactarme)/i.test(t)) {
    return true;
  }

  return null;
}

export function extractLeadDataFromText(text, existingLead = null) {
  const safeText = String(text || "");

  const email = extractEmail(safeText);
  const phone = extractPhone(safeText);
  const name = extractNameFromPhrases(safeText) || extractStandaloneName(safeText);
  const interest_service = pickService(safeText, existingLead?.interest_service || null);
  const urgency = extractUrgency(safeText);
  const budget_range = extractBudget(safeText);
  const consent = extractConsent(safeText);

  let lead_score = 0;
  if (name) lead_score += 15;
  if (email) lead_score += 20;
  if (phone) lead_score += 20;
  if (interest_service) lead_score += 15;
  if (budget_range) lead_score += 15;
  if (urgency === "alta") lead_score += 15;
  if (urgency === "media") lead_score += 10;

  return {
    name,
    email,
    phone,
    interest_service,
    urgency,
    budget_range,
    summary: safeText.slice(0, 500),
    lead_score: Math.min(100, lead_score),
    consent,
    consent_at: consent === true ? new Date().toISOString() : null,
  };
}