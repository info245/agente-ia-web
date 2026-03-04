// backend/src/lib/leadEmailPolicy.js

/**
 * Campos que consideramos "relevantes" para enviar una actualización.
 * Ajusta esta lista si quieres.
 */
const IMPORTANT_FIELDS = [
  "name",
  "email",
  "phone",
  "interest_service",
  "urgency",
  "budget_range",
  "lead_score",
];

/**
 * Genera una firma estable del lead (solo campos importantes).
 * Si la firma cambia, significa que hay novedades relevantes.
 */
export function buildLeadSignature(lead = {}) {
  const payload = {};
  for (const f of IMPORTANT_FIELDS) {
    payload[f] = lead?.[f] ?? null;
  }
  return JSON.stringify(payload);
}

/**
 * Devuelve qué campos importantes han cambiado entre before y after.
 */
export function getChangedImportantFields(before = {}, after = {}) {
  const changed = [];
  for (const f of IMPORTANT_FIELDS) {
    const b = before?.[f] ?? null;
    const a = after?.[f] ?? null;

    // normalización simple de strings
    const bn = typeof b === "string" ? b.trim() : b;
    const an = typeof a === "string" ? a.trim() : a;

    if (bn !== an) changed.push(f);
  }
  return changed;
}

/**
 * Decide si enviar email:
 * - sendType: "new" | "update" | "none"
 *
 * Reglas:
 * - "new": si antes NO había lead y ahora sí hay contacto (email o phone) o mínimo name+interest
 * - "update": si ya existía lead y han cambiado campos importantes y hay mejoras (p.ej presupuesto/urgencia/phone/email)
 * - Evita spam con signature cache (externa, en memoria) y ventana mínima en minutos
 */
export function decideEmailSend({
  leadBefore,
  leadAfter,
  lastSignatureSent,
  minMinutesBetween = 10,
  lastSentAtMs = 0,
}) {
  const now = Date.now();

  const hasAnyData = !!(leadAfter?.name || leadAfter?.email || leadAfter?.phone || leadAfter?.interest_service);
  if (!hasAnyData) return { sendType: "none", changedFields: [] };

  const hasContactAfter = !!(leadAfter?.email || leadAfter?.phone);
  const hasMinimalAfter = !!(leadAfter?.name && leadAfter?.interest_service);

  const beforeExists = !!(leadBefore && (leadBefore.email || leadBefore.phone || leadBefore.name || leadBefore.interest_service));
  const afterSignature = buildLeadSignature(leadAfter);

  // Si no existía nada antes, y ahora hay algo útil -> NEW
  if (!beforeExists && (hasContactAfter || hasMinimalAfter)) {
    return { sendType: "new", changedFields: getChangedImportantFields(leadBefore || {}, leadAfter || {}) };
  }

  // Si existía antes -> UPDATE solo si cambian campos importantes
  const changedFields = getChangedImportantFields(leadBefore || {}, leadAfter || {});
  if (!changedFields.length) return { sendType: "none", changedFields: [] };

  // Ventana mínima entre envíos (por si el usuario manda 5 mensajes seguidos)
  if (now - lastSentAtMs < minMinutesBetween * 60_000) {
    // Permitimos update si el cambio incluye presupuesto o urgencia o teléfono (cambio muy valioso)
    const highValueChange = changedFields.some((f) => ["budget_range", "urgency", "phone", "email"].includes(f));
    if (!highValueChange) return { sendType: "none", changedFields: [] };
  }

  // Si ya enviamos exactamente esta misma firma, no vuelvas a enviar
  if (lastSignatureSent && lastSignatureSent === afterSignature) {
    return { sendType: "none", changedFields: [] };
  }

  // Update solo si el cambio incluye algo relevante (evita updates por micro cambios)
  const relevantChange = changedFields.some((f) =>
    ["budget_range", "urgency", "phone", "email", "interest_service", "lead_score", "name"].includes(f)
  );

  if (!relevantChange) return { sendType: "none", changedFields: [] };

  return { sendType: "update", changedFields };
}s