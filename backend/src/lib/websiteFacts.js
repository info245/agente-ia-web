import { sanitizeAppConfig } from "./appConfig.js";

function normalizeOfferName(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanCell(value) {
  return String(value || "").trim();
}

function splitSpreadsheetLine(line = "") {
  const raw = String(line || "");
  const delimiter = raw.includes("\t")
    ? "\t"
    : raw.includes(";")
      ? ";"
      : ",";
  return raw.split(delimiter).map((cell) => cleanCell(cell));
}

function parseSpreadsheetRows(raw = "") {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitSpreadsheetLine(lines[0]).map((header) =>
    normalizeOfferName(header)
  );

  return lines.slice(1).map((line) => {
    const cells = splitSpreadsheetLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cleanCell(cells[index]);
    });
    return row;
  });
}

function findColumnValue(row = {}, candidates = []) {
  for (const candidate of candidates) {
    const exact = row[candidate];
    if (exact) return exact;

    const foundKey = Object.keys(row).find((key) => key.includes(candidate));
    if (foundKey && row[foundKey]) return row[foundKey];
  }
  return "";
}

function mapRowToOfferFacts(row = {}) {
  const name = findColumnValue(row, [
    "servicio",
    "service",
    "nombre",
    "producto",
  ]);

  if (!name) return null;

  return {
    name,
    facts: {
      category: findColumnValue(row, ["categoria", "categorÃ­a", "category"]),
      min_monthly_fee: findColumnValue(row, [
        "precio mensual",
        "tarifa mensual",
        "mensual",
        "monthly fee",
        "monthly",
      ]),
      min_project_fee: findColumnValue(row, [
        "precio proyecto",
        "tarifa proyecto",
        "proyecto",
        "project fee",
        "project",
      ]),
      url: findColumnValue(row, ["url", "landing", "pagina", "página"]),
      description: findColumnValue(row, [
        "descripcion",
        "descripción",
        "description",
        "detalle",
      ]),
      notes: findColumnValue(row, [
        "notas",
        "notes",
        "observaciones",
        "condiciones",
      ]),
      conversion_goal: findColumnValue(row, [
        "objetivo conversion",
        "objetivo de conversion",
        "conversion goal",
        "cta",
      ]),
    },
  };
}

function mergeOfferFacts(base = {}, incoming = {}) {
  return {
    category: incoming.category || base.category || "",
    min_monthly_fee: incoming.min_monthly_fee || base.min_monthly_fee || "",
    min_project_fee: incoming.min_project_fee || base.min_project_fee || "",
    url: incoming.url || base.url || "",
    description: incoming.description || base.description || "",
    notes: incoming.notes || base.notes || "",
    conversion_goal: incoming.conversion_goal || base.conversion_goal || "",
  };
}

function getSpreadsheetOffers(appConfig = null) {
  const merged = sanitizeAppConfig(appConfig || {});
  const rows = parseSpreadsheetRows(
    merged?.knowledge_sources?.spreadsheet_data || ""
  );

  return rows.reduce((acc, row) => {
    const mapped = mapRowToOfferFacts(row);
    if (!mapped?.name) return acc;

    const existing = acc[mapped.name] || {};
    acc[mapped.name] = mergeOfferFacts(existing, mapped.facts);
    return acc;
  }, {});
}

function summariseOffers(offers = {}) {
  return Object.entries(offers)
    .slice(0, 8)
    .map(([name, facts]) => {
      const parts = [];
      if (facts?.category) parts.push(`categoria: ${facts.category}`);
      if (facts?.min_monthly_fee) parts.push(`mensual: ${facts.min_monthly_fee}`);
      if (facts?.min_project_fee) parts.push(`proyecto: ${facts.min_project_fee}`);
      if (facts?.url) parts.push(`url: ${facts.url}`);
      if (facts?.description) parts.push(`descripcion: ${facts.description}`);
      if (facts?.notes) parts.push(`notas: ${facts.notes}`);
      if (facts?.conversion_goal) parts.push(`objetivo: ${facts.conversion_goal}`);
      return `- ${name}${parts.length ? ` | ${parts.join(" | ")}` : ""}`;
    })
    .join("\n");
}

export function getWebsiteFacts(appConfig = null) {
  const merged = sanitizeAppConfig(appConfig || {});
  const manualOffers = Object.keys(merged.offers || {}).length
    ? merged.offers
    : merged.services || {};
  const legacyServices = merged.services || {};
  const spreadsheetOffers = getSpreadsheetOffers(merged);
  const offers = { ...spreadsheetOffers };

  for (const [offerName, facts] of Object.entries(manualOffers || {})) {
    offers[offerName] = mergeOfferFacts(offers[offerName], facts);
  }

  return {
    offers,
    services: Object.keys(offers).length ? offers : legacyServices,
    knowledge_sources: merged.knowledge_sources || {},
  };
}

export function getServiceFacts(serviceName, appConfig = null) {
  if (!serviceName) return null;

  const offers = getWebsiteFacts(appConfig).offers || {};
  const matchKey = Object.keys(offers).find(
    (key) => normalizeOfferName(key) === normalizeOfferName(serviceName)
  );

  return matchKey ? offers[matchKey] : null;
}

export function buildKnowledgeContext(appConfig = null) {
  const websiteFacts = getWebsiteFacts(appConfig);
  const knowledge = websiteFacts.knowledge_sources || {};
  const offersBlock = summariseOffers(websiteFacts.offers || websiteFacts.services || {});
  const websiteUrls = Array.isArray(knowledge.website_urls)
    ? knowledge.website_urls.filter(Boolean)
    : [];

  const sections = [];

  if (offersBlock) {
    sections.push(`OFERTAS, PRODUCTOS O SERVICIOS VERIFICADOS\n${offersBlock}`);
  }

  if (websiteUrls.length) {
    sections.push(
      `URLS DE REFERENCIA\n${websiteUrls
        .slice(0, 10)
        .map((url) => `- ${url}`)
        .join("\n")}`
    );
  }

  if (knowledge.website_focus) {
    sections.push(`FOCO DE EXTRACCION WEB\n${knowledge.website_focus}`);
  }

  if (knowledge.spreadsheet_mapping) {
    sections.push(`MAPEO DE TABLA\n${knowledge.spreadsheet_mapping}`);
  }

  if (knowledge.spreadsheet_url) {
    sections.push(`HOJA EXTERNA\n${knowledge.spreadsheet_url}`);
  }

  if (knowledge.internal_notes) {
    sections.push(`NOTAS INTERNAS\n${knowledge.internal_notes}`);
  }

  return sections.filter(Boolean).join("\n\n");
}
