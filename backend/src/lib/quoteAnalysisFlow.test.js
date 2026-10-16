import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQuoteResponseNotice,
  buildWhatsAppTemplateWarnings,
  describeStepsWithoutTemplate,
  findLeadWebsite,
  findWhatsAppStepsWithoutTemplate,
  planQuoteWhatsAppSend,
} from "./quoteAnalysisFlow.js";

test("findLeadWebsite prioriza campos de web y custom_fields sobre notas y mensajes", () => {
  assert.equal(findLeadWebsite({ website: "https://acme.es" }), "https://acme.es");
  assert.equal(
    findLeadWebsite({ internal_notes: "ver otra.com", custom_fields: { tu_web: "www.acme.es" } }),
    "www.acme.es"
  );
  assert.equal(findLeadWebsite({}, { formData: { pagina_web: "acme.es/inicio" } }), "acme.es/inicio");
  assert.equal(findLeadWebsite({ summary: "Lead con web acme.es" }), "acme.es");
  assert.equal(
    findLeadWebsite({}, { messages: [{ content: "hola" }, { content: "mi web es https://acme.es" }] }),
    "https://acme.es"
  );
});

test("findLeadWebsite ignora emails y devuelve null sin web", () => {
  assert.equal(findLeadWebsite({ email: "ana@gmail.com", internal_notes: "Email: ana@gmail.com" }), null);
  assert.equal(findLeadWebsite({}, { messages: [{ content: "escríbeme a ana@acme.es" }] }), null);
  assert.equal(findLeadWebsite({ custom_fields: { presupuesto: 500 } }), null);
});

test("planQuoteWhatsAppSend usa texto libre dentro de 24h y plantilla fuera", () => {
  const vars = { nombre: "Ana", link_presupuesto: "https://x/crm/quotes/1/preview" };
  assert.deepEqual(planQuoteWhatsAppSend({ windowOpen: true, body: "Hola Ana", vars }), {
    type: "text",
    body: "Hola Ana",
  });
  assert.deepEqual(planQuoteWhatsAppSend({ windowOpen: false, whatsappConfig: {}, vars }), {
    type: "blocked",
    reason: "whatsapp-template-required-outside-24h",
  });
  assert.deepEqual(
    planQuoteWhatsAppSend({
      windowOpen: false,
      whatsappConfig: { quote_template_name: "propuesta_lista" },
      vars,
    }),
    { type: "template", name: "propuesta_lista", language: "es", params: ["Ana", vars.link_presupuesto] }
  );
});

test("findWhatsAppStepsWithoutTemplate detecta pasos activos de WhatsApp sin plantilla", () => {
  const appConfig = {
    automation_flows: {
      quote_followup: {
        enabled: true,
        steps: [
          { channel: "whatsapp", template_key: "quote_whatsapp" },
          { channel: "email", template_key: "quote_email" },
          { channel: "whatsapp", whatsapp_template_name: "seguimiento", template_key: "x" },
          { channel: "whatsapp", active: false, template_key: "y" },
        ],
      },
      lead_recovery: { enabled: false, steps: [{ channel: "whatsapp", template_key: "z" }] },
    },
  };
  const missing = findWhatsAppStepsWithoutTemplate(appConfig);
  assert.deepEqual(missing, [{ flow_key: "quote_followup", step_index: 0, template_key: "quote_whatsapp" }]);
  assert.match(describeStepsWithoutTemplate(missing), /quote_followup paso 1/);
  assert.equal(describeStepsWithoutTemplate([]), "");

  const warnings = buildWhatsAppTemplateWarnings(appConfig);
  assert.equal(warnings.length, 2);
  assert.match(warnings[1], /quote_template_name/);
  assert.deepEqual(
    buildWhatsAppTemplateWarnings({ integrations: { whatsapp: { quote_template_name: "propuesta_lista" } } }),
    []
  );
});

test("buildQuoteResponseNotice resume la respuesta para el equipo", () => {
  const notice = buildQuoteResponseNotice({
    action: "accepted",
    lead: { name: "Ana", email: "ana@acme.es" },
    quote: { title: "SEO local" },
    crmUrl: "https://x/preview",
  });
  assert.equal(notice.subject, "Propuesta aceptada: Ana");
  assert.match(notice.text, /Ana ha aceptado la propuesta "SEO local"/);
  assert.match(notice.text, /Estado CRM: ganado/);
  assert.equal(notice.nextAction, "Contactar para arrancar el proyecto");
  assert.match(buildQuoteResponseNotice({ action: "rejected" }).subject, /^Propuesta rechazada: Un lead$/);
});
