function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

  const normalized = normalizeKey(v);
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
  if (/^(agencia|asesor\S*|bufete|cl\S*nica|consultora|despacho|ecommerce|empresa|estudio|tienda)\b/iu.test(v)) {
    return false;
  }
  if (companyLikePrefixes.some((prefix) => normalized.startsWith(prefix))) return false;
  if (/\b(sl|s l|slu|sa|s a)\b/.test(normalized)) return false;

  const invalidExact = [
    "si",
    "sí",
    "si si",
    "sí sí",
    "si por favor",
    "sí por favor",
    "por favor",
    "si gracias",
    "sí gracias",
    "prefiero por whatsapp",
    "prefiero whatsapp",
    "por whatsapp",
    "whatsapp",
    "email",
    "correo",
    "mail",
    "ok",
    "vale",
    "perfecto",
    "gracias",
    "google ads",
    "meta ads",
    "seo",
    "web",
    "soporte",
    "mantenimiento",
    "emailing",
    "ropa",
    "catalogo",
    "catálogo",
    "pasarela",
    "pasarela de pago",
    "tienda online",
    "ecommerce",
    "shopify",
    "woocommerce",
    "prestashop",
    "magento",
    "wordpress",
    "plugin",
    "plugins",
    "cms",
    "trafico",
    "tráfico",
    "alta",
    "media",
    "baja",
    "esta semana",
    "esta misma semana",
    "instagram",
    "facebook",
    "telefono",
    "teléfono",
    "numero",
    "número"
  ];

  if (invalidExact.map(normalizeKey).includes(normalizeKey(v))) return false;
  if (/[¿?]\s*$/.test(v) || v.includes("¿")) return false;
  if (/^[\p{L}?\s'-]+$/u.test(v)) return true;

  if (!/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'-]+$/.test(v)) return false;

  return true;
}

function userExplicitlyCorrectedName(lastUserMessage = "") {
  const msg = normalizeKey(lastUserMessage);

  return [
    "me llamo",
    "mi nombre es",
    "soy ",
    "nombre correcto",
    "corrijo mi nombre",
    "no, mi nombre es",
    "el nombre es",
    "te lo dije antes"
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

function shouldAcceptNameCandidate(currentLead, extractedLead, lastUserMessage) {
  const candidate = normalizeText(extractedLead?.name);
  if (!looksLikeValidName(candidate)) return false;
  if (userExplicitlyCorrectedName(lastUserMessage)) return true;

  const currentStep = normalizeText(currentLead?.current_step);
  if (currentStep === "ask_name" || currentStep === "close_ask_name") return true;

  return Boolean(
    !currentLead?.name &&
      (currentLead?.email ||
        currentLead?.phone ||
        currentLead?.company_name ||
        extractedLead?.email ||
        extractedLead?.phone ||
        extractedLead?.company_name) &&
      (currentLead?.interest_service || currentLead?.main_goal || currentLead?.company_name)
  );
}

function shouldReplaceMainGoal(currentGoal, nextGoal) {
  const current = normalizeKey(currentGoal);
  const next = normalizeKey(nextGoal);
  if (!next) return false;
  if (!current) return true;
  if (current === next) return false;

  const currentIsGeneric =
    /\b(mejorar|mejorar mis clientes|clientes|ventas|negocio)\b/.test(current) &&
    !/\b(captar|conseguir|generar|leads|contactos|citas|solicitudes)\b/.test(current);
  const nextIsMoreSpecific =
    /\b(captar|conseguir|generar|leads|contactos|clientes nuevos|citas|solicitudes|reservas|pacientes|vender|ventas|checkout|conversion|medicion|medición|priorizar|reducir|coste por lead|cpl)\b/.test(next);
  const currentIsServiceExploration =
    /\b(seo|google ads|meta|anuncios|campanas|campañas|diseno web|diseño web|shopify)\b/.test(current);

  return (currentIsGeneric || currentIsServiceExploration) && nextIsMoreSpecific;
}

function shouldReplaceService(currentService, nextService, lastUserMessage) {
  const current = normalizeKey(currentService);
  const next = normalizeKey(nextService);
  const message = normalizeKey(lastUserMessage);
  if (!next) return false;
  if (!current) return true;
  if (current === next) return false;

  if (message.includes("mejor") || message.includes("prefiero") || message.includes("primero")) {
    return true;
  }

  if (next === "shopify" && /\b(primero|mejor|prefiero)\s+shopify\b/.test(message)) return true;
  if (next.includes("google ads") && message.includes("google ads")) return true;
  if (next.includes("redes sociales") && (message.includes("meta") || message.includes("instagram") || message.includes("facebook"))) {
    return true;
  }
  if (next.includes("consultoria") && message.includes("consultoria")) return true;
  if (next.includes("consultoría") && message.includes("consultoria")) return true;

  return false;
}

function rejectsCurrentService(currentService, lastUserMessage) {
  const current = normalizeKey(currentService);
  const message = normalizeKey(lastUserMessage);
  if (!current || !message) return false;

  const rejectPrefix = "(no quiero|no necesito|no me vendas|no busco|no es)";
  if (current === "seo") return new RegExp(`${rejectPrefix}[^.]{0,60}\\bseo\\b`).test(message);
  if (current.includes("google ads")) return new RegExp(`${rejectPrefix}[^.]{0,60}\\b(google ads|sem|anuncios)\\b`).test(message);
  if (current.includes("redes sociales")) return new RegExp(`${rejectPrefix}[^.]{0,60}\\b(meta|facebook|instagram|redes)\\b`).test(message);
  if (current.includes("diseno") || current.includes("dise")) return new RegExp(`${rejectPrefix}[^.]{0,60}\\b(web|pagina)\\b`).test(message);
  if (current.includes("automatizacion") || current.includes("automatizaci")) return new RegExp(`${rejectPrefix}[^.]{0,60}\\b(crm|automatiz)\\b`).test(message);
  return false;
}

function shouldReplaceBusinessType(currentType, nextType) {
  const current = normalizeKey(currentType);
  const next = normalizeKey(nextType);
  if (!next) return false;
  if (!current) return true;
  if (current === next) return false;
  return ["empresa", "negocio", "proyecto"].includes(current);
}

function chooseField(currentValue, newValue, validator) {
  const current = normalizeText(currentValue);
  const next = normalizeText(newValue);

  if (!validator(next)) return current;
  if (!current) return next;

  return current;
}

function normalizeCustomFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const cleanKey = normalizeText(key)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!cleanKey) continue;
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    if (typeof rawValue === "boolean" || typeof rawValue === "number") {
      output[cleanKey] = rawValue;
      continue;
    }
    if (Array.isArray(rawValue)) {
      const values = rawValue.map((item) => normalizeText(item)).filter(Boolean);
      if (values.length) output[cleanKey] = values;
      continue;
    }
    if (typeof rawValue === "object") continue;
    const cleanValue = normalizeText(rawValue);
    if (cleanValue) output[cleanKey] = cleanValue;
  }
  return output;
}

export function mergeLeadData({ currentLead, extractedLead, lastUserMessage }) {
  const merged = { ...currentLead };

  if (shouldReplaceName(currentLead?.name, extractedLead?.name, lastUserMessage)) {
    merged.name = normalizeText(extractedLead.name);
  } else if (
    !normalizeText(currentLead?.name) &&
    shouldAcceptNameCandidate(currentLead, extractedLead, lastUserMessage)
  ) {
    merged.name = normalizeText(extractedLead.name);
  }

  merged.email = chooseField(currentLead?.email, extractedLead?.email, looksLikeEmail);
  merged.phone = chooseField(currentLead?.phone, extractedLead?.phone, looksLikePhone);

  if (shouldReplaceService(currentLead?.interest_service, extractedLead?.interest_service, lastUserMessage)) {
    merged.interest_service = normalizeText(extractedLead.interest_service);
  } else if (rejectsCurrentService(currentLead?.interest_service, lastUserMessage)) {
    merged.interest_service = "";
  }

  if (!normalizeText(currentLead?.urgency) && isMeaningful(extractedLead?.urgency)) {
    merged.urgency = normalizeText(extractedLead.urgency);
  }

  if (!normalizeText(currentLead?.budget_range) && isMeaningful(extractedLead?.budget_range)) {
    merged.budget_range = normalizeText(extractedLead.budget_range);
  }

  if (shouldReplaceBusinessType(currentLead?.business_type, extractedLead?.business_type)) {
    merged.business_type = normalizeText(extractedLead.business_type);
  }

  if (!normalizeText(currentLead?.business_activity) && isMeaningful(extractedLead?.business_activity)) {
    merged.business_activity = normalizeText(extractedLead.business_activity);
  }

  if (!normalizeText(currentLead?.company_name) && isMeaningful(extractedLead?.company_name)) {
    merged.company_name = normalizeText(extractedLead.company_name);
  }

  if (shouldReplaceMainGoal(currentLead?.main_goal, extractedLead?.main_goal)) {
    merged.main_goal = normalizeText(extractedLead.main_goal);
  }

  if (!normalizeText(currentLead?.current_situation) && isMeaningful(extractedLead?.current_situation)) {
    merged.current_situation = normalizeText(extractedLead.current_situation);
  }

  if (!normalizeText(currentLead?.pain_points) && isMeaningful(extractedLead?.pain_points)) {
    merged.pain_points = normalizeText(extractedLead.pain_points);
  }

  if (
    !normalizeText(currentLead?.preferred_contact_channel) &&
    isMeaningful(extractedLead?.preferred_contact_channel)
  ) {
    merged.preferred_contact_channel = normalizeText(extractedLead.preferred_contact_channel);
  } else if (
    isMeaningful(extractedLead?.preferred_contact_channel) &&
    /prefiero|whatsapp|wasap|telefono|tel[eé]fono|email|correo|mail/i.test(lastUserMessage || "")
  ) {
    merged.preferred_contact_channel = normalizeText(extractedLead.preferred_contact_channel);
  }

  if (!normalizeText(currentLead?.last_intent) && isMeaningful(extractedLead?.last_intent)) {
    merged.last_intent = normalizeText(extractedLead.last_intent);
  }

  if (isMeaningful(extractedLead?.current_step)) {
    merged.current_step = normalizeText(extractedLead.current_step);
  }

  if (isMeaningful(extractedLead?.last_question)) {
    merged.last_question = normalizeText(extractedLead.last_question);
  }

  merged.custom_fields = {
    ...normalizeCustomFields(currentLead?.custom_fields),
    ...normalizeCustomFields(extractedLead?.custom_fields),
  };

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
