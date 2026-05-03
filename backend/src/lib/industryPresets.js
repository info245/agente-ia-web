export const INDUSTRY_PRESETS = {
  language_academy: {
    label: "Academia de idiomas",
    business_profile: {
      industry: "language_academy",
      business_model: "classes_and_courses",
      audience: "alumnos adultos, familias y empresas que buscan aprender idiomas",
      primary_conversion_goal: "book_level_test",
      secondary_goals: ["send_course_info", "capture_lead", "handoff_admissions"],
      sales_cycle: "short_consultative",
      human_team_label: "equipo de admisiones",
      value_proposition:
        "Orientar al alumno hacia el curso adecuado y facilitar la reserva de una prueba de nivel.",
    },
    offers: {
      "Cursos de ingles": {
        category: "idiomas",
        description:
          "Cursos de ingles para distintos niveles, objetivos y modalidades.",
        conversion_goal: "book_level_test",
      },
      "Preparacion de examenes": {
        category: "certificaciones",
        description:
          "Preparacion para examenes oficiales y objetivos academicos o profesionales.",
        conversion_goal: "book_level_test",
      },
      "Clases para empresas": {
        category: "formacion_empresas",
        description:
          "Programas de idiomas para equipos y empresas adaptados a nivel y disponibilidad.",
        conversion_goal: "handoff_admissions",
      },
    },
    qualification_schema: [
      {
        key: "language",
        label: "idioma de interes",
        type: "select",
        required: true,
        ask_when: "despues de detectar interes en cursos o informacion",
        prompt: "Que idioma te interesa aprender?",
        options: ["ingles", "frances", "aleman", "otro"],
      },
      {
        key: "student_type",
        label: "tipo de alumno",
        type: "select",
        required: true,
        ask_when: "antes de recomendar curso",
        prompt: "Es para un adulto, un nino/adolescente o una empresa?",
        options: ["adulto", "nino/adolescente", "empresa"],
      },
      {
        key: "current_level",
        label: "nivel actual",
        type: "select",
        required: true,
        ask_when: "antes de hablar de grupos, horarios o precio",
        prompt: "Sabes mas o menos tu nivel actual?",
        options: ["inicio", "basico", "intermedio", "avanzado", "no lo se"],
      },
      {
        key: "learning_goal",
        label: "objetivo del alumno",
        type: "select",
        required: true,
        ask_when: "para personalizar la recomendacion",
        prompt: "Tu objetivo es conversacion, trabajo, examen, viaje o refuerzo?",
        options: ["conversacion", "trabajo", "examen", "viaje", "refuerzo"],
      },
      {
        key: "availability",
        label: "disponibilidad horaria",
        type: "text",
        required: true,
        ask_when: "antes de ofrecer prueba o clase",
        prompt: "Que horarios te vendrian mejor?",
      },
    ],
    sales_scoring: {
      hot_intents: ["booking", "human_request"],
      warm_intents: ["pricing", "contact", "information"],
      hot_max_missing_required_fields: 0,
      pricing_hot_max_missing_required_fields: 1,
      warm_max_missing_required_fields_with_contact: 2,
      contact_makes_warm: true,
    },
    personalization_rules: [
      {
        key: "academy_company_student",
        label: "Alumno empresa",
        field: "custom.student_type",
        operator: "contains",
        values: ["empresa"],
        pitch_angle:
          "Enfatiza formacion para equipos, adaptacion a horarios laborales, objetivos profesionales y seguimiento del progreso.",
        value_points: [
          "Programa adaptado por nivel y disponibilidad del equipo",
          "Objetivos practicos para reuniones, llamadas o comunicacion profesional",
          "Prueba de nivel para segmentar grupos sin friccion",
        ],
        objections: ["No sabemos el nivel del equipo", "Hay poco tiempo disponible"],
        cta: "Proponer una prueba de nivel o una llamada corta con admisiones.",
        priority: 80,
        enabled: true,
      },
      {
        key: "academy_exam_goal",
        label: "Objetivo examen",
        field: "custom.learning_goal",
        operator: "contains",
        values: ["examen"],
        pitch_angle:
          "Enfatiza preparacion con objetivo concreto, nivel actual, plazo y plan de estudio.",
        value_points: [
          "Orientacion segun examen y fecha objetivo",
          "Plan por nivel actual y disponibilidad",
          "Prueba de nivel para recomendar grupo o preparacion",
        ],
        objections: ["No se si llego a tiempo", "No se mi nivel actual"],
        cta: "Reservar prueba de nivel y revisar plazo del examen.",
        priority: 70,
        enabled: true,
      },
    ],
    actions_catalog: {
      offer_level_test: {
        type: "calendar_booking",
        label: "Reservar prueba de nivel",
        description:
          "Ofrecer o reservar una prueba de nivel para recomendar el curso adecuado.",
        required_fields: [
          "name",
          "phone_or_email",
          "custom.language",
          "custom.student_type",
          "custom.current_level",
          "custom.learning_goal",
          "custom.availability",
        ],
        channel: "preferred",
        enabled: true,
        metadata: {
          owner_label: "equipo de admisiones",
          instructions:
            "Contactar al alumno para confirmar disponibilidad y cerrar la prueba de nivel.",
        },
      },
      send_course_info: {
        type: "send_information",
        label: "Enviar informacion del curso",
        description: "Enviar informacion del curso adecuado segun idioma y objetivo.",
        required_fields: ["phone_or_email", "custom.language", "custom.learning_goal"],
        channel: "preferred",
        template_key: "course_info",
        enabled: true,
      },
      handoff_human: {
        type: "human_handoff",
        label: "Derivar a admisiones",
        description: "Derivar al equipo de admisiones con el contexto del alumno.",
        required_fields: ["name", "phone_or_email"],
        channel: "preferred",
        enabled: true,
        metadata: {
          owner_label: "equipo de admisiones",
          instructions: "Revisar contexto del alumno y responder con el siguiente paso.",
        },
      },
    },
    message_templates: {
      course_info: {
        channel: "whatsapp",
        label: "Informacion de curso",
        subject: "Informacion sobre tu curso de {language}",
        body:
          "Hola {nombre}, te envio informacion inicial para orientarte con {language}. Por lo que nos has contado, tu objetivo principal es {learning_goal}. El siguiente paso recomendado es hacer una prueba de nivel para proponerte grupo, modalidad y horarios con mas precision. Si te encaja, te ayudo a reservarla.",
      },
    },
  },
  clinic: {
    label: "Clinica o centro medico",
    business_profile: {
      industry: "clinic",
      business_model: "appointments",
      audience: "pacientes que buscan informacion, orientacion o primera visita",
      primary_conversion_goal: "book_first_visit",
      secondary_goals: ["send_treatment_info", "handoff_reception"],
      sales_cycle: "short_trust_based",
      human_team_label: "equipo de atencion al paciente",
      value_proposition:
        "Resolver dudas iniciales con claridad y facilitar una primera visita con baja friccion.",
    },
    offers: {
      "Primera visita": {
        category: "cita",
        description:
          "Primera valoracion con el equipo de la clinica para orientar el tratamiento o siguiente paso.",
        conversion_goal: "book_first_visit",
      },
      Tratamientos: {
        category: "salud",
        description:
          "Tratamientos y servicios clinicos configurables segun la especialidad del centro.",
        conversion_goal: "book_first_visit",
      },
    },
    qualification_schema: [
      {
        key: "treatment_interest",
        label: "tratamiento o necesidad",
        type: "text",
        required: true,
        ask_when: "al inicio, despues de responder la duda principal",
        prompt: "Que tratamiento o necesidad te gustaria valorar?",
      },
      {
        key: "urgency_level",
        label: "urgencia",
        type: "select",
        required: true,
        ask_when: "si el usuario menciona dolor, molestia o plazo",
        prompt: "Te corre prisa o puedes verlo con calma?",
        options: ["urgente", "esta semana", "sin prisa"],
      },
      {
        key: "preferred_day_time",
        label: "disponibilidad",
        type: "text",
        required: true,
        ask_when: "antes de pasar a cita",
        prompt: "Que dia u horario te vendria mejor para la primera visita?",
      },
    ],
    sales_scoring: {
      hot_intents: ["booking", "human_request"],
      warm_intents: ["pricing", "contact"],
      hot_max_missing_required_fields: 0,
      pricing_hot_max_missing_required_fields: 0,
      warm_max_missing_required_fields_with_contact: 1,
      contact_makes_warm: true,
    },
    personalization_rules: [
      {
        key: "clinic_urgent_need",
        label: "Necesidad urgente",
        field: "custom.urgency_level",
        operator: "contains",
        values: ["urgente", "esta semana"],
        pitch_angle:
          "Prioriza tranquilidad, rapidez de orientacion y primera visita con el equipo adecuado, sin prometer diagnosticos.",
        value_points: [
          "Resolver dudas iniciales con claridad",
          "Buscar hueco de primera visita lo antes posible",
          "Derivar a recepcion si hace falta revisar disponibilidad",
        ],
        objections: ["Me preocupa que sea urgente", "No se que tratamiento necesito"],
        cta: "Pedir contacto y disponibilidad para gestionar la primera visita.",
        priority: 90,
        enabled: true,
      },
    ],
    actions_catalog: {
      book_first_visit: {
        type: "calendar_booking",
        label: "Reservar primera visita",
        description:
          "Ofrecer o reservar una primera visita con el equipo de la clinica.",
        required_fields: [
          "name",
          "phone_or_email",
          "custom.treatment_interest",
          "custom.urgency_level",
          "custom.preferred_day_time",
        ],
        channel: "preferred",
        enabled: true,
        metadata: {
          owner_label: "equipo de atencion al paciente",
          instructions:
            "Confirmar disponibilidad, resolver dudas finales y cerrar primera visita.",
        },
      },
      send_treatment_info: {
        type: "send_information",
        label: "Enviar informacion del tratamiento",
        description:
          "Enviar informacion inicial sobre el tratamiento o necesidad consultada.",
        required_fields: ["phone_or_email", "custom.treatment_interest"],
        channel: "preferred",
        template_key: "treatment_info",
        enabled: true,
      },
      handoff_human: {
        type: "human_handoff",
        label: "Derivar a atencion al paciente",
        description: "Derivar al equipo de atencion al paciente.",
        required_fields: ["name", "phone_or_email"],
        channel: "preferred",
        enabled: true,
        metadata: {
          owner_label: "equipo de atencion al paciente",
          instructions: "Contactar al paciente con el contexto recogido por el agente.",
        },
      },
    },
    message_templates: {
      treatment_info: {
        channel: "whatsapp",
        label: "Informacion de tratamiento",
        subject: "Informacion sobre {treatment_interest}",
        body:
          "Hola {nombre}, te comparto una primera orientacion sobre {treatment_interest}. Para darte una recomendacion fiable, lo adecuado es valorar tu caso en una primera visita y resolver dudas con el equipo clinico. Si quieres, te ayudo a encontrar un horario.",
      },
    },
  },
  real_estate: {
    label: "Inmobiliaria",
    business_profile: {
      industry: "real_estate",
      business_model: "property_leads",
      audience: "compradores, vendedores, inquilinos o propietarios",
      primary_conversion_goal: "qualify_property_lead",
      secondary_goals: ["schedule_visit", "handoff_agent", "send_listing_info"],
      sales_cycle: "medium_consultative",
      human_team_label: "asesor inmobiliario",
      value_proposition:
        "Cualificar la operacion inmobiliaria y conectar al lead con el asesor adecuado.",
    },
    offers: {
      Compra: {
        category: "comprador",
        description: "Ayuda para encontrar inmueble segun zona, presupuesto y necesidades.",
        conversion_goal: "handoff_agent",
      },
      Venta: {
        category: "propietario",
        description: "Valoracion y gestion de venta de inmuebles.",
        conversion_goal: "handoff_agent",
      },
      Alquiler: {
        category: "inquilino",
        description: "Busqueda o gestion de inmuebles en alquiler.",
        conversion_goal: "send_listing_info",
      },
    },
    qualification_schema: [
      {
        key: "operation_type",
        label: "tipo de operacion",
        type: "select",
        required: true,
        ask_when: "al detectar interes inmobiliario",
        prompt: "Quieres comprar, vender o alquilar?",
        options: ["comprar", "vender", "alquilar"],
      },
      {
        key: "area",
        label: "zona",
        type: "text",
        required: true,
        ask_when: "antes de recomendar o derivar",
        prompt: "En que zona estas buscando o donde esta el inmueble?",
      },
      {
        key: "property_budget",
        label: "presupuesto o valor estimado",
        type: "text",
        required: false,
        ask_when: "si es comprador o vendedor y ya hay interes claro",
        prompt: "Tienes un presupuesto aproximado o valor estimado?",
      },
      {
        key: "timeline",
        label: "plazo",
        type: "select",
        required: true,
        ask_when: "para priorizar el seguimiento",
        prompt: "Quieres moverlo pronto o estas mirando sin prisa?",
        options: ["urgente", "1-3 meses", "sin prisa"],
      },
    ],
    sales_scoring: {
      hot_intents: ["booking", "human_request"],
      warm_intents: ["pricing", "contact", "information"],
      hot_max_missing_required_fields: 0,
      pricing_hot_max_missing_required_fields: 1,
      warm_max_missing_required_fields_with_contact: 1,
      contact_makes_warm: true,
    },
    personalization_rules: [
      {
        key: "property_seller",
        label: "Propietario vendedor",
        field: "custom.operation_type",
        operator: "contains",
        values: ["vender"],
        pitch_angle:
          "Enfatiza valoracion, plazo de venta, zona del inmueble y contacto con asesor para priorizar la oportunidad.",
        value_points: [
          "Valoracion inicial segun zona y tipo de inmueble",
          "Asesoramiento sobre plazo y estrategia de venta",
          "Derivacion con contexto para evitar repetir datos",
        ],
        objections: ["No se cuanto vale mi inmueble", "No quiero perder tiempo"],
        cta: "Pedir zona, plazo y contacto para que el asesor revise el caso.",
        priority: 80,
        enabled: true,
      },
      {
        key: "property_buyer",
        label: "Comprador",
        field: "custom.operation_type",
        operator: "contains",
        values: ["comprar"],
        pitch_angle:
          "Enfatiza zona, presupuesto, necesidades y envio de opciones o visita con asesor.",
        value_points: [
          "Filtrar inmuebles por zona y necesidad real",
          "Evitar propuestas irrelevantes",
          "Agendar visita o derivar a asesor con contexto",
        ],
        objections: ["No encuentro opciones que encajen", "No tengo claro presupuesto"],
        cta: "Pedir zona y contacto para enviar opciones o coordinar asesor.",
        priority: 70,
        enabled: true,
      },
    ],
    actions_catalog: {
      handoff_agent: {
        type: "human_handoff",
        label: "Derivar a asesor inmobiliario",
        description:
          "Pasar el lead a un asesor con operacion, zona, plazo y contexto.",
        required_fields: [
          "name",
          "phone_or_email",
          "custom.operation_type",
          "custom.area",
          "custom.timeline",
        ],
        channel: "preferred",
        enabled: true,
        metadata: {
          owner_label: "asesor inmobiliario",
          instructions:
            "Contactar al lead con operacion, zona, plazo y contexto para priorizar seguimiento.",
        },
      },
      schedule_visit: {
        type: "calendar_booking",
        label: "Agendar visita",
        description: "Agendar visita o llamada con asesor inmobiliario.",
        required_fields: ["name", "phone_or_email", "custom.operation_type", "custom.area"],
        channel: "preferred",
        enabled: true,
        metadata: {
          owner_label: "asesor inmobiliario",
          instructions: "Proponer visita o llamada segun zona y tipo de operacion.",
        },
      },
      send_listing_info: {
        type: "send_information",
        label: "Enviar inmuebles o informacion",
        description: "Enviar informacion de inmuebles o siguiente paso por zona.",
        required_fields: ["phone_or_email", "custom.operation_type", "custom.area"],
        channel: "preferred",
        template_key: "listing_info",
        enabled: true,
      },
    },
    message_templates: {
      listing_info: {
        channel: "whatsapp",
        label: "Informacion inmobiliaria",
        subject: "Informacion sobre {operation_type} en {area}",
        body:
          "Hola {nombre}, te envio informacion inicial sobre tu consulta de {operation_type} en {area}. Con estos datos ya podemos filtrar mejor y proponerte el siguiente paso: enviarte opciones relevantes o pasarte con un asesor para afinar zona, plazo y presupuesto.",
      },
    },
  },
};

export function listIndustryPresets() {
  return Object.entries(INDUSTRY_PRESETS).map(([key, preset]) => ({
    key,
    label: preset.label,
    business_profile: preset.business_profile,
  }));
}

export function getIndustryPreset(key) {
  return INDUSTRY_PRESETS[String(key || "").trim()] || null;
}
