function normalize(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function timestamp(value) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getLatestConversationMessage(messages = []) {
  return [...(messages || [])]
    .filter((message) => timestamp(message?.created_at) > 0)
    .sort((a, b) => timestamp(a.created_at) - timestamp(b.created_at))
    .at(-1) || null;
}

export function getLastUserMessageTime(messages = []) {
  return Math.max(
    0,
    ...(messages || [])
      .filter((message) => message?.role === "user")
      .map((message) => timestamp(message?.created_at))
  );
}

function isLeadRecoveryStateEligible(lead = {}) {
  const status = normalize(lead?.crm_status);
  const step = normalize(lead?.current_step);
  if ([
    "cualificado",
    "qualified",
    "presupuesto_borrador",
    "presupuesto_enviado",
    "negociacion",
    "negotiation",
    "ganado",
    "won",
    "perdido",
    "lost",
    "completado",
    "completed",
  ].includes(status)) {
    return false;
  }
  if (["complete", "completed", "closed"].includes(step)) return false;
  return true;
}

export function canRecoverLead({ lead = {}, messages = [] } = {}) {
  if (!isLeadRecoveryStateEligible(lead)) return false;
  const latest = getLatestConversationMessage(messages);
  return latest?.role === "assistant";
}

export function canContinueLeadRecovery({ lead = {}, messages = [], sentEvents = [] } = {}) {
  if (!isLeadRecoveryStateEligible(lead)) return false;
  if (!sentEvents.length) return canRecoverLead({ lead, messages });
  const lastSentAt = Math.max(0, ...sentEvents.map((event) => timestamp(event?.created_at)));
  return lastSentAt > 0 && !userRepliedAfter(messages, lastSentAt);
}

export function userRepliedAfter(messages = [], timestampValue = null) {
  const reference = timestamp(timestampValue);
  return reference > 0 && getLastUserMessageTime(messages) > reference;
}

export function canUseAutomationChannel({ lead = {}, channel = "", flowKey = "" } = {}) {
  const normalizedChannel = normalize(channel);
  if (!["whatsapp", "email"].includes(normalizedChannel)) return false;
  if (flowKey === "quote_followup") return true;
  if (lead?.consent === true) return true;
  return normalize(lead?.conversations?.channel) === normalizedChannel;
}

function stepDelayMs(step = {}) {
  const value = Math.max(0, Number(step?.delay_value || 0));
  const unit = normalize(step?.delay_unit || "hours");
  const multiplier = unit === "minutes" ? 60_000 : unit === "days" ? 86_400_000 : 3_600_000;
  return value * multiplier;
}

export function getSafeAutomationDueAt({ baseTimestamp, step = {}, previousEvent = null, previousStep = null } = {}) {
  const baseDueAt = timestamp(baseTimestamp) + stepDelayMs(step);
  if (!previousEvent || !previousStep) return baseDueAt;
  const gap = Math.max(3_600_000, stepDelayMs(step) - stepDelayMs(previousStep));
  return Math.max(baseDueAt, timestamp(previousEvent.created_at) + gap);
}

export function getAutomationSequenceBaseTimestamp({ baseTimestamp, events = [] } = {}) {
  const scheduledFrom = (events || [])
    .map((event) => timestamp(event?.payload?.scheduled_from))
    .filter((value) => value > 0)
    .sort((a, b) => a - b)[0];
  return scheduledFrom || timestamp(baseTimestamp);
}

export function getAutomationConditionFingerprint({
  flowKey = "",
  step = {},
  template = null,
  lead = {},
  hasWhatsAppPhone = false,
} = {}) {
  return JSON.stringify({
    flow: normalize(flowKey),
    channel: normalize(step?.channel || template?.channel),
    template_key: normalize(step?.template_key),
    template_available: Boolean(template?.body),
    whatsapp_template_name: normalize(step?.whatsapp_template_name),
    whatsapp_template_language: normalize(step?.whatsapp_template_language || "es"),
    has_whatsapp_phone: Boolean(hasWhatsAppPhone),
    has_email: Boolean(String(lead?.email || "").trim()),
    consent: lead?.consent === true,
    inbound_channel: normalize(lead?.conversations?.channel),
  });
}

export function isRetryableAutomationSkipReason(reason = "") {
  return [
    "contact-not-authorized",
    "no-whatsapp-phone",
    "whatsapp-template-required-outside-24h",
    "no-email",
    "unsupported-channel",
    "missing-template",
  ].includes(normalize(reason));
}

export function shouldRetrySkippedAutomationJob({ job = null, conditionFingerprint = "" } = {}) {
  if (!job || normalize(job?.status) !== "completed") return false;
  if (job?.result?.skipped !== true || job?.result?.requires_attention !== true) return false;
  const previousFingerprint = String(job?.result?.condition_fingerprint || "");
  const nextFingerprint = String(conditionFingerprint || "");
  return Boolean(nextFingerprint && previousFingerprint && nextFingerprint !== previousFingerprint);
}
