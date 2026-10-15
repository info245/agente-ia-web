import { toFile } from "openai";
import { openai } from "./openaiClient.js";

const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// Un BSUID ("ES.13491208655302741918") identifica al usuario que oculta su número.
export function isWhatsAppBsuid(value = "") {
  return /[a-z]/i.test(String(value || ""));
}

// Clave del contacto: el teléfono si Meta lo envía; si no, su BSUID (user_id).
export function getWhatsAppContactKey(message = {}, contacts = []) {
  const from = String(message?.from || "").trim();
  if (/^\d+$/.test(from)) return from;
  const contact =
    (contacts || []).find((item) => from && [item?.wa_id, item?.user_id].map(String).includes(from)) ||
    ((contacts || []).length === 1 ? contacts[0] : null);
  const bsuid = String(message?.from_user_id || message?.user_id || contact?.user_id || from || "").trim();
  return bsuid || null;
}

async function graphGet(url, accessToken, timeoutMs) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`WhatsApp media ${response.status}`);
  return response;
}

export async function transcribeWhatsAppAudio({ mediaId, accessToken, apiVersion = "v23.0", client = openai } = {}) {
  if (!mediaId || !accessToken) throw new Error("Falta media id o token para descargar el audio");
  const meta = await (await graphGet(`https://graph.facebook.com/${apiVersion}/${mediaId}`, accessToken, 10_000)).json();
  if (!meta?.url) throw new Error("WhatsApp no devolvió la URL del audio");
  if (Number(meta.file_size) > MAX_AUDIO_BYTES) throw new Error("Audio demasiado grande para transcribir");
  const bytes = Buffer.from(await (await graphGet(meta.url, accessToken, 20_000)).arrayBuffer());
  const extension = String(meta.mime_type || "audio/ogg").split("/")[1]?.split(";")[0] || "ogg";
  const result = await client.audio.transcriptions.create({
    file: await toFile(bytes, `audio.${extension}`, { type: meta.mime_type || "audio/ogg" }),
    model: TRANSCRIBE_MODEL,
  });
  return String(result?.text || "").trim();
}
