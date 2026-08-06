import test from "node:test";
import assert from "node:assert/strict";

import {
  canRecoverLead,
  canUseAutomationChannel,
  getSafeAutomationDueAt,
  userRepliedAfter,
} from "./automationPolicy.js";

test("lead recovery only runs while the last turn is awaiting the user", () => {
  const assistantLast = [
    { role: "user", created_at: "2026-08-01T10:00:00Z" },
    { role: "assistant", created_at: "2026-08-01T10:01:00Z" },
  ];
  assert.equal(canRecoverLead({ lead: { crm_status: "nuevo" }, messages: assistantLast }), true);
  assert.equal(
    canRecoverLead({
      lead: { crm_status: "nuevo" },
      messages: [...assistantLast, { role: "user", created_at: "2026-08-01T10:02:00Z" }],
    }),
    false
  );
  assert.equal(canRecoverLead({ lead: { crm_status: "ganado" }, messages: assistantLast }), false);
  assert.equal(canRecoverLead({ lead: { crm_status: "qualified" }, messages: assistantLast }), false);
  assert.equal(canRecoverLead({ lead: { current_step: "completed" }, messages: assistantLast }), false);
});

test("recovery contact requires consent or an inbound conversation on that channel", () => {
  assert.equal(
    canUseAutomationChannel({
      lead: { consent: false, conversations: { channel: "whatsapp" } },
      channel: "whatsapp",
      flowKey: "lead_recovery",
    }),
    true
  );
  assert.equal(
    canUseAutomationChannel({
      lead: { consent: false, conversations: { channel: "web" } },
      channel: "whatsapp",
      flowKey: "lead_recovery",
    }),
    false
  );
});

test("a reply after a quote cancels its automatic follow-up", () => {
  const messages = [{ role: "user", created_at: "2026-08-02T12:00:00Z" }];
  assert.equal(userRepliedAfter(messages, "2026-08-02T11:00:00Z"), true);
});

test("overdue sequence steps keep their configured gap instead of bursting", () => {
  const dueAt = getSafeAutomationDueAt({
    baseTimestamp: "2026-08-01T00:00:00Z",
    step: { delay_value: 72, delay_unit: "hours" },
    previousStep: { delay_value: 24, delay_unit: "hours" },
    previousEvent: { created_at: "2026-08-05T12:00:00Z" },
  });
  assert.equal(dueAt, new Date("2026-08-07T12:00:00Z").getTime());
});
