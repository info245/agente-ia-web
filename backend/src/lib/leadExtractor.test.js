import test from "node:test";
import assert from "node:assert/strict";

import { extractLeadDataFromText } from "./leadExtractor.js";
import { mergeLeadData } from "./leadMerge.js";

test("interprets beta/free/zero budget replies as the free beta", () => {
  for (const message of ["Me gustaria empezar con la beta", "0", "sin inversion"]) {
    const extracted = extractLeadDataFromText(message);

    assert.equal(extracted.budget_range, "beta gratuita / 0 EUR");
  }
});

test("keeps real estate lead context and budget in the right fields", () => {
  const context = extractLeadDataFromText(
    "captar clientes nuevos, tengo una asesoría inmobiliaria"
  );
  const budget = extractLeadDataFromText("entre 500 y 600");

  assert.equal(context.main_goal, "captar clientes nuevos, tengo una asesoría inmobiliaria");
  assert.equal(context.business_type, "inmobiliaria");
  assert.equal(context.business_activity, null);
  assert.equal(context.interest_service, null);
  assert.equal(budget.budget_range, "500-600 €");
  assert.equal(budget.company_name, null);
});

test("captures immediate urgency and refines generic goals", () => {
  const urgency = extractLeadDataFromText("lo quiero ya");
  const merged = mergeLeadData({
    currentLead: { main_goal: "quiero mejorar mis clientes" },
    extractedLead: {
      main_goal: "captar clientes nuevos, tengo una asesoria inmobiliaria",
    },
    lastUserMessage: "captar clientes nuevos, tengo una asesoria inmobiliaria",
  });

  assert.equal(urgency.urgency, "alta");
  assert.equal(
    merged.main_goal,
    "captar clientes nuevos, tengo una asesoria inmobiliaria"
  );
});

test("captures short Spanish lead goals around client acquisition", () => {
  const potentialClients = extractLeadDataFromText("Captacion de clientes,potenciales.");
  const localClients = extractLeadDataFromText(
    "Quiero clientes potenciales en Granada, Loja y Antequera"
  );

  assert.equal(potentialClients.main_goal, "Captacion de clientes,potenciales.");
  assert.equal(
    localClients.main_goal,
    "Quiero clientes potenciales en Granada, Loja y Antequera"
  );
});

test("does not store complaints about repeated questions as the main goal", () => {
  const result = extractLeadDataFromText("Ya se lo he comentado anteriormente.", {
    current_step: "ask_main_goal",
  });

  assert.equal(result.main_goal, null);
});

test("detects common marketing services in messy business conversations", () => {
  const meta = extractLeadDataFromText("necesito campanas en meta para un restaurante");
  const shopify = extractLeadDataFromText("igual luego hacemos meta ads, pero primero shopify");
  const web = extractLeadDataFromText("quiero diseno web, pero que luego posicione algo");
  const budget = extractLeadDataFromText("500 o 600 euros");

  assert.equal(meta.interest_service, "Publicidad en Redes Sociales");
  assert.equal(meta.business_type, "restaurante");
  assert.equal(shopify.interest_service, "Shopify");
  assert.equal(web.interest_service, "Diseño Web");
  assert.equal(budget.budget_range, "500-600 €");
});

test("updates service and objective when the user clarifies later", () => {
  const service = mergeLeadData({
    currentLead: { interest_service: "SEO" },
    extractedLead: { interest_service: "Google Ads" },
    lastUserMessage: "pensaba en seo, pero quiero resultados antes, mejor google ads",
  });
  const objective = mergeLeadData({
    currentLead: { main_goal: "quiero diseno web, pero que luego posicione algo" },
    extractedLead: { main_goal: "captar empresas que necesiten asesoramiento laboral" },
    lastUserMessage: "captar empresas que necesiten asesoramiento laboral",
  });

  assert.equal(service.interest_service, "Google Ads");
  assert.equal(objective.main_goal, "captar empresas que necesiten asesoramiento laboral");
});

test("separates person, company and industry when users mix them", () => {
  const hotel = extractLeadDataFromText("Soy Marta Soler, tengo Casa Naranjo, un hotel rural pequeno");
  const academy = extractLeadDataFromText("soy Luis Prieto de Academia Norte");
  const brand = extractLeadDataFromText("la marca es Luma Skin, vendemos cosmetica en shopify");
  const correction = extractLeadDataFromText("la empresa se llama Fitbox, perdon FitBox Centro");

  assert.equal(hotel.name, "Marta Soler");
  assert.equal(hotel.company_name, "Casa Naranjo");
  assert.equal(hotel.business_type, "hotel");
  assert.equal(academy.name, "Luis Prieto");
  assert.equal(academy.company_name, "Academia Norte");
  assert.equal(brand.company_name, "Luma Skin");
  assert.equal(brand.interest_service, "Shopify");
  assert.equal(correction.company_name, "FitBox Centro");
});

test("handles complex budgets, urgency and consultative service corrections", () => {
  const range = extractLeadDataFromText("podemos invertir entre 800 y 1000 al mes si vemos retorno");
  const either = extractLeadDataFromText("presupuesto 600 o 700");
  const urgency = extractLeadDataFromText("no es urgente para manana pero si este trimestre");
  const service = mergeLeadData({
    currentLead: { interest_service: "SEO" },
    extractedLead: { interest_service: "Consultoría Digital" },
    lastUserMessage: "necesito consultoria digital, no solo gestion de campanas",
  });
  const goal = mergeLeadData({
    currentLead: {
      main_goal: "B2B industrial, tenemos SEO, campanas y ventas offline pero no sabemos que canal funciona",
    },
    extractedLead: {
      main_goal: "queremos mejorar medicion, priorizar inversion y reducir coste por lead",
    },
    lastUserMessage: "queremos mejorar medicion, priorizar inversion y reducir coste por lead",
  });

  assert.equal(range.budget_range, "800-1000 €");
  assert.equal(either.budget_range, "600-700 €");
  assert.equal(urgency.urgency, "media");
  assert.equal(service.interest_service, "Consultoría Digital");
  assert.equal(goal.main_goal, "queremos mejorar medicion, priorizar inversion y reducir coste por lead");
});

test("handles agency and data-stack lead wording without polluting fields", () => {
  const retail = extractLeadDataFromText("la empresa es RetailCo Iberia");
  const ecommerce = extractLeadDataFromText(
    "Me llamo Adrian Ramos. La empresa es Atlas Home, vendemos decoracion en Shopify, tenemos PMax, Meta, SEO y email marketing"
  );
  const semAgency = extractLeadDataFromText(
    "Soy Laura Medina, llevo Pangea Growth, una agencia de marketing"
  );
  const b2bSaas = extractLeadDataFromText(
    "Buenas, soy Marta Casal de Northstar Ops, SaaS B2B"
  );
  const agency = extractLeadDataFromText("somos SearchOps, una agencia SEO tecnica");
  const agencyWithContact = extractLeadDataFromText(
    "Somos SearchOps, una agencia SEO tecnica. Soy Diego Navas"
  );
  const channel = extractLeadDataFromText(
    "tenemos tiendas fisicas y ecommerce, campanas de PMax, Meta y email marketing"
  );
  const retailScale = extractLeadDataFromText(
    "Tenemos 42 tiendas fisicas y ecommerce, campanas de PMax, Meta y email marketing"
  );
  const agencyClientBudgets = extractLeadDataFromText(
    "Tenemos clientes con presupuestos desde 800 hasta 12000 al mes"
  );
  const saasGoal = extractLeadDataFromText(
    "buscamos una capa de IA para explicar rendimiento y recomendar que hacer cada semana"
  );

  assert.equal(retail.company_name, "RetailCo Iberia");
  assert.equal(ecommerce.company_name, "Atlas Home");
  assert.equal(semAgency.company_name, "Pangea Growth");
  assert.equal(b2bSaas.company_name, "Northstar Ops");
  assert.equal(b2bSaas.business_type, "SaaS");
  assert.equal(agency.company_name, "SearchOps");
  assert.equal(agencyWithContact.company_name, "SearchOps");
  assert.equal(agency.business_type, "agencia");
  assert.equal(channel.preferred_contact_channel, null);
  assert.equal(retailScale.budget_range, null);
  assert.equal(agencyClientBudgets.budget_range, null);
  assert.equal(
    saasGoal.main_goal,
    "buscamos una capa de IA para explicar rendimiento y recomendar que hacer cada semana"
  );
});

test("does not overcommit when users are unsure about channels", () => {
  const channelConfusion = extractLeadDataFromText(
    "No se si necesito SEO, Google Ads o Meta, solo se que no me entran leads buenos"
  );
  const shopifyOrWeb = extractLeadDataFromText(
    "Tengo una tienda Shopify pero igual lo que falla es la web o los anuncios, no se para que sirve cada cosa"
  );
  const whatsappOperations = extractLeadDataFromText(
    "igual primero web, o shopify, no se, vendemos por instagram y whatsapp y apuntamos pedidos en excel"
  );
  const unknownBudget = extractLeadDataFromText(
    "Presupuesto no se, dime tu que tiene sentido para empezar sin tirar dinero"
  );
  const sanchoProductQuestion = extractLeadDataFromText(
    "No quiero CRM nuevo, quiero entender si Sancho ayuda a saber que canal funciona y que hacer con los datos"
  );
  const rejectedSeo = mergeLeadData({
    currentLead: { interest_service: "SEO" },
    extractedLead: extractLeadDataFromText(
      "No quiero que me vendas SEO si igual necesito anuncios o mejorar la web"
    ),
    lastUserMessage: "No quiero que me vendas SEO si igual necesito anuncios o mejorar la web",
  });

  assert.equal(channelConfusion.interest_service, null);
  assert.equal(channelConfusion.main_goal, "No se si necesito SEO, Google Ads o Meta, solo se que no me entran leads buenos");
  assert.equal(shopifyOrWeb.interest_service, null);
  assert.equal(whatsappOperations.interest_service, null);
  assert.equal(whatsappOperations.preferred_contact_channel, null);
  assert.equal(unknownBudget.budget_range, null);
  assert.equal(sanchoProductQuestion.interest_service, null);
  assert.equal(
    sanchoProductQuestion.main_goal,
    "No quiero CRM nuevo, quiero entender si Sancho ayuda a saber que canal funciona y que hacer con los datos"
  );
  assert.equal(rejectedSeo.interest_service, "");
});
