import { extractLeadDataFromText, looksLikeValidName } from "./leadExtractor.js";
import { isBetaAccessRequest, normalizeIntentText } from "./conversationIntent.js";

const BETA_STEP_PREFIX = "beta:";
const BETA_SOURCE_PLATFORM = "sancho_chat";
const BETA_SOURCE_FORM = "Solicitud beta Sancho AI";
const BETA_SERVICE = "Sancho AI · Beta";
const BETA_BUDGET = "beta gratuita / 0 EUR";

const BETA_QUESTIONS = {
  "beta:ask_name": "¿Cuál es tu nombre?",
  "beta:ask_email": "¿Cuál es tu email profesional?",
  "beta:ask_company": "¿Cómo se llama tu empresa?",
  "beta:ask_message": "Cuéntame qué canales, objetivos o tipo de implantación quieres valorar.",
  "beta:ask_privacy": "Para tramitar la solicitud, ¿aceptas la Política de privacidad (https://www.heysancho.com/politica-privacidad) y las Condiciones generales (https://www.heysancho.com/condiciones-generales)?",
  "beta:ask_marketing": "De forma opcional, ¿quieres recibir comunicaciones comerciales relacionadas con Sancho AI, sus demostraciones, actualizaciones y propuestas? Puedes responder sí o no.",
};

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function customFields(lead = {}) {
  return lead?.custom_fields && typeof lead.custom_fields === "object" && !Array.isArray(lead.custom_fields)
    ? lead.custom_fields
    : {};
}

function mergeLeadPatch(lead = {}, patch = {}) {
  return {
    ...(lead || {}),
    ...(patch || {}),
    custom_fields: {
      ...customFields(lead),
      ...customFields(patch),
    },
  };
}

function parseYesNo(value = "") {
  const text = normalizeIntentText(value);
  if (!text) return null;
  if (/^(no|no gracias|prefiero que no|no acepto|no quiero)(?:\b|$)/.test(text)) return false;
  if (/^(si|acepto|de acuerdo|confirmo|claro|por supuesto)(?:\b|$)/.test(text)) return true;
  if (/\b(si acepto|acepto la politica|acepto las condiciones|doy mi consentimiento)\b/.test(text)) {
    return true;
  }
  return null;
}

function wantsToCancel(value = "") {
  const text = normalizeIntentText(value);
  return /\b(cancelar|cancela|anular|salir)\b.*\b(beta|solicitud|proceso)\b/.test(text) ||
    /\b(no quiero|ya no quiero)\b.*\b(beta|continuar|solicitud)\b/.test(text);
}

function safeName(message = "", lead = {}) {
  const extracted = extractLeadDataFromText(message, { ...(lead || {}), current_step: "ask_name" });
  const candidate = cleanText(extracted?.name || message).replace(/^(?:me llamo|mi nombre es|soy)\s+/i, "");
  return looksLikeValidName(candidate) ? candidate : null;
}

function safeEmail(message = "", lead = {}) {
  const extracted = extractLeadDataFromText(message, { ...(lead || {}), current_step: "ask_email" });
  const email = cleanText(extracted?.email || message).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function safeCompany(message = "", lead = {}) {
  const extracted = extractLeadDataFromText(message, { ...(lead || {}), current_step: "ask_company_name" });
  const candidate = cleanText(extracted?.company_name || message)
    .replace(/^(?:mi empresa se llama|la empresa se llama|mi empresa es|la empresa es|empresa)\s+/i, "")
    .replace(/[.,;:]+$/g, "")
    .trim();
  const normalized = normalizeIntentText(candidate);
  if (!candidate || candidate.length < 2 || candidate.length > 100) return null;
  if (candidate.includes("@") || /[?¿]/.test(candidate)) return null;
  if (/^(si|no|vale|ok|gracias|prefiero|no tengo empresa)$/.test(normalized)) return null;
  return candidate;
}

function safeRequestMessage(message = "") {
  const candidate = cleanText(message);
  const normalized = normalizeIntentText(candidate);
  if (candidate.length < 8 || candidate.length > 1200) return null;
  if (/^(si|no|vale|ok|gracias|perfecto)$/.test(normalized)) return null;
  return candidate;
}

function seedBetaPatch(lead = {}) {
  const existingCustom = customFields(lead);
  const messageCandidate = cleanText(
    existingCustom.mensaje_formulario || lead?.main_goal || lead?.current_situation || ""
  );
  const existingMessage = isBetaAccessRequest(messageCandidate) ? "" : messageCandidate;
  return {
    interest_service: BETA_SERVICE,
    budget_range: BETA_BUDGET,
    source_platform: BETA_SOURCE_PLATFORM,
    source_form_name: BETA_SOURCE_FORM,
    custom_fields: {
      ...existingCustom,
      solicitud_beta: "Sí",
      asunto_formulario: "Solicitar demo",
      ...(existingMessage ? { mensaje_formulario: existingMessage } : {}),
    },
  };
}

function getNextBetaStep(lead = {}) {
  const fields = customFields(lead);
  if (lead?.consent !== true || fields.consentimiento_privacidad !== "Aceptado") {
    return "beta:ask_privacy";
  }
  if (!cleanText(lead?.name)) return "beta:ask_name";
  if (!cleanText(lead?.email)) return "beta:ask_email";
  if (!cleanText(lead?.company_name)) return "beta:ask_company";
  if (!cleanText(fields.mensaje_formulario)) return "beta:ask_message";
  if (!cleanText(fields.consentimiento_comercial)) return "beta:ask_marketing";
  return "completed";
}

function questionReply(step = "", prefix = "") {
  const question = BETA_QUESTIONS[step] || BETA_QUESTIONS["beta:ask_name"];
  return `${prefix ? `${prefix} ` : ""}${question}`.trim();
}

function invalidAnswerReply(step = "") {
  const messages = {
    "beta:ask_name": "Necesito un nombre válido para identificar la solicitud.",
    "beta:ask_email": "Ese email no parece válido; revísalo, por favor.",
    "beta:ask_company": "Necesito el nombre de la empresa para preparar el acceso.",
    "beta:ask_message": "Necesito un poco de contexto sobre los canales, objetivos o la implantación que quieres valorar.",
    "beta:ask_privacy": "Necesito una respuesta explícita: aceptar la privacidad y las condiciones es obligatorio para tramitar el acceso.",
    "beta:ask_marketing": "Esta autorización es opcional, pero necesito registrar tu elección. Responde sí o no.",
  };
  return questionReply(step, messages[step] || "No he podido validar ese dato.");
}

function answerPatchForStep(step = "", message = "", lead = {}) {
  if (step === "beta:ask_name") {
    const name = safeName(message, lead);
    return name ? { valid: true, patch: { name } } : { valid: false, patch: {} };
  }
  if (step === "beta:ask_email") {
    const email = safeEmail(message, lead);
    return email ? { valid: true, patch: { email } } : { valid: false, patch: {} };
  }
  if (step === "beta:ask_company") {
    const company_name = safeCompany(message, lead);
    return company_name ? { valid: true, patch: { company_name } } : { valid: false, patch: {} };
  }
  if (step === "beta:ask_message") {
    const requestMessage = safeRequestMessage(message);
    return requestMessage
      ? {
          valid: true,
          patch: {
            main_goal: requestMessage,
            custom_fields: {
              ...customFields(lead),
              mensaje_formulario: requestMessage,
            },
          },
        }
      : { valid: false, patch: {} };
  }
  if (step === "beta:ask_privacy") {
    const choice = parseYesNo(message);
    if (choice === null) return { valid: false, patch: {} };
    if (!choice) {
      return {
        valid: false,
        declinedPrivacy: true,
        patch: {
          consent: false,
          custom_fields: {
            ...customFields(lead),
            consentimiento_privacidad: "Rechazado",
          },
        },
      };
    }
    return {
      valid: true,
      patch: {
        consent: true,
        consent_at: new Date().toISOString(),
        custom_fields: {
          ...customFields(lead),
          consentimiento_privacidad: "Aceptado",
        },
      },
    };
  }
  if (step === "beta:ask_marketing") {
    const choice = parseYesNo(message);
    return choice === null
      ? { valid: false, patch: {} }
      : {
          valid: true,
          patch: {
            custom_fields: {
              ...customFields(lead),
              consentimiento_comercial: choice ? "Aceptado" : "Rechazado",
            },
          },
        };
  }
  return { valid: false, patch: {} };
}

export function isBetaAccessActive(lead = {}) {
  const step = String(lead?.current_step || "").trim();
  return step.startsWith(BETA_STEP_PREFIX) && step !== "beta:cancelled";
}

export function isBetaAccessLead(lead = {}) {
  return customFields(lead).solicitud_beta === "Sí" || lead?.source_form_name === BETA_SOURCE_FORM;
}

export function isBetaAccessComplete(lead = {}) {
  return isBetaAccessLead(lead) &&
    lead?.current_step === "completed" &&
    customFields(lead).estado_solicitud_beta === "Lista para revisión";
}

export function buildBetaAccessReply({ message = "", lead = {}, starting = false } = {}) {
  if (!starting && !isBetaAccessActive(lead)) {
    return { handled: false, assistant_message: "", lead_patch: {} };
  }

  if (starting && isBetaAccessComplete(lead)) {
    return {
      handled: true,
      assistant_message: "Tu solicitud de acceso a la beta ya está registrada. El equipo revisará los datos y continuará contigo por el email que dejaste.",
      lead_patch: {},
    };
  }

  if (!starting && wantsToCancel(message)) {
    return {
      handled: true,
      assistant_message: "He cancelado la solicitud de beta. No continuaré pidiendo datos para este acceso.",
      lead_patch: {
        current_step: "beta:cancelled",
        last_question: "beta_cancelled",
        custom_fields: {
          ...customFields(lead),
          estado_solicitud_beta: "Cancelada",
        },
      },
    };
  }

  const seedPatch = seedBetaPatch(lead);
  const seededLead = mergeLeadPatch(lead, seedPatch);

  if (starting) {
    const nextStep = getNextBetaStep(seededLead);
    if (nextStep === "completed") {
      return {
        handled: true,
        assistant_message: "Tu solicitud de acceso a la beta ya tiene todos los datos necesarios y ha quedado registrada para revisión.",
        lead_patch: {
          ...seedPatch,
          current_step: "completed",
          last_question: "beta_application_complete",
          custom_fields: {
            ...customFields(seededLead),
            estado_solicitud_beta: "Lista para revisión",
          },
        },
      };
    }
    const intro = "Para darte acceso a la beta recogeré los mismos datos que solicita el formulario, uno cada vez.";
    return {
      handled: true,
      assistant_message: questionReply(nextStep, intro),
      lead_patch: {
        ...seedPatch,
        current_step: nextStep,
        last_question: BETA_QUESTIONS[nextStep],
      },
    };
  }

  const activeStep = String(lead?.current_step || "").trim();
  const answered = answerPatchForStep(activeStep, message, seededLead);
  if (!answered.valid) {
    const privacyPrefix = answered.declinedPrivacy
      ? "Sin aceptar la privacidad y las condiciones no puedo tramitar el acceso; no guardaré la solicitud como lista para revisión."
      : "";
    return {
      handled: true,
      assistant_message: privacyPrefix
        ? questionReply(activeStep, privacyPrefix)
        : invalidAnswerReply(activeStep),
      lead_patch: {
        ...seedPatch,
        ...answered.patch,
        current_step: activeStep,
        last_question: BETA_QUESTIONS[activeStep],
      },
    };
  }

  const answeredLead = mergeLeadPatch(seededLead, answered.patch);
  const nextStep = getNextBetaStep(answeredLead);
  if (nextStep === "completed") {
    return {
      handled: true,
      assistant_message: "Perfecto. Tu solicitud de acceso a la beta ha quedado registrada. El equipo revisará el contexto y continuará contigo por email.",
      lead_patch: {
        ...seedPatch,
        ...answered.patch,
        current_step: "completed",
        last_question: "beta_application_complete",
        custom_fields: {
          ...customFields(answeredLead),
          estado_solicitud_beta: "Lista para revisión",
        },
      },
    };
  }

  return {
    handled: true,
    assistant_message: questionReply(nextStep),
    lead_patch: {
      ...seedPatch,
      ...answered.patch,
      current_step: nextStep,
      last_question: BETA_QUESTIONS[nextStep],
    },
  };
}

export const __betaAccessFlowTestables = {
  BETA_QUESTIONS,
  answerPatchForStep,
  getNextBetaStep,
  mergeLeadPatch,
  parseYesNo,
  seedBetaPatch,
};
