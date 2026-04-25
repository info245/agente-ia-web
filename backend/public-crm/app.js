const state = {
  currentUser: null,
  needsBootstrap: false,
  accounts: [],
  activeAccountId: null,
  adminOverview: [],
  leads: [],
  filteredLeads: [],
  selectedLead: null,
  selectedQuote: null,
  selectedAnalysis: null,
  leadPage: 0,
  quoteItems: [],
  analytics: null,
  appConfig: null,
  suggestedSectorPresetKey: "",
};

const LEAD_PAGE_SIZE = 15;
const API_BASE = `${window.location.origin}/api/crm`;
const ACCOUNT_STORAGE_KEY = "crmActiveAccountId";
const MESSAGE_TEMPLATE_ORDER = [
  "whatsapp_first_contact",
  "email_first_contact",
  "quote_whatsapp",
  "quote_email",
  "recovery_whatsapp",
  "recovery_email",
];
const AUTOMATION_FLOW_ORDER = ["lead_recovery", "quote_followup"];
const SECTOR_PRESETS = {
  clinic: {
    label: "Clinica",
    kicker: "Captacion local",
    summary: "Pensado para clinicas y centros que necesitan convertir visitas en citas o valoraciones.",
    tone: "cercano, profesional y orientado a resolver dudas con claridad y confianza",
    prompt_additions:
      "Prioriza confianza, autoridad y facilidad de reserva. Haz preguntas simples, evita tecnicismos y conduce la conversacion hacia valoracion, cita o llamada.",
    website_focus:
      "tratamientos, especialidades, zonas, testimonios, casos, contacto, llamada a la accion y reserva",
    internal_notes:
      "Trabajar objeciones habituales sobre precio, confianza, tiempos y resultados esperados. Dar mucha importancia a testimonios y autoridad.",
    services: {
      SEO: {
        min_monthly_fee: "350 € + IVA",
        min_project_fee: "",
        url: "",
        description: "SEO local y contenidos orientados a captar pacientes y mejorar visibilidad en buscadores.",
        notes: "Enfatizar Google Maps, reseñas, confianza y captacion por especialidad.",
      },
      "Google Ads": {
        min_monthly_fee: "300 € + IVA",
        min_project_fee: "",
        url: "",
        description: "Campañas para captar solicitudes de cita y primeras valoraciones.",
        notes: "Hablar de volumen de leads, zonas y especialidades con mejor retorno.",
      },
      "Diseño Web": {
        min_monthly_fee: "",
        min_project_fee: "1200 € + IVA",
        url: "",
        description: "Web enfocada a generar confianza y facilitar el paso a cita o contacto.",
        notes: "Priorizar prueba social, llamadas a la accion y estructura clara por tratamiento.",
      },
      },
    },
    esthetic_clinic: {
      label: "Clinica estetica",
      kicker: "Valoraciones y tratamientos premium",
      summary: "Pensado para clinicas esteticas y centros medico-esteticos que necesitan generar confianza y primeras valoraciones.",
      tone: "cercano, elegante y orientado a confianza, tratamiento y valoracion",
      prompt_additions:
        "En clinica estetica prioriza confianza, resultados, autoridad profesional y facilidad para pedir valoracion. Evita promesas exageradas y conduce la conversacion hacia diagnostico, llamada o cita.",
      website_focus:
        "tratamientos faciales y corporales, doctores, casos, valoraciones, financiacion, testimonios, preguntas frecuentes y reserva",
      internal_notes:
        "Importan mucho la prueba social, la claridad del tratamiento, la confianza en el equipo y la velocidad de respuesta a leads calientes.",
      services: {
        SEO: {
          min_monthly_fee: "400 EUR + IVA",
          min_project_fee: "",
          url: "",
          description: "SEO local y de tratamiento para captar pacientes con intencion alta de valoracion.",
          notes: "Muy util trabajar tratamientos, before/after, zonas y autoridad medica.",
        },
        "Google Ads": {
          min_monthly_fee: "400 EUR + IVA",
          min_project_fee: "",
          url: "",
          description: "Campanas para primeras valoraciones y captacion por tratamiento o zona.",
          notes: "Conviene filtrar bien tipo de tratamiento, ticket y urgencia comercial.",
        },
        "Diseno Web": {
          min_monthly_fee: "",
          min_project_fee: "1500 EUR + IVA",
          url: "",
          description: "Web orientada a generar confianza y convertir interes en valoracion o cita.",
          notes: "Muy importante reforzar testimonios, doctores, tratamientos y CTA visibles.",
        },
      },
    },
    dental: {
      label: "Clinica dental",
    kicker: "Implantes, ortodoncia y primeras visitas",
    summary: "Pensado para clinicas dentales que necesitan generar confianza y captar primeras valoraciones o citas.",
    tone: "claro, cercano y orientado a resolver dudas con autoridad y confianza",
    prompt_additions:
      "En clinica dental, prioriza confianza, testimonios, especialidades, financiacion y facilidad de reserva. Lleva la conversacion hacia valoracion, llamada o cita.",
    website_focus:
      "implantes, ortodoncia, invisalign, estetica dental, primeras visitas, testimonios, financiacion, contacto y reserva",
    internal_notes:
      "Importan mucho la confianza, la prueba social, la rapidez de respuesta y explicar tratamientos sin tecnicismos innecesarios.",
    services: {
      SEO: {
        min_monthly_fee: "400 € + IVA",
        min_project_fee: "",
        url: "",
        description: "SEO local y de tratamiento para captar pacientes con alta intencion de busqueda.",
        notes: "Hablar de Google Maps, reseñas, ubicacion, tratamientos y especialidades.",
      },
      "Google Ads": {
        min_monthly_fee: "350 € + IVA",
        min_project_fee: "",
        url: "",
        description: "Campañas para primeras visitas, valoraciones y tratamientos clave.",
        notes: "Interesa trabajar intencion, zona, coste por lead y calidad de llamada.",
      },
      "Diseño Web": {
        min_monthly_fee: "",
        min_project_fee: "1400 € + IVA",
        url: "",
        description: "Web enfocada a generar confianza y acelerar la reserva de cita.",
        notes: "Muy relevante reforzar testimonios, casos y llamadas a la accion visibles.",
      },
      },
    },
    saas: {
      label: "Software B2B",
      kicker: "Demos, trials y pipeline",
      summary: "Pensado para software, SaaS y herramientas digitales que quieren generar demos y oportunidades cualificadas.",
      tone: "consultivo, preciso y orientado a pipeline, demo y retorno",
      prompt_additions:
        "En software B2B prioriza caso de uso, vertical, demo, objeciones y claridad de propuesta de valor. Lleva la conversacion a demo, llamada o prueba.",
      website_focus:
        "producto, casos de uso, integraciones, demo, pricing, comparativas, testimonios y captura de demanda",
      internal_notes:
        "Importan mucho vertical, ICP, friccion del formulario, claridad del onboarding y argumentos de diferenciacion frente a competidores.",
      services: {
        SEO: {
          min_monthly_fee: "500 EUR + IVA",
          min_project_fee: "",
          url: "",
          description: "SEO para captar demanda con intencion en categorias, problemas y comparativas.",
          notes: "Muy util trabajar landing por problema, categoria y comparacion con competidores.",
        },
        "Google Ads": {
          min_monthly_fee: "450 EUR + IVA",
          min_project_fee: "",
          url: "",
          description: "Campanas para demos, trials y reuniones comerciales con intencion alta.",
          notes: "Priorizar search de alta intencion, branded defense y audiencias por sector.",
        },
        "Diseno Web": {
          min_monthly_fee: "",
          min_project_fee: "1800 EUR + IVA",
          url: "",
          description: "Web y landings para explicar producto, demostrar valor y convertir a demo.",
          notes: "Importa mucho estructura de valor, prueba social, UX de demo y objeciones.",
        },
      },
    },
    ecommerce: {
      label: "Ecommerce",
    kicker: "Venta online",
    summary: "Base pensada para tiendas online que quieren vender mas con mejor conversion y adquisicion.",
    tone: "directo, comercial y orientado a conversion, rentabilidad y escalado",
    prompt_additions:
      "Prioriza catalogo, conversion, ticket medio y adquisicion. Si el usuario vende online, habla de embudo, margen y retorno sin perder claridad.",
    website_focus:
      "catalogo, categorias, producto, pasarela de pago, envios, confianza, captacion y conversion",
    internal_notes:
      "Tener en cuenta Shopify, WooCommerce, feed de productos, campañas de shopping, emailing y CRO.",
    services: {
      "Google Ads": {
        min_monthly_fee: "400 € + IVA",
        min_project_fee: "",
        url: "",
        description: "Campañas de shopping, search y performance orientadas a ventas online.",
        notes: "Hablar de ROAS, feed, catalogo y escalado por categoria o margen.",
      },
      SEO: {
        min_monthly_fee: "450 € + IVA",
        min_project_fee: "",
        url: "",
        description: "SEO para categorias, producto y estructura de ecommerce orientada a captacion organica.",
        notes: "Relevante para fichas de producto, categorias, enlazado interno y contenidos.",
      },
      "Diseño Web": {
        min_monthly_fee: "",
        min_project_fee: "1800 € + IVA",
        url: "",
        description: "Diseño o mejora de ecommerce con foco en conversion y experiencia de compra.",
        notes: "Mencionar checkout, confianza, pasarela de pago, email marketing y automatizaciones.",
      },
    },
  },
  real_estate: {
    label: "Inmobiliaria",
    kicker: "Captacion de compradores y propietarios",
    summary: "Base para inmobiliarias y promotoras que necesitan leads locales con seguimiento rapido.",
    tone: "consultivo, agil y centrado en confianza, zona y calidad del lead",
    prompt_additions:
      "En inmobiliaria prioriza zona, tipologia de inmueble, confianza y velocidad de contacto. Conduce la conversacion hacia visita, valoracion o llamada.",
    website_focus:
      "inmuebles, zonas, valoracion, captacion de propietarios, promociones, testimonios y contacto",
    internal_notes:
      "Trabajar tanto comprador como propietario. Importa mucho la respuesta rapida, la autoridad local y el filtrado del lead.",
    services: {
      SEO: {
        min_monthly_fee: "400 € + IVA",
        min_project_fee: "",
        url: "",
        description: "SEO local por zona, tipologia de inmueble y servicios inmobiliarios.",
        notes: "Hablar de visibilidad local, posicionamiento por barrio y captacion de propietarios.",
      },
      "Google Ads": {
        min_monthly_fee: "400 € + IVA",
        min_project_fee: "",
        url: "",
        description: "Campañas para captar interesados y propietarios con alta intencion.",
        notes: "Muy importante segmentacion geografica, urgencia y seguimiento comercial.",
      },
      "Diseño Web": {
        min_monthly_fee: "",
        min_project_fee: "1500 € + IVA",
        url: "",
        description: "Web para convertir visitas en solicitudes de visita o valoracion.",
        notes: "Priorizar buscador de inmuebles, confianza y formularios muy visibles.",
      },
    },
  },
  agency: {
    label: "Agencia",
    kicker: "Leads B2B",
    summary: "Pensado para agencias y negocios de servicios que venden proyectos o retainers.",
    tone: "consultivo, estrategico y orientado a detectar oportunidades de captacion y posicionamiento",
    prompt_additions:
      "Si el negocio es una agencia o servicio B2B, prioriza captacion de leads, posicionamiento de expertise, propuesta de valor y canal mas rentable.",
    website_focus:
      "casos de exito, servicios, propuesta de valor, equipo, captacion de leads y diferenciacion",
    internal_notes:
      "Importan mucho autoridad, casos reales, especializacion, formularios cortos y continuidad comercial por WhatsApp o llamada.",
    services: {
      SEO: {
        min_monthly_fee: "400 € + IVA",
        min_project_fee: "",
        url: "",
        description: "SEO para captar demanda organica y construir autoridad por especialidad.",
        notes: "Enfatizar contenidos, casos y landings por servicio.",
      },
      "Google Ads": {
        min_monthly_fee: "350 € + IVA",
        min_project_fee: "",
        url: "",
        description: "Captacion de leads mediante search y campañas orientadas a formularios o llamadas.",
        notes: "Hablar de calidad del lead, volumen y control de coste por oportunidad.",
      },
      "Consultoría Digital": {
        min_monthly_fee: "",
        min_project_fee: "600 € + IVA",
        url: "",
        description: "Diagnostico comercial y plan de crecimiento para ordenar canales y conversion.",
        notes: "Muy util cuando hay dudas de canal, propuesta o priorizacion.",
      },
    },
  },
  academy: {
    label: "Academia",
    kicker: "Matriculas y captacion educativa",
    summary: "Pensado para academias, centros de formacion y cursos que necesitan convertir interes en matriculas o entrevistas.",
    tone: "claro, didactico y orientado a confianza, resultado y matricula",
    prompt_additions:
      "En academias y centros de formacion, prioriza claridad de oferta, modalidad, resultados y proceso de matricula. Haz la conversacion facil y muy orientada a resolver dudas.",
    website_focus:
      "cursos, matricula, metodologia, resultados, testimonios, modalidad, precios y contacto",
    internal_notes:
      "Importan mucho modalidades, plazas, pruebas sociales y resolver objeciones sobre tiempo, precio y salida profesional.",
    services: {
      SEO: {
        min_monthly_fee: "350 € + IVA",
        min_project_fee: "",
        url: "",
        description: "SEO para captar demanda organica de cursos y formaciones.",
        notes: "Hablar de cursos, categorias, campus, modalidad y contenidos de captacion.",
      },
      "Google Ads": {
        min_monthly_fee: "300 € + IVA",
        min_project_fee: "",
        url: "",
        description: "Campañas para matriculas, entrevistas y solicitudes de informacion.",
        notes: "Muy util para picos de captacion y cursos concretos con plazo.",
      },
      "Diseño Web": {
        min_monthly_fee: "",
        min_project_fee: "1200 € + IVA",
        url: "",
        description: "Web y landings para aumentar matriculas y solicitudes de informacion.",
        notes: "Importa mucho claridad, calendario, confianza y formularios sencillos.",
      },
    },
  },
    legal: {
      label: "Despacho",
    kicker: "Confianza y autoridad",
    summary: "Base comercial para despachos y profesionales donde la confianza y la claridad pesan mucho.",
    tone: "serio, claro y orientado a generar confianza sin sonar frio ni excesivamente tecnico",
    prompt_additions:
      "En negocios legales o profesionales, prioriza claridad, autoridad, especializacion y facilidad de contacto. Evita prometer resultados de forma agresiva.",
    website_focus:
      "especialidades, casos, confianza, equipo, contacto, zonas y captacion de consultas",
    internal_notes:
      "Dar mucha importancia a reputacion, especializacion, tono profesional y seguimiento humano rapido.",
    services: {
      SEO: {
        min_monthly_fee: "400 € + IVA",
        min_project_fee: "",
        url: "",
        description: "SEO local y de especialidad para generar consultas cualificadas.",
        notes: "Trabajar visibilidad por ciudad y por vertical juridica o profesional.",
      },
      "Google Ads": {
        min_monthly_fee: "350 € + IVA",
        min_project_fee: "",
        url: "",
        description: "Campañas para captar primeras consultas y llamadas en servicios de alta intencion.",
        notes: "Importa mucho el filtrado de lead y el control de calidad de la consulta.",
      },
      "Diseño Web": {
        min_monthly_fee: "",
        min_project_fee: "1000 € + IVA",
        url: "",
        description: "Web sobria y clara orientada a confianza, autoridad y conversion a consulta.",
        notes: "Reforzar especialidades, equipo, testimonios y canales de contacto visibles.",
      },
      },
    },
    hotel_tourism: {
      label: "Hotel / turismo",
      kicker: "Reservas directas y captacion local",
      summary: "Base comercial para hoteles, apartamentos y negocios turisticos que quieren mas reservas directas.",
      tone: "claro, visual y orientado a reserva, confianza y diferenciacion",
      prompt_additions:
        "En turismo prioriza reservas directas, disponibilidad, ubicacion, experiencias y confianza. Lleva la conversacion a reserva, consulta o llamada.",
      website_focus:
        "habitaciones, apartamentos, experiencias, reserva directa, ubicacion, opiniones, disponibilidad y ofertas",
      internal_notes:
        "Importan mucho fotos, propuesta diferencial, mobile, disponibilidad, reseñas y competir con OTAs sin depender solo de ellas.",
      services: {
        SEO: {
          min_monthly_fee: "350 EUR + IVA",
          min_project_fee: "",
          url: "",
          description: "SEO local y de intencion turistica para ganar visibilidad y reservas directas.",
          notes: "Trabajar posicionamiento por destino, tipologia, temporada y experiencia.",
        },
        "Google Ads": {
          min_monthly_fee: "350 EUR + IVA",
          min_project_fee: "",
          url: "",
          description: "Campanas para reservas directas, ofertas y captacion por temporada o destino.",
          notes: "Importa mucho la rentabilidad frente a intermediarios y la demanda de ultima hora.",
        },
        "Diseno Web": {
          min_monthly_fee: "",
          min_project_fee: "1300 EUR + IVA",
          url: "",
          description: "Web enfocada a reserva directa, experiencia visual y confianza inmediata.",
          notes: "Reforzar motor de reserva, opiniones, disponibilidad y CTA visibles desde movil.",
        },
      },
    },
    restaurant: {
      label: "Restaurante",
    kicker: "Reservas y visibilidad local",
    summary: "Base comercial para restaurantes y negocios de hosteleria que quieren atraer mas reservas y mejorar presencia digital.",
    tone: "cercano, agil y muy visual, orientado a reserva y diferenciacion",
    prompt_additions:
      "En restauracion y hosteleria prioriza reservas, visibilidad local, propuesta gastronomica y rapidez de contacto. Usa un tono claro y muy accionable.",
    website_focus:
      "carta, reservas, ubicacion, menus, eventos, delivery, testimonios y diferenciacion",
    internal_notes:
      "Importan fotos, reseñas, Google Maps, reservas directas y diferenciarse por tipo de cocina o experiencia.",
    services: {
      SEO: {
        min_monthly_fee: "300 € + IVA",
        min_project_fee: "",
        url: "",
        description: "SEO local para mejorar visibilidad en mapas y busquedas cercanas.",
        notes: "Priorizar maps, reseñas, marca y busquedas por tipo de cocina y zona.",
      },
      "Google Ads": {
        min_monthly_fee: "300 € + IVA",
        min_project_fee: "",
        url: "",
        description: "Campañas para reservas, menus concretos, eventos o delivery.",
        notes: "Muy util para franjas horarias, campañas locales y promociones puntuales.",
      },
      "Diseño Web": {
        min_monthly_fee: "",
        min_project_fee: "900 € + IVA",
        url: "",
        description: "Web ligera y visual orientada a reservas y contacto directo.",
        notes: "Importa mucho la experiencia movil, fotos, CTA de reserva y menu visible.",
      },
    },
  },
};

const el = {
  crmPage: document.querySelector(".crm-page"),
  crmAuthShell: document.getElementById("crmAuthShell"),
  crmAuthTitle: document.getElementById("crmAuthTitle"),
  crmAuthCopy: document.getElementById("crmAuthCopy"),
  crmAuthStatus: document.getElementById("crmAuthStatus"),
  crmLoginForm: document.getElementById("crmLoginForm"),
  crmLoginEmail: document.getElementById("crmLoginEmail"),
  crmLoginPassword: document.getElementById("crmLoginPassword"),
  crmLoginBtn: document.getElementById("crmLoginBtn"),
  crmBootstrapForm: document.getElementById("crmBootstrapForm"),
  crmBootstrapName: document.getElementById("crmBootstrapName"),
  crmBootstrapEmail: document.getElementById("crmBootstrapEmail"),
  crmBootstrapPassword: document.getElementById("crmBootstrapPassword"),
  crmBootstrapBtn: document.getElementById("crmBootstrapBtn"),
  crmAuthSwitchBtn: document.getElementById("crmAuthSwitchBtn"),
  crmSidebar: document.querySelector(".crm-sidebar"),
  accountSelect: document.getElementById("accountSelect"),
  accountPlanBadge: document.getElementById("accountPlanBadge"),
  refreshBtn: document.getElementById("refreshBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  crmViewAdminBtn: document.getElementById("crmViewAdminBtn"),
  crmViewSalesBtn: document.getElementById("crmViewSalesBtn"),
  crmViewConfigBtn: document.getElementById("crmViewConfigBtn"),
  crmViewAdmin: document.getElementById("crmViewAdmin"),
  crmViewSales: document.getElementById("crmViewSales"),
  crmViewConfig: document.getElementById("crmViewConfig"),
  crmMobileControls: document.getElementById("crmMobileControls"),
  crmAnalyticsAccordion: document.getElementById("crmAnalyticsAccordion"),
  crmMobileBottomNav: document.getElementById("crmMobileBottomNav"),
  crmMobileConfigBtn: document.getElementById("crmMobileConfigBtn"),
  mobileDateFilter: document.getElementById("mobileDateFilter"),
  crmSidebarFilters: document.getElementById("crmSidebarFilters"),
  crmSidebarFlow: document.getElementById("crmSidebarFlow"),
  crmSalesLinks: [...document.querySelectorAll(".crm-sales-link")],
  crmSidebarKicker: document.getElementById("crmSidebarKicker"),
  crmBrandEyebrow: document.getElementById("crmBrandEyebrow"),
  crmBrandTitle: document.getElementById("crmBrandTitle"),
  crmSidebarLogo: document.getElementById("crmSidebarLogo"),
  crmSidebarTitle: document.getElementById("crmSidebarTitle"),
  crmConfigTitle: document.getElementById("crmConfigTitle"),
  crmConfigCopy: document.getElementById("crmConfigCopy"),
  configSetupHealthCard: document.getElementById("configSetupHealthCard"),
  configSetupHealthTitle: document.getElementById("configSetupHealthTitle"),
  configSetupHealthCopy: document.getElementById("configSetupHealthCopy"),
  configSetupHealthBadge: document.getElementById("configSetupHealthBadge"),
  configSetupHealthGrid: document.getElementById("configSetupHealthGrid"),
  configSetupHealthNext: document.getElementById("configSetupHealthNext"),
  configForm: document.getElementById("configForm"),
  configBackBtn: document.getElementById("configBackBtn"),
  configSaveBtn: document.getElementById("configSaveBtn"),
  configSaveStatus: document.getElementById("configSaveStatus"),
  configProductMode: document.getElementById("configProductMode"),
  configProductModeHint: document.getElementById("configProductModeHint"),
  configWidgetInstallUrl: document.getElementById("configWidgetInstallUrl"),
  configWidgetRecommendedDomain: document.getElementById("configWidgetRecommendedDomain"),
  configWidgetEmbedMode: document.getElementById("configWidgetEmbedMode"),
  configWidgetAllowedDomains: document.getElementById("configWidgetAllowedDomains"),
  configWidgetSnippet: document.getElementById("configWidgetSnippet"),
  configWidgetInstallStatus: document.getElementById("configWidgetInstallStatus"),
  configCopyWidgetUrlBtn: document.getElementById("configCopyWidgetUrlBtn"),
  configCopyWidgetSnippetBtn: document.getElementById("configCopyWidgetSnippetBtn"),
  configWidgetPreviewBtn: document.getElementById("configWidgetPreviewBtn"),
  configTabGeneral: document.getElementById("configTabGeneral"),
  configTabKnowledge: document.getElementById("configTabKnowledge"),
  configTabMessages: document.getElementById("configTabMessages"),
  configTabAutomations: document.getElementById("configTabAutomations"),
  configTabIntegrations: document.getElementById("configTabIntegrations"),
  configTabWebsite: document.getElementById("configTabWebsite"),
  configPanelGeneral: document.getElementById("configPanelGeneral"),
  configPanelKnowledge: document.getElementById("configPanelKnowledge"),
  configPanelMessages: document.getElementById("configPanelMessages"),
  configPanelAutomations: document.getElementById("configPanelAutomations"),
  configPanelIntegrations: document.getElementById("configPanelIntegrations"),
  configPanelWebsite: document.getElementById("configPanelWebsite"),
  configBrandName: document.getElementById("configBrandName"),
  configWebsiteUrl: document.getElementById("configWebsiteUrl"),
  configBootstrapUrl: document.getElementById("configBootstrapUrl"),
  configAnalyzeWebsiteBtn: document.getElementById("configAnalyzeWebsiteBtn"),
  configAnalyzeStatus: document.getElementById("configAnalyzeStatus"),
  configBootstrapSummary: document.getElementById("configBootstrapSummary"),
  configLogoFile: document.getElementById("configLogoFile"),
  configLogoPreview: document.getElementById("configLogoPreview"),
  configLogoClearBtn: document.getElementById("configLogoClearBtn"),
  configLogoUrl: document.getElementById("configLogoUrl"),
  configPublicWhatsappNumber: document.getElementById("configPublicWhatsappNumber"),
  configHumanWhatsappNumber: document.getElementById("configHumanWhatsappNumber"),
  configSupportEmail: document.getElementById("configSupportEmail"),
  configAgentTone: document.getElementById("configAgentTone"),
  configFinalCtaLabel: document.getElementById("configFinalCtaLabel"),
  configHandoffTargetChannel: document.getElementById("configHandoffTargetChannel"),
  configPrimaryColor: document.getElementById("configPrimaryColor"),
  configAccentColor: document.getElementById("configAccentColor"),
  configPromptAdditions: document.getElementById("configPromptAdditions"),
  configWhatsappProvider: document.getElementById("configWhatsappProvider"),
  configWhatsappStatusLabel: document.getElementById("configWhatsappStatusLabel"),
  configWhatsappPhoneNumberId: document.getElementById("configWhatsappPhoneNumberId"),
  configWhatsappBusinessAccountId: document.getElementById("configWhatsappBusinessAccountId"),
  configWhatsappStatusBadge: document.getElementById("configWhatsappStatusBadge"),
  configValidateWhatsappBtn: document.getElementById("configValidateWhatsappBtn"),
  configWhatsappValidationMessage: document.getElementById("configWhatsappValidationMessage"),
  configWhatsappLastValidated: document.getElementById("configWhatsappLastValidated"),
  configMetaLeadSource: document.getElementById("configMetaLeadSource"),
  configGoogleLeadSource: document.getElementById("configGoogleLeadSource"),
  configLeadSheetDocument: document.getElementById("configLeadSheetDocument"),
  configLeadSheetTabs: document.getElementById("configLeadSheetTabs"),
  configLeadWebhookUrl: document.getElementById("configLeadWebhookUrl"),
  configValidateLeadFormsBtn: document.getElementById("configValidateLeadFormsBtn"),
  configLeadFormsValidationMessage: document.getElementById("configLeadFormsValidationMessage"),
  configLeadFormsLastValidated: document.getElementById("configLeadFormsLastValidated"),
  configEmailProvider: document.getElementById("configEmailProvider"),
  configEmailFromAddress: document.getElementById("configEmailFromAddress"),
  configEmailReplyTo: document.getElementById("configEmailReplyTo"),
  configValidateEmailBtn: document.getElementById("configValidateEmailBtn"),
  configEmailValidationMessage: document.getElementById("configEmailValidationMessage"),
  configEmailLastValidated: document.getElementById("configEmailLastValidated"),
  configAutomationPlatform: document.getElementById("configAutomationPlatform"),
  configAutomationWorkspaceUrl: document.getElementById("configAutomationWorkspaceUrl"),
  configAutomationNotes: document.getElementById("configAutomationNotes"),
  configValidateAutomationsBtn: document.getElementById("configValidateAutomationsBtn"),
  configAutomationsValidationMessage: document.getElementById("configAutomationsValidationMessage"),
  configAutomationsLastValidated: document.getElementById("configAutomationsLastValidated"),
  configMessageTemplatesList: document.getElementById("configMessageTemplatesList"),
  configAutomationFlowsList: document.getElementById("configAutomationFlowsList"),
  configServicesList: document.getElementById("configServicesListKnowledge"),
  configAddServiceBtn: document.getElementById("configAddServiceBtnKnowledge"),
  configSuggestServicesBtn: document.getElementById("configSuggestServicesBtn"),
  configSuggestServicesStatus: document.getElementById("configSuggestServicesStatus"),
  configSectorPresetList: document.getElementById("configSectorPresetList"),
  configSuggestPresetBtn: document.getElementById("configSuggestPresetBtn"),
  configSectorPresetStatus: document.getElementById("configSectorPresetStatus"),
  configKnowledgeProgressLabel: document.getElementById("configKnowledgeProgressLabel"),
  configKnowledgeNextHint: document.getElementById("configKnowledgeNextHint"),
  configKnowledgeStepPresetBtn: document.getElementById("configKnowledgeStepPresetBtn"),
  configKnowledgeStepServicesBtn: document.getElementById("configKnowledgeStepServicesBtn"),
  configKnowledgeStepSourcesBtn: document.getElementById("configKnowledgeStepSourcesBtn"),
  configKnowledgeStepReviewBtn: document.getElementById("configKnowledgeStepReviewBtn"),
  configKnowledgeWebsiteUrls: document.getElementById("configKnowledgeWebsiteUrls"),
  configKnowledgeWebsiteFocus: document.getElementById("configKnowledgeWebsiteFocus"),
  configKnowledgeWebsiteCount: document.getElementById("configKnowledgeWebsiteCount"),
  configKnowledgeSpreadsheetFile: document.getElementById("configKnowledgeSpreadsheetFile"),
  configKnowledgeSpreadsheetUrl: document.getElementById("configKnowledgeSpreadsheetUrl"),
  configKnowledgeSpreadsheetData: document.getElementById("configKnowledgeSpreadsheetData"),
  configKnowledgeSpreadsheetMapping: document.getElementById("configKnowledgeSpreadsheetMapping"),
  configKnowledgeSpreadsheetHint: document.getElementById("configKnowledgeSpreadsheetHint"),
  configKnowledgeInternalNotes: document.getElementById("configKnowledgeInternalNotes"),
  configPreviewContextBtn: document.getElementById("configPreviewContextBtn"),
  configSuggestSetupBtn: document.getElementById("configSuggestSetupBtn"),
  configContextPreviewSummary: document.getElementById("configContextPreviewSummary"),
  configContextPreviewOutput: document.getElementById("configContextPreviewOutput"),
  configContextPreviewStatus: document.getElementById("configContextPreviewStatus"),
  configSuggestSetupStatus: document.getElementById("configSuggestSetupStatus"),
  adminOverviewGrid: document.getElementById("adminOverviewGrid"),
  adminCreateName: document.getElementById("adminCreateName"),
  adminCreateSlug: document.getElementById("adminCreateSlug"),
  adminCreatePlan: document.getElementById("adminCreatePlan"),
  adminCreateStatus: document.getElementById("adminCreateStatus"),
  adminCreateProductMode: document.getElementById("adminCreateProductMode"),
  adminCreateDefault: document.getElementById("adminCreateDefault"),
  adminCreateAdminEmail: document.getElementById("adminCreateAdminEmail"),
  adminCreateAdminPassword: document.getElementById("adminCreateAdminPassword"),
  adminCreateAdminDisplayName: document.getElementById("adminCreateAdminDisplayName"),
  adminCreateAccountBtn: document.getElementById("adminCreateAccountBtn"),
  adminAccountStatus: document.getElementById("adminAccountStatus"),
  dateFilter: document.getElementById("dateFilter"),
  sourceFilter: document.getElementById("sourceFilter"),
  serviceFilter: document.getElementById("serviceFilter"),
  leadTitle: document.getElementById("leadTitle"),
  leadChannel: document.getElementById("leadChannel"),
  leadMeta: document.getElementById("leadMeta"),
  analyticsRangeLabel: document.getElementById("analyticsRangeLabel"),
  analyticsLeadsGenerated: document.getElementById("analyticsLeadsGenerated"),
  analyticsPassedWhatsapp: document.getElementById("analyticsPassedWhatsapp"),
  analyticsWhatsappHint: document.getElementById("analyticsWhatsappHint"),
  analyticsQuotesSent: document.getElementById("analyticsQuotesSent"),
  analyticsQuotesAccepted: document.getElementById("analyticsQuotesAccepted"),
  analyticsResponseTime: document.getElementById("analyticsResponseTime"),
  analyticsAcceptanceRate: document.getElementById("analyticsAcceptanceRate"),
  analyticsChannelBreakdown: document.getElementById("analyticsChannelBreakdown"),
  analyticsSourceBreakdown: document.getElementById("analyticsSourceBreakdown"),
  analyticsServiceBreakdown: document.getElementById("analyticsServiceBreakdown"),
  analyticsTimeline: document.getElementById("analyticsTimeline"),
  leadTableBody: document.getElementById("leadTableBody"),
  leadMobileList: document.getElementById("leadMobileList"),
  leadTableInfo: document.getElementById("leadTableInfo"),
  leadPrevBtn: document.getElementById("leadPrevBtn"),
  leadNextBtn: document.getElementById("leadNextBtn"),
  leadPaginationInfo: document.getElementById("leadPaginationInfo"),
  messageList: document.getElementById("messageList"),
  leadForm: document.getElementById("leadForm"),
  saveBtn: document.getElementById("saveBtn"),
  deleteLeadBtn: document.getElementById("deleteLeadBtn"),
  leadSaveStatus: document.getElementById("leadSaveStatus"),
  leadName: document.getElementById("leadName"),
  leadEmail: document.getElementById("leadEmail"),
  leadPhone: document.getElementById("leadPhone"),
  leadCompanyName: document.getElementById("leadCompanyName"),
  leadInterestService: document.getElementById("leadInterestService"),
  leadBudgetRange: document.getElementById("leadBudgetRange"),
  leadMainGoal: document.getElementById("leadMainGoal"),
  leadCurrentSituation: document.getElementById("leadCurrentSituation"),
  leadPainPoints: document.getElementById("leadPainPoints"),
  leadPreferredContactChannel: document.getElementById("leadPreferredContactChannel"),
  crmStatus: document.getElementById("crmStatus"),
  quoteStatus: document.getElementById("quoteStatus"),
  assignedTo: document.getElementById("assignedTo"),
  nextAction: document.getElementById("nextAction"),
  followUpAt: document.getElementById("followUpAt"),
  internalNotes: document.getElementById("internalNotes"),
  quoteTitle: document.getElementById("quoteTitle"),
  quoteCurrency: document.getElementById("quoteCurrency"),
  quoteBillingType: document.getElementById("quoteBillingType"),
  quoteBillingLabel: document.getElementById("quoteBillingLabel"),
  quoteTaxRate: document.getElementById("quoteTaxRate"),
  quoteSummary: document.getElementById("quoteSummary"),
  quoteScope: document.getElementById("quoteScope"),
  quoteBody: document.getElementById("quoteBody"),
  quoteAssumptions: document.getElementById("quoteAssumptions"),
  quotePreviewBtn: document.getElementById("quotePreviewBtn"),
  quotePdfBtn: document.getElementById("quotePdfBtn"),
  quoteSendEmailBtn: document.getElementById("quoteSendEmailBtn"),
  quoteSendWhatsappBtn: document.getElementById("quoteSendWhatsappBtn"),
  quoteAutofillBtn: document.getElementById("quoteAutofillBtn"),
  quoteSaveBtn: document.getElementById("quoteSaveBtn"),
  quoteAddItemBtn: document.getElementById("quoteAddItemBtn"),
  quoteItemsList: document.getElementById("quoteItemsList"),
  quoteSubtotal: document.getElementById("quoteSubtotal"),
  quoteTax: document.getElementById("quoteTax"),
  quoteTotal: document.getElementById("quoteTotal"),
  quoteSaveStatus: document.getElementById("quoteSaveStatus"),
  analysisGenerateBtn: document.getElementById("analysisGenerateBtn"),
  analysisSaveBtn: document.getElementById("analysisSaveBtn"),
  analysisPreviewBtn: document.getElementById("analysisPreviewBtn"),
  analysisSendBtn: document.getElementById("analysisSendBtn"),
  analysisSaveStatus: document.getElementById("analysisSaveStatus"),
  analysisTitle: document.getElementById("analysisTitle"),
  analysisHeadline: document.getElementById("analysisHeadline"),
  analysisRecommendedService: document.getElementById("analysisRecommendedService"),
  analysisStatusLabel: document.getElementById("analysisStatusLabel"),
  analysisSummaryText: document.getElementById("analysisSummaryText"),
  analysisFindingsList: document.getElementById("analysisFindingsList"),
  analysisQuickWinsList: document.getElementById("analysisQuickWinsList"),
  analysisNextStepText: document.getElementById("analysisNextStepText"),
  analysisEditTitle: document.getElementById("analysisEditTitle"),
  analysisEditRecommendedService: document.getElementById("analysisEditRecommendedService"),
  analysisEditHeadline: document.getElementById("analysisEditHeadline"),
  analysisEditStatus: document.getElementById("analysisEditStatus"),
  analysisEditSummary: document.getElementById("analysisEditSummary"),
  analysisEditFindings: document.getElementById("analysisEditFindings"),
  analysisEditQuickWins: document.getElementById("analysisEditQuickWins"),
  analysisEditPriorities: document.getElementById("analysisEditPriorities"),
  analysisEditNextStep: document.getElementById("analysisEditNextStep"),
};

function fmtDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("es-ES");
}

function fmtMoney(value, currency = "EUR") {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount);
}

function setAuthMode(mode = "login") {
  const isBootstrap = mode === "bootstrap";
  state.needsBootstrap = isBootstrap;
  el.crmLoginForm?.classList.toggle("is-hidden", isBootstrap);
  el.crmBootstrapForm?.classList.toggle("is-hidden", !isBootstrap);
  el.crmAuthSwitchBtn?.classList.toggle("is-hidden", !isBootstrap);
  if (el.crmAuthTitle) {
    el.crmAuthTitle.textContent = isBootstrap ? "Crear super admin" : "Acceso CRM";
  }
  if (el.crmAuthCopy) {
    el.crmAuthCopy.textContent = isBootstrap
      ? "Este es el primer acceso. Crea la cuenta administradora principal del sistema."
      : "Entra como super admin o como administrador de una cuenta cliente.";
  }
}

function setAuthenticatedUi(isAuthenticated) {
  el.crmAuthShell?.classList.toggle("is-hidden", isAuthenticated);
  el.crmPage?.classList.toggle("is-hidden", !isAuthenticated);
}

function getDefaultViewForRole() {
  if (state.currentUser?.role === "super_admin") return "admin";
  return canAccessSalesWorkspace() ? "sales" : "config";
}

function getStoredAccountId() {
  try {
    return window.localStorage.getItem(ACCOUNT_STORAGE_KEY) || "";
  } catch (_error) {
    return "";
  }
}

function setStoredAccountId(value) {
  try {
    if (value) {
      window.localStorage.setItem(ACCOUNT_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    }
  } catch (_error) {
    // noop
  }
}

function getRequestedAccountId() {
  const url = new URL(window.location.href);
  return (
    String(url.searchParams.get("account_id") || "").trim() ||
    String(url.searchParams.get("account") || "").trim() ||
    getStoredAccountId()
  );
}

function withAccountScope(url) {
  const accountId = String(state.activeAccountId || "").trim();
  if (!accountId) return url;

  const next = new URL(url, window.location.origin);
  if (next.pathname.startsWith("/api/") || next.pathname.startsWith("/crm/")) {
    next.searchParams.set("account_id", accountId);
  }
  return next.toString();
}

function getActiveAccount() {
  return (state.accounts || []).find((account) => String(account?.id || "") === String(state.activeAccountId || "")) || state.accounts?.[0] || null;
}

function getBaseOrigin() {
  return window.location.origin.replace(/\/$/, "");
}

function getRecommendedWidgetDomain(config = state.appConfig || {}) {
  const websiteUrl = String(config?.brand?.website_url || "").trim();
  if (!websiteUrl) return "-";
  try {
    return new URL(websiteUrl).hostname;
  } catch (_error) {
    return websiteUrl.replace(/^https?:\/\//i, "").replace(/\/.*$/, "") || "-";
  }
}

function buildWidgetInstallData(config = state.appConfig || {}) {
  const account = getActiveAccount();
  const baseOrigin = getBaseOrigin();
  const widgetUrl = `${baseOrigin}/widget.js`;
  const installMode = String(config?.widget?.install_mode || "slug").trim() === "id" ? "id" : "slug";
  const accountSlug = String(account?.slug || "").trim();
  const accountId = String(account?.id || "").trim();
  const scopeAttr = installMode === "id"
    ? accountId
      ? `data-account-id="${accountId}"`
      : accountSlug
        ? `data-account-slug="${accountSlug}"`
        : ""
    : accountSlug
      ? `data-account-slug="${accountSlug}"`
      : accountId
        ? `data-account-id="${accountId}"`
        : "";
  const snippet = [
    "<script",
    `  src="${widgetUrl}"`,
    `  data-backend="${baseOrigin}"`,
    scopeAttr ? `  ${scopeAttr}` : "",
    '  data-position="right"',
    "></script>",
  ].filter(Boolean).join("\n");

  return {
    widgetUrl,
    recommendedDomain: getRecommendedWidgetDomain(config),
    installMode,
    snippet,
  };
}

function refreshWidgetInstallPreview() {
  const configSnapshot = {
    ...(state.appConfig || {}),
    brand: {
      ...(state.appConfig?.brand || {}),
      website_url: el.configWebsiteUrl?.value || state.appConfig?.brand?.website_url || "",
    },
    widget: {
      ...(state.appConfig?.widget || {}),
      install_mode: el.configWidgetEmbedMode?.value || state.appConfig?.widget?.install_mode || "slug",
      allowed_domains: String(el.configWidgetAllowedDomains?.value || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    },
  };
  const widgetInstall = buildWidgetInstallData(configSnapshot);
  if (el.configWidgetInstallUrl) {
    el.configWidgetInstallUrl.value = widgetInstall.widgetUrl;
  }
  if (el.configWidgetRecommendedDomain) {
    const preferredDomain = configSnapshot.widget.allowed_domains?.[0] || widgetInstall.recommendedDomain;
    el.configWidgetRecommendedDomain.value = preferredDomain || "-";
  }
  if (el.configWidgetSnippet) {
    el.configWidgetSnippet.value = widgetInstall.snippet;
  }
}

function prettyJson(value) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch (_error) {
    return "{}";
  }
}

function isChatOnlyProductMode(config = state.appConfig) {
  return String(config?.product?.mode || "").trim() === "chat_only";
}

function canAccessSalesWorkspace() {
  return !(isChatOnlyProductMode() && state.currentUser?.role !== "super_admin");
}

function getProductModeLabel(mode = "") {
  return mode === "chat_only" ? "Solo chat" : "Chat + CRM";
}

function computeSetupHealth(config = {}) {
  const servicesCount = Object.keys(config?.services || {}).length;
  const websiteUrlsCount = Array.isArray(config?.knowledge_sources?.website_urls)
    ? config.knowledge_sources.website_urls.filter(Boolean).length
    : 0;
  const hasSpreadsheetSource =
    Boolean(String(config?.knowledge_sources?.spreadsheet_url || "").trim()) ||
    Boolean(String(config?.knowledge_sources?.spreadsheet_data || "").trim());
  const hasInternalNotes = Boolean(
    String(config?.knowledge_sources?.internal_notes || "").trim()
  );
  const hasBrandIdentity =
    Boolean(String(config?.brand?.name || "").trim()) &&
    (Boolean(String(config?.brand?.website_url || "").trim()) ||
      Boolean(String(config?.brand?.logo_url || "").trim()));
  const hasDeliveryChannels =
    Boolean(String(config?.contact?.public_whatsapp_number || "").trim()) ||
    Boolean(String(config?.contact?.support_email || "").trim()) ||
    Boolean(String(config?.integrations?.whatsapp?.phone_number_id || "").trim()) ||
    Boolean(String(config?.integrations?.email?.from_email || "").trim()) ||
    Boolean(String(config?.integrations?.lead_forms?.webhook_url || "").trim()) ||
    Boolean(String(config?.integrations?.automations?.workspace_url || "").trim());

  const checks = [
    {
      key: "brand",
      label: "Marca",
      ready: hasBrandIdentity,
      hint: hasBrandIdentity ? "Lista" : "Falta identidad base",
    },
    {
      key: "offer",
      label: "Oferta",
      ready: servicesCount > 0,
      hint: servicesCount > 0 ? `${servicesCount} servicios` : "Sin servicios",
    },
    {
      key: "context",
      label: "Contexto",
      ready: websiteUrlsCount > 0 || hasSpreadsheetSource || hasInternalNotes,
      hint:
        websiteUrlsCount > 0 || hasSpreadsheetSource || hasInternalNotes
          ? "Fuentes cargadas"
          : "Sin fuentes",
    },
    {
      key: "delivery",
      label: "Entrega",
      ready: hasDeliveryChannels,
      hint: hasDeliveryChannels ? "Canales listos" : "Falta canal",
    },
  ];

  const readyCount = checks.filter((item) => item.ready).length;
  const totalCount = checks.length;
  const nextStep = checks.find((item) => !item.ready)?.label || "Listo para publicar";
  const status =
    readyCount === totalCount ? "ready" : readyCount >= 2 ? "in_progress" : "starting";

  return {
    checks,
    readyCount,
    totalCount,
    nextStep,
    status,
  };
}

function renderSetupHealth(config = state.appConfig) {
  if (!el.configSetupHealthCard || !el.configSetupHealthGrid) return;

  const health = computeSetupHealth(config || {});
  const tone =
    health.status === "ready" ? "ok" : health.status === "in_progress" ? "progress" : "pending";
  const title =
    health.status === "ready"
      ? "Listo para publicar"
      : health.status === "in_progress"
        ? "Setup en progreso"
        : "Setup por empezar";
  const copy =
    health.status === "ready"
      ? "La cuenta ya tiene marca, oferta, contexto y canales mínimos para salir a producción."
      : health.status === "in_progress"
        ? "Ya hay una base útil. Remata los bloques pendientes para dejar el agente consistente y publicable."
        : "Todavía falta aterrizar la base comercial y técnica del agente antes de ponerlo a trabajar.";

  el.configSetupHealthCard.dataset.tone = tone;
  if (el.configSetupHealthTitle) {
    el.configSetupHealthTitle.textContent = title;
  }
  if (el.configSetupHealthCopy) {
    el.configSetupHealthCopy.textContent = copy;
  }
  if (el.configSetupHealthBadge) {
    el.configSetupHealthBadge.textContent = `${health.readyCount}/${health.totalCount}`;
    el.configSetupHealthBadge.dataset.tone = tone;
  }
  el.configSetupHealthGrid.innerHTML = health.checks
    .map(
      (check) => `
        <div class="config-setup-health-item ${check.ready ? "is-ready" : ""}">
          <strong>${escapeHtml(check.label)}</strong>
          <span>${escapeHtml(check.hint)}</span>
        </div>
      `
    )
    .join("");

  if (el.configSetupHealthNext) {
    el.configSetupHealthNext.innerHTML = `
      <span>Siguiente paso</span>
      <strong>${escapeHtml(health.nextStep)}</strong>
    `;
  }
}

function updateProductModeUi(config = state.appConfig) {
  const isChatOnly = isChatOnlyProductMode(config);
  const allowSales = canAccessSalesWorkspace();
  const brandName = config?.brand?.name || "TMedia Global";
  const isChatOnlyEntry = isChatOnly && !allowSales;
  document.body?.classList.toggle("product-chat-only", isChatOnly);
  document.body?.classList.toggle("product-chat-entry", isChatOnlyEntry);
  el.crmPage?.classList.toggle("product-chat-only", isChatOnly);
  el.crmPage?.classList.toggle("product-chat-entry", isChatOnlyEntry);

  if (el.crmSidebarKicker) {
    el.crmSidebarKicker.textContent = isChatOnlyEntry ? "Onboarding guiado" : isChatOnly ? "Setup del chat" : "Indice operativo";
  }
  if (el.crmBrandEyebrow) {
    el.crmBrandEyebrow.textContent = brandName;
  }
  if (el.crmBrandTitle) {
    el.crmBrandTitle.textContent = isChatOnly ? "Chat IA" : "CRM Comercial";
  }
  if (el.crmSidebarTitle) {
    el.crmSidebarTitle.textContent = isChatOnly ? "Chat IA" : brandName;
  }
  if (el.crmViewSalesBtn) {
    el.crmViewSalesBtn.textContent = isChatOnly ? "Workspace comercial" : "CRM comercial";
  }
  if (el.crmViewConfigBtn) {
    el.crmViewConfigBtn.textContent = isChatOnlyEntry ? "Onboarding del chat" : isChatOnly ? "Setup del chat" : "Configuracion del agente";
  }
  if (el.crmMobileControlsSummary) {
    el.crmMobileControlsSummary.textContent = isChatOnlyEntry ? "Accesos del setup" : isChatOnly ? "Setup rapido" : "Menu rapido y filtros";
  }
  if (el.crmMobileConfigBtn) {
    el.crmMobileConfigBtn.textContent = isChatOnly ? "Setup" : "Config";
  }
  if (el.refreshBtn) {
    el.refreshBtn.textContent = isChatOnly ? "Actualizar setup" : "Actualizar";
  }
  if (el.configBackBtn) {
    el.configBackBtn.textContent = allowSales ? "Volver al CRM" : "Volver al setup";
  }
  if (el.crmConfigTitle) {
    el.crmConfigTitle.textContent = isChatOnly ? "Setup del chat" : "Configuracion del agente";
  }
  if (el.crmConfigCopy) {
    el.crmConfigCopy.textContent = isChatOnly
      ? "Configura marca, fuentes, mensajes, automatizaciones e integraciones para dejar el asistente listo sin depender del CRM comercial."
      : "Gestiona marca, canales, tono, servicios y bootstrap desde web sin invadir la operativa comercial.";
  }

  document.title = `${isChatOnly ? "Chat IA" : "CRM"} ${brandName}`;
}

function normalizeKnowledgeCopyLegacy() {
  const setText = (selector, text) => {
    if (!text) return;
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
  };

  setText('#configPanelKnowledge .knowledge-onboarding-head p', 'Empieza por el sector, aterriza la oferta, añade contexto útil y revisa exactamente lo que va a usar la IA.');
  setText('#configKnowledgeStepPreset .knowledge-block-head p', 'Si quieres ir rápido, arranca con una base por tipo de negocio y luego ajusta servicios, mensajes y automatizaciones.');
  setText('#configKnowledgeStepServices .knowledge-block-head strong', 'Define la oferta que sí o sí quieres controlar');
  setText('#configKnowledgeStepServices .knowledge-block-head p', 'Ideal para dejar claro qué vendes, con qué enfoque y con qué rango de precios, sin depender de scraping ni importaciones.');
  setText('#configKnowledgeStepSources .knowledge-block:first-child .knowledge-block-head p', 'Pega la home y páginas clave de servicios, casos de éxito o FAQ. Una URL por línea.');
  setText('#configKnowledgeStepSources .knowledge-block:nth-child(2) .knowledge-block-head strong', 'Tarifas y catálogo comercial');
  setText('#configKnowledgeStepSources .knowledge-block:nth-child(2) .knowledge-block-head p', 'Puedes pegar aquí filas copiadas desde Excel o subir un CSV exportado para conservar servicios, packs y precios.');
  setText('#configKnowledgeStepReview .knowledge-block-head p', 'Comprueba antes de publicar qué servicios, URLs, notas y matices está usando la IA para responder y proponer.');
  setText('#configContextPreviewSummary', 'Aún no has generado una vista previa del contexto.');

  const websiteFocusField = el.configKnowledgeWebsiteFocus?.closest('label');
  if (websiteFocusField) {
    const labelTextNode = [...websiteFocusField.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || '').trim());
    if (labelTextNode) {
      labelTextNode.textContent = '\n                      Qué quieres extraer\n                      ';
    }
  }

  const mappingField = el.configKnowledgeSpreadsheetMapping?.closest('label');
  if (mappingField) {
    const labelTextNode = [...mappingField.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || '').trim());
    if (labelTextNode) {
      labelTextNode.textContent = '\n                      Cómo interpretar esta tabla\n                      ';
    }
  }

  const notesField = el.configKnowledgeInternalNotes?.closest('label');
  if (notesField) {
    const labelTextNode = [...notesField.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || '').trim());
    if (labelTextNode) {
      labelTextNode.textContent = '\n                    Documentación rápida del agente\n                    ';
    }
  }

  if (el.configKnowledgeWebsiteFocus) {
    el.configKnowledgeWebsiteFocus.placeholder = 'Servicios prioritarios, propuesta de valor, testimonios, FAQs, claims comerciales...';
  }
  if (el.configKnowledgeSpreadsheetMapping) {
    el.configKnowledgeSpreadsheetMapping.placeholder = 'Ejemplo: columna A servicio, B tarifa mensual, C tarifa proyecto, D URL';
  }
  if (el.configContextPreviewOutput) {
    el.configContextPreviewOutput.placeholder = 'Aquí verás el contexto que usará la IA para servicios, URLs, hojas y notas internas.';
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeKnowledgeCopyRuntimeOld() {
  const setText = (selector, text) => {
    if (!text) return;
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
  };

  setText("#configPanelKnowledge .knowledge-onboarding-head p", "Empieza por el sector, aterriza la oferta, añade contexto útil y revisa exactamente lo que va a usar la IA.");
  setText("#configKnowledgeStepPreset .knowledge-block-head p", "Si quieres ir rápido, arranca con una base por tipo de negocio y luego ajusta servicios, mensajes y automatizaciones.");
  setText("#configKnowledgeStepServices .knowledge-block-head strong", "Define la oferta que sí o sí quieres controlar");
  setText("#configKnowledgeStepServices .knowledge-block-head p", "Ideal para dejar claro qué vendes, con qué enfoque y con qué rango de precios, sin depender de scraping ni importaciones.");
  setText("#configKnowledgeStepSources .knowledge-block:first-child .knowledge-block-head p", "Pega la home y páginas clave de servicios, casos de éxito o FAQ. Una URL por línea.");
  setText("#configKnowledgeStepSources .knowledge-block:nth-child(2) .knowledge-block-head strong", "Tarifas y catálogo comercial");
  setText("#configKnowledgeStepSources .knowledge-block:nth-child(2) .knowledge-block-head p", "Puedes pegar aquí filas copiadas desde Excel o subir un CSV exportado para conservar servicios, packs y precios.");
  setText("#configKnowledgeStepReview .knowledge-block-head p", "Comprueba antes de publicar qué servicios, URLs, notas y matices está usando la IA para responder y proponer.");
  setText("#configContextPreviewSummary", "Aún no has generado una vista previa del contexto.");

  const websiteFocusField = el.configKnowledgeWebsiteFocus?.closest("label");
  if (websiteFocusField) {
    const labelTextNode = [...websiteFocusField.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || "").trim());
    if (labelTextNode) {
      labelTextNode.textContent = "\n                      Qué quieres extraer\n                      ";
    }
  }

  const mappingField = el.configKnowledgeSpreadsheetMapping?.closest("label");
  if (mappingField) {
    const labelTextNode = [...mappingField.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || "").trim());
    if (labelTextNode) {
      labelTextNode.textContent = "\n                      Cómo interpretar esta tabla\n                      ";
    }
  }

  const notesField = el.configKnowledgeInternalNotes?.closest("label");
  if (notesField) {
    const labelTextNode = [...notesField.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || "").trim());
    if (labelTextNode) {
      labelTextNode.textContent = "\n                    Documentación rápida del agente\n                    ";
    }
  }

  if (el.configKnowledgeWebsiteFocus) {
    el.configKnowledgeWebsiteFocus.placeholder = "Servicios prioritarios, propuesta de valor, testimonios, FAQs, claims comerciales...";
  }
  if (el.configKnowledgeSpreadsheetMapping) {
    el.configKnowledgeSpreadsheetMapping.placeholder = "Ejemplo: columna A servicio, B tarifa mensual, C tarifa proyecto, D URL";
  }
  if (el.configContextPreviewOutput) {
    el.configContextPreviewOutput.placeholder = "Aquí verás el contexto que usará la IA para servicios, URLs, hojas y notas internas.";
  }
}

function normalizeKnowledgeCopy() {
  const setText = (selector, text) => {
    if (!text) return;
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
  };

  setText("#configPanelKnowledge .knowledge-onboarding-head p", "Empieza por el sector, aterriza la oferta, a\u00f1ade contexto \u00fatil y revisa exactamente lo que va a usar la IA.");
  setText("#configKnowledgeStepPreset .knowledge-block-head p", "Si quieres ir r\u00e1pido, arranca con una base por tipo de negocio y luego ajusta servicios, mensajes y automatizaciones.");
  setText("#configKnowledgeStepServices .knowledge-block-head strong", "Define la oferta que s\u00ed o s\u00ed quieres controlar");
  setText("#configKnowledgeStepServices .knowledge-block-head p", "Ideal para dejar claro qu\u00e9 vendes, con qu\u00e9 enfoque y con qu\u00e9 rango de precios, sin depender de scraping ni importaciones.");
  setText("#configKnowledgeStepSources .knowledge-block:first-child .knowledge-block-head p", "Pega la home y p\u00e1ginas clave de servicios, casos de \u00e9xito o FAQ. Una URL por l\u00ednea.");
  setText("#configKnowledgeStepSources .knowledge-block:nth-child(2) .knowledge-block-head strong", "Tarifas y cat\u00e1logo comercial");
  setText("#configKnowledgeStepSources .knowledge-block:nth-child(2) .knowledge-block-head p", "Puedes pegar aqu\u00ed filas copiadas desde Excel o subir un CSV exportado para conservar servicios, packs y precios.");
  setText("#configKnowledgeStepReview .knowledge-block-head p", "Comprueba antes de publicar qu\u00e9 servicios, URLs, notas y matices est\u00e1 usando la IA para responder y proponer.");
  setText("#configContextPreviewSummary", "A\u00fan no has generado una vista previa del contexto.");

  const websiteFocusField = el.configKnowledgeWebsiteFocus?.closest("label");
  if (websiteFocusField) {
    const labelTextNode = [...websiteFocusField.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || "").trim());
    if (labelTextNode) {
      labelTextNode.textContent = "\n                      Qu\u00e9 quieres extraer\n                      ";
    }
  }

  const mappingField = el.configKnowledgeSpreadsheetMapping?.closest("label");
  if (mappingField) {
    const labelTextNode = [...mappingField.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || "").trim());
    if (labelTextNode) {
      labelTextNode.textContent = "\n                      C\u00f3mo interpretar esta tabla\n                      ";
    }
  }

  const notesField = el.configKnowledgeInternalNotes?.closest("label");
  if (notesField) {
    const labelTextNode = [...notesField.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || "").trim());
    if (labelTextNode) {
      labelTextNode.textContent = "\n                    Documentaci\u00f3n r\u00e1pida del agente\n                    ";
    }
  }

  if (el.configKnowledgeWebsiteFocus) {
    el.configKnowledgeWebsiteFocus.placeholder = "Servicios prioritarios, propuesta de valor, testimonios, FAQs, claims comerciales...";
  }
  if (el.configKnowledgeSpreadsheetMapping) {
    el.configKnowledgeSpreadsheetMapping.placeholder = "Ejemplo: columna A servicio, B tarifa mensual, C tarifa proyecto, D URL";
  }
  if (el.configContextPreviewOutput) {
    el.configContextPreviewOutput.placeholder = "Aqu\u00ed ver\u00e1s el contexto que usar\u00e1 la IA para servicios, URLs, hojas y notas internas.";
  }
}

function normalizeAssetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "./assets/tmedia-global-logo.png";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  return raw;
}

function applyBrandTheme(config = {}) {
  const brand = config?.brand || {};
  const primary = brand.primary_color || "#6d41f3";
  const accent = brand.accent_color || "#8d58ff";
  const logoUrl = normalizeAssetUrl(brand.logo_url);
  const brandName = brand.name || "TMedia Global";

  const root = document.documentElement;
  root.style.setProperty("--accent", primary);
  root.style.setProperty("--accent-dark", primary);
  root.style.setProperty("--accent-line", accent);
  root.style.setProperty("--sidebar-start", primary);
  root.style.setProperty("--sidebar-mid", accent);
  root.style.setProperty("--sidebar-end", primary);

  if (el.crmSidebarLogo) {
    el.crmSidebarLogo.src = logoUrl;
    el.crmSidebarLogo.alt = brandName;
  }
  if (el.crmSidebarTitle) {
    el.crmSidebarTitle.textContent = brandName;
  }
  updateProductModeUi(config);
}

function updateConfigLogoPreview(value) {
  const logoUrl = normalizeAssetUrl(value);
  if (el.configLogoPreview) {
    el.configLogoPreview.src = logoUrl;
    el.configLogoPreview.alt = state.appConfig?.brand?.name || "Logo de marca";
  }
}

function fmtShortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("es-ES", {
        dateStyle: "short",
        timeStyle: "short",
      });
}

function getValidationTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "connected") return "ok";
  if (normalized === "warning") return "warning";
  return "pending";
}

function renderIntegrationValidation(type, validation = {}, badgeText = "") {
  const tone = getValidationTone(validation?.status);
  const fallbackMessage = validation?.message || "Sin validar todavia";
  const lastValidated = validation?.last_validated_at
    ? `Ultima validacion: ${fmtShortDate(validation.last_validated_at)}`
    : "Ultima validacion: -";

  const map = {
    whatsapp: {
      badge: el.configWhatsappStatusBadge,
      message: el.configWhatsappValidationMessage,
      timestamp: el.configWhatsappLastValidated,
    },
    lead_forms: {
      badge: null,
      message: el.configLeadFormsValidationMessage,
      timestamp: el.configLeadFormsLastValidated,
    },
    email: {
      badge: null,
      message: el.configEmailValidationMessage,
      timestamp: el.configEmailLastValidated,
    },
    automations: {
      badge: null,
      message: el.configAutomationsValidationMessage,
      timestamp: el.configAutomationsLastValidated,
    },
  };

  const target = map[type];
  if (!target) return;

  if (target.badge) {
    target.badge.textContent = badgeText || validation?.status || "Pendiente";
    target.badge.dataset.tone = tone;
  }
  if (target.message) {
    target.message.textContent = fallbackMessage;
    target.message.dataset.tone = tone;
  }
  if (target.timestamp) {
    target.timestamp.textContent = lastValidated;
  }
}

function setMainView(viewName) {
  const allowSales = canAccessSalesWorkspace();
  const isAdmin = viewName === "admin";
  const requestedConfig = viewName === "config";
  const isMobile = window.matchMedia("(max-width: 980px)").matches;
  const canSeeAdmin = state.currentUser?.role === "super_admin";
  const finalIsAdmin = isAdmin && canSeeAdmin;
  const isConfig = requestedConfig || (!allowSales && !finalIsAdmin);
  const isSales = !isConfig && !finalIsAdmin && allowSales;

  el.crmViewAdminBtn?.classList.toggle("is-hidden", !canSeeAdmin);
  el.crmViewAdminBtn?.classList.toggle("is-active", finalIsAdmin);
  el.crmViewSalesBtn.classList.toggle("is-hidden", !allowSales);
  el.crmViewSalesBtn.classList.toggle("is-active", isSales);
  el.crmViewConfigBtn.classList.toggle("is-active", isConfig);
  el.crmViewAdmin.classList.toggle("is-active", finalIsAdmin);
  el.crmViewSales.classList.toggle("is-active", isSales);
  el.crmViewConfig.classList.toggle("is-active", isConfig);
  if (el.crmMobileBottomNav) {
    el.crmMobileBottomNav.classList.toggle("is-hidden", isConfig || isAdmin || !allowSales);
  }
  if (el.crmMobileControls) {
    el.crmMobileControls.classList.toggle("is-hidden", isMobile || isAdmin || !allowSales);
  }
  if (el.crmSidebar) {
    el.crmSidebar.classList.toggle("is-mobile-sales-hidden", isMobile && isSales);
  }
  if (el.crmSidebarFilters) {
    el.crmSidebarFilters.classList.toggle("is-hidden", isConfig || isAdmin || !allowSales);
  }
  if (el.crmSidebarFlow) {
    el.crmSidebarFlow.classList.toggle("is-hidden", isConfig || isAdmin || !allowSales);
  }
  for (const link of el.crmSalesLinks) {
    link.classList.toggle("is-hidden", isConfig || isAdmin || !allowSales);
  }
}

function syncMobileAdaptiveUi() {
  const isMobile = window.matchMedia("(max-width: 980px)").matches;

  if (el.crmMobileControls) {
    el.crmMobileControls.classList.toggle("is-hidden", isMobile);
  }
  if (el.crmSidebar) {
    el.crmSidebar.classList.toggle("is-mobile-sales-hidden", isMobile);
  }

  if (el.crmMobileControls) {
    if (isMobile) {
      if (!el.crmMobileControls.dataset.mobileReady) {
        el.crmMobileControls.open = false;
        el.crmMobileControls.dataset.mobileReady = "true";
      }
    } else {
      el.crmMobileControls.open = true;
      delete el.crmMobileControls.dataset.mobileReady;
    }
  }

  if (el.crmAnalyticsAccordion) {
    if (isMobile) {
      if (!el.crmAnalyticsAccordion.dataset.mobileReady) {
        el.crmAnalyticsAccordion.open = false;
        el.crmAnalyticsAccordion.dataset.mobileReady = "true";
      }
    } else {
      el.crmAnalyticsAccordion.open = true;
      delete el.crmAnalyticsAccordion.dataset.mobileReady;
    }
  }
}

function getDateFilterLabel(value) {
  if (value === "today") return "Hoy";
  if (value === "7d") return "Ultimos 7 dias";
  if (value === "30d") return "Ultimos 30 dias";
  return "Todas";
}

function reloadSalesData() {
  state.leadPage = 0;
  renderLeadTable();
  renderLeadDetail();
  loadAnalytics().catch((error) => {
    console.warn("CRM analytics reload failed", error);
  });
}

function handleDateFilterChange(nextValue) {
  const value = nextValue || "all";
  if (el.dateFilter) {
    el.dateFilter.value = value;
  }
  if (el.mobileDateFilter) {
    el.mobileDateFilter.value = value;
  }
  reloadSalesData();
}

function populateServiceFilter(leads = []) {
  if (!el.serviceFilter) return;

  const currentValue = el.serviceFilter.value || "all";
  const services = Array.from(
    new Set(
      (leads || [])
        .map((lead) => String(lead?.interest_service || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "es"));

  el.serviceFilter.innerHTML = [
    '<option value="all">Todos</option>',
    ...services.map(
      (service) =>
        `<option value="${escapeHtml(service)}">${escapeHtml(service)}</option>`
    ),
  ].join("");

  el.serviceFilter.value = services.includes(currentValue) ? currentValue : "all";
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function fetchJson(url, options = {}) {
  const scopedUrl = withAccountScope(url);
  const res = await fetch(scopedUrl, options);
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();

  if (!contentType.includes("application/json")) {
    const preview = raw.trim().slice(0, 120);
      throw new Error(`La API no devolvio JSON en ${options.method || "GET"} ${scopedUrl}. Respuesta: ${preview || `HTTP ${res.status}`}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_error) {
    throw new Error("La API devolvio un JSON invalido");
  }

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

async function fetchOptionalJson(url, options = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();
  let data = null;

  if (contentType.includes("application/json") && raw) {
    try {
      data = JSON.parse(raw);
    } catch (_error) {
      data = null;
    }
  }

  return { ok: res.ok, status: res.status, data };
}

function renderAccounts() {
  if (!el.accountSelect) return;

  const accounts = state.accounts || [];
  el.accountSelect.innerHTML = accounts
    .map(
      (account) =>
        `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`
    )
    .join("");

  if (state.activeAccountId) {
    el.accountSelect.value = state.activeAccountId;
  }

  const activeAccount =
    accounts.find((account) => String(account.id) === String(state.activeAccountId)) ||
    accounts[0] ||
    null;

  if (el.accountPlanBadge) {
    el.accountPlanBadge.textContent = `${activeAccount?.plan || "Internal"} · ${getProductModeLabel(
      state.appConfig?.product?.mode || activeAccount?.product_mode || "full_crm"
    )}`;
  }

  if (el.accountSelect) {
    el.accountSelect.disabled = state.currentUser?.role !== "super_admin";
  }
}

function renderAdminOverview() {
  if (!el.adminOverviewGrid) return;

  const accounts = state.adminOverview || [];
  if (!accounts.length) {
    el.adminOverviewGrid.innerHTML = '<div class="empty">Todavia no hay cuentas registradas.</div>';
    return;
  }

  el.adminOverviewGrid.innerHTML = accounts
    .map((account) => {
      const isActive = String(account.id) === String(state.activeAccountId);
      const logoUrl = normalizeAssetUrl(account.brand_logo_url);
      const productMode = String(account.product_mode || "full_crm");
      const isChatOnlyAccount = productMode === "chat_only";
      const setupHealth = account.setup_health || {};
      const setupChecks = Array.isArray(setupHealth.checks) ? setupHealth.checks : [];
      const setupTone =
        setupHealth.status === "ready"
          ? "ok"
          : setupHealth.status === "in_progress"
            ? "progress"
            : "pending";
      return `
        <article class="admin-account-card ${isActive ? "is-active" : ""}">
          <div class="admin-account-head">
            <div class="admin-account-brand">
              <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(account.brand_name || account.name)}" />
              <div>
                <span>${escapeHtml(account.slug || account.id)}</span>
                <strong>${escapeHtml(account.brand_name || account.name)}</strong>
              </div>
            </div>
            <div class="admin-account-badges">
              <span class="pill">${escapeHtml(account.plan || "trial")}</span>
              <span class="pill">${escapeHtml(account.status || "active")}</span>
              <span class="pill">${escapeHtml(getProductModeLabel(productMode))}</span>
            </div>
          </div>
          <div class="admin-account-metrics">
            <div><span>Leads</span><strong>${Number(account?.totals?.leads || 0)}</strong></div>
            <div><span>Enviadas</span><strong>${Number(account?.totals?.quotes_sent || 0)}</strong></div>
            <div><span>Aceptadas</span><strong>${Number(account?.totals?.quotes_accepted || 0)}</strong></div>
          </div>
          <section class="admin-account-health" data-tone="${escapeHtml(setupTone)}">
            <div class="admin-account-health-head">
              <div>
                <span>Salud del setup</span>
                <strong>${escapeHtml(setupHealth.progress || "0/4")} listo</strong>
              </div>
              <span class="status-pill" data-tone="${escapeHtml(setupTone)}">${escapeHtml(
                setupHealth.status === "ready"
                  ? "Listo"
                  : setupHealth.status === "in_progress"
                    ? "En progreso"
                    : "Por empezar"
              )}</span>
            </div>
            <div class="admin-account-health-grid">
              ${setupChecks
                .map(
                  (check) => `
                    <div class="admin-account-health-item ${check.ready ? "is-ready" : ""}">
                      <strong>${escapeHtml(check.label || "")}</strong>
                      <span>${escapeHtml(check.hint || "")}</span>
                    </div>
                  `
                )
                .join("")}
            </div>
            <p class="admin-account-health-next">
              <span>Siguiente paso</span>
              <strong>${escapeHtml(setupHealth.next_step || "Revisar cuenta")}</strong>
            </p>
          </section>
          <div class="admin-account-edit-grid">
            <label>
              Nombre
              <input type="text" data-account-field="name" data-account-id="${escapeHtml(account.id)}" value="${escapeHtml(account.name || "")}" />
            </label>
            <label>
              Slug
              <input type="text" data-account-field="slug" data-account-id="${escapeHtml(account.id)}" value="${escapeHtml(account.slug || "")}" />
            </label>
            <label>
              Plan
              <select data-account-field="plan" data-account-id="${escapeHtml(account.id)}">
                ${["starter", "growth", "pro", "trial", "internal"]
                  .map(
                    (option) =>
                      `<option value="${option}" ${String(account.plan) === option ? "selected" : ""}>${option}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <label>
              Estado
              <select data-account-field="status" data-account-id="${escapeHtml(account.id)}">
                ${["trial", "active", "paused", "archived"]
                  .map(
                    (option) =>
                      `<option value="${option}" ${String(account.status) === option ? "selected" : ""}>${option}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <label>
              Producto
              <select data-account-field="product_mode" data-account-id="${escapeHtml(account.id)}">
                ${["full_crm", "chat_only"]
                  .map(
                    (option) =>
                      `<option value="${option}" ${productMode === option ? "selected" : ""}>${option === "chat_only" ? "solo chat" : "chat + crm"}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <label class="admin-checkbox">
              <input type="checkbox" data-account-field="is_default" data-account-id="${escapeHtml(account.id)}" ${
                account.is_default ? "checked" : ""
              } />
              <span>Cuenta por defecto</span>
            </label>
          </div>
          <div class="admin-account-footer">
            <small>Ultima actividad: ${fmtShortDate(account.last_activity_at)}</small>
            <div class="admin-account-actions">
              ${
                account.is_default
                  ? ""
                  : `<button type="button" class="crm-danger-btn" data-delete-account="${escapeHtml(account.id)}">Eliminar</button>`
              }
              <button type="button" class="crm-secondary-btn" data-save-account="${escapeHtml(account.id)}">Guardar cuenta</button>
              <button type="button" class="crm-secondary-btn" data-open-account="${escapeHtml(account.id)}" data-open-view="config">Configurar</button>
              <button type="button" class="crm-primary-inline-btn" data-open-account="${escapeHtml(account.id)}" data-open-view="${isChatOnlyAccount ? "config" : "sales"}">${isChatOnlyAccount ? "Abrir setup" : "Abrir CRM"}</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  el.adminOverviewGrid.querySelectorAll("[data-open-account]").forEach((button) => {
    button.addEventListener("click", async () => {
      const accountId = button.getAttribute("data-open-account");
      const view = button.getAttribute("data-open-view") || "sales";
      await handleAccountChange(accountId);
      setMainView(view);
    });
  });

  el.adminOverviewGrid.querySelectorAll("[data-save-account]").forEach((button) => {
    button.addEventListener("click", async () => {
      const accountId = button.getAttribute("data-save-account");
      const fields = [
        ...el.adminOverviewGrid.querySelectorAll(`[data-account-id="${accountId}"]`),
      ];
      const payload = {};
      let productMode = "";
      for (const field of fields) {
        const key = field.getAttribute("data-account-field");
        if (!key) continue;
        if (key === "product_mode") {
          productMode = field.value;
          continue;
        }
        payload[key] =
          field.type === "checkbox" ? field.checked : field.value;
      }

      button.disabled = true;
      button.classList.add("is-busy");
      setStatus(el.adminAccountStatus, "Guardando cuenta...");
      try {
        await fetchJson(`${window.location.origin}/api/admin/accounts/${accountId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (productMode) {
          await fetchJson(`${API_BASE}/config?account_id=${encodeURIComponent(accountId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product: {
                mode: productMode,
              },
            }),
          });
        }
        await Promise.all([loadAccounts(), loadAdminOverview(), loadConfig(), loadLeads()]);
        setStatus(el.adminAccountStatus, "Cuenta actualizada.", "ok");
      } catch (error) {
        setStatus(el.adminAccountStatus, `No se pudo guardar: ${error.message}`, "error");
      } finally {
        button.disabled = false;
        button.classList.remove("is-busy");
      }
    });
  });

  el.adminOverviewGrid.querySelectorAll("[data-delete-account]").forEach((button) => {
    button.addEventListener("click", async () => {
      const accountId = button.getAttribute("data-delete-account");
      if (!accountId) return;
      if (!window.confirm("¿Seguro que quieres eliminar esta cuenta y sus datos asociados?")) {
        return;
      }

      button.disabled = true;
      button.classList.add("is-busy");
      setStatus(el.adminAccountStatus, "Eliminando cuenta...");
      try {
        await fetchJson(`${window.location.origin}/api/admin/accounts/${accountId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: state.activeAccountId || "" }),
        });
        await Promise.all([loadAccounts(), loadAdminOverview(), loadConfig(), loadLeads()]);
        setStatus(el.adminAccountStatus, "Cuenta eliminada.", "ok");
      } catch (error) {
        setStatus(el.adminAccountStatus, `No se pudo eliminar: ${error.message}`, "error");
      } finally {
        button.disabled = false;
        button.classList.remove("is-busy");
      }
    });
  });
}

async function loadAccounts() {
  const requestedAccountId = getRequestedAccountId();
  const params = new URLSearchParams();
  if (requestedAccountId) {
    params.set("account_id", requestedAccountId);
  }

  const data = await fetchJson(
    `${window.location.origin}/api/crm/accounts${params.toString() ? `?${params.toString()}` : ""}`
  );

  state.accounts = data.accounts || [];
  state.activeAccountId =
    data.active_account?.id || state.accounts[0]?.id || requestedAccountId || "default";

  setStoredAccountId(state.activeAccountId);

  const url = new URL(window.location.href);
  url.searchParams.set("account_id", state.activeAccountId);
  window.history.replaceState({}, "", url);

  renderAccounts();
}

async function loadAdminOverview() {
  if (state.currentUser?.role !== "super_admin") {
    state.adminOverview = [];
    renderAdminOverview();
    return;
  }

  const data = await fetchJson(`${window.location.origin}/api/admin/overview`);
  state.adminOverview = data.accounts || [];
  renderAdminOverview();
}

async function checkBootstrapStatus() {
  const result = await fetchOptionalJson(`${window.location.origin}/api/auth/bootstrap-status`);
  return Boolean(result?.data?.needs_bootstrap);
}

async function hydrateCurrentUser() {
  const result = await fetchOptionalJson(`${window.location.origin}/api/auth/me`);
  if (!result.ok || !result.data?.user) {
    state.currentUser = null;
    return null;
  }

  state.currentUser = result.data.user;
  if (state.currentUser?.account?.id && state.currentUser.role !== "super_admin") {
    state.activeAccountId = state.currentUser.account.id;
    setStoredAccountId(state.activeAccountId);
  }
  return state.currentUser;
}

async function loginCrm(event) {
  event.preventDefault();
  el.crmLoginBtn.disabled = true;
  setStatus(el.crmAuthStatus, "Entrando...");

  try {
    const result = await fetchJson(`${window.location.origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: el.crmLoginEmail.value,
        password: el.crmLoginPassword.value,
      }),
    });

    state.currentUser = result.user || null;
    setAuthenticatedUi(true);
    await bootstrapCrm();
    setMainView(getDefaultViewForRole());
    setStatus(el.crmAuthStatus, "");
  } catch (error) {
    setStatus(el.crmAuthStatus, `No se pudo entrar: ${error.message}`, "error");
  } finally {
    el.crmLoginBtn.disabled = false;
  }
}

async function bootstrapAdmin(event) {
  event.preventDefault();
  el.crmBootstrapBtn.disabled = true;
  setStatus(el.crmAuthStatus, "Creando super admin...");

  try {
    const result = await fetchJson(`${window.location.origin}/api/auth/bootstrap-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: el.crmBootstrapName.value,
        email: el.crmBootstrapEmail.value,
        password: el.crmBootstrapPassword.value,
      }),
    });

    state.currentUser = result.user || null;
    setAuthenticatedUi(true);
    await bootstrapCrm();
    setMainView("admin");
    setStatus(el.crmAuthStatus, "");
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("ya existe")) {
      setAuthMode("login");
      setStatus(
        el.crmAuthStatus,
        "Ya existe un super admin. Entra con tus credenciales en la pantalla de login.",
        "error"
      );
      el.crmLoginEmail.value = el.crmBootstrapEmail.value || "";
      return;
    }
    setStatus(el.crmAuthStatus, `No se pudo crear el admin: ${error.message}`, "error");
  } finally {
    el.crmBootstrapBtn.disabled = false;
  }
}

async function createAdminAccount() {
  const payload = {
    name: el.adminCreateName.value,
    slug: el.adminCreateSlug.value,
    plan: el.adminCreatePlan.value,
    status: el.adminCreateStatus.value,
    product_mode: el.adminCreateProductMode.value,
    is_default: el.adminCreateDefault.checked,
    admin_email: el.adminCreateAdminEmail.value,
    admin_password: el.adminCreateAdminPassword.value,
    admin_display_name: el.adminCreateAdminDisplayName.value,
  };

  el.adminCreateAccountBtn.disabled = true;
  el.adminCreateAccountBtn.classList.add("is-busy");
  setStatus(el.adminAccountStatus, "Creando cuenta...");

  try {
    const data = await fetchJson(`${window.location.origin}/api/admin/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (data?.account?.id && payload.product_mode === "chat_only") {
      await fetchJson(`${API_BASE}/config?account_id=${encodeURIComponent(data.account.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: {
            mode: "chat_only",
          },
        }),
      });
    }

    el.adminCreateName.value = "";
    el.adminCreateSlug.value = "";
    el.adminCreatePlan.value = "starter";
    el.adminCreateStatus.value = "trial";
    el.adminCreateProductMode.value = "full_crm";
    el.adminCreateDefault.checked = false;
    el.adminCreateAdminEmail.value = "";
    el.adminCreateAdminPassword.value = "";
    el.adminCreateAdminDisplayName.value = "";

    await Promise.all([loadAccounts(), loadAdminOverview()]);
    if (data?.account?.id) {
      await handleAccountChange(data.account.id);
      setMainView("config");
    }
    setStatus(el.adminAccountStatus, "Cuenta creada correctamente.", "ok");
  } catch (error) {
    setStatus(el.adminAccountStatus, `No se pudo crear: ${error.message}`, "error");
  } finally {
    el.adminCreateAccountBtn.disabled = false;
    el.adminCreateAccountBtn.classList.remove("is-busy");
  }
}

async function handleAccountChange(nextAccountId) {
  state.activeAccountId = String(nextAccountId || "").trim();
  setStoredAccountId(state.activeAccountId);

  const url = new URL(window.location.href);
  if (state.activeAccountId) {
    url.searchParams.set("account_id", state.activeAccountId);
  } else {
    url.searchParams.delete("account_id");
  }
  window.history.replaceState({}, "", url);

  renderAccounts();
  await Promise.all([loadLeads(), loadConfig(), loadAdminOverview()]);
}

async function logoutCrm() {
  try {
    await fetchJson(`${window.location.origin}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch (_error) {
    // noop
  }

  state.currentUser = null;
  state.accounts = [];
  state.activeAccountId = null;
  state.adminOverview = [];
  state.leads = [];
  state.filteredLeads = [];
  state.selectedLead = null;
  state.selectedQuote = null;
  state.analytics = null;
  state.appConfig = null;
  setStoredAccountId("");
  setAuthenticatedUi(false);
  const needsBootstrap = await checkBootstrapStatus();
  setAuthMode(needsBootstrap ? "bootstrap" : "login");
}

function looksGenericName(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  if (/\d{6,}/.test(text)) return true;

  const normalized = text.toLowerCase();
  return [
    "hola",
    "buenas",
    "buenas tardes",
    "buenos dias",
    "buenos días",
    "lead sin nombre",
  ].includes(normalized) || text.length > 30;
}

function getLeadDisplayName(lead) {
  if (lead?.name && !looksGenericName(lead.name)) return lead.name;
  if (lead?.phone) return lead.phone;
  if (lead?.email) return lead.email;
  return "Lead sin nombre";
}

function createServiceEditorItem(name = "", facts = {}) {
  const item = document.createElement("article");
  item.className = "service-item";
  item.innerHTML = `
    <div class="service-item-head">
      <div class="service-item-head-copy">
        <span>Servicio</span>
        <strong>${escapeHtml(name || "Bloque de servicio")}</strong>
        <p>Define nombre, URL, tarifas de referencia y el enfoque comercial que debe respetar el agente.</p>
      </div>
      <button type="button" class="service-remove-btn">Quitar</button>
    </div>
    <div class="service-item-grid">
      <label class="service-item-field">
        Nombre
        <input type="text" data-field="name" value="${escapeHtml(name)}" />
      </label>
      <label class="service-item-field">
        URL
        <input type="url" data-field="url" value="${escapeHtml(facts?.url || "")}" />
      </label>
      <label class="service-item-field">
        Tarifa mensual orientativa
        <input type="text" data-field="min_monthly_fee" value="${escapeHtml(facts?.min_monthly_fee || "")}" />
      </label>
      <label class="service-item-field">
        Tarifa de proyecto orientativa
        <input type="text" data-field="min_project_fee" value="${escapeHtml(facts?.min_project_fee || "")}" />
      </label>
      <label class="service-item-field quote-grid-full">
        Descripcion
        <textarea rows="4" data-field="description">${escapeHtml(facts?.description || "")}</textarea>
      </label>
      <label class="service-item-field quote-grid-full">
        Notas comerciales
        <textarea rows="4" data-field="notes">${escapeHtml(facts?.notes || "")}</textarea>
      </label>
    </div>
  `;

  item
    .querySelector(".service-remove-btn")
    .addEventListener("click", () => item.remove());

  return item;
}

function renderServiceEditor(services = {}) {
  el.configServicesList.innerHTML = "";
  const entries = Object.entries(services || {});

  if (!entries.length) {
    el.configServicesList.appendChild(createServiceEditorItem());
    return;
  }

  for (const [name, facts] of entries) {
    el.configServicesList.appendChild(createServiceEditorItem(name, facts));
  }
}

function collectServiceConfig() {
  const items = [...el.configServicesList.querySelectorAll(".service-item")];
  const services = {};

  for (const item of items) {
    const getValue = (field) =>
      String(item.querySelector(`[data-field="${field}"]`)?.value || "").trim();

    const name = getValue("name");
    if (!name) continue;

    services[name] = {
      url: getValue("url"),
      min_monthly_fee: getValue("min_monthly_fee"),
      min_project_fee: getValue("min_project_fee"),
      description: getValue("description"),
      notes: getValue("notes"),
    };
  }

  return services;
}

function parseMultilineUrls(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitSpreadsheetLine(raw = "") {
  const text = String(raw || "");
  const delimiter = text.includes("\t")
    ? "\t"
    : text.includes(";")
      ? ";"
      : ",";
  return text.split(delimiter).map((cell) => String(cell || "").trim());
}

function normalizeSpreadsheetHeading(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSpreadsheetValue(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePriceValue(value = "") {
  const raw = normalizeSpreadsheetValue(value);
  if (!raw) return "";

  const compact = raw
    .replace(/\b(eur|euros?)\b/gi, "EUR")
    .replace(/\s*\/\s*mes\b/gi, " / mes")
    .replace(/\s*\/\s*month\b/gi, " / month")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (/(\€|eur|iva)/i.test(compact)) return compact;
  if (/^\d+(?:[.,]\d+)?$/.test(compact)) return `${compact} EUR + IVA`;
  return compact;
}

function parseSpreadsheetMappingHints(raw = "") {
  const text = String(raw || "").trim();
  const mapping = {
    name: [],
    url: [],
    monthly: [],
    project: [],
    description: [],
    notes: [],
  };
  if (!text) return mapping;

  const aliasMap = {
    servicio: "name",
    service: "name",
    nombre: "name",
    producto: "name",
    solucion: "name",
    url: "url",
    pagina: "url",
    página: "url",
    landing: "url",
    enlace: "url",
    mensual: "monthly",
    "precio mensual": "monthly",
    "tarifa mensual": "monthly",
    proyecto: "project",
    setup: "project",
    alta: "project",
    "precio proyecto": "project",
    descripcion: "description",
    descripción: "description",
    detalle: "description",
    resumen: "description",
    notas: "notes",
    observaciones: "notes",
    condiciones: "notes",
    comentarios: "notes",
  };

  text
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const parts = entry.split(/[:=]/).map((item) => item.trim()).filter(Boolean);
      if (parts.length < 2) return;
      const left = normalizeSpreadsheetHeading(parts[0]);
      const right = normalizeSpreadsheetHeading(parts.slice(1).join(" "));
      const targetKey = aliasMap[left];
      if (!targetKey || !right) return;
      if (!mapping[targetKey].includes(right)) {
        mapping[targetKey].push(right);
      }
    });

  return mapping;
}

function parseSpreadsheetRows(raw = "") {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitSpreadsheetLine(lines[0]).map((header) =>
    normalizeSpreadsheetHeading(header)
  );

  return lines.slice(1).map((line) => {
    const cells = splitSpreadsheetLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = normalizeSpreadsheetValue(cells[index] || "");
    });
    return row;
  });
}

function getSpreadsheetCell(row = {}, candidates = []) {
  const normalizedCandidates = candidates.map((candidate) => normalizeSpreadsheetHeading(candidate));
  for (const candidate of normalizedCandidates) {
    if (row[candidate]) return row[candidate];
    const fuzzy = Object.keys(row).find((key) => key === candidate || key.includes(candidate) || candidate.includes(key));
    if (fuzzy && row[fuzzy]) return row[fuzzy];
  }
  return "";
}

function parseServicesFromSpreadsheet(raw = "") {
  const rows = parseSpreadsheetRows(raw);
  const services = {};

  for (const row of rows) {
    const name = getSpreadsheetCell(row, ["servicio", "service", "nombre", "producto"]);
    if (!name) continue;

    services[name] = {
      url: getSpreadsheetCell(row, ["url", "landing", "pagina", "página"]),
      min_monthly_fee: getSpreadsheetCell(row, [
        "precio mensual",
        "tarifa mensual",
        "mensual",
        "monthly fee",
        "monthly",
      ]),
      min_project_fee: getSpreadsheetCell(row, [
        "precio proyecto",
        "tarifa proyecto",
        "proyecto",
        "project fee",
        "project",
      ]),
      description: getSpreadsheetCell(row, [
        "descripcion",
        "descripción",
        "description",
        "detalle",
      ]),
      notes: getSpreadsheetCell(row, [
        "notas",
        "notes",
        "observaciones",
        "condiciones",
      ]),
    };
  }

  return services;
}

function parseServicesFromSpreadsheetEnhanced(raw = "", mappingHints = {}) {
  const rows = parseSpreadsheetRows(raw);
  const services = {};

  for (const row of rows) {
    const name = getSpreadsheetCell(row, [
      "servicio",
      "service",
      "nombre",
      "producto",
      "solucion",
      "solución",
      "categoria",
      "categoría",
      "pack",
      ...(mappingHints?.name || []),
    ]);
    if (!name) continue;

    services[name] = {
      url: getSpreadsheetCell(row, ["url", "landing", "pagina", "página", "page", "enlace", "link", ...(mappingHints?.url || [])]),
      min_monthly_fee: normalizePriceValue(
        getSpreadsheetCell(row, [
          "precio mensual",
          "tarifa mensual",
          "mensual",
          "monthly fee",
          "monthly",
          "retainer",
          "fee mensual",
          "cuota mensual",
          "desde mes",
          ...(mappingHints?.monthly || []),
        ])
      ),
      min_project_fee: normalizePriceValue(
        getSpreadsheetCell(row, [
          "precio proyecto",
          "tarifa proyecto",
          "proyecto",
          "project fee",
          "project",
          "setup",
          "alta",
          "precio inicial",
          "one off",
          ...(mappingHints?.project || []),
        ])
      ),
      description: getSpreadsheetCell(row, [
        "descripcion",
        "descripción",
        "description",
        "detalle",
        "resumen",
        "summary",
        ...(mappingHints?.description || []),
      ]),
      notes: getSpreadsheetCell(row, [
        "notas",
        "notes",
        "observaciones",
        "condiciones",
        "comentarios",
        "comentario",
        ...(mappingHints?.notes || []),
      ]),
    };
  }

  return services;
}

function updateKnowledgeUiHints() {
  const websiteCount = parseMultilineUrls(el.configKnowledgeWebsiteUrls?.value || "").length;
  if (el.configKnowledgeWebsiteCount) {
    el.configKnowledgeWebsiteCount.textContent = `${websiteCount} URL${websiteCount === 1 ? "" : "s"}`;
  }

  if (el.configKnowledgeSpreadsheetHint) {
    const dataValue = String(el.configKnowledgeSpreadsheetData?.value || "").trim();
    const rowCount = dataValue ? dataValue.split(/\r?\n/).filter(Boolean).length : 0;
    const hasSheetUrl = String(el.configKnowledgeSpreadsheetUrl?.value || "").trim();
    if (rowCount > 0) {
      el.configKnowledgeSpreadsheetHint.textContent = `${rowCount} fila${rowCount === 1 ? "" : "s"} cargada${rowCount === 1 ? "" : "s"}`;
    } else if (hasSheetUrl) {
      el.configKnowledgeSpreadsheetHint.textContent = "Hoja enlazada";
      } else {
        el.configKnowledgeSpreadsheetHint.textContent = "Sin tabla cargada";
      }
    }

  updateKnowledgeOnboardingState();
}

function updateKnowledgeOnboardingState() {
  const { stepStates, totalComplete, nextStep } = getKnowledgeOnboardingSnapshot();
  if (el.configKnowledgeProgressLabel) {
    el.configKnowledgeProgressLabel.textContent =
      totalComplete === 4 ? "Setup listo para revisar" : `${totalComplete} de 4 pasos completados`;
  }

  if (el.configKnowledgeNextHint) {
    const hintTitle = el.configKnowledgeNextHint.querySelector("strong");
    const hintBody = el.configKnowledgeNextHint.querySelector("p");
    const presetLabel = SECTOR_PRESETS[state.suggestedSectorPresetKey]?.label || "tu sector";
    if (hintTitle) {
      hintTitle.textContent = nextStep.label;
    }
    if (hintBody) {
      hintBody.textContent =
        totalComplete === 4
          ? "Ya tienes el setup cubierto. El siguiente paso util es revisar la vista previa del contexto y guardar."
          : nextStep.key === "preset"
            ? "Empieza por el preset que mejor encaje con este negocio para acelerar el resto del setup."
            : nextStep.key === "services"
              ? `Ya tienes una base sugerida para ${presetLabel}. Ahora toca dejar clara la oferta base que si o si quieres controlar.`
              : nextStep.key === "sources"
                ? "Anade URLs, tabla comercial o notas internas para enriquecer el agente sin perder control."
                : "Genera la vista previa final para comprobar exactamente que contexto usara la IA antes de guardar.";
    }
  }

  const stepButtons = [
    { key: "preset", button: el.configKnowledgeStepPresetBtn },
    { key: "services", button: el.configKnowledgeStepServicesBtn },
    { key: "sources", button: el.configKnowledgeStepSourcesBtn },
    { key: "review", button: el.configKnowledgeStepReviewBtn },
  ];

  stepButtons.forEach(({ key, button }) => {
    if (!button) return;
    button.classList.toggle("is-complete", stepStates[key]);
    const badge = button.querySelector(`[data-step-state="${key}"]`);
    if (badge) {
      badge.textContent = stepStates[key] ? "Listo" : "Por hacer";
    }
  });

  if (!document.querySelector(".knowledge-step-card.is-active") && nextStep?.targetId) {
    document
      .querySelectorAll(".knowledge-step-card")
      .forEach((card) => card.classList.toggle("is-active", card.getAttribute("data-target") === nextStep.targetId));
  }
}

function getKnowledgeStepMeta(stepKey) {
  const stepMeta = {
    preset: {
      key: "preset",
      label: "Elegir sector",
      shortLabel: "sector",
      targetId: "configKnowledgeStepPreset",
    },
    services: {
      key: "services",
      label: "Definir oferta",
      shortLabel: "oferta base",
      targetId: "configKnowledgeStepServices",
    },
    sources: {
      key: "sources",
      label: "Anadir contexto",
      shortLabel: "contexto extra",
      targetId: "configKnowledgeStepSources",
    },
    review: {
      key: "review",
      label: "Revisar y publicar",
      shortLabel: "revision final",
      targetId: "configKnowledgeStepReview",
    },
  };

  return stepMeta[stepKey] || stepMeta.review;
}

function getKnowledgeOnboardingSnapshot() {
  const servicesCount = Object.keys(collectServiceConfig()).length;
  const websiteCount = parseMultilineUrls(el.configKnowledgeWebsiteUrls?.value || "").length;
  const hasSpreadsheetData = Boolean(String(el.configKnowledgeSpreadsheetData?.value || "").trim());
  const hasSpreadsheetUrl = Boolean(String(el.configKnowledgeSpreadsheetUrl?.value || "").trim());
  const hasInternalNotes = Boolean(String(el.configKnowledgeInternalNotes?.value || "").trim());
  const hasReview = Boolean(String(el.configContextPreviewOutput?.value || "").trim());

  const stepStates = {
    preset: Boolean(state.suggestedSectorPresetKey),
    services: servicesCount > 0,
    sources: websiteCount > 0 || hasSpreadsheetData || hasSpreadsheetUrl || hasInternalNotes,
    review: hasReview,
  };

  const totalComplete = Object.values(stepStates).filter(Boolean).length;
  const nextStepKey = !stepStates.preset
    ? "preset"
    : !stepStates.services
      ? "services"
      : !stepStates.sources
        ? "sources"
        : "review";

  return {
    stepStates,
    totalComplete,
    nextStep: getKnowledgeStepMeta(nextStepKey),
  };
}

function scrollToKnowledgeTarget(targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;

  target.scrollIntoView({ behavior: "smooth", block: "start" });
  document
    .querySelectorAll(".knowledge-step-card")
    .forEach((card) => card.classList.toggle("is-active", card.getAttribute("data-target") === targetId));
}

function highlightSuggestedKnowledgeFlow() {
  const payload = buildConfigPayload();
  const presetKey = inferSectorPresetKey(payload);
  const preset = SECTOR_PRESETS[presetKey];
  state.suggestedSectorPresetKey = presetKey;
  renderSectorPresets();

    if (el.configSectorPresetStatus) {
      setStatus(
        el.configSectorPresetStatus,
      `Te recomiendo empezar por ${preset?.label || "este preset"}. Revísalo y luego termina de aterrizar la oferta base.`,
        "ok"
      );
    }
}

function focusNextKnowledgeStep() {
  const { nextStep } = getKnowledgeOnboardingSnapshot();
  scrollToKnowledgeTarget(nextStep.targetId);
  return nextStep;
}

function renderKnowledgeSources(knowledgeSources = {}) {
  el.configKnowledgeWebsiteUrls.value = (knowledgeSources?.website_urls || []).join("\n");
  el.configKnowledgeWebsiteFocus.value = knowledgeSources?.website_focus || "";
  el.configKnowledgeSpreadsheetUrl.value = knowledgeSources?.spreadsheet_url || "";
  el.configKnowledgeSpreadsheetData.value = knowledgeSources?.spreadsheet_data || "";
  el.configKnowledgeSpreadsheetMapping.value = knowledgeSources?.spreadsheet_mapping || "";
  el.configKnowledgeInternalNotes.value = knowledgeSources?.internal_notes || "";
  if (el.configKnowledgeSpreadsheetFile) {
    el.configKnowledgeSpreadsheetFile.value = "";
  }
  updateKnowledgeUiHints();
}

function collectKnowledgeSources() {
  return {
    website_urls: parseMultilineUrls(el.configKnowledgeWebsiteUrls?.value || ""),
    website_focus: String(el.configKnowledgeWebsiteFocus?.value || "").trim(),
    spreadsheet_url: String(el.configKnowledgeSpreadsheetUrl?.value || "").trim(),
    spreadsheet_data: String(el.configKnowledgeSpreadsheetData?.value || "").trim(),
    spreadsheet_mapping: String(el.configKnowledgeSpreadsheetMapping?.value || "").trim(),
    internal_notes: String(el.configKnowledgeInternalNotes?.value || "").trim(),
  };
}

function buildPresetFeatureList(preset = {}) {
  const serviceNames = Object.keys(preset.services || {});
  return [
    preset.kicker || "",
    ...serviceNames.slice(0, 3),
  ].filter(Boolean);
}

function renderSectorPresets() {
  if (!el.configSectorPresetList) return;

  el.configSectorPresetList.innerHTML = Object.entries(SECTOR_PRESETS)
    .map(([key, preset]) => {
      const featureList = buildPresetFeatureList(preset)
        .map((item) => `<span class="sector-preset-chip">${escapeHtml(item)}</span>`)
        .join("");

      return `
        <article class="sector-preset-card ${state.suggestedSectorPresetKey === key ? "is-suggested" : ""}">
          <div class="sector-preset-head">
            <div>
              <span>${escapeHtml(preset.label || "")}</span>
              <strong>${escapeHtml(preset.summary || "")}</strong>
            </div>
            <em>${Object.keys(preset.services || {}).length} servicios</em>
          </div>
          ${
            state.suggestedSectorPresetKey === key
              ? '<div class="sector-preset-recommendation">Recomendado segun tu contexto actual</div>'
              : ""
          }
          <div class="sector-preset-chips">${featureList}</div>
          <button type="button" class="crm-secondary-btn" data-sector-preset="${escapeHtml(key)}">
            Aplicar preset
          </button>
        </article>
      `;
    })
    .join("");

  el.configSectorPresetList.querySelectorAll("[data-sector-preset]").forEach((button) => {
    button.addEventListener("click", () => applySectorPreset(button.getAttribute("data-sector-preset")));
  });
}

function mergePresetServices(currentServices = {}, presetServices = {}) {
  const merged = { ...(presetServices || {}) };
  for (const [name, facts] of Object.entries(currentServices || {})) {
    merged[name] = {
      ...(merged[name] || {}),
      ...(facts || {}),
    };
  }
  return merged;
}

function mergePresetText(currentValue = "", presetValue = "", { append = false } = {}) {
  const current = String(currentValue || "").trim();
  const preset = String(presetValue || "").trim();
  if (!preset) return current;
  if (!current) return preset;
  if (current.toLowerCase().includes(preset.toLowerCase())) return current;
  return append ? `${current}\n\n${preset}` : preset;
}

function applySectorPreset(presetKey) {
  const preset = SECTOR_PRESETS[presetKey];
  if (!preset) return;

  const payload = buildConfigPayload();
  const nextConfig = {
    ...(state.appConfig || {}),
    ...payload,
    services: mergePresetServices(payload.services, preset.services || {}),
    agent: {
      ...(state.appConfig?.agent || {}),
      ...payload.agent,
      tone: mergePresetText(payload.agent?.tone, preset.tone),
      prompt_additions: mergePresetText(payload.agent?.prompt_additions, preset.prompt_additions, {
        append: true,
      }),
    },
    knowledge_sources: {
      ...(state.appConfig?.knowledge_sources || {}),
      ...(payload.knowledge_sources || {}),
      website_focus: mergePresetText(payload.knowledge_sources?.website_focus, preset.website_focus),
      internal_notes: mergePresetText(payload.knowledge_sources?.internal_notes, preset.internal_notes, {
        append: true,
      }),
    },
  };

  const suggestedTemplates = buildSuggestedTemplates(
    nextConfig,
    state.appConfig?.message_templates || {}
  );

  nextConfig.message_templates = {
    ...(state.appConfig?.message_templates || {}),
    ...Object.fromEntries(
      Object.entries(suggestedTemplates).filter(([key]) => !key.startsWith("_"))
    ),
  };

  nextConfig.automation_flows = buildSuggestedAutomations(
    nextConfig,
    state.appConfig?.automation_flows || {},
    suggestedTemplates
  );

  state.appConfig = nextConfig;
  state.suggestedSectorPresetKey = presetKey;
      renderConfig();
      state.suggestedSectorPresetKey = inferSectorPresetKey(buildConfigPayload());
      renderSectorPresets();
  setStatus(
    el.configSectorPresetStatus,
    `Preset ${preset.label} aplicado. Ya puedes retocar servicios, mensajes y automatizaciones antes de guardar.`,
    "ok"
  );
}

function inferSectorPresetKey(payload = {}) {
  const text = [
    payload?.brand?.name,
    payload?.brand?.website_url,
    payload?.knowledge_sources?.website_focus,
    payload?.knowledge_sources?.internal_notes,
    ...Object.keys(payload?.services || {}),
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();

  if (/(clinica estetica|medicina estetica|estetica avanzada|botox|hialuronico|depilacion laser|laser diodo|acido hialuronico|tratamiento facial|tratamiento corporal)/i.test(text)) {
    return "esthetic_clinic";
  }
  if (/(dental|ortodoncia|implante|invisalign|clinica dental)/i.test(text)) {
    return "dental";
  }
  if (/(software|saas|crm|erp|plataforma b2b|demo|trial|herramienta digital|integraciones|onboarding)/i.test(text)) {
    return "saas";
  }
  if (/(shopify|woocommerce|prestashop|ecommerce|tienda online|catalogo|producto|checkout)/i.test(text)) {
    return "ecommerce";
  }
  if (/(hotel|apartamento turistico|apartamentos turisticos|alojamiento|booking|reserva directa|turismo rural|casa rural|hostal|resort)/i.test(text)) {
    return "hotel_tourism";
  }
  if (/(clinica|clinic|paciente|tratamiento|dental|medic|salud|estetica)/i.test(text)) {
    return "clinic";
  }
  if (/(inmobiliaria|inmueble|propiedad|propietario|promotora|piso|casa|alquiler|venta de vivienda)/i.test(text)) {
    return "real_estate";
  }
  if (/(academia|curso|formacion|máster|master|matricula|alumno|estudiante|escuela)/i.test(text)) {
    return "academy";
  }
  if (/(restaurante|carta|reserva|hosteleria|menu|menú|delivery|terraza|comida)/i.test(text)) {
    return "restaurant";
  }
  if (/(abogado|legal|despacho|asesoria|fiscal|juridic|bufete)/i.test(text)) {
    return "legal";
  }
  if (/(agencia|marketing|captacion b2b|leads b2b|consultoria|consultoría|estudio)/i.test(text)) {
    return "agency";
  }

  const serviceNames = Object.keys(payload?.services || {}).map((item) => item.toLowerCase());
  if (serviceNames.some((item) => item.includes("saas") || item.includes("software") || item.includes("demo"))) {
    return "saas";
  }
  if (serviceNames.some((item) => item.includes("tienda") || item.includes("ecommerce"))) {
    return "ecommerce";
  }
  if (serviceNames.some((item) => item.includes("consultor"))) {
    return "agency";
  }
  if (serviceNames.some((item) => item.includes("diseño web") || item.includes("diseño"))) {
    return "ecommerce";
  }

  return "agency";
}

function suggestSectorPreset() {
  const payload = buildConfigPayload();
  const presetKey = inferSectorPresetKey(payload);
  const preset = SECTOR_PRESETS[presetKey];
  state.suggestedSectorPresetKey = presetKey;
  renderSectorPresets();
  setStatus(
    el.configSectorPresetStatus,
    `Te recomiendo empezar por ${preset?.label || "este preset"} y después afinar oferta, mensajes y automatizaciones.`,
    "ok"
  );
  scrollToKnowledgeTarget("configKnowledgeStepServices");
}

function buildConfigPayload() {
  const services = collectServiceConfig();
  const knowledge_sources = collectKnowledgeSources();
  const message_templates = collectMessageTemplates();
  const automation_flows = collectAutomationFlows();
  const widgetAllowedDomains = String(el.configWidgetAllowedDomains?.value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    product: {
      mode: el.configProductMode?.value || "full_crm",
    },
    brand: {
      name: el.configBrandName.value,
      website_url: el.configWebsiteUrl.value,
      logo_url: el.configLogoUrl.value,
      primary_color: el.configPrimaryColor.value,
      accent_color: el.configAccentColor.value,
    },
    contact: {
      public_whatsapp_number: el.configPublicWhatsappNumber.value,
      human_agent_whatsapp_number: el.configHumanWhatsappNumber.value,
      support_email: el.configSupportEmail.value,
    },
      agent: {
        tone: el.configAgentTone.value,
        final_cta_label: el.configFinalCtaLabel.value,
        handoff_target_channel: el.configHandoffTargetChannel.value,
        prompt_additions: el.configPromptAdditions.value,
      },
      widget: {
        install_mode: el.configWidgetEmbedMode?.value || "slug",
        allowed_domains: widgetAllowedDomains,
      },
      knowledge_sources,
      integrations: {
      whatsapp: {
        provider: el.configWhatsappProvider.value,
        status_label: el.configWhatsappStatusLabel.value,
        phone_number_id: el.configWhatsappPhoneNumberId.value,
        business_account_id: el.configWhatsappBusinessAccountId.value,
        validation: state.appConfig?.integrations?.whatsapp?.validation || {},
      },
      lead_forms: {
        meta_source: el.configMetaLeadSource.value,
        google_source: el.configGoogleLeadSource.value,
        sheet_document: el.configLeadSheetDocument.value,
        sheet_tabs: el.configLeadSheetTabs.value,
        webhook_url: el.configLeadWebhookUrl.value,
        validation: state.appConfig?.integrations?.lead_forms?.validation || {},
      },
      email: {
        provider: el.configEmailProvider.value,
        from_email: el.configEmailFromAddress.value,
        reply_to_email: el.configEmailReplyTo.value,
        validation: state.appConfig?.integrations?.email?.validation || {},
      },
      automations: {
        platform: el.configAutomationPlatform.value,
        workspace_url: el.configAutomationWorkspaceUrl.value,
        notes: el.configAutomationNotes.value,
        validation: state.appConfig?.integrations?.automations?.validation || {},
      },
    },
    message_templates,
    automation_flows,
    services,
  };
}

async function importKnowledgeSpreadsheetFile(file) {
  const text = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el CSV."));
    reader.readAsText(file, "utf-8");
  });

  el.configKnowledgeSpreadsheetData.value = text.trim();
  updateKnowledgeUiHints();
  setStatus(
    el.configSaveStatus,
    `CSV cargado correctamente desde ${file.name}. Revisa el mapeo y guarda cuando te encaje.`,
    "ok"
  );
}

function mergeSuggestedServicesIntoEditor(nextServices = {}) {
  const current = collectServiceConfig();
  const merged = { ...nextServices };

  for (const [serviceName, facts] of Object.entries(current)) {
    merged[serviceName] = {
      ...(merged[serviceName] || {}),
      ...facts,
    };
  }

  renderServiceEditor(merged);
  return Object.keys(nextServices).length;
}

function suggestServicesFromSpreadsheet() {
  const raw = String(el.configKnowledgeSpreadsheetData?.value || "").trim();
  if (!raw) {
    setStatus(
      el.configSuggestServicesStatus,
      "Pega primero una tabla o sube un CSV para proponer servicios.",
      "error"
    );
    return;
  }

  const mappingHints = parseSpreadsheetMappingHints(el.configKnowledgeSpreadsheetMapping?.value || "");
  const suggested = parseServicesFromSpreadsheetEnhanced(raw, mappingHints);
  const count = mergeSuggestedServicesIntoEditor(suggested);

  if (!count) {
    setStatus(
      el.configSuggestServicesStatus,
      "No he detectado una columna clara de servicio. Revisa la primera fila o ajusta el contenido pegado.",
      "error"
    );
    return;
  }

  const nextPayload = buildConfigPayload();
  const presetKey = inferSectorPresetKey(nextPayload);
  const preset = SECTOR_PRESETS[presetKey];
  state.suggestedSectorPresetKey = presetKey;
  renderSectorPresets();

  setStatus(
    el.configSuggestServicesStatus,
    `${count} servicio${count === 1 ? "" : "s"} propuesto${count === 1 ? "" : "s"} desde la tabla. El siguiente paso más útil es revisar ${preset?.label || "el preset sugerido"} antes de guardar.`,
    "ok"
  );
  focusNextKnowledgeStep();
}

function getTemplateOptionsMarkup(selected = "") {
  const templates = state.appConfig?.message_templates || {};
  return MESSAGE_TEMPLATE_ORDER.map((key) => {
    const template = templates[key] || {};
    const label = template.label || key;
    return `<option value="${escapeHtml(key)}"${selected === key ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function createMessageTemplateCard(key, template = {}) {
  const card = document.createElement("article");
  card.className = "message-template-card";
  card.dataset.templateKey = key;

  const channel = template.channel || "email";
  const isEmail = channel === "email";
  const preview = String(template.body || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  card.innerHTML = `
    <div class="message-template-head">
      <div class="message-template-head-copy">
        <span>${escapeHtml(channel)}</span>
        <strong>${escapeHtml(template.label || key)}</strong>
        <p>${escapeHtml(preview || "Configura una plantilla breve, clara y orientada a conversion.")}</p>
      </div>
      <em>${escapeHtml(key)}</em>
    </div>
    <div class="message-template-fields">
      <label class="message-template-field">
        Etiqueta interna
        <input type="text" data-field="label" value="${escapeHtml(template.label || "")}" />
      </label>
      <label class="message-template-field">
        Canal
        <select data-field="channel">
          <option value="whatsapp"${channel === "whatsapp" ? " selected" : ""}>whatsapp</option>
          <option value="email"${isEmail ? " selected" : ""}>email</option>
        </select>
      </label>
      <label class="message-template-field quote-grid-full${isEmail ? "" : " is-hidden"}" data-role="subject">
        Asunto
        <input type="text" data-field="subject" value="${escapeHtml(template.subject || "")}" />
      </label>
      <label class="message-template-field quote-grid-full">
        Cuerpo del mensaje
        <textarea rows="5" data-field="body">${escapeHtml(template.body || "")}</textarea>
      </label>
    </div>
  `;

  const channelSelect = card.querySelector('[data-field="channel"]');
  const subjectRow = card.querySelector('[data-role="subject"]');
  channelSelect?.addEventListener("change", () => {
    subjectRow?.classList.toggle("is-hidden", channelSelect.value !== "email");
  });

  return card;
}

function renderMessageTemplates(templates = {}) {
  if (!el.configMessageTemplatesList) return;
  el.configMessageTemplatesList.innerHTML = "";

  for (const key of MESSAGE_TEMPLATE_ORDER) {
    el.configMessageTemplatesList.appendChild(
      createMessageTemplateCard(key, templates?.[key] || {})
    );
  }
}

function collectMessageTemplates() {
  const cards = [...(el.configMessageTemplatesList?.querySelectorAll(".message-template-card") || [])];
  const templates = {};

  for (const card of cards) {
    const key = card.dataset.templateKey;
    if (!key) continue;
    const getValue = (field) =>
      String(card.querySelector(`[data-field="${field}"]`)?.value || "").trim();

    templates[key] = {
      label: getValue("label"),
      channel: getValue("channel") || "email",
      subject: getValue("subject"),
      body: getValue("body"),
    };
  }

  return templates;
}

function createAutomationStepItem(step = {}) {
  const item = document.createElement("div");
  item.className = "automation-step-item";
  const delayValue = step.delay_value || "24";
  const delayUnit = step.delay_unit || "hours";
  const channel = step.channel || "whatsapp";
  const templateKey = step.template_key || "";
  const active = step.active !== false;

  item.innerHTML = `
    <div class="automation-step-head">
      <strong>Paso automatico</strong>
      <button type="button" class="service-remove-btn automation-step-remove">Quitar</button>
    </div>
    <div class="automation-step-grid">
      <label class="automation-step-field">
        Espera
        <input type="number" min="0" step="1" data-field="delay_value" value="${escapeHtml(delayValue)}" />
      </label>
      <label class="automation-step-field">
        Unidad
        <select data-field="delay_unit">
          <option value="minutes"${delayUnit === "minutes" ? " selected" : ""}>minutos</option>
          <option value="hours"${delayUnit === "hours" ? " selected" : ""}>horas</option>
          <option value="days"${delayUnit === "days" ? " selected" : ""}>dias</option>
        </select>
      </label>
      <label class="automation-step-field">
        Canal
        <select data-field="channel">
          <option value="whatsapp"${channel === "whatsapp" ? " selected" : ""}>whatsapp</option>
          <option value="email"${channel === "email" ? " selected" : ""}>email</option>
        </select>
      </label>
      <label class="automation-step-field">
        Plantilla
        <select data-field="template_key">${getTemplateOptionsMarkup(templateKey)}</select>
      </label>
      <label class="automation-step-field automation-step-toggle">
        <input type="checkbox" data-field="active"${active ? " checked" : ""} />
        <span>Paso activo</span>
      </label>
    </div>
  `;

  item
    .querySelector(".automation-step-remove")
    ?.addEventListener("click", () => item.remove());

  return item;
}

function createAutomationFlowCard(key, flow = {}) {
  const card = document.createElement("article");
  card.className = "automation-flow-card";
  card.dataset.flowKey = key;
  const steps = Array.isArray(flow.steps) && flow.steps.length ? flow.steps : [];

  card.innerHTML = `
    <div class="automation-flow-head">
      <div class="automation-flow-head-copy">
        <span>Flujo</span>
        <strong>${escapeHtml(flow.label || key)}</strong>
        <p>${escapeHtml(flow.description || "Secuencia automatica para mover la oportunidad sin depender de seguimiento manual.")}</p>
      </div>
      <div class="automation-flow-head-meta">
        <em>${steps.length} paso${steps.length === 1 ? "" : "s"}</em>
        <label class="automation-flow-toggle">
          <input type="checkbox" data-field="enabled"${flow.enabled !== false ? " checked" : ""} />
          <span>Activo</span>
        </label>
      </div>
    </div>
    <div class="automation-flow-fields">
      <label class="automation-flow-field">
        Nombre visible
        <input type="text" data-field="label" value="${escapeHtml(flow.label || "")}" />
      </label>
      <label class="automation-flow-field quote-grid-full">
        Descripcion
        <textarea rows="3" data-field="description">${escapeHtml(flow.description || "")}</textarea>
      </label>
    </div>
    <div class="automation-flow-steps-head">
      <strong>Pasos</strong>
      <button type="button" class="crm-secondary-btn automation-add-step-btn">Añadir paso</button>
    </div>
    <div class="automation-steps-list"></div>
  `;

  const stepsList = card.querySelector(".automation-steps-list");
  for (const step of steps) {
    stepsList?.appendChild(createAutomationStepItem(step));
  }

  card
    .querySelector(".automation-add-step-btn")
    ?.addEventListener("click", () => {
      stepsList?.appendChild(createAutomationStepItem());
    });

  return card;
}

function renderAutomationFlows(flows = {}) {
  if (!el.configAutomationFlowsList) return;
  el.configAutomationFlowsList.innerHTML = "";

  for (const key of AUTOMATION_FLOW_ORDER) {
    el.configAutomationFlowsList.appendChild(
      createAutomationFlowCard(key, flows?.[key] || {})
    );
  }
}

function collectAutomationFlows() {
  const cards = [...(el.configAutomationFlowsList?.querySelectorAll(".automation-flow-card") || [])];
  const flows = {};

  for (const card of cards) {
    const key = card.dataset.flowKey;
    if (!key) continue;

    const getValue = (field) =>
      String(card.querySelector(`[data-field="${field}"]`)?.value || "").trim();

    const steps = [...card.querySelectorAll(".automation-step-item")].map((item) => {
      const value = (field) =>
        String(item.querySelector(`[data-field="${field}"]`)?.value || "").trim();

      return {
        delay_value: value("delay_value"),
        delay_unit: value("delay_unit"),
        channel: value("channel"),
        template_key: value("template_key"),
        active: Boolean(item.querySelector('[data-field="active"]')?.checked),
      };
    }).filter((step) => step.template_key);

    flows[key] = {
      label: getValue("label"),
      description: getValue("description"),
      enabled: Boolean(card.querySelector('[data-field="enabled"]')?.checked),
      steps,
    };
  }

  return flows;
}

function applyLeadFilters() {
  const source = el.sourceFilter.value;
  const dateRange = el.dateFilter.value;
  const service = String(el.serviceFilter?.value || "all").trim();
  const now = Date.now();

  state.filteredLeads = state.leads.filter((lead) => {
    const channelOk = source === "all" || (lead.channel || "web") === source;
    const serviceOk =
      service === "all" ||
      String(lead?.interest_service || "").trim() === service;

    let dateOk = true;
    if (dateRange !== "all") {
      const value = lead.last_message?.created_at || lead.created_at;
      const time = new Date(value).getTime();
      if (Number.isNaN(time)) {
        dateOk = false;
      } else if (dateRange === "today") {
        const today = new Date();
        const sample = new Date(time);
        dateOk =
          today.getFullYear() === sample.getFullYear() &&
          today.getMonth() === sample.getMonth() &&
          today.getDate() === sample.getDate();
      } else if (dateRange === "7d") {
        dateOk = now - time <= 7 * 24 * 60 * 60 * 1000;
      } else if (dateRange === "30d") {
        dateOk = now - time <= 30 * 24 * 60 * 60 * 1000;
      }
    }

    return channelOk && serviceOk && dateOk;
  });

  if (!state.filteredLeads.find((lead) => lead.id === state.selectedLead?.id)) {
    state.selectedLead = state.filteredLeads[0] || null;
  }

  const totalPages = Math.max(1, Math.ceil(state.filteredLeads.length / LEAD_PAGE_SIZE));
  if (state.leadPage > totalPages - 1) {
    state.leadPage = totalPages - 1;
  }
}

function renderLeadTable() {
  applyLeadFilters();
  el.leadTableBody.innerHTML = "";
  el.leadMobileList.innerHTML = "";

  if (!state.filteredLeads.length) {
    el.leadTableBody.innerHTML =
      '<tr><td colspan="8" class="empty">No hay leads para esos filtros.</td></tr>';
    el.leadMobileList.innerHTML = '<div class="empty">No hay leads para esos filtros.</div>';
    el.leadTableInfo.textContent = "0 resultados";
    el.leadPaginationInfo.textContent = "Pagina 1 de 1";
    el.leadPrevBtn.disabled = true;
    el.leadNextBtn.disabled = true;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(state.filteredLeads.length / LEAD_PAGE_SIZE));
  const start = state.leadPage * LEAD_PAGE_SIZE;
  const pageItems = state.filteredLeads.slice(start, start + LEAD_PAGE_SIZE);

  for (const lead of pageItems) {
    const row = document.createElement("tr");
    row.className = `lead-row${state.selectedLead?.id === lead.id ? " active" : ""}`;
    row.innerHTML = `
      <td data-label="Nombre de lead"><button type="button" class="lead-name-btn">${getLeadDisplayName(lead)}</button></td>
      <td data-label="Servicio">${lead.interest_service || "-"}</td>
      <td data-label="Presupuesto">${lead.budget_range || "-"}</td>
      <td data-label="Canal">${lead.channel || "web"}</td>
      <td data-label="Telefono">${lead.phone || "-"}</td>
      <td data-label="Email">${lead.email || "-"}</td>
      <td data-label="Fecha">${fmtDate(lead.last_message?.created_at || lead.created_at)}</td>
      <td data-label="Status"><span class="status-pill">${lead.crm_status || "nuevo"}</span></td>
    `;
    row.addEventListener("click", () => selectLead(lead.id));
    row.querySelector(".lead-name-btn")?.addEventListener("click", (event) => {
      event.stopPropagation();
      selectLead(lead.id);
    });
    el.leadTableBody.appendChild(row);

    const mobileCard = document.createElement("details");
    mobileCard.className = `lead-mobile-card${state.selectedLead?.id === lead.id ? " active" : ""}`;
    if (state.selectedLead?.id === lead.id) {
      mobileCard.open = true;
    }
    mobileCard.innerHTML = `
      <summary>
        <div class="lead-mobile-summary">
          <div class="lead-mobile-main">
            <strong>${getLeadDisplayName(lead)}</strong>
            <span>${lead.interest_service || "Sin servicio"}</span>
          </div>
          <div class="lead-mobile-meta-top">
            <span class="status-pill">${lead.crm_status || "nuevo"}</span>
            <time>${fmtDate(lead.last_message?.created_at || lead.created_at)}</time>
          </div>
        </div>
      </summary>
      <div class="lead-mobile-details">
        <div><span>Canal</span><strong>${lead.channel || "web"}</strong></div>
        <div><span>Presupuesto</span><strong>${lead.budget_range || "-"}</strong></div>
        <div><span>Telefono</span><strong>${lead.phone || "-"}</strong></div>
        <div><span>Email</span><strong>${lead.email || "-"}</strong></div>
        <button type="button" class="lead-mobile-open-btn">Abrir lead</button>
      </div>
    `;
    mobileCard.addEventListener("toggle", () => {
      if (!mobileCard.open) return;
      el.leadMobileList
        .querySelectorAll(".lead-mobile-card")
        .forEach((card) => {
          if (card !== mobileCard) card.open = false;
        });
    });
    mobileCard.querySelector(".lead-mobile-open-btn")?.addEventListener("click", () => {
      selectLead(lead.id);
    });
    el.leadMobileList.appendChild(mobileCard);
  }

  el.leadTableInfo.textContent = `${state.filteredLeads.length} resultados`;
  el.leadPaginationInfo.textContent = `Pagina ${state.leadPage + 1} de ${totalPages}`;
  el.leadPrevBtn.disabled = state.leadPage === 0;
  el.leadNextBtn.disabled = state.leadPage >= totalPages - 1;
}

function renderLeadDetail() {
  const lead = state.selectedLead;

  if (!lead) {
    el.leadTitle.textContent = "Selecciona un lead";
    el.leadChannel.textContent = "-";
    el.leadMeta.innerHTML = "";
    el.messageList.innerHTML = '<div class="empty">Selecciona una conversacion.</div>';
    renderQuote(null);
    renderAnalysis(null);
    if (el.deleteLeadBtn) {
      el.deleteLeadBtn.disabled = true;
      el.deleteLeadBtn.classList.remove("is-busy");
    }
    return;
  }

  el.leadTitle.textContent = getLeadDisplayName(lead);
  el.leadChannel.textContent = lead.channel || "web";
  el.leadMeta.innerHTML = `
    <div class="meta-box"><strong>Servicio</strong>${lead.interest_service || "-"}</div>
    <div class="meta-box"><strong>Presupuesto</strong>${lead.budget_range || "-"}</div>
    <div class="meta-box"><strong>Urgencia</strong>${lead.urgency || "-"}</div>
    <div class="meta-box"><strong>Email</strong>${lead.email || "-"}</div>
    <div class="meta-box"><strong>Telefono</strong>${lead.phone || "-"}</div>
    <div class="meta-box"><strong>Actividad</strong>${lead.business_activity || "-"}</div>
    <div class="meta-box"><strong>Origen</strong>${lead.source_platform || "-"}</div>
    <div class="meta-box"><strong>Campaña</strong>${lead.source_campaign || "-"}</div>
  `;

  el.crmStatus.value = lead.crm_status || "nuevo";
  el.quoteStatus.value = lead.quote_status || "sin_presupuesto";
  el.leadName.value = lead.name || "";
  el.leadEmail.value = lead.email || "";
  el.leadPhone.value = lead.phone || "";
  el.leadCompanyName.value = lead.company_name || "";
  el.leadInterestService.value = lead.interest_service || "";
  el.leadBudgetRange.value = lead.budget_range || "";
  el.leadMainGoal.value = lead.main_goal || "";
  el.leadCurrentSituation.value = lead.current_situation || "";
  el.leadPainPoints.value = lead.pain_points || "";
  el.leadPreferredContactChannel.value = lead.preferred_contact_channel || "";
  el.assignedTo.value = lead.assigned_to || "";
  el.nextAction.value = lead.next_action || "";
  el.followUpAt.value = toDatetimeLocal(lead.follow_up_at);
  el.internalNotes.value = lead.internal_notes || "";
  if (el.deleteLeadBtn) {
    el.deleteLeadBtn.disabled = false;
    el.deleteLeadBtn.classList.remove("is-busy");
  }
}

function renderBreakdown(target, rows = []) {
  if (!target) return;

  if (!rows.length) {
    target.innerHTML = '<div class="empty">Sin datos todavia.</div>';
    return;
  }

  target.innerHTML = rows
    .map(
      (row) => `
        <div class="analytics-breakdown-row">
          <span>${row.label || "-"}</span>
          <strong>${row.value ?? 0}</strong>
        </div>
      `
    )
    .join("");
}

function renderServicePerformance(rows = []) {
  if (!el.analyticsServiceBreakdown) return;

  if (!rows.length) {
    el.analyticsServiceBreakdown.innerHTML =
      '<div class="empty">Sin datos por servicio todavia.</div>';
    return;
  }

  el.analyticsServiceBreakdown.innerHTML = rows
    .map(
      (row) => `
        <article class="analytics-service-card">
          <div class="analytics-service-head">
            <strong>${row.label || "-"}</strong>
            <span>${row.acceptance_rate ?? 0}% aceptacion</span>
          </div>
          <div class="analytics-service-metrics">
            <div><span>Leads</span><strong>${row.leads ?? 0}</strong></div>
            <div><span>Enviadas</span><strong>${row.quotes_sent ?? 0}</strong></div>
            <div><span>Aceptadas</span><strong>${row.quotes_accepted ?? 0}</strong></div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderTimeline(rows = []) {
  if (!el.analyticsTimeline) return;

  if (!rows.length) {
    el.analyticsTimeline.innerHTML = '<div class="empty">Sin datos del periodo todavia.</div>';
    return;
  }

  const maxValue = Math.max(
    ...rows.flatMap((row) => [row.leads || 0, row.quotes_sent || 0, row.quotes_accepted || 0]),
    1
  );

  const totals = rows.reduce(
    (acc, row) => {
      acc.leads += row.leads || 0;
      acc.sent += row.quotes_sent || 0;
      acc.accepted += row.quotes_accepted || 0;
      return acc;
    },
    { leads: 0, sent: 0, accepted: 0 }
  );

  const activeDays = rows.filter(
    (row) => (row.leads || 0) > 0 || (row.quotes_sent || 0) > 0 || (row.quotes_accepted || 0) > 0
  ).length;
  const averageLeads = rows.length ? (totals.leads / rows.length).toFixed(1) : "0.0";
  const topDay = rows.reduce((best, row) => {
    const currentScore = (row.leads || 0) + (row.quotes_sent || 0) + (row.quotes_accepted || 0);
    const bestScore =
      (best?.leads || 0) + (best?.quotes_sent || 0) + (best?.quotes_accepted || 0);
    return currentScore > bestScore ? row : best;
  }, rows[0]);

  const dailyRows = rows
    .map((row) => {
      const leadPct = Math.max(8, Math.round(((row.leads || 0) / maxValue) * 100));
      const sentPct = Math.max(8, Math.round(((row.quotes_sent || 0) / maxValue) * 100));
      const acceptedPct = Math.max(8, Math.round(((row.quotes_accepted || 0) / maxValue) * 100));

      return `
        <article class="timeline-row">
          <div class="timeline-date">${row.date}</div>
          <div class="timeline-metrics">
            <div class="timeline-bar-group">
              <span>Leads</span>
              <div class="timeline-bar"><i style="width:${leadPct}%"></i></div>
              <strong>${row.leads || 0}</strong>
            </div>
            <div class="timeline-bar-group">
              <span>Enviadas</span>
              <div class="timeline-bar secondary"><i style="width:${sentPct}%"></i></div>
              <strong>${row.quotes_sent || 0}</strong>
            </div>
            <div class="timeline-bar-group">
              <span>Aceptadas</span>
              <div class="timeline-bar success"><i style="width:${acceptedPct}%"></i></div>
              <strong>${row.quotes_accepted || 0}</strong>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  el.analyticsTimeline.innerHTML = `
    <div class="timeline-overview">
      <div class="timeline-overview-copy">
        <span class="timeline-overview-kicker">Resumen ejecutivo</span>
        <h5>Lectura global del periodo</h5>
        <p>${activeDays} dias con movimiento. Mejor pico: <strong>${topDay?.date || "-"}</strong>. Media diaria de leads: <strong>${averageLeads}</strong>.</p>
      </div>
      <div class="timeline-overview-stats">
        <article class="timeline-overview-stat">
          <span>Leads del periodo</span>
          <strong>${totals.leads}</strong>
        </article>
        <article class="timeline-overview-stat">
          <span>Propuestas enviadas</span>
          <strong>${totals.sent}</strong>
        </article>
        <article class="timeline-overview-stat">
          <span>Propuestas aceptadas</span>
          <strong>${totals.accepted}</strong>
        </article>
      </div>
    </div>
    <details class="timeline-details">
      <summary>Ver detalle por dia</summary>
      <div class="timeline-detail-list">${dailyRows}</div>
    </details>
  `;
}

function renderAnalytics() {
  const analytics = state.analytics;

  el.analyticsRangeLabel.textContent = getDateFilterLabel(el.dateFilter.value);

  if (!analytics) {
    el.analyticsLeadsGenerated.textContent = "-";
    el.analyticsPassedWhatsapp.textContent = "-";
    el.analyticsWhatsappHint.textContent = "-";
    el.analyticsQuotesSent.textContent = "-";
    el.analyticsQuotesAccepted.textContent = "-";
    el.analyticsResponseTime.textContent = "-";
    el.analyticsAcceptanceRate.textContent = "-";
    renderBreakdown(el.analyticsChannelBreakdown, []);
    renderBreakdown(el.analyticsSourceBreakdown, []);
    renderServicePerformance([]);
    renderTimeline([]);
    return;
  }

  const totals = analytics.totals || {};
  el.analyticsLeadsGenerated.textContent = totals.leads_generated ?? 0;
  el.analyticsPassedWhatsapp.textContent = totals.passed_to_whatsapp ?? 0;
  el.analyticsWhatsappHint.textContent = `${totals.whatsapp_handoff_real ?? 0} reales · ${totals.whatsapp_preference ?? 0} por preferencia`;
  el.analyticsQuotesSent.textContent = totals.quotes_sent ?? 0;
  el.analyticsQuotesAccepted.textContent = totals.quotes_accepted ?? 0;
  el.analyticsResponseTime.textContent = totals.average_response_label || "-";
  el.analyticsAcceptanceRate.textContent = `${totals.acceptance_rate ?? 0}%`;

  renderBreakdown(el.analyticsChannelBreakdown, analytics?.breakdowns?.channel || []);
  renderBreakdown(el.analyticsSourceBreakdown, analytics?.breakdowns?.source || []);
  renderServicePerformance(analytics?.breakdowns?.service || []);
  renderTimeline(analytics?.timeline || []);
}

function renderConfig() {
  const config = state.appConfig || {};
  applyBrandTheme(config);

  if (el.configProductMode) {
    el.configProductMode.value = config?.product?.mode || "full_crm";
  }
  if (el.configProductModeHint) {
    el.configProductModeHint.textContent =
      (config?.product?.mode || "full_crm") === "chat_only"
        ? "Esta cuenta solo vera configuracion del agente, integraciones y fuentes. El CRM comercial quedara fuera para el cliente."
        : "Esta cuenta vera captacion, pipeline, presupuestos, analitica y configuracion.";
  }
  el.configBrandName.value = config?.brand?.name || "";
  el.configWebsiteUrl.value = config?.brand?.website_url || "";
  el.configBootstrapUrl.value = config?.brand?.website_url || "";
  el.configLogoUrl.value = config?.brand?.logo_url || "";
  if (el.configLogoFile) {
    el.configLogoFile.value = "";
  }
  updateConfigLogoPreview(config?.brand?.logo_url || "");
  el.configPrimaryColor.value = config?.brand?.primary_color || "";
  el.configAccentColor.value = config?.brand?.accent_color || "";
  el.configPublicWhatsappNumber.value =
    config?.contact?.public_whatsapp_number || "";
  el.configHumanWhatsappNumber.value =
    config?.contact?.human_agent_whatsapp_number || "";
  el.configSupportEmail.value = config?.contact?.support_email || "";
  el.configAgentTone.value = config?.agent?.tone || "";
  el.configFinalCtaLabel.value = config?.agent?.final_cta_label || "";
  el.configHandoffTargetChannel.value =
    config?.agent?.handoff_target_channel || "whatsapp";
  el.configPromptAdditions.value = config?.agent?.prompt_additions || "";
  renderKnowledgeSources(config?.knowledge_sources || {});
  normalizeKnowledgeCopy();
  renderSectorPresets();
  renderSetupHealth(config);
  updateProductModeUi(config);
  const widgetInstall = buildWidgetInstallData(config);
  if (el.configWidgetInstallUrl) {
    el.configWidgetInstallUrl.value = widgetInstall.widgetUrl;
  }
  if (el.configWidgetRecommendedDomain) {
    el.configWidgetRecommendedDomain.value =
      (Array.isArray(config?.widget?.allowed_domains) && config.widget.allowed_domains[0]) ||
      widgetInstall.recommendedDomain;
  }
  if (el.configWidgetEmbedMode) {
    el.configWidgetEmbedMode.value = config?.widget?.install_mode || widgetInstall.installMode || "slug";
  }
  if (el.configWidgetAllowedDomains) {
    el.configWidgetAllowedDomains.value = Array.isArray(config?.widget?.allowed_domains)
      ? config.widget.allowed_domains.join("\n")
      : "";
  }
  if (el.configWidgetSnippet) {
    el.configWidgetSnippet.value = widgetInstall.snippet;
  }
  el.configWhatsappProvider.value =
    config?.integrations?.whatsapp?.provider || "meta_cloud";
  el.configWhatsappStatusLabel.value =
    config?.integrations?.whatsapp?.status_label || "";
  el.configWhatsappPhoneNumberId.value =
    config?.integrations?.whatsapp?.phone_number_id || "";
  el.configWhatsappBusinessAccountId.value =
    config?.integrations?.whatsapp?.business_account_id || "";
  el.configMetaLeadSource.value =
    config?.integrations?.lead_forms?.meta_source || "google_sheets";
  el.configGoogleLeadSource.value =
    config?.integrations?.lead_forms?.google_source || "webhook_n8n";
  el.configLeadSheetDocument.value =
    config?.integrations?.lead_forms?.sheet_document || "";
  el.configLeadSheetTabs.value =
    config?.integrations?.lead_forms?.sheet_tabs || "";
  el.configLeadWebhookUrl.value =
    config?.integrations?.lead_forms?.webhook_url || "";
  el.configEmailProvider.value =
    config?.integrations?.email?.provider || "smtp";
  el.configEmailFromAddress.value =
    config?.integrations?.email?.from_email || "";
  el.configEmailReplyTo.value =
    config?.integrations?.email?.reply_to_email || "";
  el.configAutomationPlatform.value =
    config?.integrations?.automations?.platform || "n8n";
  el.configAutomationWorkspaceUrl.value =
    config?.integrations?.automations?.workspace_url || "";
  el.configAutomationNotes.value =
    config?.integrations?.automations?.notes || "";
  if (el.configWhatsappStatusBadge) {
    el.configWhatsappStatusBadge.textContent =
      config?.integrations?.whatsapp?.status_label || "Pendiente";
  }
  renderIntegrationValidation(
    "whatsapp",
    config?.integrations?.whatsapp?.validation || {},
    config?.integrations?.whatsapp?.status_label || "Pendiente"
  );
  renderIntegrationValidation(
    "lead_forms",
    config?.integrations?.lead_forms?.validation || {}
  );
  renderIntegrationValidation(
    "email",
    config?.integrations?.email?.validation || {}
  );
  renderIntegrationValidation(
    "automations",
    config?.integrations?.automations?.validation || {}
  );
  renderMessageTemplates(config?.message_templates || {});
  renderAutomationFlows(config?.automation_flows || {});
  renderServiceEditor(config?.services || {});
  if (!canAccessSalesWorkspace()) {
    setMainView("config");
  }
  if (!el.configBootstrapSummary.value.trim()) {
    el.configBootstrapSummary.value = "";
  }
  updateKnowledgeOnboardingState();
}

function setConfigTab(tabName) {
  const isGeneral = tabName === "general";
  const isKnowledge = tabName === "knowledge";
  const isMessages = tabName === "messages";
  const isAutomations = tabName === "automations";
  const isIntegrations = tabName === "integrations";
  const isWebsite = tabName === "website";
  el.configTabGeneral.classList.toggle("is-active", isGeneral);
  el.configTabKnowledge?.classList.toggle("is-active", isKnowledge);
  el.configTabMessages.classList.toggle("is-active", isMessages);
  el.configTabAutomations.classList.toggle("is-active", isAutomations);
  el.configTabIntegrations.classList.toggle("is-active", isIntegrations);
  el.configTabWebsite.classList.toggle("is-active", isWebsite);
  el.configPanelGeneral.classList.toggle("is-active", isGeneral);
  el.configPanelKnowledge?.classList.toggle("is-active", isKnowledge);
  el.configPanelMessages.classList.toggle("is-active", isMessages);
  el.configPanelAutomations.classList.toggle("is-active", isAutomations);
  el.configPanelIntegrations.classList.toggle("is-active", isIntegrations);
  el.configPanelWebsite.classList.toggle("is-active", isWebsite);
}

function renderMessages(messages = []) {
  el.messageList.innerHTML = "";

  if (!messages.length) {
    el.messageList.innerHTML = '<div class="empty">No hay mensajes en esta conversacion.</div>';
    return;
  }

  for (const msg of messages) {
    const item = document.createElement("div");
    item.className = `message-item ${msg.role}`;
    item.innerHTML = `
      <strong>${msg.role}</strong>
      <div>${msg.content}</div>
      <time>${fmtDate(msg.created_at)}</time>
    `;
    el.messageList.appendChild(item);
  }
}

function renderAnalysisList(target, rows = []) {
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = "<li>Sin datos todavia.</li>";
    return;
  }

  target.innerHTML = rows
    .slice(0, 4)
    .map((item) => {
      if (typeof item === "string") {
        return `<li>${escapeHtml(item)}</li>`;
      }
      return `<li><strong>${escapeHtml(item?.title || "Punto clave")}:</strong> ${escapeHtml(
        item?.detail || item?.text || ""
      )}</li>`;
    })
      .join("");
}

function normaliseAnalysisEditorList(rows = []) {
  return (rows || [])
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") return item.trim();
      const title = String(item?.title || "").trim();
      const detail = String(item?.detail || item?.text || "").trim();
      return [title, detail].filter(Boolean).join(": ").trim();
    })
    .filter(Boolean)
    .join("\n");
}

function parseAnalysisEditorList(value = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderAnalysis(analysis) {
  state.selectedAnalysis = analysis || null;
  const content = analysis?.content_json || {};
  const recommendedService =
    analysis?.recommended_service ||
    content?.recommended_service ||
    state.selectedLead?.interest_service ||
    "-";
  const status = analysis?.status || "draft";
  const title = analysis?.title || "Todavia no hay analisis generado";
  const headline =
    content?.headline ||
    "Cuando generemos el analisis, aqui veras el enfoque recomendado y el resumen ejecutivo.";
  const summary =
    content?.summary ||
    "Genera el analisis para obtener una lectura comercial clara y reutilizable.";
  const nextStep = content?.next_step || "-";

  el.analysisTitle.textContent = title;
  el.analysisHeadline.textContent = headline;
  el.analysisRecommendedService.textContent = recommendedService;
  el.analysisStatusLabel.textContent = status;
  el.analysisSummaryText.textContent = summary;
  el.analysisNextStepText.textContent = nextStep;
  renderAnalysisList(el.analysisFindingsList, content?.findings || []);
  renderAnalysisList(el.analysisQuickWinsList, content?.quick_wins || []);

  if (el.analysisEditTitle) el.analysisEditTitle.value = analysis?.title || "";
  if (el.analysisEditRecommendedService) {
    el.analysisEditRecommendedService.value =
      analysis?.recommended_service || content?.recommended_service || state.selectedLead?.interest_service || "";
  }
  if (el.analysisEditHeadline) el.analysisEditHeadline.value = content?.headline || "";
  if (el.analysisEditStatus) el.analysisEditStatus.value = status;
  if (el.analysisEditSummary) el.analysisEditSummary.value = content?.summary || "";
  if (el.analysisEditFindings) el.analysisEditFindings.value = normaliseAnalysisEditorList(content?.findings || []);
  if (el.analysisEditQuickWins) el.analysisEditQuickWins.value = normaliseAnalysisEditorList(content?.quick_wins || []);
  if (el.analysisEditPriorities) el.analysisEditPriorities.value = normaliseAnalysisEditorList(content?.priorities || []);
  if (el.analysisEditNextStep) el.analysisEditNextStep.value = nextStep === "-" ? "" : nextStep;

  const hasAnalysis = Boolean(analysis?.id);
  if (el.analysisPreviewBtn) el.analysisPreviewBtn.disabled = !hasAnalysis;
  if (el.analysisSendBtn) el.analysisSendBtn.disabled = !hasAnalysis;
  if (el.analysisSaveBtn) el.analysisSaveBtn.disabled = !state.selectedLead?.id;
}

function renderQuote(quote) {
  state.selectedQuote = quote || null;
  const content = quote?.content_json || {};
  state.quoteItems = Array.isArray(content.items) && content.items.length
    ? content.items.map((item) => ({
        concept: item?.concept || "",
        quantity: Number(item?.quantity || 1),
        unit_price: Number(item?.unit_price || 0),
      }))
    : [];

  el.quoteTitle.value = quote?.title || "";
  el.quoteCurrency.value = quote?.currency || "EUR";
  el.quoteBillingType.value = content.billing_type || "monthly";
  el.quoteBillingLabel.value = content.billing_label || "";
  el.quoteTaxRate.value = content.tax_rate ?? 21;
  el.quoteSummary.value = content.summary || "";
  el.quoteScope.value = content.scope || "";
  el.quoteBody.value = content.body || "";
  el.quoteAssumptions.value = content.assumptions || "";
  renderQuoteItems();
  updateQuoteTotals();
}

function setStatus(target, message = "", kind = "") {
  if (!target) return;
  target.textContent = message;
  target.className = `save-status${kind ? ` ${kind}` : ""}`;
}

async function getServiceFacts(serviceName) {
  if (!serviceName) return null;
  const encoded = encodeURIComponent(serviceName);
  const data = await fetchJson(`${API_BASE}/service-facts/${encoded}`);
  return data.facts || null;
}

async function loadLeads() {
  const data = await fetchJson(`${API_BASE}/leads`);
  state.leads = data.leads || [];
  populateServiceFilter(state.leads);

  if (!state.selectedLead && state.leads.length) {
    state.selectedLead = state.leads[0];
  } else if (state.selectedLead) {
    state.selectedLead =
      state.leads.find((lead) => lead.id === state.selectedLead.id) || state.leads[0] || null;
  }

  renderLeadTable();
  renderLeadDetail();

  if (state.selectedLead?.conversation_id) {
    await loadMessages(state.selectedLead.conversation_id);
  } else {
    renderMessages([]);
  }

  if (state.selectedLead?.id) {
    await loadQuote(state.selectedLead.id);
    await loadAnalysis(state.selectedLead.id);
  } else {
    renderQuote(null);
    renderAnalysis(null);
  }

  try {
    await loadAnalytics();
  } catch (error) {
    console.warn("CRM analytics load failed", error);
    state.analytics = null;
    renderAnalytics();
  }
}

async function loadConfig() {
  const data = await fetchJson(`${API_BASE}/config`);
  state.appConfig = data.config || null;
  if (data.account?.id) {
    state.activeAccountId = data.account.id;
  }
  renderConfig();
  renderAccounts();
}

async function loadAnalytics() {
  const params = new URLSearchParams({
    channel: el.sourceFilter.value || "all",
    date_range: el.dateFilter.value || "all",
    service: el.serviceFilter?.value || "all",
  });
  const data = await fetchJson(`${API_BASE}/analytics?${params.toString()}`);
  state.analytics = data.analytics || null;
  renderAnalytics();
}

async function loadMessages(conversationId) {
  const data = await fetchJson(`${API_BASE}/conversations/${conversationId}/messages`);
  renderMessages(data.messages || []);
}

async function loadQuote(leadId) {
  const data = await fetchJson(`${API_BASE}/leads/${leadId}/quote`);
  renderQuote(data.quote || null);
}

async function loadAnalysis(leadId) {
  const data = await fetchJson(`${API_BASE}/leads/${leadId}/analysis`);
  renderAnalysis(data.analysis || null);
}

async function selectLead(leadId) {
  state.selectedLead = state.leads.find((lead) => lead.id === leadId) || null;
  renderLeadTable();
  renderLeadDetail();

  if (state.selectedLead?.conversation_id) {
    await loadMessages(state.selectedLead.conversation_id);
  } else {
    renderMessages([]);
  }

  if (state.selectedLead?.id) {
    await loadQuote(state.selectedLead.id);
    await loadAnalysis(state.selectedLead.id);
  } else {
    renderQuote(null);
    renderAnalysis(null);
  }
}

async function saveConfig() {
  el.configSaveBtn.disabled = true;
  el.configSaveBtn.classList.add("is-busy");
  setStatus(el.configSaveStatus, "Guardando configuracion...");

  try {
    const payload = buildConfigPayload();

    const data = await fetchJson(`${API_BASE}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    state.appConfig = data.config || null;
    renderConfig();
    highlightSuggestedKnowledgeFlow();
    highlightSuggestedKnowledgeFlow();
    renderAccounts();
    setStatus(el.configSaveStatus, "Configuracion guardada.", "ok");
  } catch (error) {
    setStatus(el.configSaveStatus, `No se pudo guardar: ${error.message}`, "error");
  } finally {
    el.configSaveBtn.disabled = false;
    el.configSaveBtn.classList.remove("is-busy");
  }
}

async function uploadLogoAsset(file) {
  const encoded = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });

  const data = await fetchJson(`${API_BASE}/assets/logo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_name: file.name || "logo",
      content_type: file.type || "image/png",
      data_url: encoded,
      brand_name: el.configBrandName.value || state.appConfig?.brand?.name || "Marca",
    }),
  });

  return data?.asset?.public_url || "";
}

async function analyzeWebsiteConfig() {
  const websiteUrl = (el.configBootstrapUrl.value || "").trim();
  if (!websiteUrl) {
    setStatus(el.configAnalyzeStatus, "Introduce una web para analizar.", "error");
    return;
  }

  el.configAnalyzeWebsiteBtn.disabled = true;
  el.configAnalyzeWebsiteBtn.classList.add("is-busy");
  setStatus(el.configAnalyzeStatus, "Analizando web...");

  try {
    const data = await fetchJson(`${API_BASE}/config/bootstrap-site`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ website_url: websiteUrl }),
    });

    const suggested = data.suggested_config || {};
    const previousConfig = state.appConfig || {};
    state.appConfig = suggested;
    const mergedWebsiteUrls = Array.from(
      new Set([
        websiteUrl,
        ...((previousConfig?.knowledge_sources?.website_urls || []).filter(Boolean)),
        ...((suggested?.knowledge_sources?.website_urls || []).filter(Boolean)),
      ])
    );
    state.appConfig.knowledge_sources = {
      ...(previousConfig?.knowledge_sources || {}),
      ...(suggested?.knowledge_sources || {}),
      website_urls: mergedWebsiteUrls,
    };
    renderConfig();

    const snapshot = data.snapshot || {};
    el.configBootstrapSummary.value = [
      `URL final: ${snapshot.final_url || snapshot.url || websiteUrl}`,
      `Marca sugerida: ${suggested?.brand?.name || "-"}`,
      `Title: ${snapshot.title || "-"}`,
      `H1: ${snapshot.h1 || "-"}`,
      `Resumen: ${snapshot.summary || "-"}`,
      `Prioridad: ${(snapshot.priorities || [])[0] || "-"}`,
    ].join("\n");
    const presetLabel = SECTOR_PRESETS[state.suggestedSectorPresetKey]?.label || "tu sector";

    setStatus(
      el.configAnalyzeStatus,
      "Analisis completado. Revisa la pestaña General y guarda si te encaja.",
      "ok"
    );
    setConfigTab("knowledge");
    const nextStep = focusNextKnowledgeStep();
    setStatus(
      el.configAnalyzeStatus,
      `Web analizada. Te recomiendo empezar por ${presetLabel} y seguir con ${nextStep?.shortLabel || "el siguiente paso del setup"}.`,
      "ok"
    );
  } catch (error) {
    setStatus(el.configAnalyzeStatus, `No se pudo analizar: ${error.message}`, "error");
  } finally {
    el.configAnalyzeWebsiteBtn.disabled = false;
    el.configAnalyzeWebsiteBtn.classList.remove("is-busy");
  }
}

async function previewKnowledgeContext() {
  if (!el.configPreviewContextBtn) return;

  el.configPreviewContextBtn.disabled = true;
  el.configPreviewContextBtn.classList.add("is-busy");
  setStatus(el.configContextPreviewStatus, "Construyendo vista previa...");

  try {
    const payload = buildConfigPayload();
    const data = await fetchJson(`${API_BASE}/config/context-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const preview = data.preview || {};
    const summaryParts = [
      preview.brand_name ? `Marca: ${preview.brand_name}` : "",
      preview.service_count >= 0 ? `${preview.service_count} servicio${preview.service_count === 1 ? "" : "s"}` : "",
      preview.website_url_count > 0 ? `${preview.website_url_count} URL${preview.website_url_count === 1 ? "" : "s"} de referencia` : "Sin URLs de apoyo",
      preview.has_spreadsheet_data ? "Con tabla comercial" : "Sin tabla comercial",
      preview.has_internal_notes ? "Con notas internas" : "Sin notas internas",
    ].filter(Boolean);

      if (el.configContextPreviewSummary) {
        el.configContextPreviewSummary.textContent = summaryParts.join(" · ");
      }
      if (el.configContextPreviewOutput) {
        el.configContextPreviewOutput.value = preview.context || "";
      }
      updateKnowledgeOnboardingState();

      setStatus(
        el.configContextPreviewStatus,
      "Vista previa generada. Ya puedes revisar exactamente qué contexto utilizará la IA.",
      "ok"
    );
  } catch (error) {
    setStatus(
      el.configContextPreviewStatus,
      `No se pudo generar la vista previa: ${error.message}`,
      "error"
    );
  } finally {
    el.configPreviewContextBtn.disabled = false;
    el.configPreviewContextBtn.classList.remove("is-busy");
  }
}

function getServiceNamesFromConfigPayload(payload = {}) {
  return Object.keys(payload?.services || {}).filter(Boolean);
}

function inferSuggestedTone(payload = {}) {
  const services = getServiceNamesFromConfigPayload(payload).join(" ").toLowerCase();
  const notes = [
    payload?.knowledge_sources?.website_focus,
    payload?.knowledge_sources?.internal_notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/seo|google ads|sem|meta ads|redes/.test(services)) {
    return "consultivo, estrategico y orientado a diagnosticar antes de proponer";
  }
  if (/diseno|diseño|web|tienda|ecommerce|shopify|woocommerce/.test(`${services} ${notes}`)) {
    return "cercano, visual y orientado a convertir necesidades en una propuesta clara";
  }
  return "profesional, cercano y orientado a diagnosticar antes de vender";
}

function inferSuggestedPromptAdditions(payload = {}) {
  const services = getServiceNamesFromConfigPayload(payload);
  const websiteFocus = String(payload?.knowledge_sources?.website_focus || "").trim();
  const notes = String(payload?.knowledge_sources?.internal_notes || "").trim();
  const references = (payload?.knowledge_sources?.website_urls || []).slice(0, 5);

  const parts = [
    services.length
      ? `Prioriza estos servicios en el discurso comercial: ${services.join(", ")}.`
      : "",
    websiteFocus
      ? `Cuando uses contexto web, céntrate especialmente en: ${websiteFocus}.`
      : "",
    notes
      ? `Ten presentes estas notas internas y objeciones: ${notes}.`
      : "",
    references.length
      ? `URLs de referencia a considerar: ${references.join(", ")}.`
      : "",
    "Si falta información, ofrece una orientación prudente y convierte el siguiente paso en una recomendación concreta, no en un formulario.",
  ].filter(Boolean);

  return parts.join(" ");
}

function buildSuggestedTemplates(payload = {}, currentTemplates = {}) {
  const brand = payload?.brand?.name || "la marca";
  const primaryService = getServiceNamesFromConfigPayload(payload)[0] || "{servicio}";
  const prefersWhatsapp = Boolean(String(payload?.contact?.public_whatsapp_number || "").trim());
  const introChannel = prefersWhatsapp ? "whatsapp" : "email";

  return {
    whatsapp_first_contact: {
      ...(currentTemplates?.whatsapp_first_contact || {}),
      channel: "whatsapp",
      label: "Primer contacto por WhatsApp",
      body: `Hola {nombre}, soy parte del equipo de ${brand}. Ya tengo contexto sobre tu interés en ${primaryService} y quiero ayudarte con un siguiente paso claro, sin hacerte repetir información. Si te va bien, seguimos por aquí y te aterrizo la recomendación.`,
    },
    email_first_contact: {
      ...(currentTemplates?.email_first_contact || {}),
      channel: "email",
      label: "Primer contacto por email",
      subject: `Seguimos con tu consulta sobre ${primaryService}`,
      body: `Hola {nombre},\n\nGracias por escribirnos a ${brand}. Ya he revisado el contexto de tu interés en ${primaryService} y quiero ayudarte con una recomendación clara y accionable.\n\nSi te encaja, responde a este correo y seguimos contigo.\n\nUn saludo,\n${brand}`,
    },
    quote_whatsapp: {
      ...(currentTemplates?.quote_whatsapp || {}),
      channel: "whatsapp",
      label: "Envio de propuesta por WhatsApp",
      body: `Hola {nombre}, te comparto aquí tu propuesta de {servicio}: {link_presupuesto}. Si quieres, la revisamos juntos y resolvemos dudas antes de decidir.`,
    },
    quote_email: {
      ...(currentTemplates?.quote_email || {}),
      channel: "email",
      label: "Envio de propuesta por email",
      subject: "Tu propuesta de {servicio} ya está lista",
      body: `Hola {nombre},\n\nTe comparto tu propuesta de {servicio}: {link_presupuesto}\n\nSi prefieres verla con un agente, también puedes escribirnos por WhatsApp: {whatsapp_humano}.\n\nUn saludo,\n${brand}`,
    },
    recovery_whatsapp: {
      ...(currentTemplates?.recovery_whatsapp || {}),
      channel: "whatsapp",
      label: "Recuperacion por WhatsApp",
      body: `Hola {nombre}, retomo este hilo porque creo que todavía podemos ayudarte con {servicio}. Si quieres, te dejo aquí una recomendación concreta para tu caso y vemos si tiene sentido avanzar.`,
    },
    recovery_email: {
      ...(currentTemplates?.recovery_email || {}),
      channel: "email",
      label: "Recuperacion por email",
      subject: "Seguimos disponibles para ayudarte con {servicio}",
      body: `Hola {nombre},\n\nRetomo el contacto porque creo que aún hay recorrido para ayudarte con {servicio}. Si te encaja, podemos retomar la conversación y proponerte un siguiente paso muy concreto.\n\nQuedo pendiente,\n${brand}`,
    },
    _preferred_intro_channel: introChannel,
  };
}

function buildSuggestedAutomations(payload = {}, currentFlows = {}, templates = {}) {
  const introChannel = templates._preferred_intro_channel === "whatsapp" ? "whatsapp" : "email";
  const secondaryChannel = introChannel === "whatsapp" ? "email" : "whatsapp";
  const introTemplateKey =
    introChannel === "whatsapp" ? "recovery_whatsapp" : "recovery_email";
  const secondaryTemplateKey =
    secondaryChannel === "whatsapp" ? "recovery_whatsapp" : "recovery_email";

  return {
    lead_recovery: {
      ...(currentFlows?.lead_recovery || {}),
      label: "Recuperacion de leads",
      description:
        "Secuencia automatica para reactivar oportunidades que pidieron informacion pero dejaron la conversacion a medias.",
      enabled: true,
      steps: [
        {
          delay_value: "24",
          delay_unit: "hours",
          channel: introChannel,
          template_key: introTemplateKey,
          active: true,
        },
        {
          delay_value: "72",
          delay_unit: "hours",
          channel: secondaryChannel,
          template_key: secondaryTemplateKey,
          active: true,
        },
      ],
    },
    quote_followup: {
      ...(currentFlows?.quote_followup || {}),
      label: "Seguimiento de propuesta",
      description:
        "Secuencia automatica para propuestas enviadas sin respuesta, combinando un primer toque corto y un recordatorio posterior.",
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
  };
}

function suggestOnboardingSetup() {
  const payload = buildConfigPayload();
  const serviceNames = getServiceNamesFromConfigPayload(payload);

  if (!serviceNames.length) {
    setStatus(
      el.configSuggestSetupStatus,
      "Añade al menos un servicio o propón servicios desde la tabla antes de generar el setup inicial.",
      "error"
    );
    return;
  }

  const nextConfig = {
    ...(state.appConfig || {}),
    ...payload,
    agent: {
      ...(state.appConfig?.agent || {}),
      ...payload.agent,
      tone: inferSuggestedTone(payload),
      prompt_additions: inferSuggestedPromptAdditions(payload),
    },
  };

  const suggestedTemplates = buildSuggestedTemplates(
    nextConfig,
    state.appConfig?.message_templates || {}
  );
  nextConfig.message_templates = {
    ...(state.appConfig?.message_templates || {}),
    ...Object.fromEntries(
      Object.entries(suggestedTemplates).filter(([key]) => !key.startsWith("_"))
    ),
  };
  nextConfig.automation_flows = buildSuggestedAutomations(
    nextConfig,
    state.appConfig?.automation_flows || {},
    suggestedTemplates
  );

  state.appConfig = nextConfig;
  renderConfig();
  setStatus(
    el.configSuggestSetupStatus,
    "Setup inicial propuesto. Revisa Mensajes, Automatizaciones y el tono del agente antes de guardar.",
    "ok"
  );
  scrollToKnowledgeTarget("configKnowledgeStepReview");
}

async function validateIntegration(type, button) {
  if (!type) return;
  button.disabled = true;
  button.classList.add("is-busy");
  setStatus(el.configSaveStatus, `Comprobando ${type}...`);

  try {
    const data = await fetchJson(`${API_BASE}/integrations/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });

    state.appConfig = data.config || state.appConfig;
    renderConfig();
    setStatus(el.configSaveStatus, `Integracion ${type} validada.`, "ok");
  } catch (error) {
    setStatus(el.configSaveStatus, `No se pudo validar ${type}: ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.classList.remove("is-busy");
  }
}

async function saveLead() {
  if (!state.selectedLead) return;

  el.saveBtn.disabled = true;
  el.saveBtn.classList.add("is-busy");
  setStatus(el.leadSaveStatus, "Guardando...");

  try {
    const payload = {
      name: el.leadName.value,
      email: el.leadEmail.value,
      phone: el.leadPhone.value,
      company_name: el.leadCompanyName.value,
      interest_service: el.leadInterestService.value,
      budget_range: el.leadBudgetRange.value,
      main_goal: el.leadMainGoal.value,
      current_situation: el.leadCurrentSituation.value,
      pain_points: el.leadPainPoints.value,
      preferred_contact_channel: el.leadPreferredContactChannel.value,
      crm_status: el.crmStatus.value,
      quote_status: el.quoteStatus.value,
      assigned_to: el.assignedTo.value,
      next_action: el.nextAction.value,
      follow_up_at: el.followUpAt.value ? new Date(el.followUpAt.value).toISOString() : null,
      internal_notes: el.internalNotes.value,
    };

    const response = await fetchJson(`${API_BASE}/leads/${state.selectedLead.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response?.lead) {
      state.selectedLead = {
        ...state.selectedLead,
        ...response.lead,
        channel: state.selectedLead.channel,
        external_user_id: state.selectedLead.external_user_id,
        conversation_created_at: state.selectedLead.conversation_created_at,
        last_message: state.selectedLead.last_message,
      };
      state.leads = state.leads.map((lead) =>
        lead.id === state.selectedLead.id ? { ...lead, ...state.selectedLead } : lead
      );
      renderLeadTable();
      renderLeadDetail();
    }

    setStatus(el.leadSaveStatus, "Cambios guardados.", "ok");

    loadLeads().catch((error) => {
      console.warn("CRM reload after save failed", error);
      setStatus(el.leadSaveStatus, "Cambios guardados. La recarga automatica ha fallado, pero el lead esta actualizado.", "ok");
    });
  } catch (error) {
    setStatus(el.leadSaveStatus, `No se pudo guardar: ${error.message}`, "error");
  } finally {
    el.saveBtn.disabled = false;
    el.saveBtn.classList.remove("is-busy");
  }
}

async function deleteSelectedLead() {
  if (!state.selectedLead?.id) return;

  const leadName = getLeadDisplayName(state.selectedLead);
  const confirmed = window.confirm(
    `¿Seguro que quieres eliminar el lead "${leadName}" del CRM? Esta accion borra tambien su propuesta y analisis guardados.`
  );

  if (!confirmed) return;

  el.deleteLeadBtn.disabled = true;
  el.deleteLeadBtn.classList.add("is-busy");
  setStatus(el.leadSaveStatus, "Eliminando lead...");

  try {
    await fetchJson(`${API_BASE}/leads/${state.selectedLead.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    const deletedLeadId = state.selectedLead.id;
    state.leads = state.leads.filter((lead) => lead.id !== deletedLeadId);
    state.filteredLeads = state.filteredLeads.filter((lead) => lead.id !== deletedLeadId);
    state.selectedLead = state.leads[0] || null;

    renderLeadTable();
    renderLeadDetail();

    if (state.selectedLead?.conversation_id) {
      await loadMessages(state.selectedLead.conversation_id);
    } else {
      renderMessages([]);
    }

    if (state.selectedLead?.id) {
      await loadQuote(state.selectedLead.id);
      await loadAnalysis(state.selectedLead.id);
    } else {
      renderQuote(null);
      renderAnalysis(null);
    }

    setStatus(el.leadSaveStatus, "Lead eliminado del CRM.", "ok");

    loadAnalytics().catch((error) => {
      console.warn("CRM analytics reload after delete failed", error);
    });
  } catch (error) {
    setStatus(el.leadSaveStatus, `No se pudo eliminar: ${error.message}`, "error");
  } finally {
    if (el.deleteLeadBtn) {
      el.deleteLeadBtn.disabled = !state.selectedLead;
      el.deleteLeadBtn.classList.remove("is-busy");
    }
  }
}

function buildServiceItems(service, serviceFacts = null) {
  const normalizedService = String(service || "").toLowerCase();

  if (normalizedService.includes("google ads")) {
    return [
      { concept: "Auditoria y planteamiento inicial de Google Ads", quantity: 1, unit_price: 190 },
      { concept: "Configuracion y estructura de campañas", quantity: 1, unit_price: 210 },
      { concept: "Gestion mensual y optimizacion continua", quantity: 1, unit_price: 300 },
    ];
  }

  if (normalizedService.includes("seo")) {
    return [
      { concept: "Auditoria SEO inicial", quantity: 1, unit_price: 180 },
      { concept: "Plan de contenidos y palabras clave", quantity: 1, unit_price: 160 },
      { concept: "Optimizacion mensual SEO", quantity: 1, unit_price: 280 },
    ];
  }

  if (normalizedService.includes("meta ads") || normalizedService.includes("redes")) {
    return [
      { concept: "Auditoria inicial de campañas", quantity: 1, unit_price: 180 },
      { concept: "Preparacion creativa y estructura de campañas", quantity: 1, unit_price: 220 },
      { concept: "Gestion mensual y optimizacion", quantity: 1, unit_price: 300 },
    ];
  }

  const fallbackPrice = String(serviceFacts?.min_monthly_fee || serviceFacts?.min_project_fee || "")
    .match(/(\d+)/)?.[1];

  return [
    {
      concept: `Servicio base de ${service}`,
      quantity: 1,
      unit_price: fallbackPrice ? Number(fallbackPrice) : 300,
    },
  ];
}

function inferBillingType(service) {
  const normalizedService = String(service || "").toLowerCase();

  if (
    normalizedService.includes("google ads") ||
    normalizedService.includes("seo") ||
    normalizedService.includes("meta ads") ||
    normalizedService.includes("redes")
  ) {
    return "monthly";
  }

  if (
    normalizedService.includes("web") ||
    normalizedService.includes("dise") ||
    normalizedService.includes("consultor")
  ) {
    return "one_time";
  }

  return "custom";
}

function getBillingTypeLabel(value) {
  if (value === "monthly") return "Mensual";
  if (value === "one_time") return "Pago unico";
  if (value === "custom") return "Personalizado";
  return "Mensual";
}

function buildQuoteSuggestion(lead, serviceFacts = null) {
  const service = lead?.interest_service || "servicio de marketing";
  const business = lead?.business_activity || lead?.business_type || "tu proyecto";
  const goal = lead?.main_goal || "mejorar resultados";
  const items = buildServiceItems(service, serviceFacts);
  const billingType = inferBillingType(service);
  const billingLabel = getBillingTypeLabel(billingType);
  const includedBase = serviceFacts?.description
    ? serviceFacts.description
    : [
        "Analisis inicial del negocio y del punto de partida.",
        `Definicion de estrategia para ${service}.`,
        "Configuracion y optimizacion continua.",
        "Seguimiento de resultados y mejoras.",
      ].join(" ");

  return {
    title: `Propuesta ${service}`,
    summary: `${service} para ${business}`,
    tax_rate: 21,
    billing_type: billingType,
    billing_label: billingLabel,
    items,
    scope: includedBase,
    body: `Te compartimos una propuesta inicial de ${service} para ${business}, orientada a ${goal}. Puedes revisarla y ajustarla antes del envio definitivo al cliente.`,
    assumptions: "",
  };
}

async function autofillQuote() {
  if (!state.selectedLead) return;
  let serviceFacts = null;
  try {
    serviceFacts = await getServiceFacts(state.selectedLead.interest_service);
  } catch (_error) {
    serviceFacts = null;
  }

  const draft = buildQuoteSuggestion(state.selectedLead, serviceFacts);
  el.quoteTitle.value = draft.title;
  el.quoteBillingType.value = draft.billing_type;
  el.quoteBillingLabel.value = draft.billing_label;
  el.quoteTaxRate.value = draft.tax_rate;
  el.quoteSummary.value = draft.summary;
  el.quoteScope.value = draft.scope;
  el.quoteBody.value = draft.body;
  el.quoteAssumptions.value = draft.assumptions;
  state.quoteItems = draft.items.map((item) => ({ ...item }));
  renderQuoteItems();
  updateQuoteTotals();
}

function createEmptyQuoteItem() {
  return { concept: "", quantity: 1, unit_price: 0 };
}

function renderQuoteItems() {
  el.quoteItemsList.innerHTML = "";

  if (!state.quoteItems.length) {
    el.quoteItemsList.innerHTML = '<div class="empty">No hay partidas todavia.</div>';
    return;
  }

  state.quoteItems.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "quote-item";
    row.innerHTML = `
      <label>
        Concepto
        <input type="text" data-field="concept" data-index="${index}" value="${item.concept || ""}" />
      </label>
      <label>
        Cantidad
        <input type="number" min="0" step="1" data-field="quantity" data-index="${index}" value="${item.quantity || 1}" />
      </label>
      <label>
        Precio unitario
        <input type="number" min="0" step="0.01" data-field="unit_price" data-index="${index}" value="${item.unit_price || 0}" />
      </label>
      <button type="button" class="quote-item-remove" data-remove-index="${index}">Quitar</button>
    `;
    el.quoteItemsList.appendChild(row);
  });

  el.quoteItemsList.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", handleQuoteItemChange);
  });

  el.quoteItemsList.querySelectorAll("[data-remove-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-remove-index"));
      state.quoteItems.splice(index, 1);
      renderQuoteItems();
      updateQuoteTotals();
    });
  });
}

function handleQuoteItemChange(event) {
  const field = event.target.getAttribute("data-field");
  const index = Number(event.target.getAttribute("data-index"));
  if (!field || Number.isNaN(index) || !state.quoteItems[index]) return;

  if (field === "concept") {
    state.quoteItems[index][field] = event.target.value;
  } else {
    state.quoteItems[index][field] = Number(event.target.value || 0);
  }

  updateQuoteTotals();
}

function calculateQuoteTotals() {
  const subtotal = state.quoteItems.reduce((sum, item) => {
    const qty = Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0;
    const price = Number.isFinite(Number(item.unit_price)) ? Number(item.unit_price) : 0;
    return sum + qty * price;
  }, 0);

  const taxRate = Number.isFinite(Number(el.quoteTaxRate.value)) ? Number(el.quoteTaxRate.value) : 0;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  return { subtotal, tax, total, taxRate };
}

function updateQuoteTotals() {
  const { subtotal, tax, total } = calculateQuoteTotals();
  const currency = el.quoteCurrency.value || "EUR";
  el.quoteSubtotal.textContent = fmtMoney(subtotal, currency);
  el.quoteTax.textContent = fmtMoney(tax, currency);
  el.quoteTotal.textContent = fmtMoney(total, currency);
}

async function saveQuote() {
  if (!state.selectedLead) return;

  el.quoteSaveBtn.disabled = true;
  el.quoteSaveBtn.classList.add("is-busy");
  setStatus(el.quoteSaveStatus, "Guardando borrador...");

  try {
    const payload = {
      title: el.quoteTitle.value,
      subtotal: calculateQuoteTotals().subtotal,
      tax: calculateQuoteTotals().tax,
      total: calculateQuoteTotals().total,
      currency: el.quoteCurrency.value || "EUR",
      billing_type: el.quoteBillingType.value || "monthly",
      billing_label: el.quoteBillingLabel.value,
      summary: el.quoteSummary.value,
      scope: el.quoteScope.value,
      body: el.quoteBody.value,
      assumptions: el.quoteAssumptions.value,
      items: state.quoteItems,
      tax_rate: calculateQuoteTotals().taxRate,
      status: "draft",
    };

    const data = await fetchJson(`${API_BASE}/leads/${state.selectedLead.id}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    renderQuote(data.quote || null);
    setStatus(el.quoteSaveStatus, "Borrador guardado.", "ok");
  } catch (error) {
    setStatus(el.quoteSaveStatus, `No se pudo guardar: ${error.message}`, "error");
  } finally {
    el.quoteSaveBtn.disabled = false;
    el.quoteSaveBtn.classList.remove("is-busy");
  }
}

async function sendQuote(via) {
  if (!state.selectedLead) return;

  const button =
    via === "email" ? el.quoteSendEmailBtn : el.quoteSendWhatsappBtn;
  const label = via === "email" ? "email" : "WhatsApp";

  button.disabled = true;
  button.classList.add("is-busy");
  setStatus(el.quoteSaveStatus, `Enviando por ${label}...`);

  try {
    const data = await fetchJson(`${API_BASE}/leads/${state.selectedLead.id}/quote/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ via }),
    });

    if (data?.quote) {
      renderQuote(data.quote);
      state.selectedLead = {
        ...state.selectedLead,
        quote_status: "sent",
      };
      state.leads = state.leads.map((lead) =>
        lead.id === state.selectedLead.id ? { ...lead, quote_status: "sent" } : lead
      );
      renderLeadTable();
      renderLeadDetail();
    }

    setStatus(el.quoteSaveStatus, `Propuesta enviada por ${label}.`, "ok");
  } catch (error) {
    setStatus(el.quoteSaveStatus, `No se pudo enviar por ${label}: ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.classList.remove("is-busy");
  }
}

async function generateAnalysis() {
  if (!state.selectedLead) return;

  el.analysisGenerateBtn.disabled = true;
  el.analysisGenerateBtn.classList.add("is-busy");
  setStatus(el.analysisSaveStatus, "Generando analisis...");

  try {
    const data = await fetchJson(`${API_BASE}/leads/${state.selectedLead.id}/analysis/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    renderAnalysis(data.analysis || null);
    setStatus(el.analysisSaveStatus, "Analisis generado.", "ok");
  } catch (error) {
    setStatus(el.analysisSaveStatus, `No se pudo generar: ${error.message}`, "error");
  } finally {
    el.analysisGenerateBtn.disabled = false;
    el.analysisGenerateBtn.classList.remove("is-busy");
  }
}

async function saveAnalysis() {
  if (!state.selectedLead?.id) return;

  const currentContent = state.selectedAnalysis?.content_json || {};
  const payload = {
    title: String(el.analysisEditTitle?.value || "").trim(),
    status: String(el.analysisEditStatus?.value || "draft").trim() || "draft",
    recommended_service: String(el.analysisEditRecommendedService?.value || "").trim(),
    content_json: {
      ...currentContent,
      headline: String(el.analysisEditHeadline?.value || "").trim(),
      summary: String(el.analysisEditSummary?.value || "").trim(),
      findings: parseAnalysisEditorList(el.analysisEditFindings?.value || ""),
      quick_wins: parseAnalysisEditorList(el.analysisEditQuickWins?.value || ""),
      priorities: parseAnalysisEditorList(el.analysisEditPriorities?.value || ""),
      next_step: String(el.analysisEditNextStep?.value || "").trim(),
      recommended_service: String(el.analysisEditRecommendedService?.value || "").trim(),
    },
  };

  el.analysisSaveBtn.disabled = true;
  el.analysisSaveBtn.classList.add("is-busy");
  setStatus(el.analysisSaveStatus, "Guardando analisis...");

  try {
    const data = await fetchJson(`${API_BASE}/leads/${state.selectedLead.id}/analysis`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    renderAnalysis(data.analysis || null);
    setStatus(el.analysisSaveStatus, "Analisis actualizado.", "ok");
  } catch (error) {
    setStatus(el.analysisSaveStatus, `No se pudo guardar: ${error.message}`, "error");
  } finally {
    el.analysisSaveBtn.disabled = false;
    el.analysisSaveBtn.classList.remove("is-busy");
  }
}

async function sendAnalysis() {
  if (!state.selectedLead?.id) return;

  el.analysisSendBtn.disabled = true;
  el.analysisSendBtn.classList.add("is-busy");
  setStatus(el.analysisSaveStatus, "Enviando analisis...");

  try {
    const data = await fetchJson(`${API_BASE}/leads/${state.selectedLead.id}/analysis/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    renderAnalysis(data.analysis || null);
    setStatus(el.analysisSaveStatus, "Analisis enviado por email.", "ok");
  } catch (error) {
    setStatus(el.analysisSaveStatus, `No se pudo enviar: ${error.message}`, "error");
  } finally {
    el.analysisSendBtn.disabled = false;
    el.analysisSendBtn.classList.remove("is-busy");
  }
}

async function copyToClipboard(value, successMessage, target = el.configWidgetInstallStatus) {
  try {
    await navigator.clipboard.writeText(String(value || ""));
    setStatus(target, successMessage, "ok");
  } catch (error) {
    setStatus(target, `No se pudo copiar: ${error.message}`, "error");
  }
}

el.saveBtn.addEventListener("click", saveLead);
el.deleteLeadBtn?.addEventListener("click", deleteSelectedLead);
el.refreshBtn.addEventListener("click", loadLeads);
el.accountSelect?.addEventListener("change", () =>
  handleAccountChange(el.accountSelect.value).catch((error) => {
    console.error(error);
  })
);
el.configSaveBtn.addEventListener("click", saveConfig);
el.configAddServiceBtn.addEventListener("click", () => {
  el.configServicesList.appendChild(createServiceEditorItem());
});
el.configSuggestServicesBtn?.addEventListener("click", suggestServicesFromSpreadsheet);
el.configSuggestPresetBtn?.addEventListener("click", suggestSectorPreset);
el.configSuggestSetupBtn?.addEventListener("click", suggestOnboardingSetup);
el.configLogoFile.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setStatus(el.configSaveStatus, "El logo debe ser una imagen valida.", "error");
    event.target.value = "";
    return;
  }

  el.configLogoFile.disabled = true;
  setStatus(el.configSaveStatus, "Subiendo logo...");

  try {
    const uploadedUrl = await uploadLogoAsset(file);
    if (!uploadedUrl) {
      throw new Error("No se pudo obtener la URL publica del logo.");
    }

    el.configLogoUrl.value = uploadedUrl;
    updateConfigLogoPreview(uploadedUrl);
    setStatus(el.configSaveStatus, "Logo subido. Guarda la configuracion para aplicarlo.", "ok");
  } catch (error) {
    setStatus(el.configSaveStatus, error.message, "error");
    event.target.value = "";
  } finally {
    el.configLogoFile.disabled = false;
  }
});
el.configLogoClearBtn.addEventListener("click", () => {
  el.configLogoUrl.value = "";
  if (el.configLogoFile) {
    el.configLogoFile.value = "";
  }
  updateConfigLogoPreview("");
  setStatus(el.configSaveStatus, "Logo eliminado de la configuracion actual.", "ok");
});
el.crmViewSalesBtn.addEventListener("click", () => setMainView("sales"));
el.crmViewAdminBtn?.addEventListener("click", () => setMainView("admin"));
el.crmViewConfigBtn.addEventListener("click", () => setMainView("config"));
el.adminCreateAccountBtn?.addEventListener("click", createAdminAccount);
el.logoutBtn?.addEventListener("click", logoutCrm);
el.configBackBtn?.addEventListener("click", () => setMainView("sales"));
el.crmLoginForm?.addEventListener("submit", loginCrm);
el.crmBootstrapForm?.addEventListener("submit", bootstrapAdmin);
el.crmAuthSwitchBtn?.addEventListener("click", () => {
  setAuthMode("login");
  setStatus(el.crmAuthStatus, "");
  el.crmLoginEmail.value = el.crmBootstrapEmail.value || "";
});
el.crmSalesLinks.forEach((link) =>
  link.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 980px)").matches && el.crmMobileControls) {
      el.crmMobileControls.open = false;
    }
  })
);
el.configAnalyzeWebsiteBtn.addEventListener("click", analyzeWebsiteConfig);
el.configPreviewContextBtn?.addEventListener("click", previewKnowledgeContext);
el.configValidateWhatsappBtn?.addEventListener("click", () =>
  validateIntegration("whatsapp", el.configValidateWhatsappBtn)
);
el.configValidateLeadFormsBtn?.addEventListener("click", () =>
  validateIntegration("lead_forms", el.configValidateLeadFormsBtn)
);
el.configValidateEmailBtn?.addEventListener("click", () =>
  validateIntegration("email", el.configValidateEmailBtn)
);
el.configValidateAutomationsBtn?.addEventListener("click", () =>
  validateIntegration("automations", el.configValidateAutomationsBtn)
);
el.configTabGeneral.addEventListener("click", () => setConfigTab("general"));
el.configTabKnowledge?.addEventListener("click", () => setConfigTab("knowledge"));
el.configTabMessages?.addEventListener("click", () => setConfigTab("messages"));
el.configTabAutomations?.addEventListener("click", () => setConfigTab("automations"));
el.configTabIntegrations.addEventListener("click", () => setConfigTab("integrations"));
el.configTabWebsite.addEventListener("click", () => setConfigTab("website"));
el.configProductMode?.addEventListener("change", () => {
  if (!el.configProductModeHint) return;
  updateProductModeUi({
    ...(state.appConfig || {}),
    product: {
      ...(state.appConfig?.product || {}),
      mode: el.configProductMode.value || "full_crm",
    },
  });
  el.configProductModeHint.textContent =
    el.configProductMode.value === "chat_only"
      ? "Esta cuenta solo vera configuracion del agente, integraciones y fuentes. El CRM comercial quedara fuera para el cliente."
      : "Esta cuenta vera captacion, pipeline, presupuestos, analitica y configuracion.";
  renderSetupHealth(buildConfigPayload());
});
el.configForm?.addEventListener("input", () => renderSetupHealth(buildConfigPayload()));
el.configForm?.addEventListener("change", () => renderSetupHealth(buildConfigPayload()));
el.configWidgetEmbedMode?.addEventListener("change", refreshWidgetInstallPreview);
el.configWidgetAllowedDomains?.addEventListener("input", refreshWidgetInstallPreview);
el.configWebsiteUrl?.addEventListener("input", refreshWidgetInstallPreview);
el.configKnowledgeStepPresetBtn?.addEventListener("click", () => scrollToKnowledgeTarget("configKnowledgeStepPreset"));
el.configKnowledgeStepServicesBtn?.addEventListener("click", () => scrollToKnowledgeTarget("configKnowledgeStepServices"));
el.configKnowledgeStepSourcesBtn?.addEventListener("click", () => scrollToKnowledgeTarget("configKnowledgeStepSources"));
el.configKnowledgeStepReviewBtn?.addEventListener("click", () => scrollToKnowledgeTarget("configKnowledgeStepReview"));
el.dateFilter.addEventListener("change", () => handleDateFilterChange(el.dateFilter.value));
el.mobileDateFilter?.addEventListener("change", () =>
  handleDateFilterChange(el.mobileDateFilter.value)
);
el.sourceFilter.addEventListener("change", () => {
  reloadSalesData();
});
el.serviceFilter.addEventListener("change", () => {
  reloadSalesData();
});
el.configKnowledgeWebsiteUrls?.addEventListener("input", updateKnowledgeUiHints);
el.configKnowledgeWebsiteFocus?.addEventListener("input", updateKnowledgeUiHints);
el.configKnowledgeSpreadsheetUrl?.addEventListener("input", updateKnowledgeUiHints);
el.configKnowledgeSpreadsheetData?.addEventListener("input", updateKnowledgeUiHints);
el.configKnowledgeSpreadsheetMapping?.addEventListener("input", updateKnowledgeUiHints);
el.configKnowledgeInternalNotes?.addEventListener("input", updateKnowledgeUiHints);
el.configKnowledgeSpreadsheetFile?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const lowerName = file.name.toLowerCase();
    const isSupportedDelimitedFile =
      file.type === "text/csv" ||
      file.type === "text/plain" ||
      file.type === "text/tab-separated-values" ||
      lowerName.endsWith(".csv") ||
      lowerName.endsWith(".tsv") ||
      lowerName.endsWith(".txt");

    if (!isSupportedDelimitedFile) {
      setStatus(
        el.configSaveStatus,
        "Por ahora la importacion directa admite CSV, TSV o TXT. Si vienes de Excel, exporta a uno de esos formatos o pega las filas en la tabla.",
        "error"
      );
    event.target.value = "";
    return;
  }

  try {
    await importKnowledgeSpreadsheetFile(file);
  } catch (error) {
    setStatus(el.configSaveStatus, error.message, "error");
  } finally {
    event.target.value = "";
  }
});
el.crmMobileConfigBtn?.addEventListener("click", () => setMainView("config"));
el.leadPrevBtn.addEventListener("click", () => {
  if (state.leadPage <= 0) return;
  state.leadPage -= 1;
  renderLeadTable();
});
el.leadNextBtn.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(state.filteredLeads.length / LEAD_PAGE_SIZE));
  if (state.leadPage >= totalPages - 1) return;
  state.leadPage += 1;
  renderLeadTable();
});
el.quoteAutofillBtn.addEventListener("click", autofillQuote);
el.quoteSaveBtn.addEventListener("click", saveQuote);
el.quotePreviewBtn.addEventListener("click", () => {
  if (!state.selectedLead?.id) return;
  window.open(withAccountScope(`/crm/quotes/${state.selectedLead.id}/preview`), "_blank", "noopener,noreferrer");
});
el.quotePdfBtn.addEventListener("click", () => {
  if (!state.selectedLead?.id) return;
  window.open(withAccountScope(`/crm/quotes/${state.selectedLead.id}/preview?print=1`), "_blank", "noopener,noreferrer");
});
el.quoteSendEmailBtn.addEventListener("click", () => sendQuote("email"));
el.quoteSendWhatsappBtn.addEventListener("click", () => sendQuote("whatsapp"));
el.analysisGenerateBtn?.addEventListener("click", generateAnalysis);
el.analysisSaveBtn?.addEventListener("click", saveAnalysis);
el.analysisPreviewBtn?.addEventListener("click", () => {
  if (!state.selectedLead?.id || !state.selectedAnalysis?.id) return;
  window.open(withAccountScope(`/crm/analysis/${state.selectedLead.id}/preview`), "_blank", "noopener,noreferrer");
});
el.analysisSendBtn?.addEventListener("click", sendAnalysis);
el.configCopyWidgetUrlBtn?.addEventListener("click", () => {
  copyToClipboard(el.configWidgetInstallUrl?.value || "", "URL del widget copiada.");
});
el.configCopyWidgetSnippetBtn?.addEventListener("click", () => {
  copyToClipboard(el.configWidgetSnippet?.value || "", "Script del widget copiado.");
});
el.configWidgetPreviewBtn?.addEventListener("click", () => {
  const account = getActiveAccount();
  if (!account?.id) {
    setStatus(el.configWidgetInstallStatus, "Selecciona primero una cuenta para generar la vista previa.", "error");
    return;
  }
  window.open(withAccountScope("/crm/widget-preview"), "_blank", "noopener,noreferrer");
});
el.quoteAddItemBtn.addEventListener("click", () => {
  state.quoteItems.push(createEmptyQuoteItem());
  renderQuoteItems();
  updateQuoteTotals();
});
el.quoteTaxRate.addEventListener("input", updateQuoteTotals);
el.quoteCurrency.addEventListener("input", updateQuoteTotals);
el.quoteBillingType.addEventListener("change", () => {
  const nextLabel = getBillingTypeLabel(el.quoteBillingType.value);
  if (!el.quoteBillingLabel.value.trim() || ["Mensual", "Pago unico", "Personalizado"].includes(el.quoteBillingLabel.value.trim())) {
    el.quoteBillingLabel.value = nextLabel;
  }
});
window.addEventListener("resize", syncMobileAdaptiveUi);

async function bootstrapCrm() {
  await loadAccounts();
  await Promise.all([loadLeads(), loadConfig(), loadAdminOverview()]);
}

async function startCrm() {
  if (el.mobileDateFilter && el.dateFilter) {
    el.mobileDateFilter.value = el.dateFilter.value;
  }
  syncMobileAdaptiveUi();

  const user = await hydrateCurrentUser();
  if (user) {
    setAuthenticatedUi(true);
    await bootstrapCrm();
    setMainView(getDefaultViewForRole());
    return;
  }

  setAuthenticatedUi(false);
  const needsBootstrap = await checkBootstrapStatus();
  setAuthMode(needsBootstrap ? "bootstrap" : "login");
}

startCrm().catch((error) => {
  setAuthenticatedUi(false);
  setStatus(el.crmAuthStatus, `No se pudo iniciar el CRM: ${error.message}`, "error");
  el.leadTableBody.innerHTML = `<tr><td colspan="8" class="empty">Error cargando CRM: ${error.message}</td></tr>`;
});
