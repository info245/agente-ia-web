import test from "node:test";
import assert from "node:assert/strict";

import { __leadMemoryTestables } from "./leadMemoryAgent.js";

test("only deterministic evidence is eligible for lead persistence", () => {
  const patch = __leadMemoryTestables.buildPersistedLeadPatch({
    currentLead: {},
    deterministicPatch: {
      main_goal: "Automatizar campañas",
      current_step: "ask_business_type",
    },
  });
  assert.deepEqual(patch, {
    main_goal: "Automatizar campañas",
    current_step: "ask_business_type",
  });
  assert.equal(__leadMemoryTestables.hasNewLeadData({}, {}), false);
});

test("an old business question cannot reinterpret an unrelated current answer", () => {
  const messages = [
    { role: "assistant", content: "¿Qué tipo de negocio tienes?" },
    { role: "user", content: "Una clínica" },
    { role: "assistant", content: "¿Cuál es tu presupuesto?" },
  ];
  assert.equal(__leadMemoryTestables.lastAssistantAskedBusinessType(messages), false);
});

test("memory advances only to a requirement configured for the account", () => {
  const patch = __leadMemoryTestables.advanceToNextRequirement({
    currentLead: { current_step: "ask_business_type", main_goal: "Captar clientes" },
    leadPatch: { business_activity: "Venta de material de hostelería" },
    appConfig: {
      lead_capture: {
        fields: { business_type: true, email: true, phone: true },
      },
    },
  });

  assert.equal(patch.current_step, "ask_contact");
  assert.doesNotMatch(patch.last_question, /empresa|presupuesto/i);
});
