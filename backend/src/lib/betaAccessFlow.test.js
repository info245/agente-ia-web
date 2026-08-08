import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBetaAccessReply,
  isBetaAccessActive,
  isBetaAccessComplete,
  isBetaAccessLead,
  __betaAccessFlowTestables,
} from "./betaAccessFlow.js";

function applyTurn(lead, message, starting = false) {
  const result = buildBetaAccessReply({ message, lead, starting });
  return {
    result,
    lead: __betaAccessFlowTestables.mergeLeadPatch(lead, result.lead_patch),
  };
}

test("collects the same fields as the Sancho beta form and completes the CRM lead", () => {
  let lead = {};

  let turn = applyTurn(lead, "Quiero acceder a la beta gratuita", true);
  lead = turn.lead;
  assert.match(turn.result.assistant_message, /mismos datos.*formulario/i);
  assert.match(turn.result.assistant_message, /Política de privacidad.*Condiciones generales/i);
  assert.equal(lead.interest_service, "Sancho AI · Beta");
  assert.equal(lead.custom_fields.asunto_formulario, "Solicitar demo");
  assert.equal(isBetaAccessActive(lead), true);

  turn = applyTurn(lead, "Sí, acepto la política de privacidad y las condiciones");
  lead = turn.lead;
  assert.equal(lead.consent, true);
  assert.ok(lead.consent_at);
  assert.equal(lead.custom_fields.consentimiento_privacidad, "Aceptado");
  assert.match(turn.result.assistant_message, /nombre/i);

  turn = applyTurn(lead, "Ana Pérez");
  lead = turn.lead;
  assert.equal(lead.name, "Ana Pérez");
  assert.match(turn.result.assistant_message, /email profesional/i);

  turn = applyTurn(lead, "ana@acme.example");
  lead = turn.lead;
  assert.equal(lead.email, "ana@acme.example");
  assert.match(turn.result.assistant_message, /empresa/i);

  turn = applyTurn(lead, "Acme Analytics");
  lead = turn.lead;
  assert.equal(lead.company_name, "Acme Analytics");
  assert.match(turn.result.assistant_message, /canales.*objetivos.*implantación/i);

  const requestMessage = "Queremos conectar Google Ads y CRM para priorizar oportunidades.";
  turn = applyTurn(lead, requestMessage);
  lead = turn.lead;
  assert.equal(lead.main_goal, requestMessage);
  assert.equal(lead.custom_fields.mensaje_formulario, requestMessage);
  assert.match(turn.result.assistant_message, /opcional.*comunicaciones comerciales/i);

  turn = applyTurn(lead, "No, gracias");
  lead = turn.lead;
  assert.equal(lead.custom_fields.consentimiento_comercial, "Rechazado");
  assert.equal(lead.custom_fields.estado_solicitud_beta, "Lista para revisión");
  assert.equal(lead.current_step, "completed");
  assert.equal(lead.source_platform, "sancho_chat");
  assert.equal(lead.source_form_name, "Solicitud beta Sancho AI");
  assert.equal(isBetaAccessLead(lead), true);
  assert.equal(isBetaAccessComplete(lead), true);
  assert.match(turn.result.assistant_message, /solicitud.*beta.*registrada/i);
});

test("reuses data already captured in the conversation instead of asking twice", () => {
  const lead = {
    name: "Ana Pérez",
    email: "ana@acme.example",
    company_name: "Acme",
    main_goal: "Unificar Ads y ventas",
  };
  const { result, lead: nextLead } = applyTurn(lead, "Elijo la beta", true);
  assert.match(result.assistant_message, /privacidad/i);
  assert.doesNotMatch(result.assistant_message, /cuál es tu nombre|email profesional|cómo se llama tu empresa/i);
  assert.equal(nextLead.custom_fields.mensaje_formulario, "Unificar Ads y ventas");
});

test("does not mistake selecting the beta for the form message", () => {
  const lead = {
    name: "Ana Pérez",
    email: "ana@acme.example",
    company_name: "Acme",
    main_goal: "Quiero acceder a la beta gratuita",
    consent: true,
    custom_fields: { consentimiento_privacidad: "Aceptado" },
  };
  const { result, lead: nextLead } = applyTurn(lead, "Quiero acceder a la beta gratuita", true);
  assert.match(result.assistant_message, /canales.*objetivos.*implantación/i);
  assert.equal(nextLead.custom_fields.mensaje_formulario, undefined);
});

test("invalid form data does not advance and privacy rejection cannot complete access", () => {
  let lead = {
    consent: true,
    current_step: "beta:ask_email",
    custom_fields: { solicitud_beta: "Sí", consentimiento_privacidad: "Aceptado" },
  };
  let turn = applyTurn(lead, "esto no es un email");
  lead = turn.lead;
  assert.equal(lead.current_step, "beta:ask_email");
  assert.match(turn.result.assistant_message, /email no parece válido/i);

  lead = {
    name: "Ana Pérez",
    email: "ana@acme.example",
    company_name: "Acme",
    main_goal: "Probar señales de marketing",
    current_step: "beta:ask_privacy",
    custom_fields: {
      solicitud_beta: "Sí",
      asunto_formulario: "Solicitar demo",
      mensaje_formulario: "Probar señales de marketing",
    },
  };
  turn = applyTurn(lead, "No acepto");
  lead = turn.lead;
  assert.equal(lead.consent, false);
  assert.equal(lead.current_step, "beta:ask_privacy");
  assert.equal(isBetaAccessComplete(lead), false);
  assert.match(turn.result.assistant_message, /no puedo tramitar el acceso/i);
});

test("an active beta application can be cancelled explicitly", () => {
  const lead = {
    current_step: "beta:ask_company",
    custom_fields: { solicitud_beta: "Sí" },
  };
  const { result, lead: cancelled } = applyTurn(lead, "Ya no quiero continuar con la beta");
  assert.equal(cancelled.current_step, "beta:cancelled");
  assert.equal(cancelled.custom_fields.estado_solicitud_beta, "Cancelada");
  assert.equal(isBetaAccessActive(cancelled), false);
  assert.match(result.assistant_message, /cancelado la solicitud/i);
});
