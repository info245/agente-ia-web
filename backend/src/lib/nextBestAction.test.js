import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeAppConfig } from "./appConfig.js";
import { getIndustryPreset } from "./industryPresets.js";
import { getNextBestAction } from "./nextBestAction.js";

function presetConfig(key) {
  const preset = getIndustryPreset(key);
  return sanitizeAppConfig(
    {
      product: { mode: "chat_only" },
      brand: { name: "Demo" },
      ...preset,
    },
    { useBlankDefaults: true }
  );
}

test("language academy asks for the next missing qualification field", () => {
  const config = presetConfig("language_academy");
  const result = getNextBestAction({
    appConfig: config,
    lead: {
      custom_fields: {
        language: "ingles",
      },
    },
    text: "quiero saber precios de clases",
    phase: "deepen",
  });

  assert.equal(result.next_best_action, "ask_qualification_field");
  assert.equal(result.target_field.key, "student_type");
  assert.equal(result.primary_conversion_goal, "book_level_test");
});

test("language academy offers level test once qualification is complete", () => {
  const config = presetConfig("language_academy");
  const result = getNextBestAction({
    appConfig: config,
    lead: {
      name: "Ana",
      phone: "600111222",
      custom_fields: {
        language: "ingles",
        student_type: "adulto",
        current_level: "intermedio",
        learning_goal: "trabajo",
        availability: "tardes",
      },
    },
    text: "quiero reservar una prueba",
    phase: "close",
  });

  assert.equal(result.next_best_action, "offer_level_test");
  assert.equal(result.action_config.type, "calendar_booking");
  assert.equal(result.action_ready, true);
  assert.equal(result.stage, "convert");
  assert.equal(result.lead_temperature, "hot");
});

test("clinic maps completed booking intent to first visit", () => {
  const config = presetConfig("clinic");
  const result = getNextBestAction({
    appConfig: config,
    lead: {
      name: "Luis",
      email: "luis@example.com",
      custom_fields: {
        treatment_interest: "revision dental",
        urgency_level: "esta semana",
        preferred_day_time: "viernes por la manana",
      },
    },
    text: "me gustaria pedir cita",
    phase: "close",
  });

  assert.equal(result.next_best_action, "book_first_visit");
  assert.equal(result.action_label, "Reservar primera visita");
  assert.equal(result.action_ready, true);
});

test("real estate asks operation type before handing off", () => {
  const config = presetConfig("real_estate");
  const result = getNextBestAction({
    appConfig: config,
    lead: { custom_fields: {} },
    text: "busco piso por la zona norte",
    phase: "discover",
  });

  assert.equal(result.next_best_action, "ask_qualification_field");
  assert.equal(result.target_field.key, "operation_type");
});

test("human request overrides missing qualification", () => {
  const config = presetConfig("clinic");
  const result = getNextBestAction({
    appConfig: config,
    lead: { custom_fields: {} },
    text: "quiero hablar con una persona",
    phase: "deepen",
  });

  assert.equal(result.next_best_action, "handoff_human");
  assert.equal(result.stage, "handoff");
  assert.equal(result.action_config.type, "human_handoff");
  assert.deepEqual(result.missing_action_fields, ["name", "phone_or_email"]);
});

test("action readiness reports missing action requirements", () => {
  const config = presetConfig("real_estate");
  const result = getNextBestAction({
    appConfig: config,
    lead: {
      name: "Marta",
      custom_fields: {
        operation_type: "comprar",
        area: "Valencia",
        timeline: "1-3 meses",
      },
    },
    text: "quiero que me contacte un asesor",
    phase: "close",
  });

  assert.equal(result.next_best_action, "handoff_agent");
  assert.equal(result.action_ready, false);
  assert.deepEqual(result.missing_action_fields, ["phone_or_email"]);
});

test("custom sales scoring can keep booking leads warm until qualification is complete", () => {
  const config = {
    ...presetConfig("language_academy"),
    sales_scoring: {
      hot_intents: ["booking"],
      warm_intents: ["pricing", "contact", "booking"],
      hot_max_missing_required_fields: 0,
      pricing_hot_max_missing_required_fields: 0,
      warm_max_missing_required_fields_with_contact: 5,
      contact_makes_warm: true,
    },
  };
  const result = getNextBestAction({
    appConfig: config,
    lead: {
      phone: "600111222",
      custom_fields: {
        language: "ingles",
      },
    },
    text: "quiero reservar una prueba",
    phase: "qualification",
  });

  assert.equal(result.lead_temperature, "warm");
  assert.equal(result.scoring.signals.missing_required_fields, 4);
  assert.match(result.scoring.reason, /contacto/i);
});

test("personalization rules match lead custom fields and alter reply strategy", () => {
  const config = presetConfig("language_academy");
  const result = getNextBestAction({
    appConfig: config,
    lead: {
      name: "Eva",
      email: "eva@example.com",
      custom_fields: {
        language: "ingles",
        student_type: "empresa",
        current_level: "intermedio",
        learning_goal: "trabajo",
        availability: "mañanas",
      },
    },
    text: "quiero informacion",
    phase: "qualification",
  });

  assert.equal(result.personalization.active.key, "academy_company_student");
  assert.match(result.reply_strategy, /formacion para equipos/i);
  assert.equal(result.personalization.matches.length, 1);
});
