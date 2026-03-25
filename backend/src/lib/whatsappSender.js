// src/lib/whatsappSender.js
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

function getMessagesEndpoint() {
  return `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

export async function sendWhatsAppTextMessage({ to, body }) {
  const response = await fetch(getMessagesEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body,
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `WhatsApp send failed: ${response.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}

export async function markWhatsAppMessageAsRead(messageId) {
  const response = await fetch(getMessagesEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `WhatsApp mark-as-read failed: ${response.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}