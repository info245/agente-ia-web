import { processTmediaIncomingMessage } from "../agents/orchestrators/tmediaChatOrchestrator.js";
import { processAgentV2Message } from "../agent/orchestrator.js";
import { getPublishedAppConfig } from "../lib/appConfigStore.js";

// Cada cuenta elige motor en su configuración publicada (agent_engine); por defecto, legacy.
export async function resolveAgentEngine(accountId = null) {
  const config = await getPublishedAppConfig({ accountId }).catch(() => null);
  return config?.agent_engine === "v2" ? "v2" : "legacy";
}

export async function processIncomingMessage({
  channel = "web",
  externalUserId = null,
  conversationId = null,
  messageText = "",
  metadata = {},
  accountId = null,
  actionCallbacks = null,
  text = null,
  conversation_id = null,
  external_user_id = null,
  account_id = null,
  sourceChannel = null,
  message = null,
} = {}) {
  const input = {
    conversationId: conversationId || conversation_id || null,
    externalUserId: externalUserId || external_user_id || null,
    sourceChannel: sourceChannel || channel || "web",
    message: messageText || message || text || "",
    metadata,
    accountId: accountId || account_id || null,
    actionCallbacks,
  };
  if ((await resolveAgentEngine(input.accountId)) === "v2") return processAgentV2Message(input);
  return processTmediaIncomingMessage(input);
}
