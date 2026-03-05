// backend/src/lib/leadExtractor.js

const SERVICE_ALIASES = [
  { key: "Google Ads", patterns: [/google\s*ads/i, /\bsem\b/i, /ads\s+google/i, /campañ(a|as)\s+google/i] },
  { key: "SEO", patterns: [/\bseo\b/i, /posicionamiento/i, /ranking/i, /org[aá]nico/i] },
  { key: "Meta Ads", patterns: [/meta\s*ads/i, /facebook\s*ads/i, /instagram\s*ads/i] },
  { key: "Diseño Web", patterns: [/diseñ(o|ar)\s+web/i, /p[aá]gina\s+web/i, /\bwordpress\b/i, /\blanding\b/i, /\bweb\b/i] },
  { key: "Automatización", patterns: [/automatiz/i, /\bcrm\b/i, /\bzapier\b/i, /\bmake\b/i, /\bn8n\b/i] },
  { key: "IA", patterns: [/\bagente\s+ia\b/i, /\bchatbot\b/i, /\bia\b/i] },
];

// servicios “genéricos” que NO deben machacar uno específico en el merge
const GENERIC_SERVICES = new Set(["IA", "Automatización"]);

export function isGenericService(service) {
  return GENERIC_SERVICES.has(String(service || ""));
}

function extractEmail(text) {
  const m = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].trim() : null;
}

function extractPhone(text) {
  const cleaned = String(text || "").replace(/[().-]/g, " ").replace(/\s+/g, " ");
  const m = cleaned.match(/(\+?\d{1,3}\s*)?(\d[\d\s]{7,14}\d)/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  return digits.length >= 9 ? digits : null;
}

function extractName(text) {
  const t = String(text || "").trim();
  const patterns = [
    /me llamo\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,2})/i,
    /soy\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,2})/i,
    /mi nombre es\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,2})/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m && m[1]) return m[1].trim().replace(/[.,;:]+$/g, "");
  }
  return null;
}

function extractUrgency(text) {
  const t = String(text || "").toLowerCase();
  if (/(urgente|inmediato|hoy|ya|esta\s+semana|cuanto\s+antes)/i.test(t)) return "Alta";
  if (/(este\s+mes|pronto|en\s+breve)/i.test(t)) return "Media";
  if (/(sin\s+prisa|m[aá]s\s+adelante|en\s+unos\s+meses)/i.test(t)) return "Baja";
  return null;
}

function normalizeNumber(str) {
  // 1.500 / 1,500 -> 1500
  return String(str).replace(/[.,](?=\d{3}\b)/g, "");
}

function extractBudget(text) {
  const t = String(text || "");

  // Rangos: 1000-2000 / 1000 – 2000
  const range = t.match(/(\d{3,6})\s*(€|eur)?\s*[-–]\s*(\d{3,6})\s*(€|eur)?/i);
  if (range) return `${range[1]}-${range[3]} €/mes`;

  // Entre X y Y
  const between = t.match(/entre\s+(\d{3,6})\s*(€|eur)?\s+y\s+(\d{3,6})\s*(€|eur)?/i);
  if (between) return `${between[1]}-${between[3]} €/mes`;

  // Monto con keywords cerca: presupuesto/inversión/gasto
  const kw = t.match(
    /(presupuesto|inversi[oó]n|gasto|budget)\D{0,20}(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(k)?\s*(€|eur)?\s*(\/\s*mes|al\s+mes|mensual(es)?|mes)?/i
  );
  if (kw) {
    let num = Number(normalizeNumber(kw[2]));
    if (kw[3]) num *= 1000;
    if (Number.isFinite(num) && num >= 50) return `${num} €/mes`;
  }

  // Monto simple: 1500€/mes, 1.500 al mes, 2k/mes
  const simple = t.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(k)?\s*(€|eur)\s*(\/\s*mes|al\s+mes|mensual(es)?|mes)?/i);
  if (simple) {
    let num = Number(normalizeNumber(simple[1]));
    if (simple[2]) num *= 1000;
    if (Number.isFinite(num) && num >= 50) return `${num} €/mes`;
  }

  return null;
}

function pickService(text) {
  if (!text) return null;

  // Importante: priorizamos servicios específicos antes que IA/Automatización
  const ordered = [...SERVICE_ALIASES].sort((a, b) => {
    const aGen = isGenericService(a.key) ? 1 : 0;
    const bGen = isGenericService(b.key) ? 1 : 0;
    return aGen - bGen;
  });

  for (const s of ordered) {
    if (s.patterns.some((re) => re.test(text))) return s.key;
  }
  return null;
}

function extractConsent(text) {
  const t = String(text || "").toLowerCase();
  if (/(acepto|consiento|autorizo|pueden\s+contactarme)/i.test(t)) return true;
  if (/(no\s+acepto|no\s+consiento|no\s+me\s+contacten|no\s+contactar)/i.test(t)) return false;
  return null;
}

export function extractLeadDataFromText(text) {
  const email = extractEmail(text);
  const phone = extractPhone(text);
  const name = extractName(text);
  const interest_service = pickService(text);
  const urgency = extractUrgency(text);
  const budget_range = extractBudget(text);
  const consent = extractConsent(text);

  let lead_score = 0;
  if (name) lead_score += 15;
  if (email) lead_score += 20;
  if (phone) lead_score += 20;
  if (interest_service) lead_score += 15;
  if (budget_range) lead_score += 15;
  if (urgency === "Alta") lead_score += 15;
  if (urgency === "Media") lead_score += 10;

  return {
    name,
    email,
    phone,
    interest_service,
    urgency,
    budget_range,
    summary: String(text || "").slice(0, 500),
    lead_score: Math.min(100, lead_score),
    consent,
    consent_at: consent === true ? new Date().toISOString() : null,
  };
}