import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSanchoUseCaseReply,
  guardSanchoProductClaims,
} from "./sanchoUseCases.js";

const config = { brand: { name: "Sancho AI" }, offers: { "Sancho AI": {} } };

const cases = [
  ["¿Cómo aplicarías Sancho a un ecommerce con Shopify y Meta Ads?", /Shopify.*Meta Ads|Meta Ads.*Shopify/i],
  ["Ponme un caso de uso de Sancho para una clínica", /clínica|citas/i],
  ["¿Qué caso de uso tendría Sancho en una inmobiliaria?", /portales|inmobiliaria/i],
  ["Asesórame para una cadena de restaurantes", /reservas.*facturación|facturación.*reservas/i],
  ["Somos una agencia. ¿Cómo funcionaría Sancho para nosotros?", /anomalías|clientes/i],
  ["Somos un SaaS B2B y salimos a GTM. ¿Puede ayudarnos Sancho?", /encaje.*GTM|GTM.*encaje/i],
  ["Aplica Sancho a una empresa industrial B2B", /ciclo|pipeline/i],
];

test("describes the Sancho product without inventing operational capabilities", () => {
  for (const message of [
    "¿Qué es Sancho AI y cómo funciona?",
    "¿Qué aporta tu plataforma?",
  ]) {
    const reply = buildSanchoUseCaseReply({ message, appConfig: config });
    assert.match(reply, /inteligencia operativa/i);
    assert.match(reply, /datos y señales.*negocio, marketing y ventas/i);
    assert.match(reply, /no presta atención al cliente/i);
    assert.match(reply, /no automatiza comunicaciones con clientes/i);
    assert.match(reply, /no gestiona ni hace seguimiento de leads o contactos/i);
    assert.doesNotMatch(reply, /automatizar la comunicación|mejorar el seguimiento/i);
  }
});

test("blocks forbidden Sancho claims in any final reply while preserving explicit limits", () => {
  const hallucinations = [
    "Soy un asistente diseñado para ayudarte con marketing, ventas y atención al cliente.",
    "Sancho aporta una solución para automatizar la comunicación con clientes.",
    "Permite mejorar el seguimiento de tus leads y contactos.",
    "Ayuda a personalizar la experiencia del cliente.",
  ];

  for (const reply of hallucinations) {
    const guarded = guardSanchoProductClaims({ reply, appConfig: config });
    assert.match(guarded, /inteligencia operativa/i);
    assert.match(guarded, /no automatiza comunicaciones con clientes/i);
    assert.notEqual(guarded, reply);
  }

  const approved =
    "Sancho AI no presta atención al cliente, no automatiza comunicaciones con clientes y no hace seguimiento de leads o contactos.";
  assert.equal(guardSanchoProductClaims({ reply: approved, appConfig: config }), approved);
});

for (const [message, expected] of cases) {
  test(`builds a grounded use case for: ${message}`, () => {
    const reply = buildSanchoUseCaseReply({ message, appConfig: config });
    assert.match(reply, expected);
    assert.doesNotMatch(reply, /puede (?:enviar campañas|agendar visitas|programar mensajes)/i);
    assert.ok((reply.match(/\?/g) || []).length <= 1);
  });
}

test("adapts a follow-up using remembered sector context", () => {
  const reply = buildSanchoUseCaseReply({
    message: "No quiero otro dashboard; quiero saber qué cuenta necesita atención hoy",
    lead: { interest_service: "Sancho AI", business_type: "Agencia de marketing" },
    appConfig: config,
  });
  assert.match(reply, /cola diaria|priorizada/i);
  assert.doesNotMatch(reply, /Cómo se llama tu empresa/i);
});
