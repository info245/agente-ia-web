export function normalizeCapabilityText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isCapabilityQuestion(value = "") {
  return /\b(integrar|integracion|conectar|conexion|compatible|api|mcp|webhook|erp|crm|salesforce|hubspot|odoo)\b/.test(
    normalizeCapabilityText(value)
  );
}

export function hasCapabilityEvidence(message = "", factsText = "") {
  const evidence = normalizeCapabilityText(factsText);
  if (!evidence) return false;
  const generic = new Set([
    "puedo", "puede", "usar", "propio", "como", "integra", "integrar", "integracion",
    "conectar", "conexion", "compatible", "api", "mcp", "webhook", "erp", "crm", "sistema",
    "datos", "sancho", "automaticamente", "configurar", "configuracion",
  ]);
  const entities = normalizeCapabilityText(message)
    .split(" ")
    .filter((word) => word.length >= 4 && !generic.has(word));
  return entities.length > 0 && entities.some((entity) => evidence.includes(entity));
}

export function buildUngroundedCapabilityReply({ message = "", factsText = "" } = {}) {
  if (!isCapabilityQuestion(message) || hasCapabilityEvidence(message, factsText)) return null;
  return "Con la información configurada no puedo confirmar que esa integración esté disponible tal cual. La vía habitual sería validar la API o los webhooks del sistema; MCP solo sería una opción si existe y se configura un conector específico. Antes de prometerlo, hay que comprobar la versión y el entorno que utilizas.";
}

export function guardCapabilityReply({ message = "", reply = "", factsText = "" } = {}) {
  const boundary = buildUngroundedCapabilityReply({ message, factsText });
  if (!boundary) return reply;
  const normalizedReply = normalizeCapabilityText(reply);
  const claimsAvailability =
    /\b(si|claro|por supuesto|es posible|se puede|permite|compatible|se integra|se conecta|mediante)\b/.test(normalizedReply) ||
    /\b(ayudarte|podemos ayudar)\b.*\b(integrar|integrarlo|configurar|conectar)\b/.test(normalizedReply) ||
    /\b(puede|puedo|podemos)\b.*\b(integrar|integrarlo|configurar|conectar)\b/.test(normalizedReply);
  return claimsAvailability ? boundary : reply;
}
