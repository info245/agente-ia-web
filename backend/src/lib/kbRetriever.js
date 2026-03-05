// backend/src/lib/kbRetriever.js
import { supabase } from "./supabase.js";
import { openai } from "./openaiClient.js";

const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims

export async function retrieveWebsiteContext(query, { topK = 5, threshold = 0.75 } = {}) {
  const q = String(query || "").trim();
  if (q.length < 3) return [];

  const emb = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: q,
  });

  const queryEmbedding = emb.data?.[0]?.embedding;
  if (!queryEmbedding) return [];

  const { data, error } = await supabase.rpc("kb_match_docs", {
    query_embedding: queryEmbedding,
    match_count: topK,
    match_threshold: threshold,
  });

  if (error) throw error;
  return data || [];
}