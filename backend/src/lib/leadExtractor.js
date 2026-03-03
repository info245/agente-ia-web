function extractEmail(text = "") {
  const match = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].trim() : null;
}

function extractPhone(text = "") {
  const raw = String(text);
  const match = raw.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  if (!match) return null;

  // Limpieza suave, sin romper formato humano
  return match[0].replace(/\s+/g, " ").trim();
}

function extractName(text = "") {
  const t = String(text);

  const patterns = [
    /me llamo\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2})/i,
    /mi nombre es\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2})/i,
    /soy\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2})/i,
  ];

  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function detectInterestService(text = "") {
  const t = String(text).toLowerCase();

  if (t.includes("google ads")) return "Google Ads";
  if (t.includes("meta ads")) return "Meta Ads";
  if (t.includes("facebook ads")) return "Meta Ads";
  if (t.includes("instagram ads")) return "Meta Ads";

  if (t.includes("seo")) return "SEO";

  if (
    t.includes("página web") ||
    t.includes("pagina web") ||
    t.includes("web") ||
    t.includes("diseño web")
  ) {
    return "Diseño Web";
  }

  if (
    t.includes("automatización") ||
    t.includes("automatizacion") ||
    t.includes("ia") ||
    t.includes("chatbot")
  ) {
    return "IA / Automatización";
  }

  if (t.includes("traducción") || t.includes("traduccion")) return "Traducción";

  return null;
}

function detectUrgency(text = "") {
  const t = String(text).toLowerCase();

  if (
    t.includes("urgente") ||
    t.includes("cuanto antes") ||
    t.includes("lo antes posible") ||
    t.includes("hoy") ||
    t.includes("esta semana")
  ) {
    return "alta";
  }

  if (
    t.includes("pronto") ||
    t.includes("este mes") ||
    t.includes("en breve")
  ) {
    return "media";
  }

  if (
    t.includes("sin prisa") ||
    t.includes("más adelante") ||
    t.includes("mas adelante")
  ) {
    return "baja";
  }

  return null;
}

function detectBudgetRange(text = "") {
  const t = String(text).toLowerCase();

  // Rangos comunes escritos como 1500-3000 o 1500 a 3000
  if (/\b1500\s*[-a]\s*3000\b/.test(t) || /\b1500\s*a\s*3000\b/.test(t)) {
    return "1500-3000";
  }

  if (/\b500\s*[-a]\s*1500\b/.test(t) || /\b500\s*a\s*1500\b/.test(t)) {
    return "500-1500";
  }

  if (/\b3000\s*[-a]\s*5000\b/.test(t) || /\b3000\s*a\s*5000\b/.test(t)) {
    return "3000-5000";
  }

  if (/(menos de|hasta)\s*500/.test(t)) return "<500";
  if (/(más de|mas de)\s*3000/.test(t)) return ">3000";
  if (/(más de|mas de)\s*5000/.test(t)) return ">5000";

  if (t.includes("presupuesto")) return "pendiente";

  return null;
}

function detectConsent(text = "") {
  const t = String(text).toLowerCase();

  if (
    t.includes("acepto contacto") ||
    t.includes("acepto que me contacten") ||
    t.includes("acepto que me contactes") ||
    t.includes("puedes contactarme") ||
    t.includes("pueden contactarme") ||
    t.includes("autorizo contacto") ||
    t.includes("consiento")
  ) {
    return true;
  }

  return false;
}

function buildSummary(text = "") {
  const cleaned = String(text).replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  return cleaned.length > 500 ? `${cleaned.slice(0, 497)}...` : cleaned;
}

function calculateLeadScore({
  name,
  email,
  phone,
  interest_service,
  urgency,
  budget_range,
  consent,
}) {
  let score = 0;

  if (name) score += 10;
  if (email) score += 25;
  if (phone) score += 20;
  if (interest_service) score += 15;

  if (urgency === "alta") score += 15;
  else if (urgency === "media") score += 8;
  else if (urgency === "baja") score += 3;

  if (budget_range && budget_range !== "pendiente") score += 10;
  else if (budget_range === "pendiente") score += 3;

  if (consent) score += 5;

  return Math.min(score, 100);
}

export function extractLeadDataFromText(text = "") {
  const source = String(text);

  const name = extractName(source);
  const email = extractEmail(source);
  const phone = extractPhone(source);
  const interest_service = detectInterestService(source);
  const urgency = detectUrgency(source);
  const budget_range = detectBudgetRange(source);
  const consent = detectConsent(source);
  const summary = buildSummary(source);

  const lead_score = calculateLeadScore({
    name,
    email,
    phone,
    interest_service,
    urgency,
    budget_range,
    consent,
  });

  return {
    name,
    email,
    phone,
    interest_service,
    urgency,
    budget_range,
    summary,
    lead_score,
    consent,
    consent_at: consent ? new Date().toISOString() : null,

    // Compatibilidad con nombres antiguos (por si algo aún los usa)
    interested_service: interest_service,
    budget_text: budget_range,
    notes: summary,
    lead_Score: lead_score,
  };
}