function stripHtml(html = "") {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function extractMatch(html, regex) {
  const match = String(html || "").match(regex);
  return match?.[1]?.trim() || null;
}

function extractAllMatches(html, regex, limit = 3) {
  const matches = [...String(html || "").matchAll(regex)]
    .map((m) => m?.[1]?.trim())
    .filter(Boolean);
  return matches.slice(0, limit);
}

function buildHeroSnippet(text = "") {
  if (!text) return null;
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.slice(0, 260);
}

function detectVisibleSignals(html = "", plainText = "") {
  const source = String(html || "").toLowerCase();
  const text = String(plainText || "").toLowerCase();

  const ctaPatterns = [
    "contacta",
    "solicita",
    "pide presupuesto",
    "llámanos",
    "llamanos",
    "escríbenos",
    "escribenos",
    "whatsapp",
    "reservar",
    "empieza ahora",
    "solicitar",
  ];

  const trustPatterns = [
    "testimonio",
    "opiniones",
    "reseñas",
    "resenas",
    "casos de éxito",
    "casos de exito",
    "clientes",
    "certificado",
    "garantía",
    "garantia",
  ];

  return {
    has_cta: ctaPatterns.some((item) => source.includes(item) || text.includes(item)),
    has_form: /<form[\s>]/i.test(source),
    has_whatsapp_link: /wa\.me|api\.whatsapp\.com|whatsapp/i.test(source),
    has_trust_signals: trustPatterns.some(
      (item) => source.includes(item) || text.includes(item)
    ),
    has_contact_info:
      /mailto:|tel:|@\w|contacto|contacta|llamanos|llámanos/i.test(source) ||
      /\b\d{9,}\b/.test(text),
    has_blog: /blog|articulos|artículos|noticias|guia|guía/i.test(source),
  };
}

function buildFindings(snapshot = {}) {
  const findings = [];

  if (snapshot.hero_text) {
    findings.push("La home sí muestra un mensaje principal visible.");
  } else {
    findings.push("La propuesta principal no se percibe con claridad en el primer pantallazo.");
  }

  if (snapshot.signals?.has_cta) {
    findings.push("Se detectan llamadas a la acción visibles.");
  } else {
    findings.push("No se aprecia una llamada a la acción fuerte y evidente en la home.");
  }

  if (snapshot.signals?.has_trust_signals) {
    findings.push("Hay señales de confianza visibles.");
  } else {
    findings.push("Faltan señales de confianza claras o no destacan lo suficiente.");
  }

  if (snapshot.signals?.has_contact_info || snapshot.signals?.has_whatsapp_link) {
    findings.push("El contacto parece accesible desde la home.");
  } else {
    findings.push("El contacto no parece suficientemente visible desde el primer vistazo.");
  }

  if (!snapshot.meta_description) {
    findings.push("No se ha detectado meta description clara.");
  }

  return findings.slice(0, 5);
}

function buildPriorities(snapshot = {}) {
  const priorities = [];

  if (!snapshot.hero_text || !snapshot.signals?.has_cta) {
    priorities.push("Reforzar el mensaje principal y la llamada a la acción de la home.");
  }

  if (!snapshot.signals?.has_trust_signals) {
    priorities.push("Añadir o destacar mejor pruebas de confianza y credibilidad.");
  }

  if (!snapshot.signals?.has_contact_info && !snapshot.signals?.has_whatsapp_link) {
    priorities.push("Hacer más visible la vía de contacto o captación en primer pantallazo.");
  }

  if (!snapshot.title || !snapshot.meta_description || !snapshot.h1) {
    priorities.push("Mejorar la base visible de SEO on-page: title, meta description y encabezado principal.");
  }

  return priorities.slice(0, 3);
}

export function extractFirstUrlFromText(text = "") {
  const match = String(text || "").match(
    /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i
  );
  return match?.[1] || null;
}

export async function runLightSiteAnalysis(inputUrl) {
  const url = normalizeUrl(inputUrl);
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; TMediaGlobalBot/1.0; +https://t-mediaglobal.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const plainText = stripHtml(html);

    const snapshot = {
      url,
      final_url: response.url || url,
      title: extractMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
      meta_description: extractMatch(
        html,
        /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i
      ),
      h1: extractMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
      h2: extractAllMatches(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi, 3),
      hero_text: buildHeroSnippet(plainText.split("\n").filter(Boolean).slice(0, 4).join(" ")),
      signals: detectVisibleSignals(html, plainText),
    };

    snapshot.findings = buildFindings(snapshot);
    snapshot.priorities = buildPriorities(snapshot);
    snapshot.summary = [
      snapshot.hero_text
        ? "La home sí comunica una propuesta inicial."
        : "La propuesta de valor no queda del todo clara en el primer vistazo.",
      snapshot.signals?.has_cta
        ? "Se ve intención de captación con CTA visibles."
        : "La captación podría reforzarse con una CTA más clara.",
      snapshot.signals?.has_trust_signals
        ? "Hay alguna señal de confianza."
        : "La credibilidad visible se puede reforzar.",
    ].join(" ");

    snapshot.recommended_focus =
      snapshot.priorities?.[0] || "Mejorar claridad, captación y confianza en la home.";

    return snapshot;
  } finally {
    clearTimeout(timeout);
  }
}
