import "dotenv/config";

import express from "express";
import cors from "cors";

import { extractLeadDataFromText } from "./lib/leadExtractor.js";
import {
  createConversation,
  saveMessage,
  upsertLeadFromConversation,
  getConversationMessages,
  getLeadByConversationId,
  mergeLeadData,
} from "./lib/chatStore.js";
import { openai } from "./lib/openaiClient.js";
import { getAgentSystemPrompt } from "./lib/agentPrompt.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Puerto
const PORT = process.env.PORT || 3000;

// Ruta de salud
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "agente-ia-web-backend",
    timestamp: new Date().toISOString(),
  });
});

// Ruta raíz
app.get("/", (req, res) => {
  res.send("Backend del agente IA web activo ✅");
});

// GET historial de mensajes (debug)
app.get("/conversations/:id/messages", async (req, res) => {
  try {
    const conversationId = req.params.id;
    const limitRaw = req.query.limit;
    const limit = Number.isFinite(Number(limitRaw))
      ? Math.max(1, Math.min(Number(limitRaw), 100))
      : 50;

    if (!conversationId) {
      return res.status(400).json({
        ok: false,
        error: "conversation_id es obligatorio en la URL",
      });
    }

    const messages = await getConversationMessages(conversationId, limit);

    return res.status(200).json({
      ok: true,
      conversation_id: conversationId,
      total: messages.length,
      messages,
    });
  } catch (error) {
    console.error("Error en GET /conversations/:id/messages:", error);

    return res.status(500).json({
      ok: false,
      error: "Error obteniendo mensajes de la conversación",
      details: error?.message || String(error),
    });
  }
});

// GET lead por conversation_id
app.get("/leads/:conversationId", async (req, res) => {
  try {
    const conversationId = req.params.conversationId;

    if (!conversationId) {
      return res.status(400).json({
        ok: false,
        error: "conversationId es obligatorio en la URL",
      });
    }

    const lead = await getLeadByConversationId(conversationId);

    return res.status(200).json({
      ok: true,
      conversation_id: conversationId,
      found: !!lead,
      lead,
    });
  } catch (error) {
    console.error("Error en GET /leads/:conversationId:", error);

    return res.status(500).json({
      ok: false,
      error: "Error obteniendo lead por conversation_id",
      details: error?.message || String(error),
    });
  }
});

// GET debug combinado (mensajes + lead)
app.get("/debug/conversation/:id", async (req, res) => {
  try {
    const conversationId = req.params.id;
    const limitRaw = req.query.limit;
    const limit = Number.isFinite(Number(limitRaw))
      ? Math.max(1, Math.min(Number(limitRaw), 100))
      : 50;

    if (!conversationId) {
      return res.status(400).json({
        ok: false,
        error: "conversation_id es obligatorio en la URL",
      });
    }

    const [messages, lead] = await Promise.all([
      getConversationMessages(conversationId, limit),
      getLeadByConversationId(conversationId),
    ]);

    return res.status(200).json({
      ok: true,
      conversation_id: conversationId,
      messages_total: messages.length,
      messages,
      lead_found: !!lead,
      lead,
    });
  } catch (error) {
    console.error("Error en GET /debug/conversation/:id:", error);

    return res.status(500).json({
      ok: false,
      error: "Error obteniendo debug de conversación",
      details: error?.message || String(error),
    });
  }
});

// Helper OpenAI
function buildOpenAIInputFromHistory({ systemPrompt, historyMessages = [] }) {
  const input = [{ role: "system", content: systemPrompt }];

  for (const msg of historyMessages) {
    if (!msg?.content) continue;

    if (msg.role === "user" || msg.role === "assistant") {
      input.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  return input;
}

// POST /messages
app.post("/messages", async (req, res) => {
  try {
    const { text, conversation_id, external_user_id, channel } = req.body || {};

    console.log("POST /messages recibido");
    console.log("Body:", req.body);

    // 1) Validación mínima
    if (!text || typeof text !== "string") {
      return res.status(400).json({
        ok: false,
        error: "El campo 'text' es obligatorio y debe ser texto.",
      });
    }

    // 2) Obtener o crear conversación
    let currentConversationId = conversation_id || null;

    try {
      if (!currentConversationId) {
        const conversation = await createConversation({
          channel: channel || "web",
          external_user_id: external_user_id || null,
        });

        currentConversationId = conversation?.id || null;

        if (!currentConversationId) {
          throw new Error("No se pudo obtener conversation.id al crear conversación");
        }

        console.log("Conversación creada:", currentConversationId);
      } else {
        console.log("Usando conversación existente:", currentConversationId);
      }
    } catch (convError) {
      console.error("Error creando/obteniendo conversación:", convError);
      return res.status(500).json({
        ok: false,
        error: "Error al crear/obtener conversación",
        details: convError?.message || String(convError),
      });
    }

    // 3) Guardar mensaje del usuario
    try {
      await saveMessage({
        conversation_id: currentConversationId,
        role: "user",
        content: text,
      });
      console.log("Mensaje de usuario guardado");
    } catch (msgError) {
      console.error("Error guardando mensaje:", msgError);
      return res.status(500).json({
        ok: false,
        error: "Error al guardar mensaje en Supabase",
        details: msgError?.message || String(msgError),
      });
    }

    // 4) Generar respuesta con OpenAI usando historial
    let reply =
      "Gracias por tu mensaje. Estamos en modo prueba (sin OpenAI) mientras validamos Supabase.";

    let historyCountForAI = 0;
    let aiUsedHistory = false;

    try {
      const systemPrompt = getAgentSystemPrompt();

      const historyMessages = await getConversationMessages(currentConversationId, 12);
      historyCountForAI = historyMessages.length;

      const input = buildOpenAIInputFromHistory({
        systemPrompt,
        historyMessages,
      });

      aiUsedHistory = input.length > 2;

      const aiResponse = await openai.responses.create({
        model: "gpt-4.1-mini",
        input,
      });

      reply =
        aiResponse?.output_text?.trim() ||
        "Gracias por tu mensaje. ¿Puedes darme un poco más de detalle para ayudarte mejor?";
    } catch (openAiError) {
      console.warn(
        "Error llamando a OpenAI. Uso fallback:",
        openAiError?.message || openAiError
      );

      reply =
        "Gracias por tu mensaje. Podemos ayudarte con web, SEO, automatización o captación de leads. ¿Qué objetivo tienes ahora mismo?";
    }

    // 5) Guardar respuesta del asistente
    try {
      await saveMessage({
        conversation_id: currentConversationId,
        role: "assistant",
        content: reply,
      });
      console.log("Mensaje del asistente guardado");
    } catch (assistantMsgError) {
      console.error("Error guardando respuesta del asistente:", assistantMsgError);
      // no rompemos respuesta por esto
    }

    // 6) Extraer + MERGE inteligente + upsert lead (best effort)
    let extractedLead = null;
    let leadBeforeMerge = null;
    let mergedLeadPayload = null;
    let leadUpsertResult = null;
    let leadUpsertStatus = "not_attempted";
    let leadUpsertError = null;

    try {
      extractedLead = extractLeadDataFromText(text);
      console.log("Lead extraído:", extractedLead);

      // Mapeo del extractor -> columnas reales
      const incomingLeadPayload = {
        conversation_id: currentConversationId,
        name: extractedLead?.name ?? null,
        email: extractedLead?.email ?? null,
        phone: extractedLead?.phone ?? null,
        interest_service:
          extractedLead?.interest_service ??
          extractedLead?.interested_service ??
          null,
        urgency: extractedLead?.urgency ?? null,
        budget_range:
          extractedLead?.budget_range ??
          extractedLead?.budget_text ??
          null,
        summary: extractedLead?.summary ?? extractedLead?.notes ?? text,
        lead_score:
          extractedLead?.lead_score ??
          extractedLead?.lead_Score ??
          null,
        consent: extractedLead?.consent ?? null,
        consent_at: extractedLead?.consent_at ?? null,
      };

      // Leer lead actual (si existe)
      leadBeforeMerge = await getLeadByConversationId(currentConversationId);

      // Merge inteligente (evita pisar con null)
      mergedLeadPayload = mergeLeadData(leadBeforeMerge, incomingLeadPayload);

      // Upsert final
      leadUpsertResult = await upsertLeadFromConversation(mergedLeadPayload);

      leadUpsertStatus = "ok";
      console.log("Lead actualizado en Supabase (merge inteligente):", currentConversationId);
    } catch (leadError) {
      leadUpsertStatus = "error";
      leadUpsertError = leadError?.message || String(leadError);
      console.warn("No se pudo guardar/actualizar lead:", leadUpsertError);
    }

    // 7) Respuesta final
    const responsePayload = {
      ok: true,
      step: "supabase-on-openai-on-history-merged-lead",
      conversation_id: currentConversationId,
      external_user_id: external_user_id || null,
      channel: channel || "web",
      received_text: text,
      reply,
    };

    if (process.env.NODE_ENV !== "production") {
      responsePayload.lead_debug = {
        extracted: extractedLead,
        lead_before_merge: leadBeforeMerge,
        merged_payload: mergedLeadPayload,
        upsert_status: leadUpsertStatus,
        upsert_error: leadUpsertError,
        upsert_result: leadUpsertResult,
      };

      responsePayload.ai_debug = {
        used_history: aiUsedHistory,
        history_messages_loaded: historyCountForAI,
      };
    }

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error("Error en POST /messages:", error);

    return res.status(500).json({
      ok: false,
      error: "Error interno al procesar el mensaje.",
      details: error?.message || String(error),
    });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Ruta no encontrada",
  });
});

// Arrancar servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});