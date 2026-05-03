import test from "node:test";
import assert from "node:assert/strict";

import {
  buildActionExecutionPlan,
  executeConfiguredAction,
} from "./actionExecutor.js";

const readyNba = {
  next_best_action: "offer_level_test",
  action_label: "Reservar prueba de nivel",
  action_ready: true,
  primary_conversion_goal: "book_level_test",
  lead_temperature: "hot",
  action_config: {
    type: "calendar_booking",
    label: "Reservar prueba de nivel",
    channel: "preferred",
    required_fields: ["name", "phone_or_email", "custom.language"],
  },
};

test("builds a CRM execution plan for ready actions", () => {
  const plan = buildActionExecutionPlan({
    lead: { internal_notes: "Lead interesado" },
    nextBestAction: readyNba,
  });

  assert.equal(plan.executable, true);
  assert.equal(plan.crm_patch.crm_status, "pendiente_agenda");
  assert.equal(plan.crm_patch.next_action, "Reservar prueba de nivel");
  assert.match(plan.crm_patch.internal_notes, /Accion IA preparada/);
  assert.equal(plan.event_payload.action_type, "calendar_booking");
});

test("skips actions that are not ready", () => {
  const plan = buildActionExecutionPlan({
    nextBestAction: {
      ...readyNba,
      action_ready: false,
      missing_action_fields: ["phone_or_email"],
    },
  });

  assert.equal(plan.executable, false);
  assert.equal(plan.reason, "action-not-ready");
  assert.deepEqual(plan.missing_action_fields, ["phone_or_email"]);
});

test("skips duplicate action signatures", () => {
  const first = buildActionExecutionPlan({ nextBestAction: readyNba });
  const duplicate = buildActionExecutionPlan({
    nextBestAction: readyNba,
    recentActionEvents: [
      {
        payload: {
          action_signature: first.action_signature,
        },
      },
    ],
  });

  assert.equal(duplicate.executable, false);
  assert.equal(duplicate.reason, "duplicate-action");
});

test("executeConfiguredAction updates CRM and writes event", async () => {
  const calls = {
    updates: [],
    events: [],
  };

  const result = await executeConfiguredAction({
    lead: { id: "lead-1" },
    conversationId: "conv-1",
    channel: "web",
    externalUserId: "external-1",
    accountId: "account-1",
    nextBestAction: readyNba,
    updateLeadCrmFields: async (...args) => {
      calls.updates.push(args);
    },
    saveConversationEvent: async (...args) => {
      calls.events.push(args);
    },
  });

  assert.equal(result.executed, true);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0][0], "lead-1");
  assert.equal(calls.events.length, 1);
  assert.equal(calls.events[0][0].event_type, "action_executed");
  assert.equal(result.operation.kind, "booking_request");
  assert.equal(result.event_payload.status, "ready_for_team");
});

test("executeConfiguredAction passes booking tasks to the operational callback", async () => {
  const calls = {
    tasks: [],
  };

  const result = await executeConfiguredAction({
    lead: {
      id: "lead-booking",
      name: "Ana",
      phone: "600000000",
      custom_fields: {
        language: "ingles",
      },
    },
    conversationId: "conv-booking",
    nextBestAction: {
      ...readyNba,
      action_config: {
        ...readyNba.action_config,
        metadata: {
          owner_label: "equipo de admisiones",
          instructions: "Confirmar prueba de nivel.",
        },
      },
    },
    executeActionTask: async (payload) => {
      calls.tasks.push(payload);
      return {
        ok: true,
        notification: {
          via: "email",
          provider_message_id: "notify-1",
        },
      };
    },
  });

  assert.equal(calls.tasks.length, 1);
  assert.equal(calls.tasks[0].task.kind, "booking_request");
  assert.equal(calls.tasks[0].task.owner_label, "equipo de admisiones");
  assert.equal(calls.tasks[0].task.priority, "high");
  assert.equal(result.operation.notification.provider_message_id, "notify-1");
  assert.equal(result.event_payload.operation.kind, "booking_request");
});

test("executeConfiguredAction creates human handoff tasks without external callbacks", async () => {
  const result = await executeConfiguredAction({
    lead: {
      id: "lead-human",
      name: "Marta",
      email: "marta@example.com",
    },
    nextBestAction: {
      next_best_action: "handoff_agent",
      action_ready: true,
      lead_temperature: "hot",
      action_config: {
        type: "human_handoff",
        label: "Derivar a asesor",
        required_fields: ["name", "phone_or_email"],
      },
    },
  });

  assert.equal(result.operation.ok, true);
  assert.equal(result.operation.kind, "human_handoff_request");
  assert.equal(result.operation.contact.email, "marta@example.com");
  assert.equal(result.event_payload.status, "ready_for_team");
});

test("executeConfiguredAction sends configured information messages", async () => {
  const calls = {
    deliveries: [],
    events: [],
  };
  const infoAction = {
    next_best_action: "send_course_info",
    action_label: "Enviar informacion del curso",
    action_ready: true,
    primary_conversion_goal: "book_level_test",
    lead_temperature: "warm",
    action_config: {
      type: "send_information",
      label: "Enviar informacion del curso",
      channel: "preferred",
      template_key: "course_info",
      required_fields: ["phone_or_email", "custom.language"],
    },
  };

  const result = await executeConfiguredAction({
    lead: { id: "lead-2", email: "lead@example.com" },
    conversationId: "conv-2",
    channel: "web",
    nextBestAction: infoAction,
    saveConversationEvent: async (...args) => {
      calls.events.push(args);
    },
    sendActionMessage: async (payload) => {
      calls.deliveries.push(payload);
      return {
        ok: true,
        via: "email",
        external_user_id: "lead@example.com",
        provider_message_id: "msg-1",
      };
    },
  });

  assert.equal(result.executed, true);
  assert.equal(result.delivery.ok, true);
  assert.equal(result.event_payload.status, "sent");
  assert.equal(calls.deliveries.length, 1);
  assert.equal(calls.deliveries[0].actionConfig.template_key, "course_info");
  assert.equal(calls.events[0][0].payload.delivery.provider_message_id, "msg-1");
});

test("executeConfiguredAction records delivery errors without throwing", async () => {
  const infoAction = {
    next_best_action: "send_course_info",
    action_ready: true,
    action_config: {
      type: "send_information",
      label: "Enviar informacion del curso",
      template_key: "course_info",
      required_fields: ["phone_or_email"],
    },
  };

  const result = await executeConfiguredAction({
    lead: { id: "lead-3" },
    nextBestAction: infoAction,
    sendActionMessage: async () => {
      throw new Error("provider unavailable");
    },
  });

  assert.equal(result.executed, true);
  assert.equal(result.delivery.ok, false);
  assert.equal(result.delivery.reason, "send-error");
  assert.match(result.delivery.error, /provider unavailable/);
});
