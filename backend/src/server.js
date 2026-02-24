import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { createConversation, saveMessage } from "./lib/chatStore.js";
import { openai } from "./lib/openaiClient.js";
import { getAgentSystemPrompt } from "./lib/agentPrompt.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Puerto
const PORT = process.env.PORT || 3000;

// Ruta de salud (health check)
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "agente-ia-web-backend",
    timestamp: new Date().toISOString()
  });
});

// Ruta raíz opcional (útil para probar rápido en navegador)
app.get("/", (req, res) => {
  res.send("Backend del agente IA web activo ✅");
});
// Ruta de mensajes (dummy + guardado en Supabase)
app.post("/messages", async (req, res) => {
  try {
    const { text, conversation_id, external_user_id, channel } = req.body || {};

    // Validación mínima
    if (!text || typeof text !== "string") {
      return res.status(400).json({
        ok: false,
        error: "El campo 'text' es obligatorio y debe ser texto."
      });
    }

    // 1) Obtener o crear conversación
    let currentConversationId = conversation_id || null;

    if (!currentConversationId) {
      const conversation = await createConversation({
        channel: channel || "web",
        external_user_id: external_user_id || null
      });

      currentConversationId = conversation.id;
    }

    // 2) Guardar mensaje del usuario
    await saveMessage({
      conversation_id: currentConversationId,
      role: "user",
      content: text
    });

    // 3) Respuesta dummy del asistente (por ahora)
    let reply = "Hola, soy tu agente IA. ¿En qué puedo ayudarte hoy?";

try {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: getAgentSystemPrompt() },
      { role: "user", content: text }
    ],
    temperature: 0.4
  });

  reply = completion?.choices?.[0]?.message?.content?.trim() || reply;
} catch (aiError) {
  console.error("⚠️ Error llamando a OpenAI. Uso fallback dummy:", aiError);
}

    // 4) Guardar respuesta del asistente
    await saveMessage({
      conversation_id: currentConversationId,
      role: "assistant",
      content: reply
    });

    // 5) Responder al cliente
    return res.status(200).json({
      ok: true,
      conversation_id: currentConversationId,
      external_user_id: external_user_id || null,
      channel: channel || "web",
      received_text: text,
      reply
    });
  } catch (error) {
    console.error("❌ Error en POST /messages:", error);

    return res.status(500).json({
      ok: false,
      error: "Error interno al procesar el mensaje."
    });
  }
});
// Arranque del servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);
});
