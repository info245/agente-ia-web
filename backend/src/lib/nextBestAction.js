function norm(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return norm(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasValue(value) {
  if (value === true || value === false) return true;
  if (Array.isArray(value)) return value.length > 0;
  return norm(value).length > 0;
}

function getCustomFieldValue(lead = {}, key = "") {
  const fields = lead?.custom_fields && typeof lead.custom_fields === "object"
    ? lead.custom_fields
    : {};
  return fields[key];
}

function getRequiredQualificationFields(appConfig = null) {
  const schema = Array.isArray(appConfig?.qualification_schema)
    ? appConfig.qualification_schema
    : [];

  return schema.filter((field) => field?.key && field?.required);
}

function getMissingQualificationFields({ lead = {}, appConfig = null } = {}) {
  return getRequiredQualificationFields(appConfig).filter((field) => {
    const value = getCustomFieldValue(lead, field.key);
    return !hasValue(value);
  });
}

function hasContact(lead = {}) {
  return norm(lead?.email).length >= 3 || norm(lead?.phone).replace(/\D/g, "").length >= 6;
}

function hasName(lead = {}) {
  return norm(lead?.name).length >= 2;
}

function getLeadFieldValue(lead = {}, fieldKey = "") {
  const key = norm(fieldKey);
  if (!key) return null;
  if (key === "phone_or_email") return hasContact(lead) ? lead.email || lead.phone : null;
  if (key.startsWith("custom.")) {
    return getCustomFieldValue(lead, key.slice("custom.".length));
  }
  return lead[key];
}

function getPersonalizationRules(appConfig = null) {
  return Array.isArray(appConfig?.personalization_rules)
    ? appConfig.personalization_rules.filter((rule) => rule?.enabled !== false && rule?.field)
    : [];
}

function ruleValueMatches({ actualValue, rule } = {}) {
  const operator = normalizeText(rule?.operator || "contains");
  const values = Array.isArray(rule?.values) ? rule.values.map(normalizeText).filter(Boolean) : [];
  if (operator === "exists") return hasValue(actualValue);
  if (!values.length) return false;

  const actual = Array.isArray(actualValue)
    ? actualValue.map(normalizeText).filter(Boolean)
    : [normalizeText(actualValue)].filter(Boolean);
  if (!actual.length) return false;

  if (operator === "equals") return actual.some((item) => values.includes(item));
  if (operator === "in") return values.some((value) => actual.includes(value));
  return actual.some((item) => values.some((value) => item.includes(value) || value.includes(item)));
}

function getMatchedPersonalization({ lead = {}, appConfig = null } = {}) {
  const matches = getPersonalizationRules(appConfig)
    .map((rule) => {
      const actualValue = getLeadFieldValue(lead, rule.field);
      if (!ruleValueMatches({ actualValue, rule })) return null;
      return {
        key: rule.key,
        label: rule.label,
        field: rule.field,
        matched_value: actualValue,
        pitch_angle: rule.pitch_angle || "",
        value_points: Array.isArray(rule.value_points) ? rule.value_points : [],
        objections: Array.isArray(rule.objections) ? rule.objections : [],
        cta: rule.cta || "",
        priority: Number(rule.priority) || 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority);

  return {
    active: matches[0] || null,
    matches,
  };
}

function getActionCatalog(appConfig = null) {
  return appConfig?.actions_catalog &&
    typeof appConfig.actions_catalog === "object" &&
    !Array.isArray(appConfig.actions_catalog)
    ? appConfig.actions_catalog
    : {};
}

function resolveActionConfig(actionKey = "", appConfig = null) {
  const catalog = getActionCatalog(appConfig);
  const action = catalog[actionKey] || null;
  if (!action || action.enabled === false) return null;
  return action;
}

function findActionByType(type = "", appConfig = null) {
  const catalog = getActionCatalog(appConfig);
  const match = Object.entries(catalog).find(
    ([, action]) => action?.enabled !== false && normalizeText(action?.type) === normalizeText(type)
  );
  return match?.[0] || null;
}

function getActionReadiness({ actionKey = "", lead = {}, appConfig = null } = {}) {
  const actionConfig = resolveActionConfig(actionKey, appConfig);
  const requiredFields = Array.isArray(actionConfig?.required_fields)
    ? actionConfig.required_fields
    : [];
  const missingRequiredFields = requiredFields.filter((fieldKey) => {
    const value = getLeadFieldValue(lead, fieldKey);
    return !hasValue(value);
  });

  return {
    action_config: actionConfig
      ? {
          key: actionKey,
          type: actionConfig.type || "internal_task",
          label: actionConfig.label || getActionLabel(actionKey),
          description: actionConfig.description || "",
          channel: actionConfig.channel || "",
          template_key: actionConfig.template_key || "",
          required_fields: requiredFields,
        }
      : null,
    action_ready: !!actionConfig && missingRequiredFields.length === 0,
    missing_action_fields: missingRequiredFields,
  };
}

function detectIntent(text = "") {
  const t = normalizeText(text);

  if (!t) return "unknown";
  if (/\b(humano|persona|asesor|agente|recepcion|admisiones|comercial)\b/.test(t)) {
    return "human_request";
  }
  if (/\b(precio|precios|tarifa|tarifas|cuanto cuesta|coste|presupuesto)\b/.test(t)) {
    return "pricing";
  }
  if (/\b(reservar|agenda|agendar|cita|visita|demo|prueba|matricul|inscrib|llamada)\b/.test(t)) {
    return "booking";
  }
  if (/\b(whatsapp|email|correo|telefono|llamar|contactar)\b/.test(t)) {
    return "contact";
  }
  if (t.includes("?") || /^(que|como|cuando|donde|cual|puedes|teneis|ofreceis)\b/.test(t)) {
    return "information";
  }
  return "general";
}

function getGoalAction(goal = "") {
  const normalized = normalizeText(goal);
  const map = {
    book_level_test: "offer_level_test",
    book_first_visit: "book_first_visit",
    book_appointment: "book_appointment",
    schedule_visit: "schedule_visit",
    book_demo: "book_demo",
    request_quote: "prepare_quote",
    send_catalog: "send_catalog",
    qualify_property_lead: "handoff_agent",
    create_qualified_opportunity: "prepare_next_step",
  };

  return map[normalized] || "prepare_next_step";
}

function getActionLabel(action = "") {
  const labels = {
    answer_question: "Responder la duda y orientar",
    ask_name: "Pedir nombre",
    ask_contact: "Pedir contacto",
    ask_qualification_field: "Pedir dato de cualificacion",
    offer_level_test: "Ofrecer prueba de nivel",
    book_first_visit: "Reservar primera visita",
    book_appointment: "Reservar cita",
    schedule_visit: "Agendar visita",
    book_demo: "Reservar demo",
    prepare_quote: "Preparar propuesta",
    send_catalog: "Enviar catalogo",
    handoff_agent: "Derivar a asesor",
    handoff_human: "Derivar a humano",
    prepare_next_step: "Preparar siguiente paso",
  };

  return labels[action] || "Preparar siguiente paso";
}

function getSalesScoringConfig(appConfig = null) {
  const scoring = appConfig?.sales_scoring && typeof appConfig.sales_scoring === "object"
    ? appConfig.sales_scoring
    : {};
  return {
    hot_intents: Array.isArray(scoring.hot_intents)
      ? scoring.hot_intents.map(normalizeText).filter(Boolean)
      : ["booking", "human_request"],
    warm_intents: Array.isArray(scoring.warm_intents)
      ? scoring.warm_intents.map(normalizeText).filter(Boolean)
      : ["pricing", "contact"],
    hot_max_missing_required_fields: Number.isFinite(Number(scoring.hot_max_missing_required_fields))
      ? Math.max(0, Number(scoring.hot_max_missing_required_fields))
      : 0,
    pricing_hot_max_missing_required_fields: Number.isFinite(
      Number(scoring.pricing_hot_max_missing_required_fields)
    )
      ? Math.max(0, Number(scoring.pricing_hot_max_missing_required_fields))
      : 1,
    warm_max_missing_required_fields_with_contact: Number.isFinite(
      Number(scoring.warm_max_missing_required_fields_with_contact)
    )
      ? Math.max(0, Number(scoring.warm_max_missing_required_fields_with_contact))
      : 1,
    contact_makes_warm: scoring.contact_makes_warm !== false,
  };
}

function getLeadTemperature({ intent, missingQualificationFields = [], lead = {}, appConfig = null } = {}) {
  const scoring = getSalesScoringConfig(appConfig);
  const normalizedIntent = normalizeText(intent);
  const missingCount = missingQualificationFields.length;
  const contactAvailable = hasContact(lead);
  let temperature = "cold";
  let reason = "No hay señales suficientes de avance comercial.";

  if (scoring.hot_intents.includes(normalizedIntent) && missingCount <= scoring.hot_max_missing_required_fields) {
    temperature = "hot";
    reason = "La intención está configurada como caliente y no faltan datos críticos.";
  } else if (
    normalizedIntent === "pricing" &&
    missingCount <= scoring.pricing_hot_max_missing_required_fields
  ) {
    temperature = "hot";
    reason = "Pregunta por precio con pocos datos pendientes según la regla configurada.";
  } else if (
    scoring.contact_makes_warm &&
    contactAvailable &&
    missingCount <= scoring.warm_max_missing_required_fields_with_contact
  ) {
    temperature = "warm";
    reason = "Ya existe contacto y faltan pocos datos para avanzar.";
  } else if (scoring.warm_intents.includes(normalizedIntent)) {
    temperature = "warm";
    reason = "La intención está configurada como templada.";
  }

  return {
    temperature,
    reason,
    scoring_config: scoring,
    signals: {
      intent: normalizedIntent,
      missing_required_fields: missingCount,
      has_contact: contactAvailable,
    },
  };
}

function getStage({ intent, missingQualificationFields = [], lead = {} } = {}) {
  if (intent === "human_request") return "handoff";
  if (!missingQualificationFields.length && hasContact(lead)) return "convert";
  if (!missingQualificationFields.length && (intent === "booking" || intent === "pricing")) {
    return "convert";
  }
  if (missingQualificationFields.length) return "qualify";
  return "discover";
}

export function getNextBestAction({
  lead = {},
  text = "",
  appConfig = null,
  channel = "web",
  phase = "",
} = {}) {
  const intent = detectIntent(text);
  const missingQualificationFields = getMissingQualificationFields({ lead, appConfig });
  const primaryGoal = norm(appConfig?.business_profile?.primary_conversion_goal);
  const goalAction = getGoalAction(primaryGoal);
  const personalization = getMatchedPersonalization({ lead, appConfig });
  const leadScoring = getLeadTemperature({
    intent,
    missingQualificationFields,
    lead,
    appConfig,
  });
  const leadTemperature = leadScoring.temperature;
  const stage = getStage({ intent, missingQualificationFields, lead });

  let action = "answer_question";
  let targetField = null;
  let reason = "Responder primero y mantener avance conversacional.";

  if (intent === "human_request") {
    action = findActionByType("human_handoff", appConfig) || "handoff_human";
    reason = "El usuario ha pedido una persona o un equipo humano.";
  } else if (missingQualificationFields.length) {
    targetField = missingQualificationFields[0];
    action = "ask_qualification_field";
    reason = `Falta un dato clave para el objetivo ${primaryGoal || "configurado"}: ${targetField.label}.`;
  } else if (!hasName(lead) && (intent === "booking" || intent === "pricing" || phase === "close")) {
    action = "ask_name";
    reason = "Hay intencion comercial y falta el nombre para continuar con baja friccion.";
  } else if (!hasContact(lead) && (intent === "booking" || intent === "pricing" || stage === "convert")) {
    action = "ask_contact";
    reason = "Ya hay suficiente contexto para avanzar y falta un canal de contacto.";
  } else if (intent === "booking" || intent === "pricing" || stage === "convert") {
    action = goalAction;
    reason = `El lead tiene contexto suficiente para avanzar hacia ${primaryGoal || "el siguiente paso"}.`;
  }

  const actionReadiness = getActionReadiness({
    actionKey: action,
    lead,
    appConfig,
  });

  return {
    stage,
    phase: phase || "",
    intent,
    channel,
    lead_temperature: leadTemperature,
    scoring: leadScoring,
    personalization,
    next_best_action: action,
    action_label: actionReadiness.action_config?.label || getActionLabel(action),
    reason,
    ...actionReadiness,
    primary_conversion_goal: primaryGoal || "",
    missing_fields: missingQualificationFields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type || "text",
      prompt: field.prompt || "",
      required: field.required === true,
      options: Array.isArray(field.options) ? field.options : [],
    })),
    target_field: targetField
      ? {
          key: targetField.key,
          label: targetField.label,
          type: targetField.type || "text",
          prompt: targetField.prompt || "",
          options: Array.isArray(targetField.options) ? targetField.options : [],
        }
      : null,
    reply_strategy:
      action === "ask_qualification_field"
        ? "Responde brevemente a lo que dijo el usuario y pide solo el dato objetivo."
        : action === "handoff_human"
          ? "Confirma que puede hablar con una persona y recoge o usa el canal disponible."
          : action === "ask_contact"
            ? "Explica el siguiente paso y pide un unico canal de contacto."
            : personalization.active?.pitch_angle
              ? `Da valor usando esta personalizacion: ${personalization.active.pitch_angle}`
              : "Da valor, usa el contexto del negocio y acerca al objetivo configurado.",
  };
}

export function buildNextBestActionPromptBlock(nextBestAction = null) {
  if (!nextBestAction) return "";
  const missing = Array.isArray(nextBestAction.missing_fields)
    ? nextBestAction.missing_fields.map((field) => `- ${field.label} (${field.key})`).join("\n")
    : "";
  const target = nextBestAction.target_field
    ? `${nextBestAction.target_field.label} (${nextBestAction.target_field.key})`
    : "N/D";
  const personalization = nextBestAction.personalization?.active;
  const valuePoints = Array.isArray(personalization?.value_points) && personalization.value_points.length
    ? personalization.value_points.map((item) => `  - ${item}`).join("\n")
    : "  - N/D";
  const objections = Array.isArray(personalization?.objections) && personalization.objections.length
    ? personalization.objections.map((item) => `  - ${item}`).join("\n")
    : "  - N/D";

  return `
NEXT BEST ACTION
- Etapa: ${nextBestAction.stage}
- Intencion detectada: ${nextBestAction.intent}
- Temperatura del lead: ${nextBestAction.lead_temperature}
- Motivo scoring: ${nextBestAction.scoring?.reason || "N/D"}
- Objetivo principal: ${nextBestAction.primary_conversion_goal || "N/D"}
- Accion recomendada: ${nextBestAction.next_best_action} (${nextBestAction.action_label})
- Accion configurada: ${nextBestAction.action_config ? `${nextBestAction.action_config.type} / ${nextBestAction.action_config.channel || "sin canal"}` : "No configurada"}
- Accion lista para ejecutar: ${nextBestAction.action_ready ? "si" : "no"}
- Requisitos de accion pendientes: ${
    Array.isArray(nextBestAction.missing_action_fields) && nextBestAction.missing_action_fields.length
      ? nextBestAction.missing_action_fields.join(", ")
      : "ninguno"
  }
- Motivo: ${nextBestAction.reason}
- Campo objetivo: ${target}
- Personalizacion activa: ${personalization ? `${personalization.label} (${personalization.key})` : "N/D"}
- Angulo de pitch: ${personalization?.pitch_angle || "N/D"}
- Puntos de valor personalizados:
${valuePoints}
- Objeciones a manejar:
${objections}
- CTA personalizado: ${personalization?.cta || "N/D"}
- Estrategia de respuesta: ${nextBestAction.reply_strategy}
${missing ? `- Campos pendientes:\n${missing}` : "- Campos pendientes: ninguno"}
`.trim();
}
