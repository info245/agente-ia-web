import test from "node:test";
import assert from "node:assert/strict";

import { __tmediaChatOrchestratorTestables } from "./tmediaChatOrchestrator.js";

const { repairFinalReply } = __tmediaChatOrchestratorTestables;

test("recognizes a complaint about Sancho itself and leaves the sales questionnaire", () => {
  const reply = repairFinalReply({
    reply: "Entiendo que quieres que la web funcione bien. ¿Qué objetivo buscas lograr?",
    currentMessage: "nono, si la que no funciona bien es la tuya sancho",
    lead: { current_step: "ask_main_goal" },
    messages: [
      { role: "user", content: "podrías empezar haciendo que la web funcione bien" },
    ],
    appConfig: { brand: { name: "HeySancho" } },
  });

  assert.match(reply, /propia web|asistente de Sancho/i);
  assert.match(reply, /Perdona/i);
  assert.match(reply, /qué fallo concreto/i);
  assert.doesNotMatch(reply, /qué objetivo buscas|objetivo principal/i);
});

test("answers how Odoo is integrated without pretending MCP is automatic", () => {
  const reply = repairFinalReply({
    reply: "La integración por API o MCP es posible. ¿Qué objetivo quieres conseguir?",
    currentMessage: "como se integra, via api, mcp, ?",
    messages: [{ role: "user", content: "hola puedo usar mi propio erp de odoo?" }],
  });

  assert.match(reply, /vía base es la API de Odoo/i);
  assert.match(reply, /MCP no viene integrado automáticamente/i);
  assert.doesNotMatch(reply, /qué objetivo quieres conseguir/i);
});

test("advances after the user says the Odoo objective is campaign automation", () => {
  const reply = repairFinalReply({
    reply: "Para orientarte mejor, ¿qué objetivo quieres conseguir con esta integración?",
    currentMessage: "automatizar campañas",
    messages: [
      { role: "user", content: "hola puedo usar mi propio erp de odoo?" },
      { role: "user", content: "como se integra, via api, mcp, ?" },
    ],
  });

  assert.match(reply, /objetivo es automatizar campañas/i);
  assert.match(reply, /Odoo Online, Odoo\.sh o una instalación propia/i);
  assert.doesNotMatch(reply, /qué objetivo quieres conseguir/i);
});

test("removes any qualification question whose answer is already known", () => {
  const base = {
    currentMessage: "Quiero saber cómo funciona la integración",
    messages: [],
    appConfig: { lead_capture: { fields: {} } },
  };
  const cases = [
    ["El análisis está listo. ¿Qué objetivo quieres conseguir?", { main_goal: "Captar leads" }, /objetivo quieres/i],
    ["Podemos avanzar. ¿Cómo se llama tu empresa o proyecto?", { company_name: "Acme" }, /como se llama/i],
    ["Lo revisamos. ¿Me dejas un email o teléfono de contacto?", { phone: "34600000000" }, /email o telefono/i],
    ["Perfecto. ¿Qué presupuesto tienes previsto?", { budget_range: "500 EUR" }, /presupuesto/i],
  ];

  for (const [reply, lead, repeatedPattern] of cases) {
    const repaired = repairFinalReply({ ...base, reply, lead });
    assert.doesNotMatch(repaired, repeatedPattern);
  }
});

test("support and human requests bypass closing and commercial questions", () => {
  const config = {
    contact: { public_whatsapp_number: "34600000000", support_email: "help@example.com" },
  };
  const humanReply = repairFinalReply({
    reply: "¿Qué presupuesto tienes?",
    currentMessage: "Quiero hablar con una persona",
    appConfig: config,
  });
  assert.match(humanReply, /persona del equipo/i);
  assert.doesNotMatch(humanReply, /presupuesto/i);

  const supportReply = repairFinalReply({
    reply: "¿Qué objetivo quieres conseguir?",
    currentMessage: "Tengo una incidencia con una factura",
    appConfig: config,
  });
  assert.match(supportReply, /incidencia/i);
  assert.doesNotMatch(supportReply, /objetivo/i);

  assert.equal(
    __tmediaChatOrchestratorTestables.shouldRunClosing(
      { intent: "support" },
      { main_goal: "X", email: "a@example.com" },
      {},
      { lead_capture: { fields: { main_goal: true, email: true, phone: true } } }
    ),
    false
  );
});

test("a completed lead still reaches the specialist for a new service question", () => {
  assert.equal(
    __tmediaChatOrchestratorTestables.selectAgentId({
      routerResult: { next_agent: "service_expert" },
      message: "¿Cómo se integra con Odoo?",
    }),
    "service_expert"
  );

  assert.equal(
    __tmediaChatOrchestratorTestables.selectAgentId({
      routerResult: { next_agent: "closing" },
      message: "Quiero revisar otra cosa",
    }),
    "sales_qualification"
  );
});

test("final replies contain at most one question", () => {
  const reply = repairFinalReply({
    reply: "Sí, podemos revisarlo. ¿Qué objetivo buscas? ¿Cuál es tu presupuesto?",
    currentMessage: "Necesito ayuda con marketing",
    lead: {},
    appConfig: { lead_capture: { fields: { main_goal: true, budget_range: true } } },
  });
  assert.equal((reply.match(/\?/g) || []).length, 1);
});

test("does not remove substantive technical questions that mention email or ad platforms", () => {
  const reply = repairFinalReply({
    reply: "Podemos definir el flujo. ¿Quieres conectarlo con Google Ads o con email marketing?",
    currentMessage: "Quiero automatizar campañas",
    lead: { email: "ana@example.com", interest_service: "Consultoría Digital" },
    appConfig: { lead_capture: { fields: { email: true, interest_service: true } } },
  });
  assert.match(reply, /Google Ads o con email marketing/i);
});

test("blocks repeated objective question when the user already answered in the thread", () => {
  const reply = repairFinalReply({
    reply: "¿Cuál es el objetivo principal que quieres conseguir?",
    currentMessage: "Ya lo he explicado todo. Espero tu respuesta gracias.",
    lead: {
      interest_service: "SEO",
      current_step: "ask_main_goal",
    },
    messages: [
      { role: "user", content: "Captación de clientes,potenciales." },
      { role: "user", content: "En principio los primeros, somos pioneros en piscinas y 50 años nos avalan." },
      { role: "user", content: "Local y provincial,en Granada,Loja y Antequera y zonas colindantes." },
    ],
    appConfig: { brand: { name: "TMedia Global" } },
  });

  assert.match(reply, /Perdona por repetir/i);
  assert.match(reply, /Captación de clientes/i);
  assert.match(reply, /Granada|Loja|Antequera/i);
  assert.match(reply, /no voy a inventar resultados/i);
  assert.doesNotMatch(reply, /objetivo principal que quieres conseguir/i);
});

test("blocks trust complaint from receiving another qualification question", () => {
  const reply = repairFinalReply({
    reply: "¿Cuál es el objetivo principal que quieres conseguir?",
    currentMessage: "Según veo con vosotros me está dando a pensar que no sois de fiar.",
    lead: {
      interest_service: "SEO",
      main_goal: "Captación de clientes,potenciales.",
      business_activity: "piscinas en Granada, Loja y Antequera",
    },
    messages: [],
    appConfig: { brand: { name: "TMedia Global" } },
  });

  assert.match(reply, /Perdona por repetir/i);
  assert.match(reply, /no voy a inventar resultados/i);
  assert.doesNotMatch(reply, /objetivo principal que quieres conseguir/i);
});

const repeatedObjectiveScenarios = [
  {
    label: "SEO local",
    service: "SEO",
    goal: "Captacion de clientes potenciales.",
    context: "Somos pioneros en piscinas y trabajamos en Granada, Loja y Antequera.",
  },
  {
    label: "SEM Google Ads",
    service: "Google Ads",
    goal: "Conseguir leads de personas que pidan presupuesto.",
    context: "Empresa de reformas en Malaga capital y provincia.",
  },
  {
    label: "Redes Sociales",
    service: "Publicidad en Redes Sociales",
    goal: "Captar clientes potenciales para una nueva web.",
    context: "Marca de moda con venta online y publico en Madrid.",
  },
  {
    label: "Diseno Web",
    service: "Diseno Web",
    goal: "Renovar la web para que genere contactos comerciales.",
    context: "Clinica dental local que quiere captar pacientes de la zona.",
  },
  {
    label: "Consultoria Digital",
    service: "Consultoria Digital",
    goal: "Saber que canal funciona y priorizar inversion.",
    context: "Negocio B2B con SEO, anuncios y ventas offline.",
  },
];

for (const scenario of repeatedObjectiveScenarios) {
  test(`blocks repeated objective question for ${scenario.label}`, () => {
    const reply = repairFinalReply({
      reply: "Cual es el objetivo principal que quieres conseguir?",
      currentMessage: "Ya lo he explicado todo. Espero tu respuesta gracias.",
      lead: {
        interest_service: scenario.service,
        current_step: "ask_main_goal",
      },
      messages: [
        { role: "user", content: scenario.goal },
        { role: "user", content: scenario.context },
      ],
      appConfig: { brand: { name: "TMedia Global" } },
    });

    assert.match(reply, /Perdona por repetir/i);
    assert.match(reply, new RegExp(scenario.service.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    assert.doesNotMatch(reply, /objetivo principal que quieres conseguir/i);
    assert.doesNotMatch(reply, /^Cual es el objetivo/i);
  });
}
