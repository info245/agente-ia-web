import test from "node:test";
import assert from "node:assert/strict";

import { extractLeadDataFromText } from "./leadExtractor.js";
import { mergeLeadData } from "./leadMerge.js";

test("accepts a plain name only when the close flow is explicitly asking for it", () => {
  const accepted = extractLeadDataFromText("Antonio", {
    current_step: "close_ask_name",
  });
  const acceptedWithAccent = extractLeadDataFromText("David López", {
    current_step: "close_ask_name",
  });
  const rejected = extractLeadDataFromText("Antonio", {
    current_step: "close_ask_channel",
  });

  assert.equal(accepted.name, "Antonio");
  assert.equal(acceptedWithAccent.name, "David López");
  assert.equal(rejected.name, null);
});

test("extracts corrected names from natural user corrections", () => {
  const corrected = extractLeadDataFromText(
    "No me llamo instagram, me llamo Antonii",
    { current_step: "close_ask_phone", name: "Instagram" }
  );
  const reminder = extractLeadDataFromText("David, te lo dije antes", {
    current_step: "ask_name",
  });

  assert.equal(corrected.name, "Antonii");
  assert.equal(reminder.name, "David");
});

test("mergeLeadData replaces bad remembered names when the user corrects them", () => {
  const merged = mergeLeadData({
    currentLead: { name: "Instagram", current_step: "close_ask_phone" },
    extractedLead: { name: "Antonii" },
    lastUserMessage: "No me llamo instagram, me llamo Antonii",
  });

  assert.equal(merged.name, "Antonii");
});

test("does not treat ecommerce/platform answers as names in close flow", () => {
  const result = extractLeadDataFromText("shopify", {
    current_step: "close_ask_name",
  });

  assert.equal(result.name, null);
});

test("does not treat apology words as names in close flow", () => {
  const result = extractLeadDataFromText("perdona", {
    current_step: "close_ask_name",
  });

  assert.equal(result.name, null);
});

test("does not treat greetings or negative replies as company names", () => {
  const greeting = extractLeadDataFromText("hola", {
    current_step: "ask_company_name",
  });
  const negative = extractLeadDataFromText("no", {
    current_step: "ask_company_name",
  });

  assert.equal(greeting.company_name, null);
  assert.equal(negative.company_name, null);
});

test("does not infer contact channel just because a phone or email appears", () => {
  const phoneResult = extractLeadDataFromText("608339316", {
    current_step: "close_ask_phone",
  });
  const emailResult = extractLeadDataFromText("antonio@example.com", {
    current_step: "close_ask_email",
  });

  assert.equal(phoneResult.phone, "608339316");
  assert.equal(phoneResult.preferred_contact_channel, null);
  assert.equal(emailResult.email, "antonio@example.com");
  assert.equal(emailResult.preferred_contact_channel, null);
});

test("does not treat phone-like numbers as budget", () => {
  const phoneLike = extractLeadDataFromText("608339316", {
    current_step: "close_ask_phone",
  });
  const explicitBudget = extractLeadDataFromText("700 eur", {
    current_step: "ask_budget",
  });

  assert.equal(phoneLike.budget_range, null);
  assert.equal(explicitBudget.budget_range?.includes("700"), true);
});

test("does not confuse 'emailing' with choosing email as contact channel", () => {
  const result = extractLeadDataFromText("pasarela de pago y emailing", {
    current_step: "close_ask_channel",
  });

  assert.equal(result.preferred_contact_channel, null);
});

test("separates current situation, pain points and goal instead of mixing them", () => {
  const setup = extractLeadDataFromText("Actualmente Google Ads y Analytics");
  const pain = extractLeadDataFromText(
    "tenemos 2, y tengo una persona revisando pero no falla el saber que está fallando"
  );

  assert.equal(setup.company_name, null);
  assert.equal(setup.business_activity, null);
  assert.equal(setup.main_goal, null);
  assert.equal(setup.current_situation, "Actualmente Google Ads y Analytics");

  assert.equal(pain.company_name, null);
  assert.equal(pain.main_goal, null);
  assert.equal(
    pain.pain_points,
    "tenemos 2, y tengo una persona revisando pero no falla el saber que está fallando"
  );
});

test("mergeLeadData only accepts standalone name during close name step", () => {
  const accepted = mergeLeadData({
    currentLead: { current_step: "close_ask_name" },
    extractedLead: { name: "David López" },
    lastUserMessage: "David López",
  });

  const rejected = mergeLeadData({
    currentLead: { current_step: "close_ask_channel" },
    extractedLead: { name: "Shopify" },
    lastUserMessage: "Shopify",
  });

  assert.equal(accepted.name, "David López");
  assert.equal(rejected.name, undefined);
});
