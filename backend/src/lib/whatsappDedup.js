const processedMessages = new Map();
const TTL_MS = 1000 * 60 * 60 * 24;

function clean(value) {
  return String(value || "").trim();
}

function cleanup() {
  const now = Date.now();
  for (const [messageId, timestamp] of processedMessages.entries()) {
    if (now - timestamp > TTL_MS) {
      processedMessages.delete(messageId);
    }
  }
}

export async function isAlreadyProcessedWhatsAppMessage(messageId) {
  const safeMessageId = clean(messageId);
  if (!safeMessageId) return false;
  cleanup();
  return processedMessages.has(safeMessageId);
}

export async function markWhatsAppMessageProcessed(messageId) {
  const safeMessageId = clean(messageId);
  if (!safeMessageId) return { skipped: true, reason: "missing-message-id" };
  cleanup();
  processedMessages.set(safeMessageId, Date.now());
  return { ok: true };
}
