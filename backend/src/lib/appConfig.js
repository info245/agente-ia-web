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
  contact: {
    public_whatsapp_number: "",
    human_agent_whatsapp_number: "34614149270",
    support_email: "",
  },
  agent: {
    tone:
      "profesional, cercano y orientado a diagnosticar antes de vender",
    final_cta_label: "Continuar en WhatsApp",
    handoff_target_channel: "whatsapp",
    prompt_additions: "",
  },
  widget: {
    install_mode: "slug",
    allowed_domains: [],
  },
  integrations: {
    whatsapp: {
      provider: "meta_cloud",
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
      from_email: "",
      reply_to_email: "",
      smtp_host: "",
      smtp_port: "465",
      smtp_secure: true,
      smtp_user: "",
      smtp_pass: "",
      validation: {
        status: "pending",
        last_validated_at: "",
        message: "Sin validar todavia",
      },
    },
    automations: {
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
    recovery_whatsapp: {
      channel: "whatsapp",
      label: "Recuperacion por WhatsApp",
      subject: "",
      body:
        "Hola {nombre}, retomo este hilo porque creo que aun podemos ayudarte con {servicio}. Si quieres, te dejo aqui una recomendacion concreta para tu caso y vemos si tiene sentido avanzar.",
    },
    recovery_email: {
      channel: "email",
      label: "Recuperacion por email",
      subject: "Seguimos disponibles para ayudarte con {servicio}",
      body:
        "Hola {nombre},\n\nRetomo el contacto porque creo que aun hay recorrido para ayudarte con {servicio}. Si te encaja, podemos retomar la conversacion y proponerte un siguiente paso muy concreto.\n\nQuedo pendiente,\n{marca}",
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
  knowledge_sources: {
    website_urls: [],
    website_focus: "",
    spreadsheet_url: "",
    spreadsheet_data: "",
    spreadsheet_mapping: "",
    internal_notes: "",
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
    primary_color: "#6d41f3",
    accent_color: "#8d58ff",
  },
  contact: {
    public_whatsapp_number: "",
    human_agent_whatsapp_number: "",
    support_email: "",
  },
  agent: {
    tone: "",
    final_cta_label: "",
    handoff_target_channel: "whatsapp",
    prompt_additions: "",
  },
  widget: {
    install_mode: "slug",
    allowed_domains: [],
  },
  integrations: {
    whatsapp: {
      provider: "meta_cloud",
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
      from_email: "",
      reply_to_email: "",
      smtp_host: "",
      smtp_port: "465",
      smtp_secure: true,
      smtp_user: "",
      smtp_pass: "",
      validation: {
        status: "pending",
        last_validated_at: "",
        message: "Sin validar todavia",
      },
    },
    automations: {
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
    ["services", "knowledge_sources", "message_templates", "automation_flows", "widget"].includes(parentKey)
  ) {
    return {};
  }

  const output = Array.isArray(base) ? [...base] : { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (["services", "knowledge_sources", "message_templates", "automation_flows", "widget"].includes(key)) {
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
      min_monthly_fee: cleanString(facts?.min_monthly_fee),
      min_project_fee: cleanString(facts?.min_project_fee),
      url: cleanString(facts?.url),
      description: cleanString(facts?.description),
      notes: cleanString(facts?.notes),
    };
  }

  return result;
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

  for (const [key, templateDefaults] of Object.entries(defaults)) {
    const incoming = value?.[key] || {};
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

export function sanitizeAppConfig(input = {}) {
  const services = sanitizeServices(input?.services);
  const message_templates = sanitizeMessageTemplates(input?.message_templates);
  const automation_flows = sanitizeAutomationFlows(input?.automation_flows);
  const knowledge_sources = sanitizeKnowledgeSources(input?.knowledge_sources);
  const widget = sanitizeWidgetConfig(input?.widget);
  const defaults =
    input?.product?.mode === "chat_only" || cleanString(input?.product?.mode) === "chat_only"
      ? getBlankAppConfig({ productMode: "chat_only" })
      : getDefaultAppConfig();

  return {
    product: {
      mode:
        cleanString(input?.product?.mode) === "chat_only"
          ? "chat_only"
          : defaults.product.mode,
    },
    brand: {
      name: resolveString(input?.brand?.name, defaults.brand.name),
      website_url: resolveString(input?.brand?.website_url, defaults.brand.website_url),
      logo_url: resolveString(input?.brand?.logo_url, defaults.brand.logo_url),
      primary_color: resolveString(input?.brand?.primary_color, defaults.brand.primary_color),
      accent_color: resolveString(input?.brand?.accent_color, defaults.brand.accent_color),
    },
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
      widget,
      integrations: {
      whatsapp: {
        provider:
          cleanString(input?.integrations?.whatsapp?.provider) ||
          defaults.integrations.whatsapp.provider,
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
      automation_flows,
      knowledge_sources,
      services:
        Object.prototype.hasOwnProperty.call(input || {}, "services")
          ? services
          : defaults.services,
  };
}
