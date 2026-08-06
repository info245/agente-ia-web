import {
  getConversationMessages,
  getRecentNotificationEvents,
  saveConversationEvent,
} from "../tools/supabaseTools.js";
import {
  sendClientConfirmationEmail,
  sendLeadEmail,
} from "../tools/emailTools.js";
import { buildLeadSignature } from "../../lib/leadEmailPolicy.js";

function signature(lead = {}) {
  return buildLeadSignature(lead);
}

export async function runNotificationAgent(context = {}) {
  const lead = {
    ...(context.lead || {}),
    ...(context.memoryResult?.lead_patch || {}),
  };
  const sig = signature(lead);
  const previous = await getRecentNotificationEvents(context.conversationId, 25);
  const duplicate = previous.some(
    (event) =>
      event?.payload?.signature === sig &&
      (event?.payload?.internal?.ok === true || event?.payload?.sent_internal === true)
  );

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
  const supportEmail = String(context.appConfig?.contact?.support_email || "").trim();
  if (supportEmail && !recipients.includes(supportEmail)) recipients.push(supportEmail);

  const internal = await sendLeadEmail({
    lead,
    conversation_id: context.conversationId,
    type: context.notificationType || (previous.length ? "update" : "new"),
    changedFields: context.changedFields || [],
    emailConfig,
    recipients,
    conversationMessages,
  }).catch((error) => ({ ok: false, error: error.message }));

  const shouldSendClient = context.sendClientConfirmation !== false;
  const client = shouldSendClient
    ? await sendClientConfirmationEmail({
        lead,
        conversation_id: context.conversationId,
        emailConfig,
        brandName: context.appConfig?.brand?.name || "TMedia Global",
      }).catch((error) => ({ ok: false, error: error.message }))
    : { skipped: true, reason: "client-confirmation-not-due" };

  await saveConversationEvent({
    conversation_id: context.conversationId,
    event_type: "agent_notification_sent",
    channel: context.sourceChannel,
    external_user_id: context.externalUserId,
    account_id: context.accountId,
    payload: {
      signature: sig,
      sent_at: new Date().toISOString(),
      sent_internal: !!internal?.ok,
      sent_client: !!client?.ok,
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
