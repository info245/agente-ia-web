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
 * - "new": si antes NO había lead útil y ahora sí hay contacto (email o phone) o mínimo (name+interest_service)
 * - "update": si ya existía lead y han cambiado campos importantes y el cambio es relevante
 * - Evita spam con una ventana mínima entre envíos + signature
 */
export function decideEmailSend({
  leadBefore,
  leadAfter,
  lastSignatureSent,
  minMinutesBetween = 10,
  lastSentAtMs = 0,
}) {
  const now = Date.now();

  const hasAnyData = !!(
    leadAfter?.name ||
    leadAfter?.email ||
    leadAfter?.phone ||
    leadAfter?.interest_service
  );
  if (!hasAnyData) return { sendType: "none", changedFields: [] };

  const hasContactAfter = !!(leadAfter?.email || leadAfter?.phone);
  const hasMinimalAfter = !!(leadAfter?.name && leadAfter?.interest_service);

  const beforeExists = !!(
    leadBefore &&
    (leadBefore.email ||
      leadBefore.phone ||
      leadBefore.name ||
      leadBefore.interest_service)
  );

  const changedFields = getChangedImportantFields(leadBefore || {}, leadAfter || {});

  // 1) NEW: no existía lead útil antes y ahora sí
  if (!beforeExists && (hasContactAfter || hasMinimalAfter)) {
    return { sendType: "new", changedFields };
  }

  // 2) UPDATE: existía antes, pero solo si hay cambios importantes
  if (!changedFields.length) return { sendType: "none", changedFields: [] };

  // 3) Ventana mínima entre envíos para evitar spam
  if (now - lastSentAtMs < minMinutesBetween * 60_000) {
    // Permitimos update si el cambio es de alto valor (presupuesto/urgencia/phone/email)
    const highValueChange = changedFields.some((f) =>
      ["budget_range", "urgency", "phone", "email"].includes(f)
    );
    if (!highValueChange) return { sendType: "none", changedFields: [] };
  }

  // 4) Si ya enviamos exactamente esta misma firma, no repetimos
  const afterSignature = buildLeadSignature(leadAfter);
  if (lastSignatureSent && lastSignatureSent === afterSignature) {
    return { sendType: "none", changedFields: [] };
  }

  // 5) Update solo si el cambio incluye algo relevante
  const relevantChange = changedFields.some((f) =>
    ["budget_range", "urgency", "phone", "email", "interest_service", "lead_score", "name"].includes(f)
  );

  if (!relevantChange) return { sendType: "none", changedFields: [] };

  return { sendType: "update", changedFields };
}