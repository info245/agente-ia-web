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

test("does not treat ecommerce/platform answers as names in close flow", () => {
  const result = extractLeadDataFromText("shopify", {
    current_step: "close_ask_name",
  });

  assert.equal(result.name, null);
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
