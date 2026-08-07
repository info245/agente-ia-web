import { normalizeIntentText } from "./conversationIntent.js";

function isSanchoConfig(appConfig = null) {
  const brand = normalizeIntentText(appConfig?.brand?.name || "");
  const offers = Object.keys(appConfig?.offers || appConfig?.services || {});
  return brand.includes("sancho") || offers.some((offer) => normalizeIntentText(offer).includes("sancho"));
}

function sectorFrom({ message = "", lead = {} } = {}) {
  const text = normalizeIntentText([
    message,
    lead?.business_type,
    lead?.business_activity,
    lead?.current_situation,
  ].filter(Boolean).join(" "));
  if (/\b(ecommerce|e commerce|shopify|tienda online)\b/.test(text)) return "ecommerce";
  if (/\b(clinica|paciente|especialidad|recepcion)\b/.test(text)) return "clinic";
  if (/\b(inmobiliaria|inmueble|portal inmobiliario)\b/.test(text)) return "real_estate";
  if (/\b(restaurante|restauracion|reservas por local|cadena de restaurantes)\b/.test(text)) return "restaurant";
  if (/\b(agencia|clientes ecommerce|cuentas de clientes)\b/.test(text)) return "agency";
  if (/\b(saas|software as a service|go to market|gtm)\b/.test(text)) return "saas_b2b";
  if (/\b(industrial|distribuidor|feria|ciclo de venta)\b/.test(text)) return "industrial_b2b";
  return null;
}

function asksForUseCase(message = "", lead = {}) {
  const text = normalizeIntentText(message);
  return (
    /\b(caso de uso|aplica|aplicarias|asesorame|como funcionaria|como usaria|que haria)\b/.test(text) ||
    /\b(puede ayudarnos|podria ayudarnos|hay encaje|gtm|go to market)\b/.test(text) ||
    /\b(nuestro problema|mi problema|necesito comparar|quiero distinguir|no quiero otro dashboard)\b/.test(text) ||
    Boolean(lead?.interest_service && /\b(roas|margen|calidad|reserva|facturacion|prioridad|atencion|lead|ventas|marketing)\b/.test(text))
  );
}

export function buildSanchoUseCaseReply({ message = "", lead = {}, appConfig = null } = {}) {
  if (!isSanchoConfig(appConfig) || !asksForUseCase(message, lead)) return null;
  const sector = sectorFrom({ message, lead });
  const text = normalizeIntentText(message);

  if (sector === "ecommerce") {
    if (/\b(roas|margen|calidad de cliente|ltv|beneficio)\b/.test(text)) {
      return "En ese ecommerce, el caso útil no es mirar solo el ROAS: si se conectan los datos de Shopify y de las plataformas publicitarias, Sancho puede cruzar inversión, ventas, margen y calidad o recurrencia del cliente para priorizar campañas por beneficio real. No implica modificar campañas automáticamente; convierte esas señales en recomendaciones y prioridades revisables.";
    }
    return "Para ese ecommerce, un caso de uso sensato sería conectar —si las fuentes lo permiten— Shopify, Meta Ads y Google Ads para relacionar inversión, ventas, margen y calidad del cliente. Sancho interpretaría diferencias y anomalías y priorizaría qué revisar; no ejecutaría cambios de campaña sin una integración y aprobación específicas. ¿Dónde está hoy el dato de margen por pedido?";
  }

  if (sector === "clinic") {
    if (/\b(mal cualific|calidad|recepcion|solicitudes)\b/.test(text)) {
      return "El caso sería medir calidad, no solo volumen: cruzar cada solicitud con su fuente, especialidad, cita conseguida y valoración de recepción. Sancho podría detectar qué campañas generan solicitudes que realmente terminan en cita y priorizar los problemas por impacto, siempre que esos datos estén disponibles.";
    }
    return "Para una clínica, Sancho podría conectar señales de campañas, web y resultados de citas para comparar captación por especialidad, detectar anomalías y priorizar dónde actuar. No sustituye a recepción ni agenda citas por sí solo. ¿Podéis relacionar hoy cada solicitud con la cita finalmente conseguida?";
  }

  if (sector === "real_estate") {
    if (/\b(venden|vender|compran|comprar|solo preguntan|tipo de contacto|segment)\b/.test(text)) {
      return "Ese es un buen criterio operativo: etiquetar el tipo de contacto —vender, comprar o consulta exploratoria— y cruzarlo con portal de origen, inmueble o zona, avance comercial y resultado. Sancho podría mostrar qué fuentes aportan oportunidades reales y qué segmentos requieren atención; no respondería ni agendaría visitas automáticamente sin una integración específica.";
    }
    return "En una inmobiliaria, el caso de uso sería conectar, si hay acceso, los leads de portales y web con el estado que registra el equipo comercial. Sancho podría comparar calidad por fuente, zona y tipo de operación, detectar cambios y priorizar seguimientos; no gestiona propiedades ni agenda visitas por sí solo. ¿Dónde registráis actualmente el resultado de cada lead?";
  }

  if (sector === "restaurant") {
    if (/\b(reserva|facturacion|por local|no solo clics)\b/.test(text)) {
      return "Entonces el análisis debe bajar a negocio: por cada local, cruzar inversión y clics con reservas y facturación, comparando periodos y campañas. Con esas fuentes conectadas, Sancho podría señalar qué locales o campañas se desvían y qué revisión tiene mayor impacto; no crea ni modifica campañas automáticamente.";
    }
    return "Para una cadena de restaurantes, Sancho podría cruzar campañas locales con reservas y facturación por ubicación, detectar desviaciones y priorizar los locales que necesitan revisión. Eso exige conectar esas fuentes; no programa mensajes ni gestiona campañas por sí solo. ¿Reservas y facturación comparten ahora algún identificador de local?";
  }

  if (sector === "agency") {
    if (/\b(no quiero otro dashboard|atencion hoy|prioridad|priorizar|alerta)\b/.test(text)) {
      return "Ese es precisamente el enfoque útil: no otro dashboard, sino una cola diaria de cuentas priorizada por anomalía, impacto y urgencia. Sancho podría explicar qué cambió en cada cliente y proponer la siguiente revisión; cualquier acción sobre campañas seguiría requiriendo la integración y aprobación correspondientes.";
    }
    return "Para una agencia, el caso sería reunir señales de cada cuenta, detectar anomalías y ordenar qué clientes necesitan atención primero, con una explicación y una recomendación revisable. No envía campañas ni mensajes a clientes por sí solo. ¿Qué tres métricas determinan hoy que una cuenta necesita intervención?";
  }

  if (sector === "saas_b2b") {
    if (/\b(canal|oportunidad|probabilidad de cierre|pipeline|cierre)\b/.test(text)) {
      return "Para responder a eso, habría que conectar cada canal y campaña con las oportunidades, etapas y cierres del proceso comercial. Sancho podría comparar no solo volumen de leads, sino calidad, avance y probabilidad de cierre observada para priorizar el GTM con evidencia; no decidiría el presupuesto automáticamente.";
    }
    return "Podría haber encaje para ese GTM si Sancho puede conectar las señales de captación con oportunidades y resultados comerciales. El caso de uso sería detectar qué canales y segmentos avanzan, explicar cambios y priorizar decisiones durante el lanzamiento, sin prometer encaje antes de revisar las fuentes disponibles. ¿Qué resultado queréis conseguir en los primeros 90 días?";
  }

  if (sector === "industrial_b2b") {
    if (/\b(distribuidor|feria|marketing|ventas)\b/.test(text)) {
      return "En ese modelo B2B conviene tratar campañas, distribuidores y ferias como fuentes distintas y conectarlas con oportunidades y avance comercial. Sancho podría comparar calidad, tiempo hasta oportunidad y contribución al pipeline para priorizar inversión y seguimiento, sin atribuir una venta larga a un único clic.";
    }
    return "Con un ciclo industrial de nueve meses, el caso no debe medir solo leads inmediatos: Sancho podría conectar origen, oportunidad, etapa comercial y avance del pipeline para detectar cuellos de botella y priorizar acciones durante el ciclo. ¿En qué sistema registráis las etapas y el valor de las oportunidades?";
  }

  return null;
}

export const __sanchoUseCasesTestables = {
  asksForUseCase,
  sectorFrom,
};
