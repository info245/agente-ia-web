import { processTmediaIncomingMessage } from "../agents/orchestrators/tmediaChatOrchestrator.js";
import { processAgentV2Message } from "../agent/orchestrator.js";
import { getPublishedAppConfig } from "../lib/appConfigStore.js";
import { resolveAccount } from "../lib/accountStore.js";
import { getBillingState } from "../lib/saas.js";

const PAUSED_REPLY = "Ahora mismo no podemos atenderte por este chat. Vuelve a escribirnos más tarde, por favor.";

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
  // Cuenta pausada por impago o fin de prueba: el agente no responde con IA; no se borra nada.
  // Si falla la lectura del cobro, el agente sigue atendiendo.
  const account = await resolveAccount(input.accountId).catch(() => null);
  const billing = account
    ? await getBillingState(account.id, { isDefault: account.is_default }).catch(() => null)
    : null;
  if (billing && !billing.agent_active) {
    return { ok: true, conversation_id: input.conversationId, reply: PAUSED_REPLY, agent_paused: true };
  }
  if ((await resolveAgentEngine(input.accountId)) === "v2") return processAgentV2Message(input);
  return processTmediaIncomingMessage(input);
}
