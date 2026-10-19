import "dotenv/config";
import OpenAI from "openai";
import { observeOpenAI } from "@langfuse/openai";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("Falta OPENAI_API_KEY en .env");
}

console.log("✅ OPENAI_API_KEY cargada en openaiClient.js");

// Único sitio del modelo: cambiarlo es cambiar OPENAI_AGENT_MODEL en Render.
export const AGENT_MODEL = process.env.OPENAI_AGENT_MODEL || "gpt-4.1-mini";
// Motor v2 (src/agent): gpt-6-luna da 20/21 Sancho y 10/10 TMedia al menor coste (oct 2026).
// gpt-5-mini se apaga el 11 dic 2026; con gpt-4.1-mini baja a 12/21. Comparativa en el PR del cambio.
export const AGENT_V2_MODEL = process.env.OPENAI_AGENT_V2_MODEL || "gpt-6-luna";
// Ligado a vector(1536) en kb_docs: cambiarlo exige migrar y re-indexar.
export const EMBEDDING_MODEL = "text-embedding-3-small";

// Sin timeout el SDK espera hasta 10 min con 2 reintentos y bloquea al lead y a los workers.
const client = new OpenAI({
  apiKey,
  timeout: Number(process.env.OPENAI_TIMEOUT_MS) || 20000,
  maxRetries: 1,
});

// Trazas de coste, latencia y prompts en Langfuse. Sin claves, el cliente queda tal cual.
const langfuseEnabled = Boolean(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);
if (langfuseEnabled) {
  const provider = new NodeTracerProvider({ spanProcessors: [new LangfuseSpanProcessor()] });
  provider.register();
  // Render manda SIGTERM en cada deploy: vaciar el buffer para no perder las últimas trazas.
  process.once("SIGTERM", () => provider.shutdown().catch(() => {}));
  console.log("Langfuse: trazas de OpenAI activas");
}

export const openai = langfuseEnabled ? observeOpenAI(client) : client;
