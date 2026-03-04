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

import { sendLeadEmail } from "./lib/emailService.js";
import { buildLeadSignature, decideEmailSend } from "./lib/leadEmailPolicy.js";

const app = express();

// CORS abierto (para producción podemos limitar a t-mediaglobal.com)
app.use(cors());
app.options("*", cors());

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

// Memoria simple para evitar reenvíos idénticos
// conversation_id -> { signature, sentAtMs }
const lastLeadEmailSent = new Map();

function getLastSent(conversation_id) {
  return lastLeadEmailSent.get(conversation_id) || { signature: null, sentAtMs: 0 };
}

function setLastSent(conversation_id, signature) {
  lastLeadEmailSent.set(conversation_id, { signature, sentAtMs: Date.now() });
}

// HEALTH
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "agente-ia-web-backend",
    timestamp: new Date().toISOString(),
  });
});

// ROOT
app.get("/", (req, res) => {
  res.send("Backend del agente IA web activo ✅");
});

// TEST EMAIL
app.get("/test-email", async (req, res) => {
  try {
    const fakeLead = {
      name: "Test Lead",
      email: "test@example.com",
      phone: "600000000",
      interest_service: "Google Ads",
      urgency: "Alta",
      budget_range: "1000-2000",
      summary: "Email de prueba para verificar SMTP desde Render.",
      lead_score: 80,
      consent: true,
      consent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const out = await sendLeadEmail({
      lead: fakeLead,
      conversation_id: "TEST-CONV",
      type: "new",
      changedFields: [],
    });

    return res.status(200).json({
      ok: true,
      message: "Email de prueba enviado (si SMTP está bien configurado).",
      out,
    });
  } catch (error) {
    console.error("GET /test-email error:", error);
    return res.status(500).json({
      ok: false,
      error: "Error enviando email de prueba",
      details: error?.message || String(error),
    });
  }
});

// DEBUG: mensajes de conversación
app.get("/conversations/:id/messages", async (req, res) => {
  try {
    const conversationId = req.params.id;
    const limitRaw = req.query.limit;

    const limit = Number.isFinite(Number(limitRaw))
      ? Math.max(1, Math.min(Number(limitRaw), 100))
      : 50;

    const messages = await getConversationMessages(conversationId, limit);

    return res.status(200).json({
      ok: true,
      conversation_id: conversationId,
      total: messages.length,
      messages,
    });
  } catch (error) {
    console.error("GET /conversations/:id/messages error:", error);
    return res.status(500).json({
      ok: false,
      error: "Error obteniendo mensajes",
      details: error?.message || String(error),
    });
  }
});

// DEBUG: lead por conversación
app.get("/leads/:conversationId", async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    const lead = await getLeadByConversationId(conversationId);

    return res.status(200).json({
      ok: true,
      conversation_id: conversationId,
      found: !!lead,
      lead,
    });
  } catch (error) {
    console.error("GET /leads/:conversationId error:", error);
    return res.status(500).json({
      ok: false,
      error: "Error obteniendo lead",
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
      input.push({ role: msg.role, content: msg.content });
    }
  }

  return input;
}

// POST /messages
app.post("/messages", async (req, res) => {
  try {
    const { text, conversation_id, external_user_id, channel } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        ok: false,
        error: "El campo 'text' es obligatorio y debe ser texto.",
      });
    }

    // 1) Obtener/crear conversación
    let currentConversationId = conversation_id || null;

    if (!currentConversationId) {
      const conversation = await createConversation({
        channel: channel || "web",
        external_user_id: external_user_id || null,
      });

      currentConversationId = conversation?.id || null;

      if (!currentConversationId) {
        throw new Error("No se pudo crear la conversación");
      }
    }

    // 2) Guardar mensaje user
    await saveMessage({
      conversation_id: currentConversationId,
      role: "user",
      content: text,
    });

    // 3) OpenAI con historial
    let reply =
      "Gracias por tu mensaje. Podemos ayudarte con web, SEO, Ads y automatización. ¿Qué objetivo tienes ahora mismo?";

    try {
      const systemPrompt = getAgentSystemPrompt();
      const historyMessages = await getConversationMessages(currentConversationId, 12);

      const input = buildOpenAIInputFromHistory({
        systemPrompt,
        historyMessages,
      });

      const aiResponse = await openai.responses.create({
        model: "gpt-4.1-mini",
        input,
      });

      reply =
        aiResponse?.output_text?.trim() ||
        "Gracias por tu mensaje. ¿Puedes darme un poco más de detalle para ayudarte mejor?";
    } catch (openAiError) {
      console.warn("OpenAI error (fallback):", openAiError?.message || openAiError);
    }

    // 4) Guardar mensaje assistant
    await saveMessage({
      conversation_id: currentConversationId,
      role: "assistant",
      content: reply,
    });

    // 5) Lead (extract + merge + upsert) + EMAIL NEW/UPDATE
    let email_notified = false;
    let email_type = null;
    let email_changed_fields = [];

    try {
      const extractedLead = extractLeadDataFromText(text);

      const incomingLeadPayload = {
        conversation_id: currentConversationId,
        name: extractedLead?.name ?? null,
        email: extractedLead?.email ?? null,
        phone: extractedLead?.phone ?? null,
        interest_service:
          extractedLead?.interest_service ?? extractedLead?.interested_service ?? null,
        urgency: extractedLead?.urgency ?? null,
        budget_range: extractedLead?.budget_range ?? extractedLead?.budget_text ?? null,
        summary: extractedLead?.summary ?? extractedLead?.notes ?? text,
        lead_score: extractedLead?.lead_score ?? extractedLead?.lead_Score ?? null,
        consent: extractedLead?.consent ?? null,
        consent_at: extractedLead?.consent_at ?? null,
      };

      const leadBefore = await getLeadByConversationId(currentConversationId);
      const merged = mergeLeadData(leadBefore, incomingLeadPayload);

      // Guardar en Supabase
      await upsertLeadFromConversation(merged);

      // Decidir si enviar email NEW o UPDATE
      const last = getLastSent(currentConversationId);
      const decision = decideEmailSend({
        leadBefore,
        leadAfter: merged,
        lastSignatureSent: last.signature,
        lastSentAtMs: last.sentAtMs,
        minMinutesBetween: Number(process.env.LEADS_EMAIL_UPDATE_MIN_MINUTES || 10),
      });

      if (decision.sendType !== "none") {
        try {
          await sendLeadEmail({
            lead: merged,
            conversation_id: currentConversationId,
            type: decision.sendType,
            changedFields: decision.changedFields,
          });

          // Guardamos signature enviada para no repetir lo mismo
          const signature = buildLeadSignature(merged);
          setLastSent(currentConversationId, signature);

          email_notified = true;
          email_type = decision.sendType;
          email_changed_fields = decision.changedFields;
        } catch (mailErr) {
          console.error("Lead email error:", mailErr?.message || mailErr);
        }
      }
    } catch (leadErr) {
      console.warn("Lead upsert warning:", leadErr?.message || leadErr);
    }

    return res.status(200).json({
      ok: true,
      step: "render-fixed-exports",
      conversation_id: currentConversationId,
      external_user_id: external_user_id || null,
      channel: channel || "web",
      received_text: text,
      reply,
      email_notified,
      email_type,
      email_changed_fields,
    });
  } catch (error) {
    console.error("POST /messages error:", error);
    return res.status(500).json({
      ok: false,
      error: "Error interno al procesar el mensaje.",
      details: error?.message || String(error),
    });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Ruta no encontrada" });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});