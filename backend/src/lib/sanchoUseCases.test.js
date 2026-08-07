import test from "node:test";
import assert from "node:assert/strict";

import { buildSanchoUseCaseReply } from "./sanchoUseCases.js";

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
