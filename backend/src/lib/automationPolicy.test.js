import test from "node:test";
import assert from "node:assert/strict";

import {
  canRecoverLead,
  canContinueLeadRecovery,
  canUseAutomationChannel,
  getAutomationConditionFingerprint,
  getAutomationSequenceBaseTimestamp,
  getSafeAutomationDueAt,
  isRetryableAutomationSkipReason,
  shouldRetrySkippedAutomationJob,
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

test("a recovery sequence keeps its original anchor after the first automatic message", () => {
  const anchor = getAutomationSequenceBaseTimestamp({
    baseTimestamp: "2026-08-05T12:00:00Z",
    events: [
      {
        created_at: "2026-08-02T00:00:00Z",
        payload: { scheduled_from: "2026-08-01T00:00:00Z" },
      },
    ],
  });
  assert.equal(anchor, new Date("2026-08-01T00:00:00Z").getTime());

  const secondDueAt = getSafeAutomationDueAt({
    baseTimestamp: anchor,
    step: { delay_value: 72, delay_unit: "hours" },
    previousStep: { delay_value: 24, delay_unit: "hours" },
    previousEvent: { created_at: "2026-08-02T00:00:00Z" },
  });
  assert.equal(secondDueAt, new Date("2026-08-04T00:00:00Z").getTime());
});

test("recovery continues after an automatic email but stops after a customer reply", () => {
  const sentEvents = [{ created_at: "2026-08-02T00:00:00Z" }];
  const automaticEmailLast = [
    { role: "assistant", created_at: "2026-08-01T00:00:00Z" },
    { role: "tool", created_at: "2026-08-02T00:00:00Z" },
  ];
  assert.equal(
    canContinueLeadRecovery({
      lead: { crm_status: "nuevo" },
      messages: automaticEmailLast,
      sentEvents,
    }),
    true
  );
  assert.equal(
    canContinueLeadRecovery({
      lead: { crm_status: "nuevo" },
      messages: [
        ...automaticEmailLast,
        { role: "user", created_at: "2026-08-02T01:00:00Z" },
        { role: "assistant", created_at: "2026-08-02T01:01:00Z" },
      ],
      sentEvents,
    }),
    false
  );
});

test("a skipped step is retried only after its blocking condition changes", () => {
  const unavailable = getAutomationConditionFingerprint({
    flowKey: "lead_recovery",
    step: { channel: "email", template_key: "recovery_email" },
    template: { body: "Hola" },
    lead: { email: "", consent: true },
  });
  const available = getAutomationConditionFingerprint({
    flowKey: "lead_recovery",
    step: { channel: "email", template_key: "recovery_email" },
    template: { body: "Hola" },
    lead: { email: "lead@example.com", consent: true },
  });
  const completedSkippedJob = {
    status: "completed",
    result: {
      skipped: true,
      requires_attention: true,
      condition_fingerprint: unavailable,
    },
  };

  assert.equal(
    shouldRetrySkippedAutomationJob({
      job: completedSkippedJob,
      conditionFingerprint: unavailable,
    }),
    false
  );
  assert.equal(
    shouldRetrySkippedAutomationJob({
      job: completedSkippedJob,
      conditionFingerprint: available,
    }),
    true
  );
  assert.equal(
    shouldRetrySkippedAutomationJob({
      job: {
        ...completedSkippedJob,
        result: { skipped: false, condition_fingerprint: unavailable },
      },
      conditionFingerprint: available,
    }),
    false
  );
});

test("retryable skips are explicit operational attention states", () => {
  assert.equal(isRetryableAutomationSkipReason("no-email"), true);
  assert.equal(isRetryableAutomationSkipReason("contact-not-authorized"), true);
  assert.equal(isRetryableAutomationSkipReason("provider-timeout"), false);
});
