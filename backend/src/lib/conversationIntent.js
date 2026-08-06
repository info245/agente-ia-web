export function normalizeIntentText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isGreetingOnly(text = "") {
  return /^(?:(?:hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hello)(?: (?:sancho|sanchito|equipo))?(?: que tal| como estas)?|que tal|como estas)$/.test(
    normalizeIntentText(text)
  );
}

export function isHumanRequest(text = "") {
  return /\b(hablar|contactar|pasame|pasadme|derivame|derivadme)\b.*\b(persona|humano|agente|equipo|asesor)\b|\b(atencion humana|agente humano)\b/.test(
    normalizeIntentText(text)
  );
}

export function isSupportRequest(text = "") {
  const value = normalizeIntentText(text);
  return (
    /\b(soporte|incidencia|problema tecnico|reclamacion|no funciona|ha dejado de funcionar|da error)\b/.test(value) ||
    /\b(factura|cobro|pago)\b.*\b(error|incorrect|duplicad|reclamacion|problema|no reconozco|no corresponde)\b/.test(value) ||
    /\b(error|incorrect|duplicad|reclamacion|problema|no reconozco|no corresponde)\b.*\b(factura|cobro|pago)\b/.test(value) ||
    /\b(tu|vuestra|esta) (web|pagina|chat|asistente)\b.*\b(falla|fallo|problema|error)\b/.test(value) ||
    /\b(falla|fallo|problema|error)\b.*\b(sancho|sanchito|tu web|vuestra web|este chat|esta web)\b/.test(value) ||
    /\b(la que no funciona (bien )?es la tuya)\b/.test(value)
  );
}

export function detectPriorityIntent(text = "") {
  if (isHumanRequest(text)) return "human_request";
  if (isSupportRequest(text)) return "support";
  if (isGreetingOnly(text)) return "greeting";
  return null;
}
