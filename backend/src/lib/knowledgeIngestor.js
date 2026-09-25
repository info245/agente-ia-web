import { openai } from "./openaiClient.js";
import { supabase } from "./supabase.js";
import { fetchPublicHttpText } from "./safeHttpFetch.js";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_PAGE_BYTES = 2 * 1024 * 1024;

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function chunks(text, size = 1200, overlap = 200) {
  const result = [];
  for (let start = 0; start < text.length; start += Math.max(1, size - overlap)) {
    const value = text.slice(start, start + size).trim();
    if (value) result.push(value);
  }
  return result.slice(0, 200);
}

async function fetchPage(rawUrl) {
  const page = await fetchPublicHttpText(rawUrl, {
    timeoutMs: 15_000,
    maxBytes: MAX_PAGE_BYTES,
    maxRedirects: 3,
    headers: { "User-Agent": "SanchoKnowledgeSync/2.0", Accept: "text/html,application/xhtml+xml" },
  });
  const title = page.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || null;
  return { url: page.url, title, text: stripHtml(page.text) };
}

export async function syncKnowledgeUrl(rawUrl, { accountId } = {}) {
  const safeAccountId = String(accountId || "").trim();
  if (!safeAccountId) throw new Error("accountId es obligatorio.");
  const page = await fetchPage(rawUrl);
  if (page.text.length < 100) throw new Error("La fuente no contiene texto suficiente.");
  const pageChunks = chunks(page.text);
  const embeddings = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: pageChunks,
  });
  const rows = pageChunks.map((chunk, index) => ({
    account_id: safeAccountId,
    url: page.url,
    title: page.title,
    chunk,
    embedding: embeddings.data?.[index]?.embedding,
    metadata: { chunk_index: index, synced_at: new Date().toISOString() },
  }));
  if (rows.some((row) => !row.embedding)) throw new Error("No se pudieron generar todos los embeddings.");

  const { data: insertedCount, error: replaceError } = await supabase.rpc("replace_kb_docs_for_url", {
    p_account_id: safeAccountId,
    p_url: page.url,
    p_title: page.title,
    p_rows: rows.map(({ chunk, embedding, metadata }) => ({ chunk, embedding, metadata })),
  });
  if (replaceError) throw replaceError;
  return {
    url: page.url,
    title: page.title,
    chunks: Number(insertedCount) || rows.length,
    synced_at: new Date().toISOString(),
  };
}

export async function syncConfiguredKnowledge(urls = [], { accountId } = {}) {
  const uniqueUrls = [...new Set((Array.isArray(urls) ? urls : []).map((url) => String(url || "").trim()).filter(Boolean))].slice(0, 25);
  const results = [];
  for (const url of uniqueUrls) {
    try {
      results.push({ ok: true, ...(await syncKnowledgeUrl(url, { accountId })) });
    } catch (error) {
      results.push({ ok: false, url, error: error.message });
    }
  }
  return results;
}
