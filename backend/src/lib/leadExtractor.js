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
      /campa(?:Ã±|ñ|n)(a|as)\s+en\s+meta/i,
      /\bmeta\b/i,
      /meta\s*ads/i,
      /facebook\s*ads/i,
      /instagram\s*ads/i,
    ],
  },
  {
    key: "Shopify",
    patterns: [
      /\bshopify\b/i,
    ],
  },
  {
    key: "Diseño Web",
    patterns: [
      /diseñ(o|ar)\s+web/i,
      /disen(o|ar)\s+web/i,
      /dise(?:ñ|n)o\s+web/i,
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
      /disenar\s+(una\s+)?pagina\s+web/i,
      /disenar\s+(una\s+)?tienda\s+online/i,
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
  "perdona",
  "perdon",
  "perdón",
  "disculpa",
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

  // Pronombres y autodescripciones que siguen a "soy"/"me llamo" pero
  // no son nombres propios (p.ej. "soy nuevo por aquí", "soy yo").
  "yo",
  "tu",
  "tú",
  "ella",
  "nosotros",
  "nosotras",
  "vosotros",
  "ustedes",
  "ellos",
  "ellas",
  "nuevo",
  "nueva",
  "aqui",
  "aquí",
  "alli",
  "allí",
  "esto",
  "eso",
  "esta",
  "este",
  "particular",
  "freelance",
  "freelancer",
  "responsable",
  "encargado",
  "encargada",
  "gerente",
  "director",
  "directora",
  "dueno",
  "dueño",
  "duena",
  "dueña",
]);

const GENERIC_COMPANY_RESPONSES = new Set([
  "hola",
  "buenas",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  "ok",
  "vale",
  "gracias",
  "perfecto",
  "genial",
  "no",
  "si",
  "sÃ­",
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
  if (/[!=@#$%^&*()_+=[\]{};:"\\|<>/]/.test(value)) return false;
  if (/[¿?]\s*$/.test(value) || value.includes("¿")) return false;
  if (isLikelyQuestion(value)) return false;
  if (isNegativeResponse(value) || isUnknownResponse(value)) return false;
  if (isLikelyServiceIntent(value)) return false;

  const companyLikePrefixes = [
    "agencia",
    "asesor",
    "bufete",
    "clinica",
    "consultora",
    "despacho",
    "ecommerce",
    "empresa",
    "estudio",
    "tienda",
  ];
  if (/^(agencia|asesor\S*|bufete|cl\S*nica|consultora|despacho|ecommerce|empresa|estudio|tienda)\b/iu.test(value)) {
    return false;
  }
  if (companyLikePrefixes.some((prefix) => normalized.startsWith(prefix))) return false;
  if (/\b(sl|s l|slu|sa|s a)\b/.test(normalized)) return false;

  const blockedPhrases = [
    "si por favor",
    "sí por favor",
    "por favor",
    "si gracias",
    "sí gracias",
    "de acuerdo",
    "vale",
    "ok",
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
    "perdona",
    "perdon",
    "perdón",
    "disculpa",
    "tengo una",
    "tenemos una",
    "me dedico",
    "nos dedicamos",
    "soy autonomo",
    "soy autónomo",
  ];

  if (blockedPhrases.some((p) => normalized.includes(p))) return false;

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;

  // Particulas como "de", "del", "la", "los"... son validas dentro de
  // apellidos compuestos espanoles (p.ej. "Ana de la Torre", "Juan del Rio"),
  // pero no como primera ni unica palabra (ahi siguen bloqueadas).
  const NAME_PARTICLES = new Set(["de", "del", "la", "los", "las", "y"]);

  for (const [index, word] of words.entries()) {
    const w = normalizeText(word);
    if (w.length < 2) return false;
    if (NAME_PARTICLES.has(w) && index > 0) continue;
    if (NAME_STOPWORDS.has(w)) return false;
  }

  return /^[\p{L}?]+(?:[\s'-][\p{L}?]+){0,3}$/u.test(value);
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
  if (/[¿?]\s*$/.test(t) || t.includes("¿")) return true;

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

function hasCurrentSituationSignals(text = "") {
  const t = normalizeText(text);
  return (
    t.includes("actualmente") ||
    t.includes("ahora mismo") ||
    t.includes("a dia de hoy") ||
    t.includes("a día de hoy") ||
    t.includes("usamos") ||
    t.includes("utilizamos") ||
    t.includes("tenemos") ||
    t.includes("google ads") ||
    t.includes("analytics") ||
    t.includes("google analytics") ||
    t.includes("campanas activas") ||
    t.includes("campañas activas") ||
    t.includes("revisando datos") ||
    t.includes("revisar datos")
  );
}

function hasPainPointSignals(text = "") {
  const t = normalizeText(text);
  if (
    t.includes("no salimos") ||
    t.includes("dependemos demasiado") ||
    t.includes("nadie pide cita") ||
    t.includes("web parece antigua") ||
    t.includes("flojean las altas") ||
    t.includes("no sabemos que canal funciona") ||
    t.includes("abandona carrito")
  ) {
    return true;
  }
  return (
    t.includes("falla") ||
    t.includes("fallando") ||
    t.includes("va mal") ||
    t.includes("van mal") ||
    t.includes("no sabemos") ||
    t.includes("no sabemos que") ||
    t.includes("no se que") ||
    t.includes("no sé qué") ||
    t.includes("complicado") ||
    t.includes("dificil") ||
    t.includes("difícil") ||
    t.includes("problema") ||
    t.includes("problemas") ||
    t.includes("cuesta") ||
    t.includes("no da con") ||
    t.includes("no falla el saber") ||
    t.includes("no sabemos que esta fallando") ||
    t.includes("no sabemos que está fallando")
  );
}

function extractNameFromPhrases(text = "") {
  const t = cleanText(text);

  const namePattern = "([\\p{L}?]+(?:\\s+[\\p{L}?]+){0,3})";
  const correctionPatterns = [
    new RegExp(`\\bsoy\\s+${namePattern}\\s*,?\\s+bueno\\s+${namePattern}\\b`, "iu"),
    new RegExp(`\\bme\\s+llamo\\s+${namePattern}\\s*,?\\s+bueno\\s+${namePattern}\\b`, "iu"),
    new RegExp(`\\bno\\s+me\\s+llamo\\s+${namePattern}[^\\p{L}]+me\\s+llamo\\s+${namePattern}\\b`, "iu"),
    new RegExp(`\\bno\\s+soy\\s+${namePattern}[^\\p{L}]+soy\\s+${namePattern}\\b`, "iu"),
  ];

  for (const re of correctionPatterns) {
    const m = t.match(re);
    const correctedName = m?.[2];
    if (correctedName && looksLikeValidName(correctedName)) {
      return toTitleCase(correctedName.trim());
    }
  }

  const personCompany = t.match(/\bsoy\s+([\p{L}?]+(?:\s+[\p{L}?]+){0,1})\s+de\s+(.+)$/iu);
  if (personCompany?.[1] && looksLikeValidName(personCompany[1])) {
    return toTitleCase(personCompany[1].trim());
  }

  const reminder = t.match(
    new RegExp(`^${namePattern}\\s*,?\\s+te\\s+lo\\s+dije\\s+antes\\b`, "iu")
  );
  if (reminder?.[1] && looksLikeValidName(reminder[1])) {
    return toTitleCase(reminder[1].trim());
  }

  const patterns = [
    new RegExp(`\\bme\\s+llamo\\s+${namePattern}\\b`, "iu"),
    new RegExp(`\\bmi\\s+nombre\\s+es\\s+${namePattern}\\b`, "iu"),
    new RegExp(`\\bsoy\\s+${namePattern}\\b`, "iu"),
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

  // El flujo de cualificación en vivo (salesQualificationAgent.pickNextQuestion)
  // nunca marca current_step="ask_name": pregunta el nombre como último paso,
  // una vez ya hay servicio, objetivo, presupuesto, urgencia y contacto. Si
  // llegados a ese punto el lead todavía no tiene nombre, una respuesta corta
  // y aislada ("Antonio", "Juan Pérez") es casi con toda seguridad la
  // respuesta a esa pregunta, aunque no use "me llamo"/"soy".
  const lead = existingLead || {};
  if (
    !lead.name &&
    lead.interest_service &&
    lead.main_goal &&
    ((lead.email || lead.phone) || lead.company_name)
  ) {
    return true;
  }

  return false;
}

function extractUrgency(text = "") {
  const t = String(text).toLowerCase();
  if (/no\s+es\s+urgente/i.test(t) && /trimestre|este\s+mes|proxim[oa]s?\s+semanas/i.test(t)) return "media";
  if (/\blo\s+quiero\s+ya\b/i.test(normalizeText(text))) return "alta";

  if (
    /\b(urgente|muy urgente|inmediato|inmediata|para\s+ayer|hoy|esta\s+semana|cuanto\s+antes|cuánto\s+antes|lo\s+antes\s+posible|lo\s+m[aá]s\s+pronto\s+posible|cuanto\s+más\s+pronto\s+mejor|me\s+corre\s+(?:\w+\s+)?prisa|me\s+corre\s+(?:mucha\s+)?urgencia|necesito\s+(?:esto\s+)?ya|prioridad\s+alta|alta\s+prioridad|mi\s+prioridad\s+es\s+alta|urgencia\s+alta)\b/i.test(
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
    /\b(sin\s+prisas?|tranquilamente|con\s+calma|m[aá]s\s+adelante|de\s+momento\s+no|en\s+unos\s+meses|no\s+(?:hay|tengo)\s+prisa|prioridad\s+baja|baja\s+prioridad|mi\s+prioridad\s+es\s+baja|urgencia\s+baja)\b/i.test(
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
  const t = String(text || "").trim();
  const budgetNorm = normalizeText(t);
  const normalized = budgetNorm;

  if (
    normalized === "0" ||
    normalized === "cero" ||
    /^0\s*(eur|euro|euros)?$/.test(normalized) ||
    /\b(beta|gratis|gratuito|gratuita|free|trial|prueba gratuita|version gratuita|versi[oó]n gratuita)\b/i.test(
      normalized
    ) ||
    /\b(sin presupuesto|sin inversion|sin inversi[oó]n|presupuesto cero)\b/i.test(normalized)
  ) {
    return "beta gratuita / 0 EUR";
  }

  if (/\b(clientes?|cuentas?)\s+con\s+presupuestos?\b/i.test(normalized)) {
    return null;
  }

  const earlyBetween = t.match(/entre\s+(\d{2,6})\s*(?:€|eur|euros?)?\s+y\s+(\d{2,6})\s*(?:€|eur|euros?)?/i);
  if (earlyBetween) return `${earlyBetween[1]}-${earlyBetween[2]} €`;

  const earlyAlternativeRange = t.match(/\b(\d{2,6})\s+o\s+(\d{2,6})\s*(?:€|eur|euros?)?\b/i);
  if (earlyAlternativeRange) return `${earlyAlternativeRange[1]}-${earlyAlternativeRange[2]} €`;

  if (
    /\b(cpa|cpl|coste por lead|costo por lead|por lead|por cita|por conversion|por conversacion)\b/i.test(
      normalized
    ) &&
    !/\b(presupuesto|inversion|inversion publicitaria|gestion|gestión|al mes|mensual|disponible)\b/i.test(
      normalized
    )
  ) {
    return null;
  }
  const plainNumber = t.match(/^\d{2,6}$/);
  if (plainNumber) {
    const num = Number(plainNumber[0]);
    if (Number.isFinite(num) && num >= 10) return `${num} €`;
  }

  const hasBudgetHint =
    normalized.includes("presupuesto") ||
    normalized.includes("cuanto cuesta") ||
    normalized.includes("cuánto cuesta") ||
    normalized.includes("precio") ||
    normalized.includes("inversion") ||
    normalized.includes("inversión") ||
    normalized.includes("al mes") ||
    normalized.includes("/mes") ||
    normalized.includes("mensual");

  if (hasBudgetHint) {
    const amounts = [...t.matchAll(/\b(\d{2,6})\s*(?:€|euros?|eur)?\b/gi)]
      .map((match) => Number(match[1]))
      .filter((num) => Number.isFinite(num) && num >= 10);
    if (amounts.length >= 2) {
      return amounts.map((num) => `${num} €`).join(" + ");
    }
  }

  if (hasBudgetHint) {
    const hintedNumber = t.match(/\b(\d{2,6})\b/);
    if (hintedNumber) {
      const num = Number(hintedNumber[1]);
      if (Number.isFinite(num) && num >= 10) return `${num} €`;
    }
  }
  const digitsOnly = t.replace(/\D/g, "");

  if (!t) return null;
  if (digitsOnly.length >= 8) return null;

  const alternativeRange = t.match(/\b(\d{2,6})\s+o\s+(\d{2,6})\s*(?:€|euros?|eur)?\b/i);
  if (alternativeRange) return `${alternativeRange[1]}-${alternativeRange[2]} €`;

  const available = t.match(/\b(?:tenemos|dispongo|disponemos|cuento\s+con|contamos\s+con)\s+(\d{2,6})\s*(€|euros?|eur)\b/i);
  if (available) return `${available[1]} €`;

  const between = t.match(
    /entre\s+(\d{2,6})\s*(€|eur)?\s+y\s+(\d{2,6})\s*(€|eur)?/i
  );
  if (between) return `${between[1]}-${between[3]} €`;

  const simple = t.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(€|euros?|eur)\b/i);
  if (simple) {
    const num = Number(String(simple[1]).replace(/[.,](?=\d{3}\b)/g, ""));
    if (Number.isFinite(num) && num >= 10) return `${num} €`;
  }

  const normalizedBudget = normalizeText(t);
  if (normalized.includes("menos de 500")) return "menos de 500 €";
  if (normalized.includes("alrededor de 500")) return "500 €";
  if (normalized.includes("alrededor de 1000")) return "1000 €";

  return null;
}

function pickService(text = "", existingService = null) {
  const t = String(text);
  const normalized = normalizeText(t);
  const serviceMatches = SERVICE_ALIASES
    .filter((service) => service.patterns.some((re) => re.test(t)))
    .map((service) => service.key);
  const distinctServiceMatches = [...new Set(serviceMatches)];
  if (/\b(primero|mejor|prefiero)\s+shopify\b/i.test(normalized) || /\bshopify\s+(primero|mejor)\b/i.test(normalized)) {
    return "Shopify";
  }
  if (/\bno\s+quiero\b[^.]{0,60}\bcrm\b/i.test(normalized)) return existingService || null;

  const unsureBetweenServices =
    /\b(no\s+se\s+si|no\s+s[ée]\s+si|no\s+se\s+para\s+que|no\s+s[ée]\s+para\s+que|igual|quizas|quiz[aá]s|a lo mejor)\b/i.test(normalized) &&
    distinctServiceMatches.length > 1;
  const negatedServices = [
    { key: "SEO", pattern: /\b(no\s+quiero|no\s+necesito|no\s+me\s+vendas|no\s+busco|no\s+es)\b[^.]{0,60}\bseo\b/i },
    { key: "Google Ads", pattern: /\b(no\s+quiero|no\s+necesito|no\s+me\s+vendas|no\s+busco|no\s+es)\b[^.]{0,60}\b(google\s*ads|sem|anuncios)\b/i },
    { key: "Publicidad en Redes Sociales", pattern: /\b(no\s+quiero|no\s+necesito|no\s+me\s+vendas|no\s+busco|no\s+es)\b[^.]{0,60}\b(meta|facebook|instagram|redes)\b/i },
    { key: "Diseño Web", pattern: /\b(no\s+quiero|no\s+necesito|no\s+me\s+vendas|no\s+busco|no\s+es)\b[^.]{0,60}\b(web|pagina|p[aá]gina)\b/i },
    { key: "Automatización", pattern: /\b(no\s+quiero|no\s+necesito|no\s+me\s+vendas|no\s+busco|no\s+es)\b[^.]{0,60}\b(crm|automatiz)\b/i },
  ];

  if (unsureBetweenServices) return existingService || null;

  if (
    (normalized.includes("shopify") ||
      normalized.includes("tienda online") ||
      normalized.includes("ecommerce")) &&
    (normalized.includes("ventas") ||
      normalized.includes("vender") ||
      normalized.includes("roas") ||
      normalized.includes("publicidad") ||
      normalized.includes("inversion publicitaria") ||
      normalized.includes("anuncios"))
  ) {
    return "Google Ads";
  }

  for (const s of SERVICE_ALIASES) {
    if (negatedServices.some((negated) => negated.key === s.key && negated.pattern.test(t))) continue;
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
  if (t.includes("inmobiliaria") || t.includes("asesoria inmobiliaria") || t.includes("asesoria inmobiliaria")) {
    return "inmobiliaria";
  }
  if (t.includes("hotel") || t.includes("alojamiento") || t.includes("casa rural")) return "hotel";
  if (t.includes("academia") || t.includes("clases") || t.includes("oposiciones")) return "academia";
  if (t.includes("gimnasio") || t.includes("fitness")) return "gimnasio";
  if (t.includes("asesoria") || t.includes("asesoría")) return "asesoria";
  if (t.includes("saas") || t.includes("software as a service")) return "SaaS";
  if (t.includes("b2b") || t.includes("industrial")) return "b2b industrial";
  if (t.includes("agencia de marketing") || t.includes("marketing agency")) return "agencia de marketing";
  if (t.includes("autonom")) return "autonomo";
  if (t.includes("empresa")) return "empresa";
  if (t.includes("negocio")) return "negocio";
  if (t.includes("proyecto")) return "proyecto";
  if (t.includes("tienda online") || t.includes("ecommerce") || t.includes("e-commerce")) {
    return "ecommerce";
  }
  if (t.includes("clinica") || t.includes("clínica")) return "clinica";
  if (t.includes("restaurante")) return "restaurante";
  if (t.includes("cosmetica") || t.includes("cosmética")) return "cosmetica";
  if (t.includes("agencia")) return "agencia";
  if (t.includes("despacho")) return "despacho";

  return null;
}

function extractBusinessActivity(text = "") {
  const raw = cleanText(text);
  const t = normalizeText(raw);

  if (!raw) return null;
  if (/^(hola|buenas)[, ]+/i.test(raw) && extractNameFromPhrases(raw)) return null;
  if (extractNameFromPhrases(raw) && !/\b(tengo|tenemos|damos|vendemos|ofrecemos|somos un|somos una|marca|empresa|negocio)\b/i.test(raw)) return null;
  if (t.includes("inmobiliaria") && /\b(tengo|tenemos|soy|somos)\b/.test(t)) return null;
  if (isLikelyQuestion(raw)) return null;
  if (looksLikeValidName(raw)) return null;
  if (extractEmail(raw) || extractPhone(raw)) return null;
  if (
    (t.includes("restaurante") || t.includes("catering")) &&
    !/\b(necesito|quiero|busco|campanas|campañas|meta|google ads|seo)\b/.test(t)
  ) return raw;
  if (t.includes("cosmetica") || t.includes("cosmética")) return raw;
  if (pickService(raw, null)) return null;
  if (hasCurrentSituationSignals(raw) || hasPainPointSignals(raw)) return null;

  const triggers = [
    "tengo una",
    "tenemos una",
    "soy ",
    "somos ",
    "me dedico a",
    "nos dedicamos a",
    "vendo",
    "vendemos",
    "damos",
    "ofrezco",
    "ofrecemos",
    "trabajo en",
    "trabajamos en",
  ];

  const marketingGoalSignals = [
    "queremos",
    "necesitamos",
    "buscamos",
    "nos gustaria",
    "nos gustar",
    "nuestro objetivo",
    "optimizar",
    "reducir",
    "bajar",
    "redisenar",
    "redise",
    "conversion",
    "conversi",
    "roas",
    "cpa",
    "seo",
    "visibilidad ia",
    "automatizar",
    "automatizaciones",
  ];

  const realEstateActivity = raw.match(/\b(?:tengo|tenemos|soy|somos)\s+(?:una?\s+)?((?:asesor[ií]a\s+)?inmobiliaria)\b/i);
  if (realEstateActivity?.[1]) return cleanText(realEstateActivity[1]);
  if (extractMainGoal(raw)) return null;
  if (triggers.some((x) => t.includes(x)) || marketingGoalSignals.some((x) => t.includes(x))) return raw;
  if (t.includes("tienda online")) return raw;
  if (t.includes("ecommerce")) return raw;
  if (
    (t.includes("restaurante") || t.includes("catering")) &&
    !/\b(necesito|quiero|busco|campanas|campañas|meta|google ads|seo)\b/.test(t)
  ) return raw;
  if (t.includes("cosmetica") || t.includes("cosmética")) return raw;
  if (t.includes("inmobiliaria")) return raw;
  if (t.includes("clinica") || t.includes("clínica")) return raw;
  if (t.includes("abogado") || t.includes("bufete")) return raw;
  if (t.includes("dental") || t.includes("dentista")) return raw;

  return null;
}

function extractMainGoal(text = "", existingLead = null) {
  const raw = cleanGoalMetaRequest(cleanText(text));
  const t = normalizeText(raw);

  if (!raw) return null;
  if (/\b(ya\s+(se\s+lo\s+)?(he|hemos)\s+(comentado|dicho|explicado)|ya\s+lo\s+he\s+explicado|ya\s+esta\s+todo|lo\s+he\s+explicado\s+todo)\b/i.test(t)) {
    return null;
  }
  if (
    normalizeText(existingLead?.current_step || "") === "ask_main_goal" &&
    !isNegativeResponse(raw) &&
    !isUnknownResponse(raw) &&
    !isLikelyQuestion(raw) &&
    !extractEmail(raw) &&
    !extractPhone(raw) &&
    raw.split(/\s+/).filter(Boolean).length <= 8
  ) {
    return raw;
  }
  if (/^(somos|vendo|vendemos|damos|ofrecemos|trabajamos|tenemos)\b/i.test(t) && !/\b(queremos|buscamos|necesitamos|objetivo|mejorar|reducir|priorizar|captar|conseguir)\b/i.test(t)) {
    return null;
  }
  if (looksLikeValidName(raw)) return null;
  if (/(queremos|necesitamos|buscamos|nos gustar|nuestro objetivo|optimizar|reducir|bajar|redise|conversion|conversi|roas|cpa|seo|visibilidad ia|automatizar|automatizaciones)/i.test(t)) {
    return raw;
  }
  if (/\b(captacion|clientes potenciales|potenciales|nuevos clientes|mas clientes|leads|contactos cualificados)\b/i.test(t)) {
    return raw;
  }
  if (isLikelyQuestion(raw)) return null;
  if (hasCurrentSituationSignals(raw) || hasPainPointSignals(raw)) return null;

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

function cleanGoalMetaRequest(value = "") {
  const raw = cleanText(value);
  if (!raw) return raw;

  const cleaned = raw
    .replace(
      /[,;.:\s-]*(?:podr[ií]as|podrias|puedes|puede|me\s+puedes|me\s+podr[ií]as|me\s+podrias)\s+(?:contestar|responder|decir|mandar|enviar)(?:me)?\s+(?:en\s+)?(?:json|formato\s+json|un\s+json)\b.*$/i,
      ""
    )
    .trim();

  return cleaned || raw;
}

function extractPreferredContactChannel({ text = "", email, phone }) {
  const normalized = normalizeText(text);
  if (
    /\b(whatsapp|wasap|whats)\b/.test(normalized) &&
    !/\b(prefiero|mejor|continuar|seguimos|contacto|contactar|hablar|escribir|mandar|enviar)\b/.test(normalized) &&
    !/^por\s+(whatsapp|wasap|whats)\b/.test(normalized)
  ) {
    return null;
  }
  if (/\b(email marketing|marketing por email|campanas de email|campañas de email)\b/.test(normalized)) {
    return null;
  }

  if (
    /\bwhatsapp\b/.test(normalized) ||
    /\bwasap\b/.test(normalized) ||
    /\bwhats\b/.test(normalized)
  ) {
    return "whatsapp";
  }

  if (/\btelefono\b/.test(normalized) || /\btel\b/.test(normalized)) {
    return "telefono";
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

function extractCurrentSituation(text = "") {
  const raw = cleanText(text);
  if (!raw) return null;
  if (isLikelyQuestion(raw)) return null;
  if (extractMainGoal(raw)) return null;
  if (extractEmail(raw) || extractPhone(raw)) return null;
  return hasCurrentSituationSignals(raw) ? raw : null;
}

function extractPainPoints(text = "") {
  const raw = cleanText(text);
  if (!raw) return null;
  if (isLikelyQuestion(raw)) return null;
  if (extractEmail(raw) || extractPhone(raw)) return null;
  return hasPainPointSignals(raw) ? raw : null;
}

function extractCompanyName(text = "") {
  const raw = cleanText(text);
  const t = normalizeText(raw);

  if (!raw) return null;
  const earlyExplicit =
    raw.match(/\bempresa\s+(?!es\b|se\s+llama\b)([^,.;]+)(?:[,.;]|$)/i)?.[1] ||
    raw.match(/\b(?:la\s+)?marca\s+es\s+([^,.;]+)(?:[,.;]|$)/i)?.[1] ||
    raw.match(/\b(?:la\s+)?empresa\s+es\s+([^,.;]+)(?:[,.;]|$)/i)?.[1] ||
    raw.match(/\bllevo\s+([^,.;]+),\s+(?:un|una)\s+(?:agencia|empresa|consultora|estudio|equipo|marca|tienda)\b/i)?.[1] ||
    raw.match(/\bsoy\s+[\p{L}?]+(?:\s+[\p{L}?]+){0,1}\s+de\s+([^,.;]+)(?:[,.;]|$)/iu)?.[1] ||
    raw.match(/\bsomos\s+([^,.;]+),\s+(?:un|una)\s+(?:agencia|empresa|consultora|estudio|equipo)\b/i)?.[1] ||
    raw.match(/\b(?:mi\s+)?empresa\s+es\s+([^,.;]+)(?:[,.;]|$)/i)?.[1];
  if (earlyExplicit) return cleanText(earlyExplicit);

  if (extractBudget(raw)) return null;
  if (extractNameFromPhrases(raw) && !/\b(mi empresa|empresa|marca|proyecto|negocio|tengo|tenemos|somos| de )\b/i.test(raw)) return null;
  if (/\b(este mes|esta semana|cuanto antes|pronto|urgente)\b/i.test(t)) return null;
  if (GENERIC_COMPANY_RESPONSES.has(t)) return null;
  if (isNegativeResponse(raw) || isUnknownResponse(raw)) return null;
  if (isLikelyQuestion(raw)) return null;
  if (extractEmail(raw) || extractPhone(raw)) return null;
  if (hasCurrentSituationSignals(raw) || hasPainPointSignals(raw)) return null;

  if (pickService(raw, null)) return null;

  const explicit =
    raw.match(/\b(?:la\s+)?marca\s+es\s+([^,.;]+)(?:[,.;]|$)/i)?.[1] ||
    raw.match(/\b(?:mi\s+)?empresa\s+es\s+([^,.;]+)(?:[,.;]|$)/i)?.[1] ||
    raw.match(/\b(?:la\s+)?empresa\s+se\s+llama\s+(.+)$/i)?.[1] ||
    raw.match(/\b(?:mi\s+)?empresa\s+es\s+(.+)$/i)?.[1] ||
    raw.match(/\b(?:mi\s+)?empresa:\s*(.+)$/i)?.[1] ||
    raw.match(/\bmi empresa se llama\s+(.+)$/i)?.[1] ||
    raw.match(/\bse llama\s+(.+)$/i)?.[1] ||
    raw.match(/\bsoy\s+[\p{L}?]+(?:\s+[\p{L}?]+){0,1}\s+de\s+([^,.;]+)(?:[,.;]|$)/iu)?.[1] ||
    raw.match(/\btengo\s+([^,.;]+),\s+(?:un|una)\s+(?:hotel|academia|gimnasio|asesor[ií]a|clinica|clínica|restaurante|tienda)\b/i)?.[1] ||
    raw.match(/\bsomos\s+([^,.;]+),\s+(?:un|una)\s+(?:agencia|empresa|consultora|estudio|equipo)\b/i)?.[1] ||
    raw.match(/\bsomos\s+([^,.;]+)$/i)?.[1] ||
    raw.match(/^empresa\s+(.+)$/i)?.[1];
  if (explicit) {
    const corrected = String(explicit).match(/\b(?:perdon|perd[oó]n|corrijo)\s+(.+)$/i)?.[1];
    return cleanText(corrected || explicit);
  }

  if (/^(asesor\S*|despacho|cl\S*nica|agencia|consultora|tienda|ecommerce|bufete|estudio)\s+[\p{L}\d&.' -]{2,60}$/iu.test(raw)) {
    return raw;
  }

  if (extractMainGoal(raw) || extractBusinessActivity(raw)) return null;
  if (looksLikeValidName(raw)) return null;

  if (/\b(sl|s\.l\.|sll|slu|sa|s\.a\.)\b/i.test(raw)) return raw;
  if (/^(asesor[iÃ­]a|despacho|cl[iÃ­]nica|agencia|consultora|tienda|ecommerce)\s+[\p{L}\d&.' -]{2,60}$/iu.test(raw)) {
    return raw;
  }
  if (/^[\p{L}\d&.' -]{2,40}$/u.test(raw) && raw.split(/\s+/).length <= 5) {
    return raw;
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
  const company_name = extractCompanyName(safeText);
  const main_goal = extractMainGoal(safeText, existingLead);
  const current_situation = extractCurrentSituation(safeText);
  const pain_points = extractPainPoints(safeText);
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
    company_name,
    main_goal,
    current_situation,
    pain_points,
    preferred_contact_channel,
    last_intent,
  };
}
