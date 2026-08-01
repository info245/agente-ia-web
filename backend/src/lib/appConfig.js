export const DEFAULT_APP_CONFIG = {
  product: {
    mode: "full_crm",
  },
  brand: {
    name: "TMedia Global",
    website_url: "https://t-mediaglobal.com",
    logo_url: "/crm/assets/tmedia-global-logo.png",
    primary_color: "#6d41f3",
    accent_color: "#8d58ff",
  },
  business_profile: {
    industry: "marketing_agency",
    business_model: "professional_services",
    audience: "empresas que quieren mejorar captacion, ventas o presencia digital",
    primary_conversion_goal: "create_qualified_opportunity",
    secondary_goals: ["send_analysis", "send_quote", "handoff_human"],
    sales_cycle: "consultative",
    human_team_label: "equipo comercial",
    value_proposition:
      "Ayudar a diagnosticar necesidades comerciales y orientar el siguiente paso con claridad.",
  },
  contact: {
    public_whatsapp_number: "34614149270",
    human_agent_whatsapp_number: "34614149270",
    support_email: "info@t-mediaglobal.com",
  },
  agent: {
    tone:
      "profesional, cercano y orientado a diagnosticar antes de vender",
    initial_message:
      "Hola. Estoy listo para ayudarte. Cuéntame qué te gustaría revisar y empezamos.",
    final_cta_label: "Continuar en WhatsApp",
    handoff_target_channel: "whatsapp",
    prompt_additions: "",
  },
  lead_capture: {
    fields: {
      name: true,
      company_name: true,
      business_type: false,
      business_activity: false,
      interest_service: true,
      main_goal: true,
      budget_range: false,
      urgency: false,
      preferred_contact_channel: true,
      email: true,
      phone: true,
    },
    custom_fields: [],
  },
  qualification_schema: [
    {
      key: "business_type",
      label: "Tipo de negocio",
      type: "text",
      required: true,
      ask_when: "always",
      prompt: "Para orientarte mejor, ¿qué tipo de negocio tienes?",
      use_for_personalization: true,
      options: [],
    },
    {
      key: "main_goal",
      label: "Objetivo principal",
      type: "text",
      required: true,
      ask_when: "always",
      prompt: "¿Cuál es el objetivo principal que quieres conseguir ahora?",
      use_for_personalization: true,
      options: [],
    },
    {
      key: "urgency",
      label: "Urgencia",
      type: "select",
      required: false,
      ask_when: "before_close",
      prompt: "¿Te gustaría empezar cuanto antes o lo estás valorando a medio plazo?",
      use_for_personalization: true,
      options: ["cuanto antes", "este mes", "medio plazo", "solo investigando"],
    },
  ],
  personalization_rules: [
    {
      key: "local_business",
      label: "Negocio local",
      field: "business_type",
      operator: "contains",
      values: ["clinica", "restaurante", "academia", "tienda", "local"],
      pitch_angle:
        "Prioriza captacion local, confianza, velocidad de respuesta y claridad del siguiente paso.",
      value_points: [
        "Mejorar visibilidad local y conversion de contactos cercanos.",
        "Reducir friccion entre interes inicial y contacto comercial.",
      ],
      objections: ["No se si ahora es buen momento", "Ya tengo una web o redes sociales"],
      cta: "Proponer una revision inicial del caso y preparar el siguiente paso con el equipo.",
      priority: 70,
      enabled: true,
    },
  ],
  sales_scoring: {
    hot_intents: ["booking", "human_request"],
    warm_intents: ["pricing", "contact"],
    hot_max_missing_required_fields: 0,
    pricing_hot_max_missing_required_fields: 1,
    warm_max_missing_required_fields_with_contact: 1,
    contact_makes_warm: true,
  },
  actions_catalog: {
    prepare_next_step: {
      type: "internal_task",
      label: "Preparar siguiente paso",
      description: "Crear una oportunidad cualificada y dejar preparado el seguimiento.",
      required_fields: ["name"],
      channel: "crm",
      enabled: true,
    },
    handoff_human: {
      type: "human_handoff",
      label: "Hablar con una persona",
      description: "Derivar la conversacion al equipo humano configurado.",
      required_fields: ["name", "phone_or_email"],
      channel: "preferred",
      enabled: true,
    },
    prepare_quote: {
      type: "quote",
      label: "Preparar propuesta",
      description: "Preparar una propuesta o presupuesto comercial.",
      required_fields: ["name", "phone_or_email"],
      channel: "preferred",
      enabled: true,
    },
  },
  notifications: {
    email_to: "",
    notify_new_lead: true,
    notify_chat_summary: true,
  },
  widget: {
    install_mode: "slug",
    allowed_domains: ["t-mediaglobal.com", "heysancho.com"],
  },
  deployment: {
    status: "published",
    published_at: "2026-05-03T00:00:00.000Z",
    readiness_snapshot: {
      status: "ready",
      ready_count: 10,
      total_count: 10,
      blockers: [],
      warnings: [],
      scenario_summary: {
        total: 1,
        passed: 1,
        failed: 0,
      },
    },
  },
  integrations: {
    whatsapp: {
      provider: "meta_cloud",
      setup_owner: "tmedia",
      setup_goal: "Recibir y continuar conversaciones por WhatsApp",
      phone_number_id: "",
      business_account_id: "",
      status_label: "Pendiente de conectar",
      validation: {
        status: "pending",
        last_validated_at: "",
        message: "Sin validar todavia",
      },
    },
      lead_forms: {
        website_stack: "custom_code",
        setup_owner: "developer",
        capture_goal: "",
        custom_capture_notes: "",
        intake_owner: "tmedia",
        intake_goal: "Recibir leads de Meta o Google dentro del CRM",
        meta_source: "google_sheets",
        google_source: "webhook_n8n",
        sheet_document: "",
        sheet_tabs: "",
        webhook_url: "",
      validation: {
        status: "pending",
        last_validated_at: "",
        message: "Sin validar todavia",
      },
    },
    email: {
      provider: "smtp",
      setup_owner: "client_team",
      setup_goal: "",
      from_email: "",
      reply_to_email: "",
      smtp_host: "",
      smtp_port: "465",
      smtp_secure: true,
      smtp_user: "",
      smtp_pass: "",
      google_client_id: "",
      google_client_secret: "",
      google_refresh_token: "",
      google_access_token: "",
      google_access_token_expires_at: "",
      google_connected_email: "",
      oauth_connected_at: "",
      validation: {
        status: "pending",
        last_validated_at: "",
        message: "Sin validar todavia",
      },
    },
    automations: {
      setup_owner: "tmedia",
      setup_goal: "",
      platform: "n8n",
      workspace_url: "",
      notes: "",
      validation: {
        status: "pending",
        last_validated_at: "",
        message: "Sin validar todavia",
      },
    },
  },
  message_templates: {
    whatsapp_first_contact: {
      channel: "whatsapp",
      label: "Primer contacto por WhatsApp",
      subject: "",
      body:
        "Hola {nombre}, soy parte del equipo de {marca}. He revisado tu interes en {servicio} y te escribo para ayudarte a dar el siguiente paso con contexto real. Si quieres, seguimos por aqui y te oriento segun tu caso.",
    },
    email_first_contact: {
      channel: "email",
      label: "Primer contacto por email",
      subject: "Seguimos con tu consulta sobre {servicio}",
      body:
        "Hola {nombre},\n\nGracias por escribirnos a {marca}. Hemos revisado tu interes en {servicio} y queremos ayudarte a aterrizar una propuesta clara y accionable.\n\nSi te viene bien, respondeme a este correo y seguimos contigo.\n\nUn saludo,\n{marca}",
    },
    quote_whatsapp: {
      channel: "whatsapp",
      label: "Envio de propuesta por WhatsApp",
      subject: "",
      body:
        "Hola {nombre}, te comparto aqui tu propuesta de {servicio}: {link_presupuesto}. Si quieres, la vemos juntos y resolvemos dudas antes de decidir.",
    },
    quote_email: {
      channel: "email",
      label: "Envio de propuesta por email",
      subject: "Tu propuesta de {servicio} ya esta lista",
      body:
        "Hola {nombre},\n\nTe comparto tu propuesta de {servicio}: {link_presupuesto}\n\nSi quieres comentarla con un agente, tambien puedes escribirnos por WhatsApp: {whatsapp_humano}.\n\nUn saludo,\n{marca}",
    },
    analysis_email: {
      channel: "email",
      label: "Envio de analisis por email",
      subject: "Tu analisis inicial de {servicio} ya esta listo",
      body:
        "Hola {nombre},\n\nTe comparto el analisis inicial que hemos preparado sobre {servicio}.\n\nResumen: {resumen_analisis}\n\nPuedes revisarlo aqui: {link_analisis}\n\nSi prefieres comentarlo con una persona, tambien puedes responder a este correo.\n\nUn saludo,\n{marca}",
    },
    recovery_whatsapp: {
      channel: "whatsapp",
      label: "Recuperacion por WhatsApp",
      subject: "",
      body:
        "Hola {nombre}, retomo este hilo porque creo que aún podemos ayudarte con {servicio}. Si quieres, te dejo aquí una recomendación concreta para tu caso y vemos si tiene sentido avanzar.",
    },
    recovery_email: {
      channel: "email",
      label: "Recuperacion por email",
      subject: "Seguimos disponibles para ayudarte con {servicio}",
      body:
        "Hola {nombre},\n\nRetomo el contacto porque creo que aún hay recorrido para ayudarte con {servicio}. Si te encaja, podemos retomar la conversación y proponerte un siguiente paso muy concreto.\n\nQuedo pendiente,\n{marca}",
    },
  },
  automation_flows: {
    lead_recovery: {
      label: "Recuperacion de leads",
      description:
        "Secuencia automatica para leads que no responden despues del primer contacto.",
      enabled: true,
      steps: [
        {
          delay_value: "24",
          delay_unit: "hours",
          channel: "whatsapp",
          template_key: "recovery_whatsapp",
          active: true,
        },
        {
          delay_value: "48",
          delay_unit: "hours",
          channel: "email",
          template_key: "recovery_email",
          active: true,
        },
      ],
    },
    quote_followup: {
      label: "Seguimiento de propuesta",
      description:
        "Secuencia automatica para presupuestos enviados que siguen sin respuesta.",
      enabled: true,
      steps: [
        {
          delay_value: "24",
          delay_unit: "hours",
          channel: "whatsapp",
          template_key: "quote_whatsapp",
          active: true,
        },
        {
          delay_value: "72",
          delay_unit: "hours",
          channel: "email",
          template_key: "quote_email",
          active: true,
        },
      ],
    },
  },
  deliverables: {
    quote: {
      preview_button_label: "Abrir propuesta",
      cta_intro:
        "Si te encaja, puedes aceptar la propuesta desde aqui. Si no te encaja ahora, tambien puedes indicarlo. Y si prefieres comentarlo antes, tienes acceso directo a una persona del equipo.",
      show_accept_button: true,
      accept_button_label: "Aceptar propuesta",
      show_reject_button: true,
      reject_button_label: "No me encaja ahora",
      show_human_button: true,
      human_button_label: "Hablar con una persona",
    },
    analysis: {
      preview_button_label: "Abrir analisis",
      show_human_button: true,
      human_button_label: "Hablar con una persona",
    },
  },
  knowledge_sources: {
    website_urls: ["https://t-mediaglobal.com"],
    website_focus: "servicios de marketing digital, SEO, Google Ads, diseño web, consultoría y captación de leads",
    spreadsheet_url: "",
    spreadsheet_data: "",
    spreadsheet_mapping: "",
    internal_notes:
      "TMedia Global usa esta cuenta como ejemplo interno. El agente debe diagnosticar primero, adaptar el discurso al tipo de negocio y llevar hacia WhatsApp, propuesta o auditoria inicial segun el caso.",
  },
  offers: {
    "Google Ads": {
      category: "marketing",
      min_monthly_fee: "250 € + IVA",
      url: "https://t-mediaglobal.com/agencia-google-ads/",
      description:
        "Gestión profesional de campañas en Google Ads enfocadas a captación de leads, ventas y crecimiento digital. Incluye estrategia, optimización continua, seguimiento de conversiones y análisis de resultados.",
      notes:
        "La cuota mínima de gestión mensual para Google Ads es de 250 € + IVA. La inversión publicitaria en Google es independiente de esta cuota.",
      conversion_goal: "request_quote",
    },
    SEO: {
      category: "marketing",
      min_monthly_fee: "200 € + IVA",
      url: "https://t-mediaglobal.com/agencia-seo/",
      description:
        "Servicios de posicionamiento SEO orientados a mejorar la visibilidad orgánica en Google mediante optimización técnica, estrategia de contenidos y autoridad digital.",
      notes:
        "Las estrategias SEO se adaptan al sector, competencia y objetivos del cliente. El presupuesto puede variar según el alcance del proyecto.",
      conversion_goal: "request_quote",
    },
    "Redes Sociales": {
      category: "marketing",
      min_monthly_fee: "250 € + IVA",
      url: "https://t-mediaglobal.com/publicidad-en-redes-sociales/",
      description:
        "Gestión y optimización de campañas publicitarias en redes sociales como Facebook, Instagram o LinkedIn para generar leads y ventas.",
      notes:
        "El coste mínimo de gestión de campañas en redes sociales parte desde 250 € + IVA al mes. La inversión publicitaria se establece según los objetivos del cliente.",
      conversion_goal: "request_quote",
    },
    "Diseño Web": {
      category: "web",
      min_project_fee: "700 € + IVA",
      url: "https://t-mediaglobal.com/diseno-web/",
      description:
        "Diseño y desarrollo de páginas web corporativas optimizadas para SEO, conversión y experiencia de usuario.",
      notes:
        "El presupuesto mínimo para un proyecto de diseño web corporativo es de 700 € + IVA. El precio puede aumentar dependiendo de funcionalidades, número de páginas o integración de sistemas.",
      conversion_goal: "request_quote",
    },
    "Consultoría Digital": {
      category: "consulting",
      min_project_fee: "500 € + IVA",
      url: "https://t-mediaglobal.com/consultora-de-marketing-digital/",
      description:
        "Servicio de consultoría estratégica para empresas que buscan mejorar su marketing digital, optimizar campañas o diseñar una estrategia de crecimiento.",
      notes:
        "El servicio de consultoría digital parte desde 500 € + IVA dependiendo del alcance del análisis y acompañamiento estratégico.",
      conversion_goal: "request_quote",
    },
  },
  services: {
    "Google Ads": {
      min_monthly_fee: "250 € + IVA",
      url: "https://t-mediaglobal.com/agencia-google-ads/",
      description:
        "Gestión profesional de campañas en Google Ads enfocadas a captación de leads, ventas y crecimiento digital. Incluye estrategia, optimización continua, seguimiento de conversiones y análisis de resultados.",
      notes:
        "La cuota mínima de gestión mensual para Google Ads es de 250 € + IVA. La inversión publicitaria en Google es independiente de esta cuota.",
    },
    SEO: {
      min_monthly_fee: "200 € + IVA",
      url: "https://t-mediaglobal.com/agencia-seo/",
      description:
        "Servicios de posicionamiento SEO orientados a mejorar la visibilidad orgánica en Google mediante optimización técnica, estrategia de contenidos y autoridad digital.",
      notes:
        "Las estrategias SEO se adaptan al sector, competencia y objetivos del cliente. El presupuesto puede variar según el alcance del proyecto.",
    },
    "Redes Sociales": {
      min_monthly_fee: "250 € + IVA",
      url: "https://t-mediaglobal.com/publicidad-en-redes-sociales/",
      description:
        "Gestión y optimización de campañas publicitarias en redes sociales como Facebook, Instagram o LinkedIn para generar leads y ventas.",
      notes:
        "El coste mínimo de gestión de campañas en redes sociales parte desde 250 € + IVA al mes. La inversión publicitaria se establece según los objetivos del cliente.",
    },
    "Diseño Web": {
      min_project_fee: "700 € + IVA",
      url: "https://t-mediaglobal.com/diseno-web/",
      description:
        "Diseño y desarrollo de páginas web corporativas optimizadas para SEO, conversión y experiencia de usuario.",
      notes:
        "El presupuesto mínimo para un proyecto de diseño web corporativo es de 700 € + IVA. El precio puede aumentar dependiendo de funcionalidades, número de páginas o integración de sistemas.",
    },
    "Consultoría Digital": {
      min_project_fee: "500 € + IVA",
      url: "https://t-mediaglobal.com/consultora-de-marketing-digital/",
      description:
        "Servicio de consultoría estratégica para empresas que buscan mejorar su marketing digital, optimizar campañas o diseñar una estrategia de crecimiento.",
      notes:
        "El servicio de consultoría digital parte desde 500 € + IVA dependiendo del alcance del análisis y acompañamiento estratégico.",
    },
  },
};

export const BLANK_APP_CONFIG = {
  product: {
    mode: "full_crm",
  },
  brand: {
    name: "",
    website_url: "",
    logo_url: "",
    primary_color: "",
    accent_color: "",
  },
  business_profile: {
    industry: "",
    business_model: "",
    audience: "",
    primary_conversion_goal: "",
    secondary_goals: [],
    sales_cycle: "",
    human_team_label: "",
    value_proposition: "",
  },
  contact: {
    public_whatsapp_number: "",
    human_agent_whatsapp_number: "",
    support_email: "",
  },
  agent: {
    tone: "",
    initial_message: "",
    final_cta_label: "",
    handoff_target_channel: "",
    prompt_additions: "",
  },
  lead_capture: {
    fields: {
      name: true,
      company_name: true,
      business_type: false,
      business_activity: false,
      interest_service: true,
      main_goal: true,
      budget_range: false,
      urgency: false,
      preferred_contact_channel: true,
      email: true,
      phone: true,
    },
    custom_fields: [],
  },
  qualification_schema: [],
  personalization_rules: [],
  sales_scoring: {
    hot_intents: ["booking", "human_request"],
    warm_intents: ["pricing", "contact"],
    hot_max_missing_required_fields: 0,
    pricing_hot_max_missing_required_fields: 1,
    warm_max_missing_required_fields_with_contact: 1,
    contact_makes_warm: true,
  },
  actions_catalog: {},
  notifications: {
    email_to: "",
    notify_new_lead: true,
    notify_chat_summary: true,
  },
  widget: {
    install_mode: "slug",
    allowed_domains: [],
  },
  deployment: {
    status: "draft",
    published_at: "",
    readiness_snapshot: null,
  },
  integrations: {
    whatsapp: {
      provider: "meta_cloud",
      setup_owner: "tmedia",
      setup_goal: "Recibir y continuar conversaciones por WhatsApp",
      phone_number_id: "",
      business_account_id: "",
      status_label: "Pendiente de conectar",
      validation: {
        status: "pending",
        last_validated_at: "",
        message: "Sin validar todavia",
      },
    },
      lead_forms: {
        website_stack: "custom_code",
        setup_owner: "developer",
        capture_goal: "",
        custom_capture_notes: "",
        intake_owner: "tmedia",
        intake_goal: "Recibir leads de Meta o Google dentro del CRM",
        meta_source: "google_sheets",
        google_source: "webhook_n8n",
        sheet_document: "",
        sheet_tabs: "",
        webhook_url: "",
      validation: {
        status: "pending",
        last_validated_at: "",
        message: "Sin validar todavia",
      },
    },
    email: {
      provider: "smtp",
      setup_owner: "client_team",
      setup_goal: "",
      from_email: "",
      reply_to_email: "",
      smtp_host: "",
      smtp_port: "465",
      smtp_secure: true,
      smtp_user: "",
      smtp_pass: "",
      google_client_id: "",
      google_client_secret: "",
      google_refresh_token: "",
      google_access_token: "",
      google_access_token_expires_at: "",
      google_connected_email: "",
      oauth_connected_at: "",
      validation: {
        status: "pending",
        last_validated_at: "",
        message: "Sin validar todavia",
      },
    },
    automations: {
      setup_owner: "tmedia",
      setup_goal: "",
      platform: "n8n",
      workspace_url: "",
      notes: "",
      validation: {
        status: "pending",
        last_validated_at: "",
        message: "Sin validar todavia",
      },
    },
  },
  message_templates: {
    whatsapp_first_contact: {
      channel: "whatsapp",
      label: "Primer contacto por WhatsApp",
      subject: "",
      body: "",
    },
    email_first_contact: {
      channel: "email",
      label: "Primer contacto por email",
      subject: "",
      body: "",
    },
    quote_whatsapp: {
      channel: "whatsapp",
      label: "Envio de propuesta por WhatsApp",
      subject: "",
      body: "",
    },
    quote_email: {
      channel: "email",
      label: "Envio de propuesta por email",
      subject: "",
      body: "",
    },
    recovery_whatsapp: {
      channel: "whatsapp",
      label: "Recuperacion por WhatsApp",
      subject: "",
      body: "",
    },
    recovery_email: {
      channel: "email",
      label: "Recuperacion por email",
      subject: "",
      body: "",
    },
  },
  automation_flows: {
    lead_recovery: {
      label: "Recuperacion de leads",
      description: "",
      enabled: false,
      steps: [],
    },
    quote_followup: {
      label: "Seguimiento de propuesta",
      description: "",
      enabled: false,
      steps: [],
    },
  },
  knowledge_sources: {
    website_urls: [],
    website_focus: "",
    spreadsheet_url: "",
    spreadsheet_data: "",
    spreadsheet_mapping: "",
    internal_notes: "",
  },
  offers: {},
  services: {},
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDeep(base, patch, parentKey = "") {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return clone(base);
  }

  if (
    Object.keys(patch).length === 0 &&
    ["services", "offers", "knowledge_sources", "message_templates", "automation_flows", "widget"].includes(parentKey)
  ) {
    return {};
  }

  const output = Array.isArray(base) ? [...base] : { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (["services", "offers", "knowledge_sources", "message_templates", "automation_flows", "widget"].includes(key)) {
      output[key] = clone(value);
      continue;
    }
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      output[key] = mergeDeep(base[key], value, key);
    } else {
      output[key] = value;
    }
  }

  return output;
}

export function getDefaultAppConfig() {
  return clone(DEFAULT_APP_CONFIG);
}

export function getBlankAppConfig({ productMode = "full_crm" } = {}) {
  const next = clone(BLANK_APP_CONFIG);
  next.product.mode = productMode === "chat_only" ? "chat_only" : "full_crm";
  return next;
}

export function mergeAppConfig(overrides = null) {
  return mergeDeep(getDefaultAppConfig(), overrides || {});
}

function cleanString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function resolveString(value, fallback = "") {
  if (value === undefined || value === null) return cleanString(fallback);
  return cleanString(value);
}

function sanitizeServices(services = {}) {
  if (!services || typeof services !== "object" || Array.isArray(services)) {
    return {};
  }

  const result = {};
  for (const [name, facts] of Object.entries(services)) {
    const cleanName = cleanString(name);
    if (!cleanName) continue;

    result[cleanName] = {
      category: cleanString(facts?.category),
      min_monthly_fee: cleanString(facts?.min_monthly_fee),
      min_project_fee: cleanString(facts?.min_project_fee),
      url: cleanString(facts?.url),
      description: cleanString(facts?.description),
      notes: cleanString(facts?.notes),
      conversion_goal: cleanString(facts?.conversion_goal),
    };
  }

  return result;
}

function sanitizeBusinessProfile(value = {}, defaults = {}) {
  const secondaryGoals = Array.isArray(value?.secondary_goals)
    ? value.secondary_goals
    : Array.isArray(defaults?.secondary_goals)
      ? defaults.secondary_goals
      : [];

  return {
    industry: resolveString(value?.industry, defaults?.industry),
    business_model: resolveString(value?.business_model, defaults?.business_model),
    audience: resolveString(value?.audience, defaults?.audience),
    primary_conversion_goal: resolveString(
      value?.primary_conversion_goal,
      defaults?.primary_conversion_goal
    ),
    secondary_goals: secondaryGoals.map(cleanString).filter(Boolean).slice(0, 12),
    sales_cycle: resolveString(value?.sales_cycle, defaults?.sales_cycle),
    human_team_label: resolveString(value?.human_team_label, defaults?.human_team_label),
    value_proposition: resolveString(
      value?.value_proposition,
      defaults?.value_proposition
    ),
  };
}

function sanitizeKnowledgeSources(value = {}) {
  const websiteUrls = Array.isArray(value?.website_urls)
    ? value.website_urls
    : String(value?.website_urls || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);

  return {
    website_urls: websiteUrls.map(cleanString).filter(Boolean),
    website_focus: cleanString(value?.website_focus),
    spreadsheet_url: cleanString(value?.spreadsheet_url),
    spreadsheet_data: cleanString(value?.spreadsheet_data),
    spreadsheet_mapping: cleanString(value?.spreadsheet_mapping),
    internal_notes: cleanString(value?.internal_notes),
  };
}

function sanitizeLeadCaptureConfig(value = {}, defaults = {}) {
  const fieldDefaults = defaults?.fields || {};
  const incomingFields = value?.fields || {};
  const fields = {};

  for (const [key, defaultValue] of Object.entries(fieldDefaults)) {
    fields[key] =
      typeof incomingFields?.[key] === "boolean"
        ? incomingFields[key]
        : Boolean(defaultValue);
  }

  const rawCustomFields = Array.isArray(value?.custom_fields)
    ? value.custom_fields
    : Array.isArray(defaults?.custom_fields)
    ? defaults.custom_fields
    : [];
  const seenKeys = new Set();
  const custom_fields = rawCustomFields
    .map((field) => {
      const key = cleanString(field?.key)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60);
      const label = cleanString(field?.label).slice(0, 80);
      if (!key || !label || seenKeys.has(key)) return null;
      seenKeys.add(key);

      const type = ["text", "number", "date", "time", "datetime", "select", "boolean"].includes(
        cleanString(field?.type)
      )
        ? cleanString(field?.type)
        : "text";
      const options = Array.isArray(field?.options)
        ? field.options
        : String(field?.options || "")
            .split(/\r?\n|,/)
            .map((item) => item.trim())
            .filter(Boolean);

      return {
        key,
        label,
        type,
        required: field?.required === true,
        options: options.map(cleanString).filter(Boolean).slice(0, 40),
        prompt:
          cleanString(field?.prompt).slice(0, 180) ||
          `¿Cuál es tu ${label.toLocaleLowerCase("es-ES")}?`,
      };
    })
    .filter(Boolean)
    .slice(0, 30);

  return { fields, custom_fields };
}

function sanitizeQualificationSchema(value = [], defaults = []) {
  const rawItems = Array.isArray(value)
    ? value
    : Array.isArray(defaults)
      ? defaults
      : [];
  const seenKeys = new Set();

  return rawItems
    .map((field) => {
      const key = cleanString(field?.key)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60);
      const label = cleanString(field?.label).slice(0, 80);
      if (!key || !label || seenKeys.has(key)) return null;
      seenKeys.add(key);

      const type = ["text", "number", "date", "time", "datetime", "select", "boolean"].includes(
        cleanString(field?.type)
      )
        ? cleanString(field?.type)
        : "text";

      const options = Array.isArray(field?.options)
        ? field.options.map(cleanString).filter(Boolean).slice(0, 40)
        : [];

      return {
        key,
        label,
        type,
        required: field?.required === true,
        ask_when: cleanString(field?.ask_when),
        prompt: cleanString(field?.prompt).slice(0, 240),
        use_for_personalization: field?.use_for_personalization !== false,
        options,
      };
    })
    .filter(Boolean);
}

function sanitizePersonalizationRules(value = [], defaults = []) {
  const rawItems = Array.isArray(value)
    ? value
    : Array.isArray(defaults)
      ? defaults
      : [];
  const seenKeys = new Set();

  return rawItems
    .map((rule) => {
      const key = cleanString(rule?.key)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);
      const label = cleanString(rule?.label).slice(0, 120);
      const field = cleanString(rule?.field)
        .toLowerCase()
        .replace(/[^a-z0-9_.]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);
      if (!key || !label || !field || seenKeys.has(key)) return null;
      seenKeys.add(key);

      const operator = ["equals", "contains", "in", "exists"].includes(cleanString(rule?.operator))
        ? cleanString(rule.operator)
        : "contains";
      const values = Array.isArray(rule?.values)
        ? rule.values.map(cleanString).filter(Boolean).slice(0, 30)
        : cleanString(rule?.value)
          ? [cleanString(rule.value)]
          : [];

      return {
        key,
        label,
        field,
        operator,
        values,
        pitch_angle: cleanString(rule?.pitch_angle).slice(0, 420),
        value_points: Array.isArray(rule?.value_points)
          ? rule.value_points.map(cleanString).filter(Boolean).slice(0, 8)
          : [],
        objections: Array.isArray(rule?.objections)
          ? rule.objections.map(cleanString).filter(Boolean).slice(0, 8)
          : [],
        cta: cleanString(rule?.cta).slice(0, 220),
        priority: clampNumber(rule?.priority, 50, 0, 100),
        enabled: rule?.enabled !== false,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 40);
}

function clampNumber(value, fallback, min = 0, max = 20) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function sanitizeIntentList(value, fallback = []) {
  const raw = Array.isArray(value) ? value : fallback;
  const seen = new Set();
  return raw
    .map((item) =>
      cleanString(item)
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
    )
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 12);
}

function sanitizeSalesScoring(value = {}, defaults = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    hot_intents: sanitizeIntentList(source.hot_intents, defaults.hot_intents || []),
    warm_intents: sanitizeIntentList(source.warm_intents, defaults.warm_intents || []),
    hot_max_missing_required_fields: clampNumber(
      source.hot_max_missing_required_fields,
      Number(defaults.hot_max_missing_required_fields) || 0
    ),
    pricing_hot_max_missing_required_fields: clampNumber(
      source.pricing_hot_max_missing_required_fields,
      Number(defaults.pricing_hot_max_missing_required_fields) || 1
    ),
    warm_max_missing_required_fields_with_contact: clampNumber(
      source.warm_max_missing_required_fields_with_contact,
      Number(defaults.warm_max_missing_required_fields_with_contact) || 1
    ),
    contact_makes_warm:
      typeof source.contact_makes_warm === "boolean"
        ? source.contact_makes_warm
        : defaults.contact_makes_warm !== false,
  };
}

function sanitizeActionsCatalog(value = {}, defaults = {}) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : defaults || {};
  const result = {};

  for (const [rawKey, action] of Object.entries(source || {})) {
    const key = cleanString(rawKey)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
    if (!key || !action || typeof action !== "object" || Array.isArray(action)) continue;

    const requiredFields = Array.isArray(action.required_fields)
      ? action.required_fields
      : [];
    const metadata =
      action.metadata && typeof action.metadata === "object" && !Array.isArray(action.metadata)
        ? action.metadata
        : {};

    result[key] = {
      type:
        cleanString(action.type) ||
        cleanString(defaults?.[key]?.type) ||
        "internal_task",
      label:
        cleanString(action.label) ||
        cleanString(defaults?.[key]?.label) ||
        key,
      description: cleanString(action.description || defaults?.[key]?.description),
      required_fields: requiredFields.map(cleanString).filter(Boolean).slice(0, 30),
      channel: cleanString(action.channel || defaults?.[key]?.channel),
      template_key: cleanString(action.template_key || defaults?.[key]?.template_key),
      enabled:
        typeof action.enabled === "boolean"
          ? action.enabled
          : defaults?.[key]?.enabled !== false,
      metadata,
    };
  }

  return result;
}

function mergeQualificationIntoLeadCapture(leadCapture = {}, qualificationSchema = []) {
  const currentFields = Array.isArray(leadCapture?.custom_fields)
    ? leadCapture.custom_fields
    : [];
  const byKey = new Map(currentFields.map((field) => [field.key, field]));

  for (const field of qualificationSchema || []) {
    if (!field?.key || byKey.has(field.key)) continue;
    byKey.set(field.key, {
      key: field.key,
      label: field.label,
      type: field.type || "text",
      required: field.required === true,
      prompt: field.prompt || "",
      options: Array.isArray(field.options) ? field.options : [],
    });
  }

  return {
    ...leadCapture,
    custom_fields: Array.from(byKey.values()),
  };
}

function sanitizeNotificationsConfig(value = {}, defaults = {}) {
  return {
    email_to: cleanString(value?.email_to),
    notify_new_lead:
      typeof value?.notify_new_lead === "boolean"
        ? value.notify_new_lead
        : Boolean(defaults?.notify_new_lead),
    notify_chat_summary:
      typeof value?.notify_chat_summary === "boolean"
        ? value.notify_chat_summary
        : Boolean(defaults?.notify_chat_summary),
  };
}

function sanitizeWidgetConfig(value = {}) {
  const allowedDomains = Array.isArray(value?.allowed_domains)
    ? value.allowed_domains
    : String(value?.allowed_domains || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);

  return {
    install_mode: cleanString(value?.install_mode) === "id" ? "id" : "slug",
    allowed_domains: allowedDomains.map(cleanString).filter(Boolean),
  };
}

function sanitizeDeploymentConfig(value = {}, defaults = {}) {
  const status = cleanString(value?.status).toLowerCase();
  return {
    status: status === "published" ? "published" : "draft",
    published_at: cleanString(value?.published_at) || cleanString(defaults?.published_at),
    readiness_snapshot:
      value?.readiness_snapshot &&
      typeof value.readiness_snapshot === "object" &&
      !Array.isArray(value.readiness_snapshot)
        ? value.readiness_snapshot
        : defaults?.readiness_snapshot || null,
  };
}

function sanitizeValidation(value = {}, defaults = {}) {
  return {
    status: cleanString(value?.status) || cleanString(defaults?.status) || "pending",
    last_validated_at:
      cleanString(value?.last_validated_at) ||
      cleanString(defaults?.last_validated_at),
    message: cleanString(value?.message) || cleanString(defaults?.message),
  };
}

function sanitizeMessageTemplates(value = {}) {
  const defaults = DEFAULT_APP_CONFIG.message_templates || {};
  const result = {};
  const incomingTemplates =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const keys = new Set([
    ...Object.keys(defaults),
    ...Object.keys(incomingTemplates),
  ]);

  for (const key of keys) {
    const templateDefaults = defaults?.[key] || {};
    const incoming = incomingTemplates?.[key] || {};
    if (!templateDefaults.body && !incoming.body && !defaults?.[key]) continue;
    result[key] = {
      channel:
        cleanString(incoming?.channel) ||
        cleanString(templateDefaults?.channel) ||
        "email",
      label:
        cleanString(incoming?.label) ||
        cleanString(templateDefaults?.label) ||
        key,
      subject: resolveString(incoming?.subject, templateDefaults?.subject),
      body: resolveString(incoming?.body, templateDefaults?.body),
    };
  }

  return result;
}

function sanitizeDeliverablesConfig(value = {}, defaults = {}) {
  const quoteDefaults = defaults?.quote || {};
  const analysisDefaults = defaults?.analysis || {};
  const quoteIncoming = value?.quote || {};
  const analysisIncoming = value?.analysis || {};

  return {
    quote: {
      preview_button_label: resolveString(
        quoteIncoming?.preview_button_label,
        quoteDefaults?.preview_button_label
      ),
      cta_intro: resolveString(quoteIncoming?.cta_intro, quoteDefaults?.cta_intro),
      show_accept_button:
        typeof quoteIncoming?.show_accept_button === "boolean"
          ? quoteIncoming.show_accept_button
          : quoteDefaults?.show_accept_button !== false,
      accept_button_label: resolveString(
        quoteIncoming?.accept_button_label,
        quoteDefaults?.accept_button_label
      ),
      show_reject_button:
        typeof quoteIncoming?.show_reject_button === "boolean"
          ? quoteIncoming.show_reject_button
          : quoteDefaults?.show_reject_button !== false,
      reject_button_label: resolveString(
        quoteIncoming?.reject_button_label,
        quoteDefaults?.reject_button_label
      ),
      show_human_button:
        typeof quoteIncoming?.show_human_button === "boolean"
          ? quoteIncoming.show_human_button
          : quoteDefaults?.show_human_button !== false,
      human_button_label: resolveString(
        quoteIncoming?.human_button_label,
        quoteDefaults?.human_button_label
      ),
    },
    analysis: {
      preview_button_label: resolveString(
        analysisIncoming?.preview_button_label,
        analysisDefaults?.preview_button_label
      ),
      show_human_button:
        typeof analysisIncoming?.show_human_button === "boolean"
          ? analysisIncoming.show_human_button
          : analysisDefaults?.show_human_button !== false,
      human_button_label: resolveString(
        analysisIncoming?.human_button_label,
        analysisDefaults?.human_button_label
      ),
    },
  };
}

function sanitizeAutomationSteps(steps = []) {
  if (!Array.isArray(steps)) return [];

  return steps
    .map((step) => ({
      delay_value: cleanString(step?.delay_value) || "24",
      delay_unit: cleanString(step?.delay_unit) || "hours",
      channel: cleanString(step?.channel) || "whatsapp",
      template_key: cleanString(step?.template_key),
      active: step?.active !== false,
    }))
    .filter((step) => step.template_key);
}

function sanitizeAutomationFlows(value = {}) {
  const defaults = DEFAULT_APP_CONFIG.automation_flows || {};
  const result = {};

  for (const [key, flowDefaults] of Object.entries(defaults)) {
    const incoming = value?.[key] || {};
    result[key] = {
      label:
        cleanString(incoming?.label) ||
        cleanString(flowDefaults?.label) ||
        key,
      description:
        resolveString(incoming?.description, flowDefaults?.description),
      enabled:
        typeof incoming?.enabled === "boolean"
          ? incoming.enabled
          : flowDefaults?.enabled !== false,
      steps: sanitizeAutomationSteps(
        Array.isArray(incoming?.steps)
          ? incoming.steps
          : flowDefaults?.steps || []
      ),
    };
  }

  return result;
}

export function sanitizeAppConfig(input = {}, options = {}) {
  const services = sanitizeServices(input?.services);
  const offersInput = Object.prototype.hasOwnProperty.call(input || {}, "offers")
    ? input?.offers
    : input?.services;
  const offers = sanitizeServices(offersInput);
  const message_templates = sanitizeMessageTemplates(input?.message_templates);
  const automation_flows = sanitizeAutomationFlows(input?.automation_flows);
  const deliverables = sanitizeDeliverablesConfig(
    input?.deliverables,
    DEFAULT_APP_CONFIG.deliverables || {}
  );
  const knowledge_sources = sanitizeKnowledgeSources(input?.knowledge_sources);
  const widget = sanitizeWidgetConfig(input?.widget);
  const requestedMode =
    input?.product?.mode === "chat_only" || cleanString(input?.product?.mode) === "chat_only"
      ? "chat_only"
      : "full_crm";
  const defaults =
      options?.useBlankDefaults || requestedMode === "chat_only"
        ? getBlankAppConfig({ productMode: requestedMode })
        : getDefaultAppConfig();
  const qualification_schema = sanitizeQualificationSchema(
    input?.qualification_schema,
    defaults?.qualification_schema || []
  );
  const personalization_rules = sanitizePersonalizationRules(
    input?.personalization_rules,
    defaults?.personalization_rules || []
  );
  const sales_scoring = sanitizeSalesScoring(input?.sales_scoring, defaults?.sales_scoring || {});
  const actions_catalog = sanitizeActionsCatalog(
    input?.actions_catalog,
    defaults?.actions_catalog || {}
  );
  const lead_capture = mergeQualificationIntoLeadCapture(sanitizeLeadCaptureConfig(
    input?.lead_capture,
    defaults?.lead_capture || {}
  ), qualification_schema);
  const notifications = sanitizeNotificationsConfig(
    input?.notifications,
    defaults?.notifications || {}
  );
  const business_profile = sanitizeBusinessProfile(
    input?.business_profile,
    defaults?.business_profile || {}
  );
  const deployment = sanitizeDeploymentConfig(
    input?.deployment,
    defaults?.deployment || {}
  );

  return {
    product: {
      mode: requestedMode === "chat_only" ? "chat_only" : defaults.product.mode,
    },
    brand: {
      name: resolveString(input?.brand?.name, defaults.brand.name),
      website_url: resolveString(input?.brand?.website_url, defaults.brand.website_url),
      logo_url: resolveString(input?.brand?.logo_url, defaults.brand.logo_url),
      primary_color: resolveString(input?.brand?.primary_color, defaults.brand.primary_color),
      accent_color: resolveString(input?.brand?.accent_color, defaults.brand.accent_color),
    },
    business_profile,
    contact: {
      public_whatsapp_number: resolveString(input?.contact?.public_whatsapp_number),
      human_agent_whatsapp_number: resolveString(
        input?.contact?.human_agent_whatsapp_number,
        defaults.contact.human_agent_whatsapp_number
      ),
      support_email: resolveString(input?.contact?.support_email),
    },
      agent: {
        tone: resolveString(input?.agent?.tone, defaults.agent.tone),
        initial_message: resolveString(
          input?.agent?.initial_message,
          defaults.agent.initial_message
        ),
        final_cta_label: resolveString(
          input?.agent?.final_cta_label,
          defaults.agent.final_cta_label
        ),
        handoff_target_channel: resolveString(
          input?.agent?.handoff_target_channel,
          defaults.agent.handoff_target_channel
        ),
        prompt_additions: resolveString(input?.agent?.prompt_additions),
      },
      lead_capture,
      qualification_schema,
      personalization_rules,
      sales_scoring,
      actions_catalog,
      notifications,
      widget,
      deployment,
      integrations: {
      whatsapp: {
        provider:
          cleanString(input?.integrations?.whatsapp?.provider) ||
          defaults.integrations.whatsapp.provider,
        setup_owner:
          cleanString(input?.integrations?.whatsapp?.setup_owner) ||
          defaults.integrations.whatsapp.setup_owner,
        setup_goal:
          cleanString(input?.integrations?.whatsapp?.setup_goal) ||
          defaults.integrations.whatsapp.setup_goal,
        phone_number_id: cleanString(
          input?.integrations?.whatsapp?.phone_number_id
        ),
        business_account_id: cleanString(
          input?.integrations?.whatsapp?.business_account_id
        ),
        status_label:
          cleanString(input?.integrations?.whatsapp?.status_label) ||
          defaults.integrations.whatsapp.status_label,
        validation: sanitizeValidation(
          input?.integrations?.whatsapp?.validation,
          defaults.integrations.whatsapp.validation
        ),
      },
        lead_forms: {
          website_stack:
            cleanString(input?.integrations?.lead_forms?.website_stack) ||
            defaults.integrations.lead_forms.website_stack,
          setup_owner:
            cleanString(input?.integrations?.lead_forms?.setup_owner) ||
            defaults.integrations.lead_forms.setup_owner,
          capture_goal: cleanString(
            input?.integrations?.lead_forms?.capture_goal
          ),
          custom_capture_notes: cleanString(
            input?.integrations?.lead_forms?.custom_capture_notes
          ),
          intake_owner:
            cleanString(input?.integrations?.lead_forms?.intake_owner) ||
            defaults.integrations.lead_forms.intake_owner,
          intake_goal:
            cleanString(input?.integrations?.lead_forms?.intake_goal) ||
            defaults.integrations.lead_forms.intake_goal,
          meta_source:
            cleanString(input?.integrations?.lead_forms?.meta_source) ||
            defaults.integrations.lead_forms.meta_source,
        google_source:
          cleanString(input?.integrations?.lead_forms?.google_source) ||
          defaults.integrations.lead_forms.google_source,
        sheet_document: cleanString(
          input?.integrations?.lead_forms?.sheet_document
        ),
        sheet_tabs: cleanString(input?.integrations?.lead_forms?.sheet_tabs),
        webhook_url: cleanString(input?.integrations?.lead_forms?.webhook_url),
        validation: sanitizeValidation(
          input?.integrations?.lead_forms?.validation,
          defaults.integrations.lead_forms.validation
        ),
      },
      email: {
        provider:
          cleanString(input?.integrations?.email?.provider) ||
          defaults.integrations.email.provider,
        from_email: cleanString(input?.integrations?.email?.from_email),
        reply_to_email: cleanString(
          input?.integrations?.email?.reply_to_email
        ),
        smtp_host: cleanString(input?.integrations?.email?.smtp_host),
        smtp_port:
          cleanString(input?.integrations?.email?.smtp_port) ||
          cleanString(defaults.integrations.email.smtp_port) ||
          "465",
        smtp_secure:
          typeof input?.integrations?.email?.smtp_secure === "boolean"
            ? input.integrations.email.smtp_secure
            : defaults.integrations.email.smtp_secure !== false,
        smtp_user: cleanString(input?.integrations?.email?.smtp_user),
        smtp_pass: cleanString(input?.integrations?.email?.smtp_pass),
        google_client_id: cleanString(
          input?.integrations?.email?.google_client_id
        ),
        google_client_secret: cleanString(
          input?.integrations?.email?.google_client_secret
        ),
        google_refresh_token: cleanString(
          input?.integrations?.email?.google_refresh_token
        ),
        google_access_token: cleanString(
          input?.integrations?.email?.google_access_token
        ),
        google_access_token_expires_at: cleanString(
          input?.integrations?.email?.google_access_token_expires_at
        ),
        google_connected_email: cleanString(
          input?.integrations?.email?.google_connected_email
        ),
        oauth_connected_at: cleanString(
          input?.integrations?.email?.oauth_connected_at
        ),
        validation: sanitizeValidation(
          input?.integrations?.email?.validation,
          defaults.integrations.email.validation
        ),
      },
      automations: {
        platform:
          cleanString(input?.integrations?.automations?.platform) ||
          defaults.integrations.automations.platform,
        workspace_url: cleanString(
          input?.integrations?.automations?.workspace_url
        ),
        notes: cleanString(input?.integrations?.automations?.notes),
        validation: sanitizeValidation(
          input?.integrations?.automations?.validation,
          defaults.integrations.automations.validation
        ),
      },
      },
      message_templates,
      deliverables,
      automation_flows,
      knowledge_sources,
      offers:
        Object.prototype.hasOwnProperty.call(input || {}, "offers")
          ? offers
          : Object.prototype.hasOwnProperty.call(input || {}, "services")
            ? services
            : defaults.offers || defaults.services || {},
      services:
        Object.prototype.hasOwnProperty.call(input || {}, "services")
          ? services
          : defaults.services,
  };
}
