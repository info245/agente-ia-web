function norm(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return norm(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getActionStatus(actionType = "") {
  const type = normalizeText(actionType);
  if (type === "human_handoff") return "requiere_humano";
  if (type === "calendar_booking") return "pendiente_agenda";
  if (type === "quote") return "presupuesto_pendiente";
  if (type === "send_information") return "pendiente_envio_info";
  return "accion_pendiente";
}

function buildActionSignature(nextBestAction = {}) {
  const fields = nextBestAction?.action_config?.required_fields || [];
  return [
    norm(nextBestAction.next_best_action),
    norm(nextBestAction.action_config?.type),
    fields.join(","),
  ].join("|");
}

function wasActionAlreadyExecuted(recentActionEvents = [], signature = "") {
  if (!signature) return false;
  return (recentActionEvents || []).some(
    (event) => norm(event?.payload?.action_signature) === signature
  );
}

function buildInternalNotes({ existing = "", nextBestAction = {} } = {}) {
  const actionLabel =
    norm(nextBestAction?.action_config?.label) ||
    norm(nextBestAction?.action_label) ||
    norm(nextBestAction?.next_best_action) ||
    "Siguiente accion";
  const line = `Accion IA preparada: ${actionLabel}`;
  const current = norm(existing);
  if (!current) return line;
  if (current.includes(line)) return current;
  return `${current} | ${line}`.slice(0, 2000);
}

function getLeadContactSummary(lead = {}) {
  return {
    name: norm(lead?.name),
    email: norm(lead?.email),
    phone: norm(lead?.phone),
    preferred_contact_channel: norm(lead?.preferred_contact_channel),
  };
}

function getActionTaskKind(actionType = "") {
  const type = normalizeText(actionType);
  if (type === "calendar_booking") return "booking_request";
  if (type === "human_handoff") return "human_handoff_request";
  if (type === "quote") return "quote_request";
  if (type === "internal_task") return "crm_task";
  return "";
}

function buildActionTask({ plan, lead = {}, nextBestAction = {} } = {}) {
  const type = normalizeText(plan?.action_type);
  const actionConfig = nextBestAction?.action_config || {};
  const kind = getActionTaskKind(type);
  if (!kind) return null;

  const customFields =
    lead?.custom_fields && typeof lead.custom_fields === "object" ? lead.custom_fields : {};

  return {
    ok: true,
    mode: "crm_task",
    kind,
    action_key: plan?.action_key || "",
    action_label: plan?.action_label || "",
    action_type: plan?.action_type || "",
    owner_label: norm(actionConfig?.metadata?.owner_label),
    priority: nextBestAction?.lead_temperature === "hot" ? "high" : "normal",
    due_at: new Date().toISOString(),
    contact: getLeadContactSummary(lead),
    lead_context: {
      interest_service: norm(lead?.interest_service),
      main_goal: norm(lead?.main_goal),
      urgency: norm(lead?.urgency),
      budget_range: norm(lead?.budget_range),
      custom_fields: customFields,
    },
    instructions:
      norm(actionConfig?.metadata?.instructions) ||
      norm(actionConfig?.description) ||
      norm(plan?.action_label),
  };
}

async function runActionDelivery({ plan, lead, nextBestAction, sendActionMessage } = {}) {
  if (plan?.action_type !== "send_information") {
    return { skipped: true, reason: "not-send-information" };
  }
  if (!norm(plan?.event_payload?.template_key)) {
    return { skipped: true, reason: "missing-template-key" };
  }
  if (typeof sendActionMessage !== "function") {
    return { skipped: true, reason: "missing-send-callback" };
  }

  try {
    const result = await sendActionMessage({
      lead,
      nextBestAction,
      actionConfig: nextBestAction?.action_config || {},
      plan,
    });
    if (!result) return { skipped: true, reason: "empty-send-result" };
    return result;
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: "send-error",
      error: error?.message || String(error),
    };
  }
}

async function runOperationalAction({
  plan,
  lead,
  nextBestAction,
  executeActionTask,
} = {}) {
  const task = buildActionTask({ plan, lead, nextBestAction });
  if (!task) return { skipped: true, reason: "no-operational-task" };
  if (typeof executeActionTask !== "function") return task;

  try {
    const result = await executeActionTask({
      lead,
      nextBestAction,
      actionConfig: nextBestAction?.action_config || {},
      plan,
      task,
    });
    return {
      ...task,
      ...(result || {}),
      ok: result?.ok !== false,
    };
  } catch (error) {
    return {
      ...task,
      ok: false,
      reason: "task-execution-error",
      error: error?.message || String(error),
    };
  }
}

export function buildActionExecutionPlan({
  lead = {},
  nextBestAction = null,
  recentActionEvents = [],
} = {}) {
  if (!nextBestAction) {
    return { executable: false, skipped: true, reason: "missing-next-best-action" };
  }
  if (!nextBestAction.action_config) {
    return { executable: false, skipped: true, reason: "missing-action-config" };
  }
  if (!nextBestAction.action_ready) {
    return {
      executable: false,
      skipped: true,
      reason: "action-not-ready",
      missing_action_fields: nextBestAction.missing_action_fields || [],
    };
  }

  const actionSignature = buildActionSignature(nextBestAction);
  if (wasActionAlreadyExecuted(recentActionEvents, actionSignature)) {
    return {
      executable: false,
      skipped: true,
      reason: "duplicate-action",
      action_signature: actionSignature,
    };
  }

  const actionConfig = nextBestAction.action_config;
  const nextActionLabel =
    norm(actionConfig.label) ||
    norm(nextBestAction.action_label) ||
    norm(nextBestAction.next_best_action);

  return {
    executable: true,
    skipped: false,
    action_key: nextBestAction.next_best_action,
    action_signature: actionSignature,
    action_type: actionConfig.type || "internal_task",
    action_label: nextActionLabel,
    crm_patch: {
      crm_status: getActionStatus(actionConfig.type),
      next_action: nextActionLabel,
      internal_notes: buildInternalNotes({
        existing: lead?.internal_notes,
        nextBestAction,
      }),
    },
    event_payload: {
      action_key: nextBestAction.next_best_action,
      action_signature: actionSignature,
      action_type: actionConfig.type || "internal_task",
      action_label: nextActionLabel,
      action_channel: actionConfig.channel || "",
      template_key: actionConfig.template_key || "",
      task_kind: getActionTaskKind(actionConfig.type || "internal_task"),
      primary_conversion_goal: nextBestAction.primary_conversion_goal || "",
      lead_temperature: nextBestAction.lead_temperature || "",
      required_fields: actionConfig.required_fields || [],
      status: "prepared",
    },
  };
}

export async function executeConfiguredAction({
  lead = {},
  conversationId = "",
  channel = "web",
  externalUserId = null,
  accountId = null,
  nextBestAction = null,
  recentActionEvents = [],
  updateLeadCrmFields,
  saveConversationEvent,
  sendActionMessage,
  executeActionTask,
} = {}) {
  const plan = buildActionExecutionPlan({
    lead,
    nextBestAction,
    recentActionEvents,
  });

  if (!plan.executable) return plan;

  if (lead?.id && typeof updateLeadCrmFields === "function") {
    await updateLeadCrmFields(lead.id, plan.crm_patch, { accountId });
  }

  const delivery = await runActionDelivery({
    plan,
    lead,
    nextBestAction,
    sendActionMessage,
  });
  const operation = await runOperationalAction({
    plan,
    lead,
    nextBestAction,
    executeActionTask,
  });
  const eventPayload = {
    ...plan.event_payload,
    delivery,
    operation,
    status: delivery?.ok ? "sent" : operation?.ok ? "ready_for_team" : plan.event_payload.status,
  };

  if (conversationId && typeof saveConversationEvent === "function") {
    await saveConversationEvent({
      conversation_id: conversationId,
      event_type: "action_executed",
      channel,
      external_user_id: externalUserId,
      account_id: accountId,
      payload: eventPayload,
    });
  }

  return {
    ...plan,
    event_payload: eventPayload,
    delivery,
    operation,
    executed: true,
  };
}
