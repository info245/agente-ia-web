import {
  createConversation,
  getConversationMessages,
  getLeadByConversationId,
} from "../../lib/chatStore.js";
import { getAppConfig } from "../../lib/appConfigStore.js";
import { buildKnowledgeContext, getWebsiteFacts } from "../../lib/websiteFacts.js";
import { retrieveWebsiteContext } from "../../lib/kbRetriever.js";

export async function buildTmediaAgentContext({
  conversationId,
  externalUserId = null,
  sourceChannel = "web",
  message,
  metadata = {},
  accountId = null,
} = {}) {
  let conversation_id = conversationId || null;

  if (!conversation_id) {
    const conversation = await createConversation({
      channel: sourceChannel || "web",
      external_user_id: externalUserId || null,
      account_id: accountId,
    });
    conversation_id = conversation.id;
  }

  const [messages, lead, appConfig] = await Promise.all([
    getConversationMessages(conversation_id, 40).catch(() => []),
    getLeadByConversationId(conversation_id, { accountId }).catch(() => null),
    getAppConfig({ accountId }).catch(() => null),
  ]);

  const websiteFacts = getWebsiteFacts(appConfig);
  const knowledgeContext = buildKnowledgeContext(appConfig);
  const kbContext = await retrieveWebsiteContext(message, {
    topK: 4,
    threshold: 0.72,
  }).catch(() => []);

  return {
    conversationId: conversation_id,
    externalUserId,
    sourceChannel: sourceChannel || "web",
    message: String(message || "").trim(),
    metadata: metadata || {},
    accountId,
    messages,
    lead: lead || null,
    appConfig,
    websiteFacts,
    knowledgeContext,
    kbContext,
  };
}
