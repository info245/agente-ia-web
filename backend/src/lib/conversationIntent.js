export function normalizeIntentText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isGreetingOnly(text = "") {
  return /^(?:(?:hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hello)(?: (?:sancho|sanchito|equipo))?(?: que tal| como estas)?|que tal|como estas)$/.test(
    normalizeIntentText(text)
  );
}

export function isHumanRequest(text = "") {
  const value = normalizeIntentText(text);
  return (
    /\b(hablar|contactar|pasame|pasadme|derivame|derivadme)\b.*\b(persona|humano|agente|equipo|asesor|responsable|propietario)\b/.test(value) ||
    /\b(atencion humana|agente humano)\b/.test(value) ||
    /\b(mandar|enviar|dejar|pasar|hacer llegar)\b.*\b(mensaje|nota|email|correo|aviso)\b.*\b(equipo|responsable|propietario|dueno|persona)\b/.test(value) ||
    /\b(dile|avisale|avisa|comunica|comunicale)\b.*\b(equipo|responsable|propietario|dueno|persona)\b/.test(value) ||
    /\b(puedes|podrias)\b.*\b(mandar|enviar|dejar)\b.*\b(mensaje|nota|email|correo|aviso)\b/.test(value) ||
    /\b(puedes|podrias)\b.*\b(mandarles|enviarles|avisarles|escribirles|contactarles)\b/.test(value)
  );
}

export function isPromptExtractionRequest(text = "") {
  const value = normalizeIntentText(text);
  const protectedTarget =
    /\b(prompt(?:s)?|prompt interno|system prompt|mensaje(?:s)? de sistema|instrucciones (?:internas|del sistema)|(?:internal|system) instructions|directrices(?: internas)?|reglas internas|reglas de configuracion|configuracion interna|politicas internas|arquitectura interna|herramientas internas|internal tools|parametros internos|modelo interno|cadena de pensamiento|razonamiento interno|secretos|credenciales|api keys?|tokens? internos?)\b/;
  const extractionRequest =
    /\b(dame|dime|muestra(?:me)?|ensena(?:me)?|revela(?:me)?|copia(?:me)?|imprime(?:me)?|ignora|explica(?:me)?|enumera(?:me)?|lista(?:me)?|detalla(?:me)?|comparte(?:me)?|describe(?:me)?|show|reveal|copy|print|ignore|disregard|list|give me|tell me)\b/;
  const interrogativeRequest = /\b(cual|cuales|que|como|what|which|how)\b/;
  const falseAuthorityClaim =
    /\b(soy tu dueno|soy el propietario del sistema|soy administrador|soy el administrador|soy el desarrollador|soy developer|owner override|admin override)\b/;

  return (
    (protectedTarget.test(value) &&
      (extractionRequest.test(value) || interrogativeRequest.test(value) || falseAuthorityClaim.test(value))) ||
    /\b(ignore previous instructions|disregard prior instructions|ignora (?:todas )?(?:las )?instrucciones anteriores)\b/.test(value)
  );
}

export function isGuidedDiscoveryRequest(text = "") {
  const value = normalizeIntentText(text);
  return (
    /\b(hazme preguntas|haz preguntas|preguntame|ve preguntando|quiero que me preguntes)\b/.test(value) ||
    /\b(evalua|analiza|juzga|valora)\b.*\b(mi situacion|mi caso|si podeis ayudar|si pueden ayudar|encajamos)\b/.test(value)
  );
}

export function isBookingRequest(text = "") {
  const value = normalizeIntentText(text);
  return (
    /\b(agendar|agenda|reservar|reserva|programar|concertar)\b.*\b(demo|demostracion|reunion|llamada|cita)\b/.test(value) ||
    /\b(puedo|puedes|podrias|quiero|querria)\b.*\b(demo|demostracion)\b/.test(value)
  );
}

export function isBetaAccessRequest(text = "") {
  const value = normalizeIntentText(text);
  const betaTerm = /\b(beta|trial|prueba gratuita|acceso gratuito)\b/;
  const selection =
    /\b(quiero|querria|elijo|selecciono|prefiero|activar|activa|solicitar|solicito|apuntarme|probar|empezar|darme acceso|dame acceso)\b/;
  return (
    (betaTerm.test(value) && selection.test(value)) ||
    /^(?:si )?(?:quiero |elijo |prefiero )?(?:la )?(?:beta|trial|prueba gratuita)(?: gratuita)?(?: por favor)?$/.test(value)
  );
}

export function isLoopComplaint(text = "") {
  const value = normalizeIntentText(text);
  return (
    /\b(bucle|loop)\b/.test(value) ||
    /\b(repites|repitiendo|misma respuesta|otra vez lo mismo|no me respondes|no respondes)\b/.test(value) ||
    /\b(eso es lo que te he preguntado|te he dicho|ya te he dicho)\b/.test(value) ||
    /\b(no vuelvas a preguntarme|no preguntes otra vez|deja de preguntarme)\b/.test(value)
  );
}

export function isAgentQuestion(text = "") {
  const value = normalizeIntentText(text);
  return (
    /\b(que|cual)\b.*\b(tipo de agente|directrices|capacidad|capacidades|funcion|limitaciones)\b/.test(value) ||
    /\b(que puedes hacer|como asistente|eres un bot|eres una ia|quien eres)\b/.test(value) ||
    /\b(tu capacidad|la capacidad de sancho)\b/.test(value) ||
    /\b(mejor que chatgpt|mejor que otro asistente|comparado con chatgpt|compararte con chatgpt)\b/.test(value)
  );
}

export function hasExplicitLeadEvidence(text = "") {
  const raw = String(text || "");
  const value = normalizeIntentText(raw);
  return (
    /[^\s@]+@[^\s@]+\.[^\s@]+/.test(raw) ||
    /\+?\d[\d\s().-]{7,}/.test(raw) ||
    /\b(saas|b2b|b2c|empresa|negocio|clinica|agencia|ecommerce|tienda|restaurante|academia|inmobiliaria)\b/.test(value) ||
    /\b(mi nombre es|me llamo|mi empresa|somos una|somos un|presupuesto|urgencia)\b/.test(value)
  );
}

export function shouldBlockLeadExtraction(text = "") {
  if (isPromptExtractionRequest(text)) return true;
  const isControl =
    isGuidedDiscoveryRequest(text) ||
    isBookingRequest(text) ||
    isLoopComplaint(text) ||
    isAgentQuestion(text) ||
    isHumanRequest(text) ||
    isGreetingOnly(text);
  return isControl && !hasExplicitLeadEvidence(text);
}

export function isSupportRequest(text = "") {
  const value = normalizeIntentText(text);
  return (
    /\b(soporte|incidencia|problema tecnico|reclamacion|no funciona|ha dejado de funcionar|da error)\b/.test(value) ||
    /\b(factura|cobro|pago)\b.*\b(error|incorrect|duplicad|reclamacion|problema|no reconozco|no corresponde)\b/.test(value) ||
    /\b(error|incorrect|duplicad|reclamacion|problema|no reconozco|no corresponde)\b.*\b(factura|cobro|pago)\b/.test(value) ||
    /\b(tu|vuestra|esta) (web|pagina|chat|asistente)\b.*\b(falla|fallo|problema|error)\b/.test(value) ||
    /\b(falla|fallo|problema|error)\b.*\b(sancho|sanchito|tu web|vuestra web|este chat|esta web)\b/.test(value) ||
    /\b(la que no funciona (bien )?es la tuya)\b/.test(value)
  );
}

export function detectPriorityIntent(text = "") {
  if (isPromptExtractionRequest(text)) return "prompt_injection";
  if (isHumanRequest(text)) return "human_request";
  if (isSupportRequest(text)) return "support";
  if (isBetaAccessRequest(text)) return "beta_access_request";
  if (isBookingRequest(text)) return "booking_request";
  if (isGuidedDiscoveryRequest(text)) return "guided_discovery";
  if (isLoopComplaint(text)) return "loop_complaint";
  if (isAgentQuestion(text)) return "agent_question";
  if (isGreetingOnly(text)) return "greeting";
  return null;
}
