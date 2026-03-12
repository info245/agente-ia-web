// leadExtractor.js

const STOPWORDS_NAME = new Set([
  "hola", "buenas", "gracias", "vale", "ok", "perfecto", "genial",
  "declaras", "hacienda", "quiero", "necesito", "busco", "pregunta",
  "presupuesto", "urgencia", "prioridad", "alta", "media", "baja",
  "servicio", "email", "correo", "telefono", "teléfono", "numero",
  "número", "mi", "me", "llamo", "soy", "es", "de", "del", "la", "el"
]);

function cleanText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(str = "") {
  return str
    .toLowerCase()
    .replace(/\b([a-záéíóúüñ])/gi, (m) => m.toUpperCase());
}

function isLikelyQuestion(text = "") {
  const t = cleanText(text).toLowerCase();
  return t.includes("?") ||
    /^(que|qué|como|cómo|cuando|cuándo|donde|dónde|por que|por qué|cuanto|cuánto|declaras|puedes|tienes|ofreces|hacéis|haceis)\b/i.test(t);
}

function looksLikeValidName(name = "") {
  const value = cleanText(name);

  if (!value) return false;
  if (value.length < 2 || value.length > 40) return false;
  if (/\d/.test(value)) return false;
  if (/[?!=@#$%^&*()_+=[\]{};:"\\|<>/]/.test(value)) return false;

  const words = value.split(" ").filter(Boolean);
  if (words.length > 3) return false;

  for (const word of words) {
    const w = word.toLowerCase();
    if (STOPWORDS_NAME.has(w)) return false;
    if (w.length < 2) return false;
  }

  return true;
}

function extractName(message = "") {
  const text = cleanText(message);

  if (!text) return null;
  if (isLikelyQuestion(text)) return null;

  const patterns = [
    /\bme llamo\s+([A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+){0,2})\b/i,
    /\bsoy\s+([A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+){0,2})\b/i,
    /\bmi nombre es\s+([A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+){0,2})\b/i,
    /\bnombre\s*[:\-]\s*([A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+){0,2})\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const candidate = cleanText(match[1]);
      if (looksLikeValidName(candidate)) {
        return toTitleCase(candidate);
      }
    }
  }

  // Solo aceptar mensaje completo como nombre si es MUY claramente un nombre
  // Ejemplo válido: "Moure"
  // Ejemplo inválido: "Declaras a Hacienda"
  if (!text.includes(" ") && looksLikeValidName(text)) {
    return toTitleCase(text);
  }

  return null;
}

function extractEmail(message = "") {
  const text = cleanText(message);
  const match = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return match ? match[0].toLowerCase() : null;
}

function extractPhone(message = "") {
  const text = cleanText(message);
  const normalized = text.replace(/[^\d+]/g, "");
  const match = normalized.match(/(?:\+34)?[6-9]\d{8}\b/);
  return match ? match[0] : null;
}

function extractUrgency(message = "") {
  const text = cleanText(message).toLowerCase();

  if (!text) return null;

  // Alta
  if (
    /\b(urgente|muy urgente|cuanto antes|lo antes posible|inmediato|inmediata|alta prioridad|prioridad alta|mi prioridad es alta|urgencia alta)\b/i.test(text)
  ) {
    return "alta";
  }

  // Media
  if (
    /\b(media prioridad|prioridad media|mi prioridad es media|urgencia media|sin prisa pero pronto|pronto)\b/i.test(text)
  ) {
    return "media";
  }

  // Baja
  if (
    /\b(sin prisa|baja prioridad|prioridad baja|mi prioridad es baja|urgencia baja|más adelante|cuando se pueda)\b/i.test(text)
  ) {
    return "baja";
  }

  // Frases simples con prioridad/urgencia
  const priorityMatch = text.match(/\b(?:prioridad|urgencia)\s+(?:es\s+)?(alta|media|baja)\b/i);
  if (priorityMatch?.[1]) {
    return priorityMatch[1].toLowerCase();
  }

  return null;
}

function extractBudgetRange(message = "") {
  const text = cleanText(message).toLowerCase();
  if (!text) return null;

  if (/\b(menos de|hasta)\s*([0-9]{2,6})\s*€?/i.test(text)) return "hasta_x";
  if (/\bentre\s*([0-9]{2,6})\s*y\s*([0-9]{2,6})\s*€?/i.test(text)) return "rango";
  if (/\b(más de|a partir de)\s*([0-9]{2,6})\s*€?/i.test(text)) return "mas_de_x";

  return null;
}

function extractInterestService(message = "", serviceCatalog = []) {
  const text = cleanText(message).toLowerCase();
  if (!text) return null;

  // 1. Coincidencia exacta por catálogo
  for (const service of serviceCatalog) {
    const serviceName = String(service).toLowerCase().trim();
    if (serviceName && text.includes(serviceName)) {
      return service;
    }
  }

  // 2. Reglas simples TMedia
  if (/\b(google ads|ads|campañas)\b/i.test(text)) return "Google Ads";
  if (/\b(seo|posicionamiento)\b/i.test(text)) return "SEO";
  if (/\b(web|pagina web|página web|diseño web)\b/i.test(text)) return "Diseño Web";
  if (/\b(chatbot|ia|inteligencia artificial|agente ia)\b/i.test(text)) return "Chatbot IA";
  if (/\b(meta ads|facebook ads|instagram ads)\b/i.test(text)) return "Meta Ads";

  return null;
}

export function extractLeadData(message = "", serviceCatalog = []) {
  return {
    name: extractName(message),
    email: extractEmail(message),
    phone: extractPhone(message),
    interest_service: extractInterestService(message, serviceCatalog),
    urgency: extractUrgency(message),
    budget_range: extractBudgetRange(message),
  };
}

export {
  extractName,
  extractEmail,
  extractPhone,
  extractUrgency,
  extractBudgetRange,
  extractInterestService,
  looksLikeValidName,
};