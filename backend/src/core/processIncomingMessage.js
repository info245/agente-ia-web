import { processTmediaIncomingMessage } from "../agents/orchestrators/tmediaChatOrchestrator.js";

export async function processIncomingMessage({
  channel = "web",
  externalUserId = null,
  conversationId = null,
  messageText = "",
  metadata = {},
  accountId = null,
  text = null,
  conversation_id = null,
  external_user_id = null,
  account_id = null,
} = {}) {
  return processTmediaIncomingMessage({
    conversationId: conversationId || conversation_id || null,
    externalUserId: externalUserId || external_user_id || null,
    sourceChannel: channel || "web",
    message: messageText || text || "",
    metadata,
    accountId: accountId || account_id || null,
  });
}
