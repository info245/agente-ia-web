import test from "node:test";
import assert from "node:assert/strict";

import { decideEmailSend } from "./leadEmailPolicy.js";

test("sends a new notification when a web chat captures commercial context", () => {
  const result = decideEmailSend({
    leadBefore: {},
    leadAfter: {
      main_goal: "Quiero automatizar reporting de marketing",
      current_situation: "Tenemos datos dispersos entre Ads y Analytics",
    },
  });

  assert.equal(result.sendType, "new");
  assert.deepEqual(result.changedFields, ["main_goal", "current_situation"]);
});

test("sends an update when important commercial context changes", () => {
  const oldSentAt = Date.now() - 20 * 60_000;

  const result = decideEmailSend({
    leadBefore: {
      email: "lead@example.com",
      main_goal: "Ver una demo",
    },
    leadAfter: {
      email: "lead@example.com",
      main_goal: "Ver una demo",
      budget_range: "Plan Growth",
    },
    lastSentAtMs: oldSentAt,
  });

  assert.equal(result.sendType, "update");
  assert.deepEqual(result.changedFields, ["budget_range"]);
});
