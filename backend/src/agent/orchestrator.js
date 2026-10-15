import { buildTmediaAgentContext } from "../agents/core/agentContextBuilder.js";
import { buildHandoffOptions } from "../agents/orchestrators/tmediaChatOrchestrator.js";
import { runNotificationAgent } from "../agents/tmedia/notificationAgent.js";
import {
  getLeadByConversationId,
  listConversationEventsByType,
  saveConversationEvent,
  saveMessage,
  updateConversationInboxState,
  upsertLeadFromConversation,
} from "../lib/chatStore.js";
import { getAppConfig } from "../lib/appConfigStore.js";
import { searchKnowledge } from "../lib/kbRetriever.js";
import { decideEmailSend } from "../lib/leadEmailPolicy.js";
import { supabase } from "../lib/supabase.js";
import { runAgentTurn } from "./engine.js";
import { getCaptureFields } from "./instructions.js";
import { createGoogleCalendar, isCalendarConnected } from "./googleCalendar.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Los datos de contacto se guardan siempre que la persona los dé; el resto, solo si la cuenta los captura.
const ALWAYS_SAVED = new Set(["name", "email", "phone"]);

export function cleanLeadPatch(args = {}, appConfig = null) {
  const allowed = new Set([...ALWAYS_SAVED, ...getCaptureFields(appConfig)]);
  const patch = {};
  const ignored = [];
  for (const [key, raw] of Object.entries(args || {})) {
    const field = key === "company" ? "company_name" : key;
    const value = String(raw ?? "").trim().slice(0, 300);
    if (!value) continue;
    const invalid =
      !allowed.has(field) ||
      (field === "email" && !EMAIL_RE.test(value)) ||
      (field === "phone" && value.replace(/\D/g, "").length < 7);
    if (invalid) ignored.push(field);
    else patch[field] = field === "email" ? value.toLowerCase() : value;
  }
  return { patch, ignored };
}

function contactChannels(appConfig = null) {
  return [
    String(appConfig?.contact?.public_whatsapp_number || "").trim() ? "WhatsApp" : null,
    String(appConfig?.contact?.support_email || "").trim() ? `email (${appConfig.contact.support_email})` : null,
  ].filter(Boolean);
}

function buildHandlers(context, state) {
  const { appConfig, accountId, conversationId, sourceChannel, externalUserId } = context;
  const event = (event_type, payload) =>
    saveConversationEvent({
      conversation_id: conversationId,
      event_type,
      channel: sourceChannel,
      external_user_id: externalUserId,
      account_id: accountId,
      payload,
    }).catch(() => null);
  const notifyTeam = async (notificationType, nextAction) => {
    const result = await runNotificationAgent({
      ...context,
      lead: { ...state.lead, next_action: nextAction },
      notificationType,
      sendClientConfirmation: false,
      forceNotification: true,
    }).catch((error) => ({ sent_internal: false, error: error.message }));
    state.notified = true;
    return Boolean(result?.sent_internal);
  };
  const saveLead = async (patch) => {
    const saved = await upsertLeadFromConversation({
      ...state.lead,
      ...patch,
      conversation_id: conversationId,
      account_id: accountId,
    });
    state.lead = { ...state.lead, ...saved };
    state.leadChanged = true;
  };

  const handlers = {
    async search_knowledge({ query }) {
      const docs = await searchKnowledge(query, { accountId, topK: 5 });
      return {
        ok: true,
        results: docs.map((doc) => ({ title: doc.title, url: doc.url, text: String(doc.chunk || "").slice(0, 1200) })),
      };
    },

    async save_lead_fields(args) {
      const { patch, ignored } = cleanLeadPatch(args, appConfig);
      if (Object.keys(patch).length) await saveLead(patch);
      const missing = getCaptureFields(appConfig).filter((field) => !String(state.lead?.[field] || "").trim());
      return { ok: true, saved: Object.keys(patch), ignored, missing };
    },

    async handoff_to_human({ reason }) {
      await updateConversationInboxState(conversationId, { ai_status: "paused", inbox_status: "open" }, { accountId });
      await event("human_handoff_requested", { reason, source_channel: sourceChannel });
      const teamNotified = await notifyTeam("handoff", `Atender en persona: ${reason}`);
      state.handoff = true;
      return { ok: true, registered: true, team_notified: teamNotified, other_channels: contactChannels(appConfig) };
    },

    async send_quote({ summary }) {
      await event("quote_requested", { summary });
      const teamNotified = await notifyTeam("quote_request", `Preparar presupuesto: ${summary}`);
      return { ok: true, registered: true, team_notified: teamNotified };
    },
  };

  const calendarConfig = state.liveConfig?.integrations?.calendar;
  if (isCalendarConnected(calendarConfig)) {
    const calendar = createGoogleCalendar(calendarConfig, appConfig?.agent?.meeting || {});
    handlers.get_available_slots = async ({ from_date, days }) => {
      const slots = await calendar.getAvailableSlots({ from_date, days: days || 5 });
      return { ok: true, timezone: appConfig?.agent?.meeting?.timezone || "Europe/Madrid", slots: slots.map(({ start, label }) => ({ start, label })) };
    };
    handlers.book_meeting = async ({ start, name, email, notes }) => {
      const booking = await calendar.bookMeeting({
        start,
        name,
        email,
        notes,
        summary: `Reunión ${appConfig?.brand?.name || ""}`.trim(),
      });
      if (!booking.ok) return booking;
      await saveLead(cleanLeadPatch({ name, email }, appConfig).patch);
      const { error } = await supabase.from("bookings").insert({
        account_id: accountId,
        conversation_id: conversationId,
        lead_id: state.lead?.id || null,
        starts_at: booking.start,
        ends_at: booking.end,
        timezone: booking.timezone,
        attendee_name: name,
        attendee_email: email,
        notes,
        provider_event_id: booking.event_id,
      });
      if (error) console.log("[agent-v2] booking row not saved:", error.message);
      await event("meeting_booked", { start: booking.start, event_id: booking.event_id });
      state.booked = true;
      return { ok: true, start: booking.start, end: booking.end, timezone: booking.timezone };
    };
  }
  return handlers;
}

async function notifyLeadChanges(context, leadBefore, leadAfter) {
  const events = await listConversationEventsByType(context.conversationId, "agent_notification_sent", 25, context.accountId).catch(() => []);
  const last = events.find((item) => item?.payload?.sent_internal === true || item?.payload?.internal?.ok === true);
  const decision = decideEmailSend({
    leadBefore,
    leadAfter,
    lastSignatureSent: last?.payload?.signature || null,
    minMinutesBetween: 10,
    lastSentAtMs: last?.created_at ? Date.parse(last.created_at) : 0,
  });
  if (decision.sendType === "none") return null;
  return runNotificationAgent({
    ...context,
    lead: leadAfter,
    notificationType: decision.sendType,
    changedFields: decision.changedFields,
    sendClientConfirmation: false,
  }).catch((error) => ({ sent_internal: false, error: error.message }));
}

export async function processAgentV2Message({
  conversationId = null,
  externalUserId = null,
  sourceChannel = "web",
  message,
  metadata = {},
  accountId = null,
} = {}) {
  if (!message || typeof message !== "string") throw new Error("message es obligatorio y debe ser texto");

  const first = await buildTmediaAgentContext({
    conversationId,
    externalUserId,
    sourceChannel,
    message,
    metadata,
    accountId,
    includeKnowledge: false,
  });
  await saveMessage({ conversation_id: first.conversationId, role: "user", content: first.message, metadata, account_id: accountId });
  await saveConversationEvent({
    conversation_id: first.conversationId,
    event_type: "message_received",
    channel: sourceChannel,
    external_user_id: externalUserId,
    account_id: accountId,
    payload: { role: "user", text: first.message.slice(0, 500), source_channel: sourceChannel },
  }).catch(() => null);

  if (first.conversation?.ai_status === "paused") {
    return { ok: true, conversation_id: first.conversationId, reply: null, lead: first.lead || null, chat_completed: false, human_takeover: true, mode: "human" };
  }

  // Segunda lectura: el historial ya incluye el mensaje recién guardado.
  const context = await buildTmediaAgentContext({
    conversationId: first.conversationId,
    externalUserId,
    sourceChannel,
    message,
    metadata,
    accountId,
    includeKnowledge: false,
  });
  const leadBefore = context.lead || {};
  const lead = { ...leadBefore };
  if (sourceChannel === "whatsapp" && !lead.phone && /^\d{7,}$/.test(String(externalUserId || ""))) {
    lead.phone = String(externalUserId);
  }
  const state = {
    lead,
    leadChanged: false,
    notified: false,
    handoff: false,
    booked: false,
    liveConfig: await getAppConfig({ accountId }).catch(() => null),
  };

  const turn = await runAgentTurn({
    appConfig: context.appConfig,
    lead: state.lead,
    messages: context.messages,
    channel: sourceChannel,
    handlers: buildHandlers(context, state),
  });
  const reply =
    turn.reply ||
    "Perdona, no he podido procesar bien tu mensaje. Puedes reformularlo o pedirme que lo pase al equipo.";
  const toolsUsed = turn.tool_calls.map((call) => call.name);

  await saveMessage({
    conversation_id: context.conversationId,
    role: "assistant",
    content: reply,
    metadata: { engine: "v2", intent: turn.intent, tools: toolsUsed, response_id: turn.response_id },
    account_id: accountId,
  });
  await saveConversationEvent({
    conversation_id: context.conversationId,
    event_type: "message_sent",
    channel: sourceChannel,
    external_user_id: externalUserId,
    account_id: accountId,
    payload: { role: "assistant", text: reply.slice(0, 500), engine: "v2", intent: turn.intent, tools: toolsUsed },
  }).catch(() => null);

  if (state.leadChanged && !state.notified) await notifyLeadChanges(context, leadBefore, state.lead);

  const finalLead = state.leadChanged
    ? await getLeadByConversationId(context.conversationId, { accountId }).catch(() => state.lead)
    : context.lead;
  const handoffOptions = buildHandoffOptions({
    appConfig: context.appConfig,
    conversationId: context.conversationId,
    reply,
    show: sourceChannel === "web" && (state.handoff || turn.intent === "human_request"),
  });
  const whatsappHandoff = handoffOptions.find((option) => option.type === "whatsapp") || null;

  return {
    ok: true,
    build: "agent-v2",
    engine: "v2",
    conversation_id: context.conversationId,
    reply,
    replyText: reply,
    assistantMessage: reply,
    intent: turn.intent,
    tool_calls: toolsUsed,
    lead: finalLead,
    handoff_recorded: state.handoff,
    meeting_booked: state.booked,
    chat_completed: false,
    handoff_options: handoffOptions,
    handoff_url: whatsappHandoff?.url || null,
    handoff_label: whatsappHandoff?.label || null,
    handoff: whatsappHandoff
      ? { whatsapp_url: whatsappHandoff.url, label: whatsappHandoff.label, options: handoffOptions }
      : handoffOptions.length
        ? { options: handoffOptions }
        : null,
  };
}
