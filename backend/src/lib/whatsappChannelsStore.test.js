import test from "node:test";
import assert from "node:assert/strict";

process.env.OPENAI_API_KEY ||= "test-key";
const { encryptSecret } = await import("./secretCrypto.js");
const { channelTokenFromRow } = await import("./whatsappChannelsStore.js");

test("un token cifrado con otra clave no rompe WhatsApp: usa el token de entorno si es el mismo número", () => {
  const originalKey = process.env.SECRETS_ENCRYPTION_KEY;
  const originalEnv = { id: process.env.WHATSAPP_PHONE_NUMBER_ID, token: process.env.WHATSAPP_TOKEN };
  const error = console.error;
  console.error = () => {};
  try {
    process.env.SECRETS_ENCRYPTION_KEY = "clave-del-otro-servicio-0123456789abcdef";
    const encrypted = encryptSecret("token-real");
    assert.equal(channelTokenFromRow({ access_token: encrypted, phone_number_id: "111" }), "token-real");

    process.env.SECRETS_ENCRYPTION_KEY = "clave-de-produccion-0123456789abcdefghij";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "111";
    process.env.WHATSAPP_TOKEN = "token-de-entorno";
    assert.equal(channelTokenFromRow({ access_token: encrypted, phone_number_id: "111" }), "token-de-entorno");
    assert.equal(channelTokenFromRow({ access_token: encrypted, phone_number_id: "222" }), "");
  } finally {
    console.error = error;
    process.env.SECRETS_ENCRYPTION_KEY = originalKey;
    process.env.WHATSAPP_PHONE_NUMBER_ID = originalEnv.id;
    process.env.WHATSAPP_TOKEN = originalEnv.token;
    for (const [k, v] of Object.entries({ SECRETS_ENCRYPTION_KEY: originalKey, WHATSAPP_PHONE_NUMBER_ID: originalEnv.id, WHATSAPP_TOKEN: originalEnv.token })) {
      if (v === undefined) delete process.env[k];
    }
  }
});
