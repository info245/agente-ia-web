import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUngroundedCapabilityReply,
  guardCapabilityReply,
  hasCapabilityEvidence,
} from "./capabilityPolicy.js";

test("brand evidence alone does not prove an Odoo integration", () => {
  const message = "¿Puedo usar mi ERP Odoo con Sancho?";
  const facts = "Sancho conecta datos y prioriza decisiones.";
  assert.equal(hasCapabilityEvidence(message, facts), false);
  assert.match(buildUngroundedCapabilityReply({ message, factsText: facts }), /no puedo confirmar/i);
});

test("documented integration evidence allows a grounded answer", () => {
  const message = "¿Puedo integrar Odoo?";
  const facts = "Integración documentada con Odoo mediante API.";
  assert.equal(hasCapabilityEvidence(message, facts), true);
  assert.equal(buildUngroundedCapabilityReply({ message, factsText: facts }), null);
});

test("blocks optimistic CRM guidance when the connector is undocumented", () => {
  const guarded = guardCapabilityReply({
    message: "¿HubSpot sí lo conectáis seguro?",
    reply: "Puedo ayudarte a conectar HubSpot y guiarte paso a paso.",
    factsText: "Sancho interpreta datos y prioriza decisiones.",
  });
  assert.match(guarded, /no puedo confirmar/i);
  assert.doesNotMatch(guarded, /puedo ayudarte a conectar HubSpot/i);
});

test("blocks an unqualified 'can integrate' claim without an explicit yes", () => {
  const guarded = guardCapabilityReply({
    message: "¿Puedo usar mi ERP Odoo con Sancho?",
    reply: "Sancho puede integrar los datos de tu ERP Odoo con marketing y ventas.",
    factsText: "Sancho conecta datos y prioriza decisiones.",
  });
  assert.match(guarded, /no puedo confirmar/i);
  assert.doesNotMatch(guarded, /puede integrar los datos de tu ERP Odoo/i);
});
