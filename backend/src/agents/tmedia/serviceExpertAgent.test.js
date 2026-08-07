import test from "node:test";
import assert from "node:assert/strict";

import { runServiceExpertAgent, __serviceExpertTestables } from "./serviceExpertAgent.js";

test("uses data extracted from the current message before choosing the next question", () => {
  const contextualLead = { main_goal: "Automatizar campañas" };
  const config = {
    lead_capture: { fields: { main_goal: true, business_type: true } },
  };
  const next = __serviceExpertTestables.nextConfiguredConversionHint(contextualLead, config);
  assert.match(next, /tipo de negocio|a qué se dedica/i);
  assert.doesNotMatch(next, /objetivo/i);

  const patch = __serviceExpertTestables.buildContextLeadPatch({
    context: { lead: {} },
    contextualLead,
    service: "Consultoría Digital",
  });
  assert.equal(patch.main_goal, "Automatizar campañas");
});

test("does not confirm an ungrounded integration capability", () => {
  const reply = __serviceExpertTestables.guardCapabilityReply({
    message: "¿Puedo integrar mi ERP Odoo por MCP?",
    reply: "Sí, claro, se puede integrar por MCP.",
    factsText: "Consultoría de automatización y marketing.",
  });
  assert.match(reply, /no puedo confirmar/i);
  assert.match(reply, /MCP solo sería una opción/i);

  const grounded = __serviceExpertTestables.guardCapabilityReply({
    message: "¿Puedo integrar Odoo?",
    reply: "Sí, Odoo está soportado.",
    factsText: "Integración documentada con Odoo mediante API.",
  });
  assert.equal(grounded, "Sí, Odoo está soportado.");

  const brandOnly = __serviceExpertTestables.guardCapabilityReply({
    message: "¿Puedo usar mi ERP Odoo con Sancho?",
    reply: "Sí, Sancho facilita la integración con Odoo.",
    factsText: "Sancho conecta datos y prioriza decisiones.",
  });
  assert.match(brandOnly, /no puedo confirmar/i);
  assert.match(brandOnly, /API o los webhooks/i);
});

test("answers proof and guarantee objections without promising daily clients", async () => {
  const result = await runServiceExpertAgent({
    message:
      "Cuenteme, con hechos demostrables que es cierto que cada dia llegarian nuevos clientes.",
    routerResult: { service: "SEO" },
    lead: {},
    appConfig: {
      brand: { name: "TMedia Global" },
      offers: {
        SEO: {
          description: "Servicios de posicionamiento SEO.",
          min_monthly_fee: "200 EUR + IVA",
        },
      },
      lead_capture: { fields: { main_goal: true }, custom_fields: [] },
    },
  });

  assert.match(result.assistant_message, /no se puede prometer/i);
  assert.match(result.assistant_message, /posiciones en Google/i);
  assert.match(result.assistant_message, /llamadas\/formularios/i);
  assert.doesNotMatch(result.assistant_message, /objetivo quieres conseguir/i);
});

test("uses Sancho operational metrics instead of an unrelated SEO proof template", async () => {
  const appConfig = {
    brand: { name: "Sancho AI" },
    offers: { "Sancho AI": { description: "Conecta datos, interpreta y prioriza decisiones." } },
    lead_capture: { fields: { main_goal: true }, custom_fields: [] },
  };
  const guarantee = await runServiceExpertAgent({
    message: "¿Me garantizas que Sancho hará que entren clientes todos los días?",
    routerResult: { service: "Sancho AI" },
    lead: {},
    appConfig,
  });
  const measurement = await runServiceExpertAgent({
    message: "Entonces, ¿qué resultados reales podría medir?",
    routerResult: { service: "Sancho AI" },
    lead: { interest_service: "Sancho AI" },
    appConfig,
  });

  assert.match(guarantee.assistant_message, /frescura y completitud|anomalías detectadas/i);
  assert.doesNotMatch(guarantee.assistant_message, /posiciones en Google|ficha de Google/i);
  assert.match(measurement.assistant_message, /resultados reales.*Sancho AI/i);
  assert.notEqual(measurement.assistant_message, guarantee.assistant_message);
});

const proofScenarios = [
  { service: "SEO", priceField: "min_monthly_fee", price: "200 EUR + IVA", metric: /posiciones en Google/i },
  { service: "Google Ads", priceField: "min_monthly_fee", price: "250 EUR + IVA", metric: /coste por lead|terminos de busqueda/i },
  { service: "Publicidad en Redes Sociales", priceField: "min_monthly_fee", price: "250 EUR + IVA", metric: /rendimiento por creatividad|coste por lead/i },
  { service: "Diseno Web", priceField: "min_project_fee", price: "700 EUR + IVA", metric: /tasa de conversion|experiencia movil/i },
  { service: "Consultoria Digital", priceField: "min_project_fee", price: "500 EUR + IVA", metric: /rendimiento por canal|prioridades detectadas/i },
];

for (const scenario of proofScenarios) {
  test(`answers proof objection for ${scenario.service} without guarantee or repeated goal`, async () => {
    const result = await runServiceExpertAgent({
      message:
        "Con hechos demostrables, es cierto que llegarian clientes nuevos todos los dias?",
      routerResult: { service: scenario.service },
      lead: {
        interest_service: scenario.service,
        main_goal: "Captar clientes potenciales",
        business_activity: "Negocio local con zona definida",
      },
      appConfig: {
        brand: { name: "TMedia Global" },
        offers: {
          [scenario.service]: {
            description: `Servicio de ${scenario.service}.`,
            [scenario.priceField]: scenario.price,
          },
        },
        lead_capture: { fields: { main_goal: true }, custom_fields: [] },
      },
    });

    assert.match(result.assistant_message, /no se puede prometer|no te voy a prometer/i);
    assert.match(result.assistant_message, scenario.metric);
    assert.match(result.assistant_message, /Captar clientes potenciales/i);
    assert.doesNotMatch(result.assistant_message, /objetivo quieres conseguir/i);
    assert.doesNotMatch(result.assistant_message, /cada dia entren clientes nuevos\.$/i);
  });
}
