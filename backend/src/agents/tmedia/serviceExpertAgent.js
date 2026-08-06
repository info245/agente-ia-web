import { openai } from "../../lib/openaiClient.js";
import { getServiceFacts } from "../tools/websiteKbTools.js";
import { compactString } from "../core/agentResponseSchema.js";
import { extractLeadDataFromText } from "../../lib/leadExtractor.js";
import {
  getLeadRequirementPrompt,
  getMissingLeadRequirements,
} from "../../lib/leadRequirements.js";

function configuredOffers(appConfig = null) {
  const offersSource = Object.keys(appConfig?.offers || {}).length
    ? appConfig.offers
    : appConfig?.services || {};
  return Object.keys(offersSource || {}).filter(Boolean);
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isPricingQuestion(value = "") {
  const t = normalizeText(value);
  const asksPrice =
    /\b(precio|precios|cuanto|cuesta|vale|tarifa|tarifas|coste|costes|paquete|paquetes|pricing|plan|planes|setup|trial|demo)\b/.test(t);
  const asksBudget =
    /\b(presupuesto|inversion)\b/.test(t) &&
    /\b(cuanto|que|necesita|recomendada|minima|minimo|para empezar|para probar|demo|trial|plan|precio|cuesta)\b/.test(t);
  return asksPrice || asksBudget;
}

function isProofOrGuaranteeQuestion(value = "") {
  const t = normalizeText(value);
  return (
    /\b(hechos|demostrable|demostrables|garantiz|garantia|garantias|asegurar|seguro|certeza|fiar|confianza|resultados reales)\b/.test(t) ||
    /\b(cada dia|todos los dias|nuevos clientes|llegarian nuevos clientes|llegan nuevos clientes)\b/.test(t)
  );
}

function isCapabilityQuestion(value = "") {
  return /\b(integrar|integracion|conectar|compatible|api|mcp|webhook|erp|crm)\b/.test(
    normalizeText(value)
  );
}

function hasCapabilityEvidence(message = "", factsText = "") {
  const evidence = normalizeText(factsText);
  if (!evidence) return false;
  const generic = new Set([
    "puedo", "puede", "usar", "propio", "como", "integra", "integrar", "integracion",
    "conectar", "compatible", "api", "mcp", "webhook", "erp", "crm", "sistema", "datos",
  ]);
  const entities = normalizeText(message)
    .split(" ")
    .filter((word) => word.length >= 4 && !generic.has(word));
  return entities.length > 0 && entities.some((entity) => evidence.includes(entity));
}

function guardCapabilityReply({ message = "", reply = "", factsText = "" } = {}) {
  if (!isCapabilityQuestion(message) || hasCapabilityEvidence(message, factsText)) return reply;
  const claimsAvailability = /\b(si|claro|por supuesto|es posible|se puede|permite|compatible|se integra|se conecta|mediante)\b/.test(
    normalizeText(reply)
  );
  if (!claimsAvailability) return reply;
  return "Con la información configurada no puedo confirmar que esa integración esté disponible tal cual. La vía habitual sería validar la API o los webhooks del sistema; MCP solo sería una opción si existe y se configura un conector específico. Antes de prometerlo, hay que comprobar la versión y el entorno que utilizas.";
}

function getConfiguredOfferEntries(appConfig = null) {
  const offersSource = Object.keys(appConfig?.offers || {}).length
    ? appConfig.offers
    : appConfig?.services || {};
  return Object.entries(offersSource || {}).filter(([name]) => Boolean(name));
}

function buildProofReply({ service, facts = {}, lead = {}, appConfig = null } = {}) {
  const brandName = String(appConfig?.brand?.name || "nuestro equipo").trim();
  const serviceName = service && service !== "servicio" && service !== "unknown"
    ? service
    : "SEO";
  const normalizedService = normalizeText(serviceName);
  const priceText = getPriceText(facts);
  const context = [
    lead?.main_goal ? `objetivo: ${lead.main_goal}` : null,
    lead?.business_activity || lead?.current_situation
      ? `contexto: ${lead.business_activity || lead.current_situation}`
      : null,
  ].filter(Boolean);
  const contextLine = context.length ? `Con lo que me has contado (${context.join("; ")}), ` : "";
  const priceLine = priceText ? ` En ${brandName}, ${serviceName} parte ${priceText}.` : "";
  let measurableFacts =
    "posiciones en Google, trafico organico, consultas recibidas, llamadas/formularios y evolucion frente al punto de partida";
  let approach =
    "trabajar busquedas de zona, ficha de Google, paginas por servicio/localidad y conversiones, y medirlo mes a mes";

  if (normalizedService.includes("google ads")) {
    measurableFacts =
      "impresiones, clics, coste por clic, conversiones, llamadas/formularios, coste por lead y terminos de busqueda que activan los anuncios";
    approach =
      "definir campanas por zona y servicio, medir conversiones reales, revisar terminos de busqueda y ajustar presupuesto segun coste por lead";
  } else if (normalizedService.includes("redes")) {
    measurableFacts =
      "alcance, clics, CTR, leads recibidos, coste por lead, rendimiento por creatividad y calidad de los formularios";
    approach =
      "probar audiencias y creatividades, medir formularios o mensajes recibidos y optimizar lo que genera contactos reales";
  } else if (normalizedService.includes("diseno") || normalizedService.includes("diseno")) {
    measurableFacts =
      "velocidad, experiencia movil, tasa de conversion, formularios enviados, llamadas, eventos de analitica y comportamiento en paginas clave";
    approach =
      "mejorar estructura, mensajes, llamadas a la accion y medicion para que la web convierta mejor el trafico existente";
  } else if (normalizedService.includes("consultoria")) {
    measurableFacts =
      "rendimiento por canal, coste por lead, conversiones, calidad de contactos, embudos, inversiones y prioridades detectadas";
    approach =
      "auditar canales, detectar fugas, priorizar acciones por impacto y construir un plan medible con responsables y plazos";
  }

  return `${contextLine}lo honesto es esto: no se puede prometer que cada dia entren clientes nuevos solo por contratar ${serviceName}. Lo que si se puede demostrar y revisar son hechos medibles: ${measurableFacts}. El enfoque seria ${approach}.${priceLine} Si alguien te garantiza clientes diarios, te estaria prometiendo algo que no controla.`;
}

function getPriceText(facts = {}) {
  if (Array.isArray(facts?.pricing_plans) && facts.pricing_plans.length) {
    return facts.pricing_plans
      .slice(0, 5)
      .map((plan) => {
        const monthlyLabel = String(plan.monthly_price || "").trim();
        const parts = [
          monthlyLabel
            ? /mes|mensual/i.test(monthlyLabel)
              ? monthlyLabel
              : `${monthlyLabel}/mes`
            : "",
          plan.annual_price ? `anual: ${plan.annual_price}` : "",
          plan.setup ? `setup: ${plan.setup}` : "",
          plan.trial_days ? `prueba: ${plan.trial_days} dias` : "",
          plan.notes ? plan.notes : "",
        ].filter(Boolean);
        return `${plan.plan}${parts.length ? ` (${parts.join("; ")})` : ""}`;
      })
      .join("; ");
  }
  const monthly = facts?.min_monthly_fee || facts?.monthly_fee || "";
  const project = facts?.min_project_fee || facts?.project_fee || "";
  const price = facts?.price || facts?.fee || "";
  if (monthly && project) return `desde ${monthly} al mes o ${project} por proyecto, segun alcance`;
  if (monthly) return `desde ${monthly} al mes`;
  if (project) return `desde ${project} por proyecto`;
  if (price) return String(price);
  return "";
}

function buildPricingReply({ service, facts = {}, appConfig = null } = {}) {
  const knownService = service && service !== "servicio" && service !== "unknown";
  const priceText = getPriceText(facts);

  if (knownService && priceText) {
    if (Array.isArray(facts?.pricing_plans) && facts.pricing_plans.length) {
      return `Estos son los paquetes configurados de ${service}: ${priceText}. Si quieres, dime tu caso y te ayudo a elegir el plan que encaja mejor.`;
    }
    return `${service} parte ${priceText}. Si quieres, dime en una frase que quieres conseguir y te digo que opcion encaja mejor.`;
  }

  const pricedOffers = getConfiguredOfferEntries(appConfig)
    .map(([name, offerFacts]) => ({ name, priceText: getPriceText(offerFacts) }))
    .filter((offer) => offer.priceText)
    .slice(0, 5);

  if (knownService) {
    return `Ahora mismo no tengo un precio publico configurado para ${service}. Lo correcto es tratarlo como precio personalizado para no inventarte una cifra. Si quieres, puedo pasarlo a una persona para que te confirme el importe.`;
  }

  if (pricedOffers.length) {
    const summary = pricedOffers
      .map((offer) => `${offer.name}: ${offer.priceText}`)
      .join("; ");
    return `Estos son los precios orientativos configurados: ${summary}. Que servicio quieres valorar exactamente?`;
  }

  return "Ahora mismo no tengo un precio publico configurado. Lo correcto es tratarlo como precio personalizado para no inventarte una cifra. Si quieres, puedo pasarlo a una persona para que te confirme el importe.";
}

function normalizeServiceName(service = "", lead = {}, appConfig = null) {
  const brandName = String(appConfig?.brand?.name || "").trim();
  const offers = configuredOffers(appConfig);
  if (offers.length === 1) return offers[0];
  const brandOffer = offers.find((offer) => normalizeText(offer) === normalizeText(brandName));
  if (brandOffer) return brandOffer;

  const raw = normalizeText(service || lead?.interest_service || "");
  const exactMatch = offers.find((offer) => normalizeText(offer) === raw);
  if (exactMatch) return exactMatch;

  const partialMatch = offers.find((offer) => {
    const normalizedOffer = normalizeText(offer);
    return normalizedOffer && (raw.includes(normalizedOffer) || normalizedOffer.includes(raw));
  });
  if (partialMatch) return partialMatch;

  return lead?.interest_service || service || "servicio";
}

function shouldForceServicePatch(service = "", appConfig = null) {
  const brandName = String(appConfig?.brand?.name || "").trim();
  const offers = configuredOffers(appConfig);
  return (
    offers.length === 1 ||
    offers.some((offer) => normalizeText(offer) === normalizeText(brandName))
  ) && offers.some((offer) => offer === service);
}

function buildContextLeadPatch({ context = {}, contextualLead = {}, service = "" } = {}) {
  const patch = {};
  if (service !== "servicio" && service !== "unknown" && !context.lead?.interest_service) {
    patch.interest_service = service;
  }
  for (const field of [
    "main_goal", "business_type", "business_activity", "company_name",
    "budget_range", "urgency", "email", "phone", "current_situation", "pain_points",
  ]) {
    if (!context.lead?.[field] && contextualLead?.[field]) patch[field] = contextualLead[field];
  }
  return patch;
}

function nextConfiguredConversionHint(lead = {}, appConfig = null) {
  const nextMissing = getMissingLeadRequirements(lead, appConfig)[0];
  if (nextMissing) return getLeadRequirementPrompt(nextMissing, appConfig);
  return "Con esto podemos revisarlo y proponerte el siguiente paso.";
}

export async function runServiceExpertAgent(context = {}) {
  const service = normalizeServiceName(context.routerResult?.service, context.lead || {}, context.appConfig);
  const facts = getServiceFacts(service, context.appConfig) || {};
  const extracted = extractLeadDataFromText(context.message, context.lead || {});
  const contextualLead = {
    ...(context.lead || {}),
    ...(service !== "servicio" && service !== "unknown" && !context.lead?.interest_service
      ? { interest_service: service }
      : {}),
    ...(extracted.main_goal && !context.lead?.main_goal ? { main_goal: extracted.main_goal } : {}),
    ...(extracted.business_activity && !context.lead?.business_activity ? { business_activity: extracted.business_activity } : {}),
    ...(extracted.current_situation && !context.lead?.current_situation ? { current_situation: extracted.current_situation } : {}),
    ...(extracted.pain_points && !context.lead?.pain_points ? { pain_points: extracted.pain_points } : {}),
    ...(extracted.business_type && !context.lead?.business_type ? { business_type: extracted.business_type } : {}),
    ...(extracted.company_name && !context.lead?.company_name ? { company_name: extracted.company_name } : {}),
    ...(extracted.budget_range && !context.lead?.budget_range ? { budget_range: extracted.budget_range } : {}),
    ...(extracted.urgency && !context.lead?.urgency ? { urgency: extracted.urgency } : {}),
    ...(extracted.email && !context.lead?.email ? { email: extracted.email } : {}),
    ...(extracted.phone && !context.lead?.phone ? { phone: extracted.phone } : {}),
  };
  if (isProofOrGuaranteeQuestion(context.message)) {
    const lead_patch = {};
    if (extracted.main_goal && !context.lead?.main_goal) lead_patch.main_goal = extracted.main_goal;
    if (extracted.business_activity && !context.lead?.business_activity) {
      lead_patch.business_activity = extracted.business_activity;
    }
    if (service !== "servicio" && service !== "unknown" && !context.lead?.interest_service) {
      lead_patch.interest_service = service;
    }
    return {
      service,
      assistant_message: compactString(
        buildProofReply({ service, facts, lead: contextualLead, appConfig: context.appConfig }),
        1000
      ),
      lead_patch,
      tools_used: ["websiteFacts", "leadExtractor"],
    };
  }
  if (isPricingQuestion(context.message)) {
    const leadPatch =
      service !== "servicio" &&
      service !== "unknown" &&
      (shouldForceServicePatch(service, context.appConfig) || !context.lead?.interest_service)
        ? { interest_service: service }
        : {};
    return {
      service,
      assistant_message: compactString(
        buildPricingReply({ service, facts, appConfig: context.appConfig }),
        900
      ),
      lead_patch: leadPatch,
      tools_used: ["websiteFacts"],
    };
  }

  const factsText = [
    context.knowledgeContext,
    facts?.description,
    facts?.notes,
    facts?.min_monthly_fee || facts?.min_project_fee,
    ...(context.kbContext || []).map((item) => item?.chunk || item?.content || item?.text || ""),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);

  const nextHint = nextConfiguredConversionHint(contextualLead, context.appConfig);
  const fallback = `${service}: podemos orientarte segun tu objetivo y situacion actual. ${nextHint}`;
  const brandName = String(context.appConfig?.brand?.name || "la empresa").trim();
  const offers = configuredOffers(context.appConfig);
  const promptAdditions = String(context.appConfig?.agent?.prompt_additions || "").trim();

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            [
              `Eres Service Expert Agent de ${brandName}. Responde breve, con tono comercial consultivo, sin agresividad.`,
              `Productos/servicios configurados para esta cuenta: ${offers.length ? offers.join(", ") : "ninguno configurado"}.`,
              "Usa solo hechos configurados para esta cuenta y lleva la conversacion hacia el siguiente dato del lead.",
              "Responde primero a la pregunta actual. No vuelvas a pedir un dato que aparezca en el lead, en el mensaje actual o en los mensajes recientes.",
              "No inventes servicios ni precios. No presentes canales, fuentes de datos o herramientas como servicios vendidos si no estan en la lista configurada.",
              promptAdditions ? `Instrucciones especificas de la cuenta: ${promptAdditions}` : "",
            ].filter(Boolean).join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            message: context.message,
            service,
            lead: contextualLead,
            facts: factsText,
            configured_offers: offers,
            next_hint: nextHint,
          }),
        },
      ],
    });
    const rawReply = response.output_text || fallback;
    return {
      service,
      assistant_message: compactString(
        guardCapabilityReply({ message: context.message, reply: rawReply, factsText }),
        900
      ),
      lead_patch: buildContextLeadPatch({ context, contextualLead, service }),
      tools_used: ["websiteFacts", "kbRetriever"],
    };
  } catch (error) {
    console.log("[serviceExpertAgent] fallback:", error.message);
    return {
      service,
      assistant_message: compactString(fallback, 900),
      lead_patch: buildContextLeadPatch({ context, contextualLead, service }),
      tools_used: ["websiteFacts"],
    };
  }
}

export const __serviceExpertTestables = {
  nextConfiguredConversionHint,
  buildContextLeadPatch,
  guardCapabilityReply,
};
