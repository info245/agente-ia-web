function normalizeText(value) {
  return String(value || "").trim();
}

function isMeaningful(value) {
  return normalizeText(value) !== "";
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value));
}

function looksLikePhone(value) {
  const digits = normalizeText(value).replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

function looksLikeValidName(value) {
  const v = normalizeText(value);

  if (!v) return false;
  if (v.length < 2 || v.length > 40) return false;
  if (looksLikeEmail(v)) return false;
  if (looksLikePhone(v)) return false;

  const invalidExact = [
    "si",
    "sí",
    "si si",
    "sí sí",
    "ok",
    "vale",
    "perfecto",
    "gracias",
    "google ads",
    "meta ads",
    "seo",
    "web",
    "trafico",
    "tráfico",
    "alta",
    "media",
    "baja",
    "esta semana",
    "esta misma semana"
  ];

  if (invalidExact.includes(v.toLowerCase())) return false;

  if (!/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'-]+$/.test(v)) return false;

  return true;
}

function userExplicitlyCorrectedName(lastUserMessage = "") {
  const msg = normalizeText(lastUserMessage).toLowerCase();

  return [
    "me llamo",
    "mi nombre es",
    "soy ",
    "nombre correcto",
    "corrijo mi nombre",
    "no, mi nombre es",
    "el nombre es"
  ].some((pattern) => msg.includes(pattern));
}

function shouldReplaceName(currentName, newName, lastUserMessage) {
  const current = normalizeText(currentName);
  const next = normalizeText(newName);

  if (!looksLikeValidName(next)) return false;
  if (!current) return true;
  if (current.toLowerCase() === next.toLowerCase()) return false;

  return userExplicitlyCorrectedName(lastUserMessage);
}

function chooseField(currentValue, newValue, validator) {
  const current = normalizeText(currentValue);
  const next = normalizeText(newValue);

  if (!validator(next)) return current;
  if (!current) return next;

  return current;
}

export function mergeLeadData({ currentLead, extractedLead, lastUserMessage }) {
  const merged = { ...currentLead };

  if (shouldReplaceName(currentLead?.name, extractedLead?.name, lastUserMessage)) {
    merged.name = normalizeText(extractedLead.name);
  } else if (!normalizeText(currentLead?.name) && looksLikeValidName(extractedLead?.name)) {
    merged.name = normalizeText(extractedLead.name);
  }

  merged.email = chooseField(currentLead?.email, extractedLead?.email, looksLikeEmail);
  merged.phone = chooseField(currentLead?.phone, extractedLead?.phone, looksLikePhone);

  if (!normalizeText(currentLead?.interest_service) && isMeaningful(extractedLead?.interest_service)) {
    merged.interest_service = normalizeText(extractedLead.interest_service);
  }

  if (!normalizeText(currentLead?.urgency) && isMeaningful(extractedLead?.urgency)) {
    merged.urgency = normalizeText(extractedLead.urgency);
  }

  if (!normalizeText(currentLead?.budget_range) && isMeaningful(extractedLead?.budget_range)) {
    merged.budget_range = normalizeText(extractedLead.budget_range);
  }

  if (typeof currentLead?.consent !== "boolean") {
    merged.consent = !!extractedLead?.consent;
  } else {
    merged.consent = currentLead.consent || !!extractedLead?.consent;
  }

  merged.lead_score = Math.max(
    Number(currentLead?.lead_score || 0),
    Number(extractedLead?.lead_score || 0)
  );

  return merged;
}

export {
  looksLikeValidName,
  looksLikeEmail,
  looksLikePhone
};