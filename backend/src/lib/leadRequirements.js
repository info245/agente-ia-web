const CORE_FIELDS = new Set([
  "name",
  "company_name",
  "business_type",
  "business_activity",
  "interest_service",
  "main_goal",
  "budget_range",
  "urgency",
  "preferred_contact_channel",
  "email",
  "phone",
]);

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function captureFields(appConfig = null) {
  return appConfig?.lead_capture?.fields || {};
}

function shouldCapture(appConfig = null, field) {
  return captureFields(appConfig)?.[field] === true;
}

function missingCustomFields(lead = {}, appConfig = null) {
  const values = lead?.custom_fields && typeof lead.custom_fields === "object"
    ? lead.custom_fields
    : {};
  const configured = Array.isArray(appConfig?.lead_capture?.custom_fields)
    ? appConfig.lead_capture.custom_fields
    : [];

  return configured
    .filter((field) => field?.required === true && field?.key)
    .filter((field) => !CORE_FIELDS.has(field.key))
    .filter((field) => !hasValue(values[field.key]))
    .map((field) => `custom:${field.key}`);
}

export function getMissingLeadRequirements(lead = {}, appConfig = null) {
  const missing = [];

  if (shouldCapture(appConfig, "main_goal") && !hasValue(lead?.main_goal)) {
    missing.push("main_goal");
  }
  if (
    shouldCapture(appConfig, "business_type") &&
    !hasValue(lead?.business_type) &&
    !hasValue(lead?.business_activity)
  ) {
    missing.push("business_type");
  }
  if (shouldCapture(appConfig, "business_activity") && !hasValue(lead?.business_activity)) {
    missing.push("business_activity");
  }
  if (shouldCapture(appConfig, "interest_service") && !hasValue(lead?.interest_service)) {
    missing.push("interest_service");
  }
  if (shouldCapture(appConfig, "urgency") && !hasValue(lead?.urgency)) {
    missing.push("urgency");
  }
  if (shouldCapture(appConfig, "budget_range") && !hasValue(lead?.budget_range)) {
    missing.push("budget_range");
  }
  if (shouldCapture(appConfig, "company_name") && !hasValue(lead?.company_name)) {
    missing.push("company_name");
  }
  if (shouldCapture(appConfig, "name") && !hasValue(lead?.name)) {
    missing.push("name");
  }
  if (
    shouldCapture(appConfig, "preferred_contact_channel") &&
    !hasValue(lead?.preferred_contact_channel)
  ) {
    missing.push("preferred_contact_channel");
  }

  const wantsEmail = shouldCapture(appConfig, "email");
  const wantsPhone = shouldCapture(appConfig, "phone");
  if (wantsEmail && wantsPhone) {
    if (!hasValue(lead?.email) && !hasValue(lead?.phone)) missing.push("contact");
  } else if (wantsEmail && !hasValue(lead?.email)) {
    missing.push("email");
  } else if (wantsPhone && !hasValue(lead?.phone)) {
    missing.push("phone");
  }

  missing.push(...missingCustomFields(lead, appConfig));
  return missing;
}

export function hasRequiredLeadData(lead = {}, appConfig = null) {
  return getMissingLeadRequirements(lead, appConfig).length === 0;
}

export function hasConfiguredLeadRequirements(appConfig = null) {
  const hasCore = Object.values(captureFields(appConfig)).some((value) => value === true);
  const hasCustom = (appConfig?.lead_capture?.custom_fields || []).some(
    (field) => field?.required === true && field?.key
  );
  return hasCore || hasCustom;
}

export function getLeadRequirementPrompt(field = "", appConfig = null) {
  const prompts = {
    interest_service: "¿Qué servicio quieres valorar?",
    main_goal: "¿Qué resultado concreto quieres conseguir?",
    company_name: "¿Cómo se llama tu empresa o proyecto?",
    business_type: "¿A qué se dedica tu negocio o proyecto?",
    business_activity: "¿A qué se dedica exactamente tu negocio o proyecto?",
    budget_range: "¿Quieres empezar con la beta gratuita o tienes una inversión prevista?",
    urgency: "¿Te corre prisa ponerlo en marcha o es para más adelante?",
    preferred_contact_channel: "¿Prefieres continuar por WhatsApp o por email?",
    name: "¿A nombre de quién dejamos la solicitud?",
    contact: "¿Me dejas un email o teléfono de contacto?",
    email: "¿Me dejas un email de contacto?",
    phone: "¿Me dejas un teléfono o WhatsApp de contacto?",
  };

  if (field.startsWith("custom:")) {
    const key = field.slice("custom:".length);
    const custom = (appConfig?.lead_capture?.custom_fields || []).find(
      (item) => item?.key === key
    );
    return String(custom?.prompt || custom?.label || "¿Me das ese dato?").trim();
  }

  return prompts[field] || "¿Qué dato necesitas aclarar para continuar?";
}

export function getLeadRequirementStep(field = "") {
  if (field.startsWith("custom:")) return field;
  const steps = {
    main_goal: "ask_main_goal",
    business_type: "ask_business_type",
    business_activity: "ask_business_activity",
    interest_service: "ask_interest_service",
    urgency: "ask_urgency",
    budget_range: "ask_budget",
    company_name: "ask_company_name",
    name: "ask_name",
    preferred_contact_channel: "ask_preferred_contact_channel",
    contact: "ask_contact",
    email: "ask_email",
    phone: "ask_phone",
  };
  return steps[field] || "qualifying";
}

export const __leadRequirementsTestables = {
  shouldCapture,
  missingCustomFields,
};
