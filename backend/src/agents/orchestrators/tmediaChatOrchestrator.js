import { buildTmediaAgentContext } from "../core/agentContextBuilder.js";
import { runAgent } from "../core/agentRouter.js";
import { saveMessage, saveConversationEvent, getLeadByConversationId } from "../tools/supabaseTools.js";

function finalReply({ selectedResult, closingResult, memoryResult }) {
  if (closingResult?.chat_completed && closingResult?.closing_message) {
    return sanitizeCommercialReply(closingResult.closing_message);
  }
  if (selectedResult?.assistant_message) return sanitizeCommercialReply(selectedResult.assistant_message);
  if (selectedResult?.response) return sanitizeCommercialReply(selectedResult.response);
  if (memoryResult?.conversation_summary) {
    return "Gracias, lo tengo en cuenta. ¿Me das un poco más de detalle para poder orientarte mejor?";
  }
  return "Gracias. ¿Me cuentas qué necesitas conseguir para poder orientarte?";
}

function sanitizeCommercialReply(reply = "") {
  const text = String(reply || "").trim();
  if (!text) return text;

  const cleaned = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/consentimiento|consient|autoriza/i.test(sentence))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || text;
}

function isSanchoSupportComplaint(message = "") {
  const text = String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return (
    /\b(la (web|pagina) (que )?no funciona (bien )?es la tuya|la que no funciona (bien )?es la tuya)\b/.test(text) ||
    /\b(tu|vuestra|esta) (web|pagina|chat|asistente)\b.*\b(no funciona|falla|fallo|problema|error)\b/.test(text) ||
    /\b(no funciona|falla|fallo|problema|error)\b.*\b(sancho|sanchito|tu web|vuestra web|este chat|esta web)\b/.test(text) ||
    /\b(sancho|sanchito)\b.*\b(no funciona|falla|fallo|problema|error)\b/.test(text)
  );
}

function sanchoSupportReply() {
  return "Entiendo: te refieres a que la propia web o el asistente de Sancho no está funcionando bien. Perdona, te había interpretado como una consulta comercial y por eso repetí la pregunta. ¿Qué fallo concreto estás viendo para que pueda registrarlo y ayudarte?";
}

function shouldRunClosing(routerResult, lead = {}, memoryResult = {}) {
  if (routerResult?.next_agent === "closing") return true;
  const merged = { ...(lead || {}), ...(memoryResult?.lead_patch || {}) };
  return !!(merged.interest_service && (merged.email || merged.phone) && merged.main_goal);
}

export async function processTmediaIncomingMessage({
  conversationId = null,
  externalUserId = null,
  sourceChannel = "web",
  message,
  metadata = {},
  accountId = null,
} = {}) {
  if (!message || typeof message !== "string") {
    throw new Error("message es obligatorio y debe ser texto");
  }

  const context = await buildTmediaAgentContext({
    conversationId,
    externalUserId,
    sourceChannel,
    message,
    metadata,
    accountId,
  });

  await saveMessage({
    conversation_id: context.conversationId,
    role: "user",
    content: context.message,
    metadata,
    account_id: accountId,
  });

  await saveConversationEvent({
    conversation_id: context.conversationId,
    event_type: "message_received",
    channel: sourceChannel,
    external_user_id: externalUserId,
    account_id: accountId,
    payload: { role: "user", text: context.message.slice(0, 500), source_channel: sourceChannel },
  });

  const refreshedContext = await buildTmediaAgentContext({
    conversationId: context.conversationId,
    externalUserId,
    sourceChannel,
    message,
    metadata,
    accountId,
  });

  const routerResult = await runAgent("lead_router", refreshedContext);
  const ownProductSupport = isSanchoSupportComplaint(refreshedContext.message);
  const selectedAgentId = ownProductSupport
    ? "lead_memory" : routerResult.next_agent || "sales_qualification";
  const selectedResult = await runAgent(selectedAgentId, {
    ...refreshedContext,
    routerResult,
  });

  const memoryResult = await runAgent("lead_memory", {
    ...refreshedContext,
    routerResult,
    selectedAgentResult: selectedResult,
  });

  const leadAfterMemory = await getLeadByConversationId(context.conversationId, { accountId }).catch(() => null);
  let closingResult = null;
  if (shouldRunClosing(routerResult, leadAfterMemory || refreshedContext.lead, memoryResult)) {
    closingResult = await runAgent("closing", {
      ...refreshedContext,
      lead: leadAfterMemory || refreshedContext.lead,
      routerResult,
      memoryResult,
    });
  }

  let notificationResult = null;
  if (closingResult?.chat_completed) {
    const leadAfterClosing = await getLeadByConversationId(context.conversationId, { accountId }).catch(() => leadAfterMemory);
    notificationResult = await runAgent("notification", {
      ...refreshedContext,
      lead: leadAfterClosing || leadAfterMemory || refreshedContext.lead,
      routerResult,
      memoryResult,
      closingResult,
    });
  }

  const reply = ownProductSupport
    ? sanchoSupportReply()
    : finalReply({ selectedResult, closingResult, memoryResult });

  await saveMessage({
    conversation_id: context.conversationId,
    role: "assistant",
    content: reply,
    metadata: {
      router: routerResult,
      selected_agent: selectedAgentId,
      chat_completed: !!closingResult?.chat_completed,
    },
    account_id: accountId,
  });

  await saveConversationEvent({
    conversation_id: context.conversationId,
    event_type: closingResult?.chat_completed ? "chat_completed" : "message_sent",
    channel: sourceChannel,
    external_user_id: externalUserId,
    account_id: accountId,
    payload: {
      role: "assistant",
      text: reply.slice(0, 500),
      router: routerResult,
      selected_agent: selectedAgentId,
    },
  });

  const finalLead = await getLeadByConversationId(context.conversationId, { accountId }).catch(() => null);

  return {
    ok: true,
    build: "tmedia-agents-v1",
    conversation_id: context.conversationId,
    reply,
    replyText: reply,
    assistantMessage: reply,
    lead: finalLead,
    router: routerResult,
    selected_agent: selectedAgentId,
    selected_result: selectedResult,
    memory: memoryResult,
    closing: closingResult,
    notification: notificationResult,
    chat_completed: !!closingResult?.chat_completed,
  };
}
