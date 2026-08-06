import test from "node:test";
import assert from "node:assert/strict";

import { __leadRouterTestables } from "./leadRouterAgent.js";

const { heuristicRoute, enforceSafeRoute } = __leadRouterTestables;

test("support and human requests can never be overridden by commercial closing", () => {
  const support = heuristicRoute({
    message: "Tengo una incidencia, el chat no funciona",
    lead: { email: "a@example.com", interest_service: "Sancho", main_goal: "Automatizar" },
  });
  assert.equal(support.intent, "support");
  assert.equal(support.next_agent, "lead_memory");

  const human = heuristicRoute({ message: "Quiero hablar con una persona" });
  assert.equal(human.intent, "human_request");
  assert.equal(human.next_agent, "lead_memory");

  const protectedRoute = enforceSafeRoute(
    { intent: "lead_capture", next_agent: "closing", reason: "modelo" },
    support
  );
  assert.equal(protectedRoute.intent, "support");
  assert.equal(protectedRoute.next_agent, "lead_memory");
});

test("a greeting does not enter qualification through an AI override", () => {
  const fallback = heuristicRoute({ message: "hola, ¿cómo estás?" });
  assert.equal(fallback.intent, "greeting");
  const route = enforceSafeRoute(
    { intent: "service_question", next_agent: "service_expert", reason: "modelo" },
    fallback
  );
  assert.equal(route.intent, "greeting");
  assert.equal(route.next_agent, "sales_qualification");
});

test("the router never skips memory by sending a fresh answer directly to closing", () => {
  const route = heuristicRoute({
    message: "mi email es ana@example.com",
    lead: { interest_service: "Consultoría", main_goal: "Automatizar", phone: "34600000000" },
  });
  assert.equal(route.intent, "lead_capture");
  assert.equal(route.next_agent, "sales_qualification");
});
