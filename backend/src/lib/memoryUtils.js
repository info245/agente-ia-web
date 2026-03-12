// backend/src/lib/memoryUtils.js

function norm(v = "") {
  return String(v || "").trim();
}

function firstNonEmpty(...values) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

function isLikelyQuestion(text = "") {
  const t = String(text || "").trim().toLowerCase();

  if (!t) return false;
  if (t.includes("?")) return true;

  return /^(que|qué|como|cómo|cuando|cuándo|donde|dónde|por que|por qué|cuanto|cuánto|declaras|puedes|tienes|ofreces|hacéis|haceis|trabajáis|trabajais)\b/i.test(
    t
  );
}

function safeAppendUnique(existing = "", incoming = [], separator = " | ") {
  const set = new Set(
    String(existing || "")
      .split(separator)
      .map((x) => x.trim())
      .filter(Boolean)
  );

  for (const item of incoming) {
    const clean = String(item || "").trim();
    if (clean) set.add(clean);
  }

  return set.size ? [...set].join(separator) : null;
}

export function detectBusinessType(text = "", existing = null) {
  const t = String(text || "").toLowerCase();

  if (!t.trim()) return existing || null;

  if (/(ecommerce|e-commerce|tienda\s+online|shopify|woocommerce|prestashop)/i.test(t)) {
    return "Ecommerce";
  }
  if (/(cl[ií]nica|medicina est[eé]tica|dentista|dermatolog)/i.test(t)) {
    return "Clínica";
  }
  if (/(hotel|hostal|apartamento tur[ií]stico|turismo)/i.test(t)) {
    return "Hotel / Turismo";
  }
  if (/(abogado|bufete|despacho)/i.test(t)) {
    return "Despacho de abogados";
  }
  if (/(inmobiliaria|hipoteca|asesor hipotecario)/i.test(t)) {
    return "Inmobiliaria / Hipotecas";
  }
  if (/(restaurante|cafeter[ií]a|bar)/i.test(t)) {
    return "Restauración";
  }
  if (/(colegio|ampa|asociaci[oó]n de padres)/i.test(t)) {
    return "Educación / AMPA";
  }

  return existing || null;
}

export function detectMainGoal(text = "", existing = null) {
  const t = String(text || "").toLowerCase();

  if (!t.trim()) return existing || null;

  if (/(lead|leads|contactos|formularios|citas|solicitudes)/i.test(t)) {
    return "Captación de leads";
  }
  if (/(ventas|vender|compras|conversiones|roas|facturaci[oó]n)/i.test(t)) {
    return "Ventas";
  }
  if (/(tr[aá]fico|visitas|audiencia)/i.test(t)) {
    return "Tráfico";
  }
  if (/(branding|marca|visibilidad|notoriedad)/i.test(t)) {
    return "Branding";
  }
  if (/(seo|posicionamiento|google org[aá]nico)/i.test(t)) {
    return "Posicionamiento orgánico";
  }

  return existing || null;
}

export function detectPainPoints(text = "", existing = null) {
  const t = String(text || "").toLowerCase();
  const pains = [];

  if (!t.trim()) return existing || null;

  if (/(no.*ventas|vendo poco|pocas ventas|no vendo)/i.test(t)) {
    pains.push("Pocas ventas");
  }
  if (/(no.*lead|pocos contactos|pocas consultas|pocos clientes)/i.test(t)) {
    pains.push("Pocos leads");
  }
  if (/(caro|coste alto|cpc alto|muy caro)/i.test(t)) {
    pains.push("Coste alto");
  }
  if (/(no aparece|no posiciona|no salgo en google)/i.test(t)) {
    pains.push("Baja visibilidad");
  }
  if (/(no convierte|mucho tr[aá]fico pero no convierte)/i.test(t)) {
    pains.push("Baja conversión");
  }

  if (!pains.length) return existing || null;

  return safeAppendUnique(existing, pains, " | ");
}

export function detectCurrentSituation(text = "", existing = null) {
  const t = String(text || "").toLowerCase();

  if (!t.trim()) return existing || null;

  if (/(ya hago google ads|ya tengo google ads|ya hago campa[nñ]as)/i.test(t)) {
    return "Ya realiza campañas";
  }
  if (/(no he hecho nunca|nunca he hecho publicidad|empiezo de cero)/i.test(t)) {
    return "Parte desde cero";
  }
  if (/(ya tengo web|tengo una web|mi web es)/i.test(t)) {
    return firstNonEmpty(existing, "Ya tiene web");
  }
  if (/(quiero rehacer mi web|cambiar mi web|nueva web)/i.test(t)) {
    return "Necesita nueva web o rediseño";
  }

  return existing || null;
}

export function detectPreferredContactChannel({
  text = "",
  email = null,
  phone = null,
  existing = null,
}) {
  const t = String(text || "").toLowerCase();

  if (phone || /whatsapp|llamar|tel[eé]fono|telefono/i.test(t)) {
    return "Teléfono / WhatsApp";
  }

  if (email || /email|correo/i.test(t)) {
    return "Email";
  }

  return existing || null;
}

export function detectLastIntent(text = "", existing = null) {
  const t = String(text || "").toLowerCase();

  if (!t.trim()) return existing || "general";

  if (/(precio|cu[aá]nto cuesta|presupuesto|coste|tarifa)/i.test(t)) {
    return "pricing";
  }

  if (/(seo|google ads|meta ads|redes sociales|diseño web|consultor[ií]a|ia|automatiz)/i.test(t)) {
    return "service_interest";
  }

  if (/(email|correo|tel[eé]fono|telefono|whatsapp)/i.test(t)) {
    return "contact";
  }

  if (/(informaci[oó]n|c[oó]mo funciona|explica|dudas)/i.test(t)) {
    return "information";
  }

  if (isLikelyQuestion(t)) {
    return firstNonEmpty(existing, "information");
  }

  return existing || "general";
}

export function buildNotesAi({ existing = null, text = "", lead = {} }) {
  const snippets = [];

  if (lead?.interest_service) snippets.push(`Servicio: ${lead.interest_service}`);
  if (lead?.budget_range) snippets.push(`Presupuesto: ${lead.budget_range}`);
  if (lead?.main_goal) snippets.push(`Objetivo: ${lead.main_goal}`);
  if (lead?.business_type) snippets.push(`Negocio: ${lead.business_type}`);
  if (lead?.urgency) snippets.push(`Urgencia: ${lead.urgency}`);

  const raw = String(text || "").trim();
  if (raw) snippets.push(`Último mensaje: ${raw.slice(0, 180)}`);

  const next = snippets.join(" | ");
  if (!next) return existing || null;
  if (!existing) return next.slice(0, 1500);

  return `${existing} || ${next}`.slice(0, 1500);
}

export function buildMemoryPatch({ text = "", leadBefore = null, extracted = {}, mergedLead = {} }) {
  const safeText = String(text || "").trim();
  const previous = leadBefore || {};
  const merged = mergedLead || {};
  const extraction = extracted || {};

  const business_type = detectBusinessType(safeText, previous?.business_type);
  const main_goal = detectMainGoal(safeText, previous?.main_goal);
  const pain_points = detectPainPoints(safeText, previous?.pain_points);
  const current_situation = detectCurrentSituation(safeText, previous?.current_situation);

  const preferred_contact_channel = detectPreferredContactChannel({
    text: safeText,
    email: merged?.email,
    phone: merged?.phone,
    existing: previous?.preferred_contact_channel,
  });

  const last_intent = detectLastIntent(safeText, previous?.last_intent);

  const memoryLead = {
    ...merged,
    business_type,
    main_goal,
    pain_points,
    current_situation,
    preferred_contact_channel,
    last_intent,
    urgency: firstNonEmpty(extraction?.urgency, merged?.urgency, previous?.urgency),
  };

  const notes_ai = buildNotesAi({
    existing: previous?.notes_ai,
    text: safeText,
    lead: memoryLead,
  });

  return {
    business_type,
    main_goal,
    pain_points,
    current_situation,
    preferred_contact_channel,
    last_intent,
    notes_ai,
    last_seen_at: new Date().toISOString(),
  };
}

export function buildLeadMemoryContext(lead = null) {
  if (!lead) return "MEMORIA LEAD: No disponible.";

  const lines = [
    `Nombre: ${lead.name || "N/D"}`,
    `Servicio de interés: ${lead.interest_service || "N/D"}`,
    `Urgencia: ${lead.urgency || "N/D"}`,
    `Presupuesto: ${lead.budget_range || "N/D"}`,
    `Email: ${lead.email || "N/D"}`,
    `Teléfono: ${lead.phone || "N/D"}`,
    `Tipo de negocio: ${lead.business_type || "N/D"}`,
    `Objetivo principal: ${lead.main_goal || "N/D"}`,
    `Situación actual: ${lead.current_situation || "N/D"}`,
    `Pain points: ${lead.pain_points || "N/D"}`,
    `Canal de contacto preferido: ${lead.preferred_contact_channel || "N/D"}`,
    `Última intención detectada: ${lead.last_intent || "N/D"}`,
    `Notas IA: ${lead.notes_ai || "N/D"}`,
  ];

  return `MEMORIA DEL LEAD\n${lines.join("\n")}`;
}