// backend/scripts/ingestWeb.js
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Páginas a indexar (añade todas las de servicio que quieras)
const URLS = [
  "https://t-mediaglobal.com/agencia-google-ads/",
  "https://t-mediaglobal.com/agencia-seo/",
  "https://t-mediaglobal.com/publicidad-en-redes-sociales/",
  "https://t-mediaglobal.com/diseno-web/",
  "https://t-mediaglobal.com/consultora-de-marketing-digital/",
];

// Ajustes
const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims
const CHUNK_SIZE = 1200; // caracteres aprox
const CHUNK_OVERLAP = 200;
const USER_AGENT = "TMediaGlobalRAGBot/1.0";

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html) {
  const m = html.match(/<title>(.*?)<\/title>/i);
  return m ? m[1].trim() : null;
}

function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  if (!text) return chunks;

  let i = 0;
  while (i < text.length) {
    const chunk = text.slice(i, i + size);
    chunks.push(chunk);
    i += Math.max(1, size - overlap);
  }
  return chunks;
}

async function fetchPage(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${url}`);
  const html = await res.text();
  const title = extractTitle(html);
  const text = stripHtml(html);
  return { url, title, text };
}

async function embed(text) {
  const r = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return r.data[0].embedding;
}

async function clearUrl(url) {
  const { error } = await supabase.from("kb_docs").delete().eq("url", url);
  if (error) throw error;
}

async function insertChunk({ url, title, chunk, embedding }) {
  const { error } = await supabase.from("kb_docs").insert({
    url,
    title,
    chunk,
    embedding,
  });
  if (error) throw error;
}

async function ingestUrl(url) {
  console.log(`\n==> Ingest: ${url}`);
  const page = await fetchPage(url);

  if (!page.text || page.text.length < 200) {
    console.log("Texto demasiado corto; se omite.");
    return;
  }

  // Limpia contenido previo de esa URL (evita duplicados)
  await clearUrl(url);

  const chunks = chunkText(page.text);
  console.log(`Title: ${page.title || "N/D"}`);
  console.log(`Text length: ${page.text.length}`);
  console.log(`Chunks: ${chunks.length}`);

  for (let idx = 0; idx < chunks.length; idx++) {
    const c = chunks[idx];
    const e = await embed(c);
    await insertChunk({
      url: page.url,
      title: page.title,
      chunk: c,
      embedding: e,
    });
    if ((idx + 1) % 5 === 0 || idx === chunks.length - 1) {
      console.log(`Saved ${idx + 1}/${chunks.length}`);
    }
  }
}

(async () => {
  console.log("RAG ingest start...");
  for (const url of URLS) {
    try {
      await ingestUrl(url);
    } catch (e) {
      console.error("Ingest error:", url, e?.message || e);
    }
  }
  console.log("\nRAG ingest done.");
})();