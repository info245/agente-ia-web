import {
  createConversation,
  saveMessage,
  saveConversationEvent,
  upsertLeadFromConversation,
  getConversationMessages,
  getLeadByConversationId,
  listConversationEventsByType,
} from "../../lib/chatStore.js";

export {
  createConversation,
  saveMessage,
  saveConversationEvent,
  upsertLeadFromConversation,
  getConversationMessages,
  getLeadByConversationId,
  listConversationEventsByType,
};

export async function getRecentNotificationEvents(conversationId, limit = 20) {
  return listConversationEventsByType(conversationId, "agent_notification_sent", limit).catch(
    () => []
  );
}
