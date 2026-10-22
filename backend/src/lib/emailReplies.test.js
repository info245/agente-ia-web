import test from "node:test";
import assert from "node:assert/strict";
import { emailAddressFrom, parseGmailMessage, stripQuotedReply } from "./emailReplies.js";
import { canContinueLeadRecovery, userRepliedAfter } from "./automationPolicy.js";

const b64 = (text) => Buffer.from(text, "utf8").toString("base64url");

test("emailAddressFrom saca la dirección del remitente", () => {
  assert.equal(emailAddressFrom('"Ana Pérez" <Ana@Ejemplo.com>'), "ana@ejemplo.com");
  assert.equal(emailAddressFrom("ana@ejemplo.com"), "ana@ejemplo.com");
  assert.equal(emailAddressFrom(""), "");
});

test("stripQuotedReply quita el email citado (Gmail en español, inglés y Outlook)", () => {
  assert.equal(
    stripQuotedReply("Sí, me interesa.\n\nEl jue, 22 oct 2026 a las 10:00, Sancho <hola@heysancho.com>\nescribió:\n> Hola Ana"),
    "Sí, me interesa."
  );
  assert.equal(stripQuotedReply("Call me\r\n\r\nOn Thu, Oct 22 Sancho wrote:\r\n> hi"), "Call me");
  assert.equal(stripQuotedReply("Vale\n\nDe: Sancho\nEnviado: jueves\nAsunto: x"), "Vale");
});

test("parseGmailMessage lee remitente, asunto y texto de un multipart", () => {
  const parsed = parseGmailMessage({
    id: "m1",
    threadId: "t1",
    internalDate: "1792656000000",
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: "Ana <ana@ejemplo.com>" },
        { name: "Subject", value: "Re: Tu propuesta" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: b64("Perfecto, ¿hablamos mañana?\n\nOn Mon X wrote:\n> antes") } },
        { mimeType: "text/html", body: { data: b64("<p>Perfecto</p>") } },
      ],
    },
  });
  assert.equal(parsed.from, "ana@ejemplo.com");
  assert.equal(parsed.subject, "Re: Tu propuesta");
  assert.equal(parsed.text, "Perfecto, ¿hablamos mañana?");
  assert.equal(parsed.autoSubmitted, false);
});

test("una respuesta por email guardada como mensaje user para la secuencia de recuperación", () => {
  const lead = { crm_status: "nuevo" };
  const sentEvents = [{ created_at: "2026-10-20T10:00:00Z" }];
  const messages = [{ role: "assistant", created_at: "2026-10-20T10:00:00Z" }];
  assert.equal(canContinueLeadRecovery({ lead, messages, sentEvents }), true);

  const withEmailReply = [...messages, { role: "user", content: "Sí, me interesa", created_at: "2026-10-21T09:00:00Z" }];
  assert.equal(canContinueLeadRecovery({ lead, messages: withEmailReply, sentEvents }), false);
  // El paso ya programado tampoco se envía si el lead contestó después de programarlo.
  assert.equal(userRepliedAfter(withEmailReply, "2026-10-21T08:00:00Z"), true);
});
