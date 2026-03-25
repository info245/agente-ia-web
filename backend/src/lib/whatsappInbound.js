// src/lib/whatsappInbound.js
import { findOrCreateConversationByExternalUserId } from "./chatStore.js";
import { processIncomingMessage } from "../core/processIncomingMessage.js";
import { sendWhatsAppTextMessage, markWhatsAppMessageAsRead } from "./whatsappSender.js";
import { isAlreadyProcessedWhatsAppMessage, markWhatsAppMessageProcessed } from "./whatsappDedup.js";

function getMessageText(message) {
  if (!message) return null;

  if (message.type === "text") {
    return message.text?.body?.trim() || null;
  }

  // Opcional: soportar botón interactivo / reply
  if (message.type === "interactive") {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      null
    );
  }

  return null;
}

function extractInboundEvents(body) {
  const events = [];

  if (!body?.entry?.length) return events;

  for (const entry of body.entry) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;

      const value = change.value || {};

      // IMPORTANTE:
      // statuses = estados de mensajes enviados por ti → ignorar
      if (value.statuses?.length) continue;

      const contacts = value.contacts || [];
      const messages = value.messages || [];

      for (const message of messages) {
        const from = message.from;
        const wamid = message.id;
        const timestamp = message.timestamp;
        const text = getMessageText(message);

        const contact = contacts.find((c) => c.wa_id === from);

        events.push({
          phone: from,
          wamid,
          timestamp,
          text,
          profileName: contact?.profile?.name || null,
          rawMessage: message,
          rawValue: value,
        });
      }
    }
  }

  return events;
}

export async function handleWhatsAppWebhook(body) {
  const events = extractInboundEvents(body);

  for (const event of events) {
    try {
      if (!event.phone || !event.wamid) continue;
      if (!event.text) continue; // ignoramos medios no soportados por ahora

      // Deduplicación fuerte por ID único de WhatsApp
      const alreadyProcessed = await isAlreadyProcessedWhatsAppMessage(event.wamid);
      if (alreadyProcessed) {
        console.log("[whatsapp] duplicate skipped:", event.wamid);
        continue;
      }

      await markWhatsAppMessageProcessed(event.wamid);

      // Opcional: marcar como leído
      await markWhatsAppMessageAsRead(event.wamid).catch((err) => {
        console.warn("[whatsapp] mark as read failed:", err.message);
      });

      // Reutiliza tu persistencia actual
      const conversation = await findOrCreateConversationByExternalUserId({
        channel: "whatsapp",
        external_user_id: event.phone,
      });

      const result = await processIncomingMessage({
        channel: "whatsapp",
        externalUserId: event.phone,
        conversationId: conversation.id,
        messageText: event.text,
        metadata: {
          whatsappMessageId: event.wamid,
          whatsappTimestamp: event.timestamp,
          whatsappProfileName: event.profileName,
          raw: event.rawMessage,
        },
      });

      const replyText =
        result?.replyText ||
        result?.assistantMessage ||
        result?.text ||
        null;

      if (replyText) {
        await sendWhatsAppTextMessage({
          to: event.phone,
          body: replyText,
        });
      }
    } catch (error) {
      console.error("[whatsapp] inbound event error:", {
        wamid: event?.wamid,
        phone: event?.phone,
        error: error.message,
      });
    }
  }
}