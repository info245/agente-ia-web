import test from "node:test";
import assert from "node:assert/strict";

import {
  detectStrongCommercialIntent,
  getCommercialCloseStep,
  getExplicitPreferredChannel,
  isCloseFlowStep,
  isShortAffirmativeResponse,
  prefersEmailChannel,
  prefersWhatsAppChannel,
} from "./closeFlow.js";

test("detects explicit contact channel without confusing adjacent words", () => {
  assert.equal(getExplicitPreferredChannel("por whatsapp"), "whatsapp");
  assert.equal(getExplicitPreferredChannel("por email"), "email");
  assert.equal(getExplicitPreferredChannel("emailing y automatización"), null);
  assert.equal(prefersWhatsAppChannel("mejor por whatsapp"), true);
  assert.equal(prefersEmailChannel("quiero seguir por correo"), true);
});

test("starts close flow after affirmative response when value was already delivered", () => {
  const step = getCommercialCloseStep({
    lead: { interest_service: "SEO" },
    text: "si por favor",
    channel: "web",
    analysisReady: true,
    isGreeting: false,
  });

  assert.equal(step, "close_ask_name");
});

test("asks for channel after having a valid name", () => {
  const step = getCommercialCloseStep({
    lead: { name: "Antonio", interest_service: "SEO" },
    text: "si",
    channel: "web",
    analysisReady: true,
    isGreeting: false,
  });

  assert.equal(step, "close_ask_channel");
});

test("asks for phone or email depending on explicit channel", () => {
  assert.equal(
    getCommercialCloseStep({
      lead: {
        name: "Antonio",
        preferred_contact_channel: "whatsapp",
        interest_service: "SEO",
      },
      text: "whatsapp",
      channel: "web",
      analysisReady: true,
      isGreeting: false,
    }),
    "close_ask_phone"
  );

  assert.equal(
    getCommercialCloseStep({
      lead: {
        name: "Antonio",
        preferred_contact_channel: "email",
        interest_service: "SEO",
      },
      text: "email",
      channel: "web",
      analysisReady: true,
      isGreeting: false,
    }),
    "close_ask_email"
  );
});

test("becomes ready only when the requested contact data is present", () => {
  assert.equal(
    getCommercialCloseStep({
      lead: {
        name: "Antonio",
        preferred_contact_channel: "whatsapp",
        phone: "608339316",
        interest_service: "SEO",
      },
      text: "608339316",
      channel: "web",
      analysisReady: true,
      isGreeting: false,
    }),
    "close_ready"
  );

  assert.equal(
    getCommercialCloseStep({
      lead: {
        name: "Antonio",
        preferred_contact_channel: "email",
        email: "antonio@example.com",
        interest_service: "SEO",
      },
      text: "antonio@example.com",
      channel: "web",
      analysisReady: true,
      isGreeting: false,
    }),
    "close_ready"
  );
});

test("exposes the close states we persist in current_step", () => {
  assert.equal(isCloseFlowStep("close_ask_name"), true);
  assert.equal(isCloseFlowStep("close_ready"), true);
  assert.equal(isCloseFlowStep("ask_name"), false);
  assert.equal(isShortAffirmativeResponse("sí"), true);
  assert.equal(detectStrongCommercialIntent("quiero precio"), true);
});
