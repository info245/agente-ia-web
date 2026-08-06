// backend/src/lib/kbRetriever.js
import { supabase } from "./supabase.js";
import { openai } from "./openaiClient.js";

const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims

function hasMissingScopedRpcError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("kb_match_docs_for_account") ||
    message.includes("could not find the function") ||
    message.includes("function") ||
    message.includes("schema cache")
  );
}

export async function retrieveWebsiteContext(query, { topK = 5, threshold = 0.75, accountId = null } = {}) {
  const q = String(query || "").trim();
  if (q.length < 3) return [];

  const emb = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: q,
  });

  const queryEmbedding = emb.data?.[0]?.embedding;
  if (!queryEmbedding) return [];

  const safeAccountId = String(accountId || "").trim();
  if (safeAccountId) {
    const { data, error } = await supabase.rpc("kb_match_docs_for_account", {
      query_embedding: queryEmbedding,
      match_count: topK,
      match_threshold: threshold,
      filter_account_id: safeAccountId,
    });

    if (!error) return data || [];

    if (!hasMissingScopedRpcError(error)) throw error;
    console.warn(
      "[kbRetriever] kb_match_docs_for_account no disponible; se omite RAG para evitar mezclar cuentas."
    );
    return [];
  }

  const { data, error } = await supabase.rpc("kb_match_docs", {
    query_embedding: queryEmbedding,
    match_count: topK,
    match_threshold: threshold,
  });

  if (error) throw error;
  return data || [];
}
