export const DEFAULT_APP_CONFIG = {
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDeep(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return clone(base);
  }

  const output = Array.isArray(base) ? [...base] : { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      output[key] = mergeDeep(base[key], value);
    } else {
      output[key] = value;
    }
  }

  return output;
}

export function getDefaultAppConfig() {
  return clone(DEFAULT_APP_CONFIG);
}

export function mergeAppConfig(overrides = null) {
  return mergeDeep(getDefaultAppConfig(), overrides || {});
}

function cleanString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
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

export function sanitizeAppConfig(input = {}) {
  const services = sanitizeServices(input?.services);

  return {
    brand: {
      name: cleanString(input?.brand?.name) || DEFAULT_APP_CONFIG.brand.name,
      website_url:
        cleanString(input?.brand?.website_url) ||
        DEFAULT_APP_CONFIG.brand.website_url,
      logo_url:
        cleanString(input?.brand?.logo_url) || DEFAULT_APP_CONFIG.brand.logo_url,
      primary_color:
        cleanString(input?.brand?.primary_color) ||
        DEFAULT_APP_CONFIG.brand.primary_color,
      accent_color:
        cleanString(input?.brand?.accent_color) ||
        DEFAULT_APP_CONFIG.brand.accent_color,
    },
    contact: {
      public_whatsapp_number: cleanString(
        input?.contact?.public_whatsapp_number
      ),
      human_agent_whatsapp_number:
        cleanString(input?.contact?.human_agent_whatsapp_number) ||
        DEFAULT_APP_CONFIG.contact.human_agent_whatsapp_number,
      support_email: cleanString(input?.contact?.support_email),
    },
    agent: {
      tone: cleanString(input?.agent?.tone) || DEFAULT_APP_CONFIG.agent.tone,
      final_cta_label:
        cleanString(input?.agent?.final_cta_label) ||
        DEFAULT_APP_CONFIG.agent.final_cta_label,
      handoff_target_channel:
        cleanString(input?.agent?.handoff_target_channel) ||
        DEFAULT_APP_CONFIG.agent.handoff_target_channel,
      prompt_additions: cleanString(input?.agent?.prompt_additions),
    },
    services: Object.keys(services).length
      ? services
      : getDefaultAppConfig().services,
  };
}
