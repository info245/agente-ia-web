import { openai, EMBEDDING_MODEL } from "./openaiClient.js";
import { supabase } from "./supabase.js";
import { fetchPublicHttpText } from "./safeHttpFetch.js";

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

function decodeEntities(text = "") {
  return String(text)
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

// Divide la página por encabezados h1-h6 para que cada fragmento lleve su contexto
// ("Precios > Plan Growth") en vez de cortarla a ciegas por número de caracteres.
export function htmlToSections(html = "") {
  const marked = String(html || "")
    .replace(/<(script|style|noscript|nav|footer)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, inner) => `\n\u0001${level}\u0002${inner.replace(/<[^>]+>/g, " ")}\n`)
    .replace(/<br\s*\/?>|<\/(p|div|li|section|article|tr|ul|ol|table|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const sections = [];
  const path = [];
  let current = { path: [], paragraphs: [] };
  for (const rawLine of decodeEntities(marked).split("\n")) {
    const heading = rawLine.match(/^\s*\u0001(\d)\u0002(.*)$/);
    if (heading) {
      const level = Number(heading[1]);
      const title = heading[2].replace(/\s+/g, " ").trim();
      if (!title) continue;
      if (current.paragraphs.length) sections.push(current);
      path.length = Math.min(path.length, level - 1);
      path[level - 1] = title;
      current = { path: path.filter(Boolean), paragraphs: [] };
      continue;
    }
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line) current.paragraphs.push(line);
  }
  if (current.paragraphs.length) sections.push(current);
  return sections;
}

export function chunkSections(sections = [], size = 1200, overlap = 200) {
  const result = [];
  for (const section of sections) {
    const prefix = section.path.length ? `${section.path.join(" > ")}\n` : "";
    let buffer = "";
    const flush = () => {
      if (buffer) result.push(`${prefix}${buffer}`);
      buffer = "";
    };
    for (const paragraph of section.paragraphs) {
      if (paragraph.length > size) {
        flush();
        for (let start = 0; start < paragraph.length; start += size - overlap) {
          result.push(`${prefix}${paragraph.slice(start, start + size).trim()}`);
        }
        continue;
      }
      if (buffer && buffer.length + paragraph.length + 1 > size) flush();
      buffer = buffer ? `${buffer}\n${paragraph}` : paragraph;
    }
    flush();
  }
  return result.slice(0, 200);
}

async function fetchPage(rawUrl) {
  const page = await fetchPublicHttpText(rawUrl, {
    timeoutMs: 15_000,
    maxBytes: MAX_PAGE_BYTES,
    maxRedirects: 3,
    headers: { "User-Agent": "AgentKnowledgeSync/2.0", Accept: "text/html,application/xhtml+xml" },
  });
  const title = page.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || null;
  return { url: page.url, title, text: stripHtml(page.text), sections: htmlToSections(page.text) };
}

export async function syncKnowledgeUrl(rawUrl, { accountId } = {}) {
  const safeAccountId = String(accountId || "").trim();
  if (!safeAccountId) throw new Error("accountId es obligatorio.");
  const page = await fetchPage(rawUrl);
  if (page.text.length < 100) throw new Error("La fuente no contiene texto suficiente.");
  const pageChunks = chunkSections(page.sections);
  if (!pageChunks.length) throw new Error("La fuente no contiene texto suficiente.");
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

// Tabla de referencias (Excel/CSV) subida desde "Mi asistente": cada fila pasa a ser conocimiento
// que el agente encuentra con search_knowledge. Se agrupan filas hasta ~1.200 caracteres por fragmento.
export function chunkSpreadsheetRows({ name = "Tabla", headers = [], rows = [] } = {}, size = 1200) {
  const cleanHeaders = headers.map((h, i) => String(h ?? "").trim() || `Columna ${i + 1}`);
  const lines = rows
    .map((row) =>
      cleanHeaders
        .map((header, i) => {
          const value = String(row?.[i] ?? "").replace(/\s+/g, " ").trim();
          return value ? `${header}: ${value}` : "";
        })
        .filter(Boolean)
        .join(" · ")
    )
    .filter(Boolean);
  const chunks = [];
  let buffer = "";
  for (const line of lines) {
    if (buffer && buffer.length + line.length + 1 > size) {
      chunks.push(`${name}\n${buffer}`);
      buffer = "";
    }
    buffer = buffer ? `${buffer}\n${line}` : line.slice(0, size);
  }
  if (buffer) chunks.push(`${name}\n${buffer}`);
  return chunks.slice(0, 400);
}

export function spreadsheetSourceUrl(name = "") {
  const slug = String(name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `tabla://${slug || "referencias"}`;
}

export async function syncSpreadsheetKnowledge({ accountId, name, headers, rows }) {
  const safeAccountId = String(accountId || "").trim();
  if (!safeAccountId) throw new Error("accountId es obligatorio.");
  const title = String(name || "Referencias").trim().slice(0, 120);
  const chunks = chunkSpreadsheetRows({ name: title, headers, rows });
  if (!chunks.length) throw new Error("La tabla no tiene filas con datos.");
  const embeddings = [];
  for (let i = 0; i < chunks.length; i += 100) {
    const batch = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: chunks.slice(i, i + 100) });
    embeddings.push(...(batch.data || []).map((item) => item.embedding));
  }
  if (embeddings.length !== chunks.length || embeddings.some((e) => !e)) throw new Error("No se pudieron generar todos los embeddings.");
  const url = spreadsheetSourceUrl(title);
  const syncedAt = new Date().toISOString();
  const { error } = await supabase.rpc("replace_kb_docs_for_url", {
    p_account_id: safeAccountId,
    p_url: url,
    p_title: title,
    p_rows: chunks.map((chunk, index) => ({ chunk, embedding: embeddings[index], metadata: { chunk_index: index, synced_at: syncedAt, source: "spreadsheet" } })),
  });
  if (error) throw error;
  return { url, title, rows: rows.length, chunks: chunks.length, synced_at: syncedAt };
}

export async function deleteKnowledgeSource({ accountId, url }) {
  const { error } = await supabase.from("kb_docs").delete().eq("account_id", String(accountId)).eq("url", String(url));
  if (error) throw error;
}
