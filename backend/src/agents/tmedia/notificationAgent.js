import {
  getConversationMessages,
  getRecentNotificationEvents,
  saveConversationEvent,
} from "../tools/supabaseTools.js";
import {
  sendClientConfirmationEmail,
  sendLeadEmail,
} from "../tools/emailTools.js";

function signature(lead = {}) {
  return JSON.stringify({
    name: lead?.name || "",
    email: lead?.email || "",
    phone: lead?.phone || "",
    service: lead?.interest_service || "",
    budget: lead?.budget_range || "",
    urgency: lead?.urgency || "",
    summary: lead?.summary || "",
  });
}

export async function runNotificationAgent(context = {}) {
  const lead = {
    ...(context.lead || {}),
    ...(context.memoryResult?.lead_patch || {}),
  };
  const sig = signature(lead);
  const previous = await getRecentNotificationEvents(context.conversationId, 25);
  const duplicate = previous.some((event) => event?.payload?.signature === sig);

  if (duplicate) {
    return {
      sent_internal: false,
      sent_client: false,
      skipped: true,
      reason: "duplicate-signature",
      tools_used: ["supabase"],
    };
  }

  const conversationMessages = await getConversationMessages(context.conversationId, 60).catch(() => []);
  const emailConfig = context.appConfig?.integrations?.email || null;
  const recipients = String(context.appConfig?.notifications?.email_to || process.env.LEADS_EMAIL_TO || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const internal = await sendLeadEmail({
    lead,
    conversation_id: context.conversationId,
    type: previous.length ? "update" : "new",
    changedFields: [],
    emailConfig,
    recipients,
    conversationMessages,
  }).catch((error) => ({ ok: false, error: error.message }));

  const client = await sendClientConfirmationEmail({
    lead,
    conversation_id: context.conversationId,
    emailConfig,
    brandName: context.appConfig?.brand?.name || "TMedia Global",
  }).catch((error) => ({ ok: false, error: error.message }));

  await saveConversationEvent({
    conversation_id: context.conversationId,
    event_type: "agent_notification_sent",
    channel: context.sourceChannel,
    external_user_id: context.externalUserId,
    account_id: context.accountId,
    payload: {
      signature: sig,
      sent_at: new Date().toISOString(),
      internal,
      client,
    },
  });

  return {
    sent_internal: !!internal?.ok,
    sent_client: !!client?.ok,
    internal,
    client,
    tools_used: ["supabase", "emailService"],
  };
}
