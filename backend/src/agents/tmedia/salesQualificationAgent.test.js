import test from "node:test";
import assert from "node:assert/strict";

import { runSalesQualificationAgent, __salesQualificationTestables } from "./salesQualificationAgent.js";

const appConfig = {
  brand: { name: "TMedia Global" },
  lead_capture: {
    fields: {
      name: true,
      company_name: true,
      business_type: true,
      business_activity: true,
      interest_service: true,
      main_goal: true,
      budget_range: true,
      urgency: true,
      preferred_contact_channel: true,
      email: true,
      phone: true,
    },
    custom_fields: [],
  },
  offers: {
    SEO: {},
    "Google Ads": {},
    "Redes Sociales": {},
    "Diseño Web": {},
  },
};

test("only the latest assistant question controls how a short answer is interpreted", () => {
  const messages = [
    { role: "assistant", content: "¿Qué presupuesto tienes previsto?" },
    { role: "user", content: "Todavía no lo sé" },
    { role: "assistant", content: "¿Cómo se llama tu empresa?" },
  ];

  assert.equal(__salesQualificationTestables.lastAssistantAskedBudget(messages), false);
  assert.equal(__salesQualificationTestables.lastAssistantAskedBusinessType(messages), false);
});

test("answers a greeting to Sancho naturally instead of opening the questionnaire", async () => {
  const result = await runSalesQualificationAgent({
    message: "hola sanchito como estas",
    lead: { current_step: "ask_main_goal" },
    messages: [],
    appConfig: {
      ...appConfig,
      agent: { initial_message: "Hola. Cuéntame qué necesitas revisar y te ayudo." },
    },
  });

  assert.match(result.assistant_message, /^Hola\./i);
  assert.doesNotMatch(result.assistant_message, /objetivo principal/i);
  assert.deepEqual(result.lead_patch, {});
});

test("does not ask for unconfigured business context", () => {
  const state = __salesQualificationTestables.getNextQuestionState(
    { main_goal: "Captar clientes" },
    {},
    "web",
    { lead_capture: { fields: { email: true, phone: true } } }
  );

  assert.equal(state.step, "ask_contact");
  assert.doesNotMatch(state.question, /a que te dedicas|captando clientes/i);
});

test("an inbound WhatsApp phone satisfies a combined contact requirement", () => {
  const state = __salesQualificationTestables.getNextQuestionState(
    { phone: "34600000000", preferred_contact_channel: "whatsapp" },
    {},
    "whatsapp",
    { lead_capture: { fields: { email: true, phone: true } } }
  );

  assert.equal(state.step, "ready");
  assert.doesNotMatch(state.question, /email/i);
});

test("does not assume SEO when the user only asks for more clients", () => {
  const service = __salesQualificationTestables.safeServiceFromFields({
    parsedService: "SEO",
    fallbackService: null,
    routerService: "unknown",
    message: "quiero mejorar mis clientes",
    appConfig,
  });

  assert.equal(service, null);
});

test("does not repeat objective and asks for organic business context before contact", () => {
  const state = __salesQualificationTestables.getNextQuestionState(
    {
      main_goal: "captar clientes nuevos",
      business_type: "inmobiliaria",
      interest_service: "Google Ads",
      budget_range: "500-600 €",
    },
    {},
    "web",
    appConfig
  );

  assert.equal(state.step, "ask_business_activity");
  assert.match(state.question, /cuentame un poco/i);
});

test("after business context it asks identity before contact handoff", () => {
  const state = __salesQualificationTestables.getNextQuestionState(
    {
      main_goal: "captar clientes nuevos",
      business_type: "inmobiliaria",
      business_activity: "captamos por referidos y queremos vendedores",
      interest_service: "Google Ads",
      urgency: "este mes",
      budget_range: "500-600 €",
    },
    {},
    "web",
    appConfig
  );

  assert.equal(state.step, "ask_company_name");
  assert.match(state.question, /empresa o proyecto/i);
});

test("after identity it offers WhatsApp or email continuation", () => {
  const state = __salesQualificationTestables.getNextQuestionState(
    {
      name: "Marta",
      company_name: "Casa Norte",
      main_goal: "captar clientes nuevos",
      business_type: "inmobiliaria",
      business_activity: "captamos por referidos y queremos vendedores",
      interest_service: "Google Ads",
      urgency: "este mes",
      budget_range: "500-600 €",
    },
    {},
    "web",
    appConfig
  );

  assert.equal(state.step, "ask_preferred_contact_channel");
  assert.match(state.question, /WhatsApp o por email/i);
});

test("Sancho account never qualifies SEO or SEM as the sold service", () => {
  const sanchoConfig = {
    brand: { name: "Sancho AI" },
    lead_capture: {
      fields: {
        name: true,
        company_name: true,
        business_type: true,
        interest_service: true,
        main_goal: true,
        email: true,
        phone: false,
      },
      custom_fields: [],
    },
    offers: {
      "Sancho AI": {},
    },
  };

  for (const message of [
    "No se si necesito SEO, Google Ads o Meta, solo quiero saber que canal funciona",
    "Somos una agencia con clientes en SEM y Meta y queremos mejores decisiones con IA",
    "No quiero contratar SEO ni SEM, quiero entender si Sancho ayuda con datos",
  ]) {
    const service = __salesQualificationTestables.safeServiceFromFields({
      parsedService: "SEO",
      fallbackService: "Google Ads",
      routerService: "SEO",
      message,
      appConfig: sanchoConfig,
    });

    assert.equal(service, "Sancho AI");
  }
});

test("acknowledges when the user already answered instead of repeating objective question", async () => {
  const result = await runSalesQualificationAgent({
    message: "Ya lo he explicado todo. Espero tu respuesta gracias.",
    sourceChannel: "web",
    appConfig,
    lead: {
      interest_service: "SEO",
      main_goal: "Captacion de clientes,potenciales.",
      business_activity: "piscinas con 50 anos de experiencia",
      current_step: "ask_main_goal",
    },
    messages: [
      { role: "user", content: "Captacion de clientes,potenciales." },
      { role: "user", content: "Local y provincial,en Granada,Loja y Antequera y zonas colindantes." },
    ],
  });

  assert.equal(result.lead_patch.current_step, "qualifying");
  assert.match(result.assistant_message, /perdona por repetir/i);
  assert.doesNotMatch(result.assistant_message, /objetivo principal que quieres conseguir/i);
});

test("recovers objective and local context from recent messages when lead state is stale", async () => {
  const result = await runSalesQualificationAgent({
    message: "Ya se lo he comentado anteriormente.",
    sourceChannel: "web",
    appConfig,
    lead: {
      interest_service: "SEO",
      current_step: "ask_main_goal",
    },
    messages: [
      { role: "user", content: "Captacion de clientes,potenciales." },
      { role: "user", content: "Local y provincial,en Granada,Loja y Antequera y zonas colindantes." },
    ],
  });

  assert.equal(result.lead_patch.main_goal, "Captacion de clientes,potenciales.");
  assert.match(result.lead_patch.business_activity, /Granada/);
  assert.doesNotMatch(result.assistant_message, /objetivo principal que quieres conseguir/i);
});

test("accepts free-text business context after asking business type", async () => {
  const sanchoConfig = {
    brand: { name: "Sancho AI" },
    lead_capture: {
      fields: {
        name: true,
        company_name: true,
        business_type: true,
        interest_service: true,
        main_goal: true,
        email: true,
        phone: false,
      },
      custom_fields: [],
    },
    offers: {
      "Sancho AI": {},
    },
  };

  const result = await runSalesQualificationAgent({
    message: "Compra-venta de productos de hostelería",
    sourceChannel: "web",
    appConfig: sanchoConfig,
    routerResult: { service: "consulting" },
    lead: {
      interest_service: "Sancho AI",
      main_goal: "Ventas",
      current_step: "ask_business_type",
      last_question: "¿Qué tipo de negocio o proyecto tienes?",
    },
    messages: [
      { role: "user", content: "no perder clientes, analizar el estado de cada uno" },
    ],
  });

  assert.equal(result.lead_patch.business_activity, "Compra-venta de productos de hostelería");
  assert.equal(result.lead_patch.company_name, undefined);
  assert.doesNotMatch(result.assistant_message, /tipo de negocio o proyecto/i);
});
