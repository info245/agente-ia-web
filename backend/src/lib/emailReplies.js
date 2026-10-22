// Respuestas de leads por email: se leen del buzón de Gmail conectado por OAuth (scope mail.google.com).
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export function emailAddressFrom(header = "") {
  const value = String(header || "");
  const match = value.match(/<([^>]+)>/) || value.match(/[^\s<>"',;]+@[^\s<>"',;]+/);
  return String(match?.[1] || match?.[0] || "").trim().toLowerCase();
}

// Se queda solo con lo que ha escrito el lead, sin el email citado debajo.
export function stripQuotedReply(text = "") {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const markers = [
    /\n[^\n]*\b(?:On|El)\b[^\n]*(?:\n[^\n]*)?\b(?:wrote|escribió):/i,
    /\n-{2,}\s*(?:Original Message|Mensaje original)\s*-{2,}/i,
    /\n_{10,}/,
    /\n(?:From|De):\s[^\n]*\n(?:Sent|Enviado(?: el)?|Date|Fecha):/i,
  ];
  let cut = normalized.length;
  for (const marker of markers) {
    const index = `\n${normalized}`.search(marker);
    if (index >= 0) cut = Math.min(cut, Math.max(0, index - 1));
  }
  return normalized
    .slice(0, cut)
    .split("\n")
    .filter((line) => !line.startsWith(">"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeBase64Url(data = "") {
  return Buffer.from(String(data || ""), "base64url").toString("utf8");
}

function findPart(part, mimeType) {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts || []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

function htmlToText(html = "") {
  return String(html || "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function parseGmailMessage(message = {}) {
  const headers = Object.fromEntries(
    (message?.payload?.headers || []).map((header) => [String(header.name || "").toLowerCase(), header.value || ""])
  );
  const plain = findPart(message?.payload, "text/plain");
  const html = plain ? null : findPart(message?.payload, "text/html");
  const body = plain
    ? decodeBase64Url(plain.body.data)
    : html
      ? htmlToText(decodeBase64Url(html.body.data))
      : String(message?.snippet || "");
  const internalDate = Number(message?.internalDate || 0);
  return {
    id: String(message?.id || ""),
    threadId: String(message?.threadId || ""),
    from: emailAddressFrom(headers.from),
    subject: String(headers.subject || "").trim(),
    text: stripQuotedReply(body),
    receivedAt: internalDate ? new Date(internalDate).toISOString() : null,
    autoSubmitted: Boolean(headers["auto-submitted"] && headers["auto-submitted"] !== "no"),
  };
}

async function gmailGet(accessToken, pathAndQuery) {
  const response = await fetch(`${GMAIL_API}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gmail respondió ${response.status}`);
  }
  return payload || {};
}

export async function listRecentInboxMessageIds(accessToken, { newerThanDays = 2 } = {}) {
  const query = encodeURIComponent(`in:inbox -from:me newer_than:${newerThanDays}d`);
  const payload = await gmailGet(accessToken, `/messages?q=${query}&maxResults=100`);
  return (payload.messages || []).map((message) => message.id).filter(Boolean);
}

export async function getGmailMessage(accessToken, messageId) {
  return gmailGet(accessToken, `/messages/${encodeURIComponent(messageId)}?format=full`);
}
