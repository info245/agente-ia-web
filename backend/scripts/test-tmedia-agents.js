import "dotenv/config";
import crypto from "crypto";

const BASE_URL = String(process.env.TEST_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const ACCOUNT_SLUG =
  process.env.TEST_ACCOUNT_SLUG ||
  process.env.ACCOUNT_SLUG ||
  process.env.DEFAULT_ACCOUNT_SLUG ||
  "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function postMessage(payload) {
  const body = {
    ...payload,
    ...(ACCOUNT_SLUG ? { account_slug: ACCOUNT_SLUG } : {}),
  };

  const response = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function runConversation({ channel, externalUserId, steps }) {
  let conversationId = null;
  let last = null;

  for (const text of steps) {
    last = await postMessage({
      text,
      conversation_id: conversationId,
      external_user_id: externalUserId,
      channel,
      metadata: { test_run: true },
    });
    conversationId = last.conversation_id;
    console.log(`[${channel}] user: ${text}`);
    console.log(`[${channel}] bot: ${last.reply}`);
  }

  return last;
}

async function main() {
  const runId = crypto.randomUUID().slice(0, 8);

  const seo = await runConversation({
    channel: "web",
    externalUserId: `test-web-seo-${runId}`,
    steps: [
      "Hola, necesito SEO para mi tienda online",
      "Me llamo Moure",
      "Quiero captar más ventas orgánicas",
    ],
  });
  assert(seo.lead?.interest_service, "usuario pide SEO: no se detecto servicio");
  assert(String(seo.lead?.name || "").toLowerCase() === "moure", "usuario da nombre: no guardo solo Moure");

  const googleAds = await runConversation({
    channel: "web",
    externalUserId: `test-web-ads-${runId}`,
    steps: [
      "Quiero Google Ads",
      "Tengo una clínica dental",
      "Mi objetivo es conseguir más solicitudes de cita",
      "Presupuesto 900€ al mes",
      "Urgencia alta",
      "Me llamo Laura",
      `mi email es qa+${runId}@example.com`,
    ],
  });
  assert(/google/i.test(googleAds.lead?.interest_service || ""), "usuario pide Google Ads: no se detecto");
  assert(googleAds.lead?.budget_range, "usuario da presupuesto: no se extrajo");
  assert(String(googleAds.lead?.urgency || "").toLowerCase() === "alta", "usuario da urgencia: no se extrajo");
  assert(googleAds.lead?.email, "usuario da email: no se extrajo");
  assert(googleAds.chat_completed === true, "se completa lead: chat_completed no es true");

  const duplicate = await postMessage({
    text: "Perfecto, gracias",
    conversation_id: googleAds.conversation_id,
    external_user_id: `test-web-ads-${runId}`,
    channel: "web",
    metadata: { test_run: true, duplicate_notification_check: true },
  });
  assert(duplicate.ok, "no se duplica email: el flujo repetido fallo");
  if (duplicate.notification) {
    assert(
      duplicate.notification.skipped || duplicate.notification.sent_internal === false,
      "no se duplica email: no se marco como duplicado/skipped"
    );
  }

  const whatsapp = await runConversation({
    channel: "whatsapp",
    externalUserId: `3460000${runId.replace(/\D/g, "").padEnd(4, "0").slice(0, 4)}`,
    steps: [
      "Hola, quiero diseño web",
      "Soy una empresa de reformas",
      "Mi objetivo es conseguir solicitudes de presupuesto",
      "Tengo 1500€",
      "urgencia media",
    ],
  });
  assert(whatsapp.conversation_id, "web y WhatsApp usan el mismo flujo: WhatsApp no devolvio conversacion");
  assert(/web/i.test(whatsapp.lead?.interest_service || ""), "WhatsApp no uso el flujo comun de servicio");

  console.log("\nOK: pruebas TMedia agents completadas");
  console.log(JSON.stringify({
    seo_conversation_id: seo.conversation_id,
    google_ads_conversation_id: googleAds.conversation_id,
    whatsapp_conversation_id: whatsapp.conversation_id,
  }, null, 2));
}

main().catch((error) => {
  console.error("\nFAIL:", error.message);
  process.exit(1);
});
