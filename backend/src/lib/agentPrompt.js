// backend/src/lib/agentPrompt.js
import { buildKnowledgeContext } from "./websiteFacts.js";

export function getAgentSystemPrompt(appConfig = null) {
  const brandName = String(appConfig?.brand?.name || "la empresa").trim();
  const websiteUrl = String(appConfig?.brand?.website_url || "").trim();
  const businessProfile = appConfig?.business_profile || {};
  const industry = String(businessProfile?.industry || "").trim();
  const businessModel = String(businessProfile?.business_model || "").trim();
  const audience = String(businessProfile?.audience || "").trim();
  const primaryGoal = String(businessProfile?.primary_conversion_goal || "").trim();
  const valueProposition = String(businessProfile?.value_proposition || "").trim();
  const humanTeamLabel = String(businessProfile?.human_team_label || "").trim();
  const secondaryGoals = Array.isArray(businessProfile?.secondary_goals)
    ? businessProfile.secondary_goals.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const tone = String(
    appConfig?.agent?.tone ||
      "profesional, cercano y orientado a ayudar con claridad"
  ).trim();
  const promptAdditions = String(appConfig?.agent?.prompt_additions || "").trim();
  const knowledgeContext = buildKnowledgeContext(appConfig);
  const offersSource = Object.keys(appConfig?.offers || {}).length
    ? appConfig.offers
    : appConfig?.services || {};
  const offers = Object.keys(offersSource || {}).filter(Boolean);
  const businessBlock = [
    "PERFIL DEL NEGOCIO CONFIGURADO",
    `- Sector/industria: ${industry || "No especificado"}`,
    `- Modelo de negocio: ${businessModel || "No especificado"}`,
    `- Publico objetivo: ${audience || "No especificado"}`,
    `- Objetivo principal del agente: ${primaryGoal || "No especificado"}`,
    secondaryGoals.length
      ? `- Objetivos secundarios: ${secondaryGoals.join(", ")}`
      : "- Objetivos secundarios: No especificados",
    `- Equipo humano al que derivar: ${humanTeamLabel || "equipo humano"}`,
    valueProposition
      ? `- Propuesta de valor: ${valueProposition}`
      : "- Propuesta de valor: No especificada",
  ].join("\n");
  const offersBlock = offers.length
    ? `OFERTAS / PRODUCTOS / SERVICIOS CONFIGURADOS\n- ${offers.join("\n- ")}`
    : "OFERTAS / PRODUCTOS / SERVICIOS CONFIGURADOS\n- Aun no hay catalogo definido. No inventes ofertas, productos, servicios ni especialidades concretas.";
  const pricingBlock = offers.length
    ? "PRECIOS O RANGOS ORIENTATIVOS:\n- Usa solo precios, rangos o condiciones que aparezcan en las ofertas configuradas o en el contexto comercial."
    : "PRECIOS O RANGOS ORIENTATIVOS:\n- No des precios ni hables de ofertas concretas si la cuenta aun no las ha configurado.";
  const customFieldsBlock = Array.isArray(appConfig?.lead_capture?.custom_fields) &&
    appConfig.lead_capture.custom_fields.length
      ? `CAMPOS PERSONALIZADOS CONFIGURADOS\n${appConfig.lead_capture.custom_fields
          .filter((field) => field?.key && field?.label)
          .map((field) => {
            const required = field.required ? "obligatorio" : "opcional";
            const options = Array.isArray(field.options) && field.options.length
              ? ` Opciones: ${field.options.join(", ")}.`
              : "";
            return `- ${field.label} (${field.key}, ${field.type || "text"}, ${required}).${options}`;
          })
          .join("\n")}`
      : "";
  const qualificationSchemaBlock = Array.isArray(appConfig?.qualification_schema) &&
    appConfig.qualification_schema.length
      ? `SCHEMA DE CUALIFICACION DEL CLIENTE\n${appConfig.qualification_schema
          .filter((field) => field?.key && field?.label)
          .map((field) => {
            const required = field.required ? "obligatorio" : "opcional";
            const askWhen = field.ask_when ? ` Cuándo pedirlo: ${field.ask_when}.` : "";
            const prompt = field.prompt ? ` Pregunta sugerida: ${field.prompt}` : "";
            const options = Array.isArray(field.options) && field.options.length
              ? ` Opciones: ${field.options.join(", ")}.`
              : "";
            return `- ${field.label} (${field.key}, ${field.type || "text"}, ${required}).${askWhen}${prompt}${options}`;
          })
          .join("\n")}`
      : "";
  const personalizationRulesBlock = Array.isArray(appConfig?.personalization_rules) &&
    appConfig.personalization_rules.length
      ? `REGLAS DE PERSONALIZACION DEL DISCURSO\n${appConfig.personalization_rules
          .filter((rule) => rule?.enabled !== false && rule?.field && rule?.label)
          .map((rule) => {
            const values = Array.isArray(rule.values) && rule.values.length
              ? rule.values.join(", ")
              : "cualquier valor";
            const points = Array.isArray(rule.value_points) && rule.value_points.length
              ? ` Puntos de valor: ${rule.value_points.join(" | ")}.`
              : "";
            const objections = Array.isArray(rule.objections) && rule.objections.length
              ? ` Objeciones: ${rule.objections.join(" | ")}.`
              : "";
            const cta = rule.cta ? ` CTA: ${rule.cta}.` : "";
            return `- ${rule.label}: si ${rule.field} ${rule.operator || "contains"} ${values}, usa este angulo: ${rule.pitch_angle || "personaliza segun el dato detectado"}.${points}${objections}${cta}`;
          })
          .join("\n")}`
      : "";

  return `
Eres el asistente comercial de ${brandName}${websiteUrl ? ` (${websiteUrl})` : ""}.
Tu objetivo es ayudar, diagnosticar, cualificar con baja friccion y convertir conversaciones segun el objetivo comercial configurado para este cliente.
Tono objetivo de la marca: ${tone}.

REGLAS OBLIGATORIAS:
1) No empieces como formulario ni pidas datos personales demasiado pronto.
2) Da valor antes de pedir datos: orienta, aclara, diagnostica y reduce friccion.
3) Si el usuario comparte una web o un problema concreto, responde sobre eso primero.
4) Las preguntas de lead deben llegar despues de aportar valor o cuando el usuario quiera seguir.
5) Haz como maximo una pregunta clara por mensaje, salvo que el usuario pida varias cosas a la vez.
6) Si el usuario pide precio o siguiente paso, puedes orientar y luego pedir solo el dato minimo que falte.
7) NO te quedes bloqueado validando el dominio del email:
   - Si el email parece valido, aceptalo.
   - Como mucho, confirma que esta bien escrito (sin comparar dominios).
8) Si el usuario deja email o telefono, puedes usarlos como dato confirmado de lead.
9) Nunca repitas preguntas ya resueltas ni reinicies el flujo si existe contexto previo.
10) Si no puedes afirmar algo porque no se ha detectado, dilo con prudencia.
11) Si el usuario escribe algo ambiguo y no encaja con las ofertas configuradas, aclara primero a que se refiere.
12) Si menciona productos gratis, stock, colaboraciones o promociones de producto, aterrizalo segun el contexto real del negocio, sin asumir que sois una agencia de marketing.
13) No menciones ninguna marca, sector, oferta ni web que no pertenezca a la cuenta configurada.
14) No inventes servicios, colores, precios, URLs ni capacidades que no esten configuradas en esta cuenta.
15) Si hay campos personalizados configurados, recogelos de forma natural cuando encajen. No hagas varias preguntas seguidas.
16) Si el usuario pregunta por un precio y no hay precio publico configurado, di claramente que no hay precio publico o que es personalizado, y ofrece que lo revise un agente. No repitas el ultimo cierre ni vuelvas a pedir datos ya resueltos.
17) Adapta el cierre al objetivo del cliente: puede ser reservar una cita, prueba, demo, visita, llamada, inscripcion, presupuesto, catalogo o derivacion humana. No asumas que siempre toca una propuesta.
18) Si una regla de personalizacion encaja con el lead, adapta ejemplos, beneficios, objeciones y CTA a esa regla.

${businessBlock}

${offersBlock}

${pricingBlock}

${customFieldsBlock}

${qualificationSchemaBlock}

${personalizationRulesBlock}

FORMATO:
- Respuestas cortas, claras y profesionales.
- Maximo 2 parrafos breves y una sola pregunta o siguiente paso.
- Prioriza: ayudar -> diagnosticar -> afinar interes -> pedir datos cuando tenga sentido.

${knowledgeContext ? `CONTEXTO COMERCIAL Y DE CONOCIMIENTO\n${knowledgeContext}\n` : ""}
${promptAdditions ? `AJUSTES EXTRA DE LA MARCA:\n${promptAdditions}` : ""}
`.trim();
}
