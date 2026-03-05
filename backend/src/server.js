// backend/src/server.js
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
app.use(cors());
app.options("*", cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

const lastLeadEmailSent = new Map();
function getLastSent(conversation_id) {
  return lastLeadEmailSent.get(conversation_id) || { signature: null, sentAtMs: 0 };
}
function setLastSent(conversation_id, signature) {
  lastLeadEmailSent.set(conversation_id, { signature, sentAtMs: Date.now() });
}

function norm(s = "") {
  return String(s || "").trim();
}
function hasName(lead) {
  return norm(lead?.name).length >= 2;
}
function hasService(lead) {
  return norm(lead?.interest_service).length >= 2;
}

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "agente-ia-web-backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.send("Backend del agente IA web activo ✅");
});

app.get("/test-email", async (req, res) => {
  try {
    const fakeLead = {
      name: "Test Lead",
      email: "test@example.com",
      phone: "600000000",
      interest_service: "Google Ads",
      urgency: "alta",
      budget_range: "1000-2000 €",
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

app.get("/conversations/:id/messages", async (req, res) => {
  try {
    const conversationId = req.params.id;
    const limitRaw = req.query.limit;

    const limit = Number.isFinite(Number(limitRaw))
      ? Math.max(1, Math.min(Number(limitRaw), 100))
      : 50;

    const messages = await getConversationMessages(conversationId, limit);
    return res.status(200).json({ ok: true, conversation_id: conversationId, total: messages.length, messages });
  } catch (error) {
    console.error("GET /conversations/:id/messages error:", error);
    return res.status(500).json({ ok: false, error: "Error obteniendo mensajes", details: error?.message || String(error) });
  }
});

app.get("/leads/:conversationId", async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    const lead = await getLeadByConversationId(conversationId);
    return res.status(200).json({ ok: true, conversation_id: conversationId, found: !!lead, lead });
  } catch (error) {
    console.error("GET /leads/:conversationId error:", error);
    return res.status(500).json({ ok: false, error: "Error obteniendo lead", details: error?.message || String(error) });
  }
});

function buildOpenAIInputFromHistory({ systemPrompt, historyMessages = [] }) {
  const input = [{ role: "system", content: systemPrompt }];
  for (const msg of historyMessages) {
    if (!msg?.content) continue;
    if (msg.role === "user" || msg.role === "assistant") input.push({ role: msg.role, content: msg.content });
  }
  return input;
}

app.post("/messages", async (req, res) => {
  try {
    const { text, conversation_id, external_user_id, channel } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ ok: false, error: "El campo 'text' es obligatorio y debe ser texto." });
    }

    // 1) conversación
    let currentConversationId = conversation_id || null;
    if (!currentConversationId) {
      const conversation = await createConversation({
        channel: channel || "web",
        external_user_id: external_user_id || null,
      });
      currentConversationId = conversation?.id || null;
      if (!currentConversationId) throw new Error("No se pudo crear la conversación");
    }

    // 2) guardar user msg
    await saveMessage({ conversation_id: currentConversationId, role: "user", content: text });

    // 3) upsert lead ANTES de responder
    let leadBefore = null;
    let leadAfter = null;

    try {
      leadBefore = await getLeadByConversationId(currentConversationId);
      const extracted = extractLeadDataFromText(text);

      const incoming = {
        conversation_id: currentConversationId,
        name: extracted?.name ?? null,
        email: extracted?.email ?? null,
        phone: extracted?.phone ?? null,
        interest_service: extracted?.interest_service ?? null,
        urgency: extracted?.urgency ?? null,
        budget_range: extracted?.budget_range ?? null,
        summary: extracted?.summary ?? text,
        lead_score: extracted?.lead_score ?? null,
        consent: extracted?.consent ?? null,
        consent_at: extracted?.consent_at ?? null,
      };

      const merged = mergeLeadData(leadBefore, incoming);
      await upsertLeadFromConversation(merged);
      leadAfter = merged;
    } catch (e) {
      console.warn("Lead upsert warning:", e?.message || e);
      leadAfter = leadBefore;
    }

    // 4) GATING FUERTE
    let reply = null;

    if (!hasName(leadAfter)) {
      reply = "Perfecto. Antes de seguir, ¿cómo te llamas?";
    } else if (!hasService(leadAfter)) {
      reply = "Gracias. ¿Qué servicio te interesa: SEO, Google Ads, Meta Ads, Diseño Web, Automatización o IA?";
    }

    // 5) Si pasa gating -> OpenAI
    if (!reply) {
      let fallback = "Gracias. ¿Qué objetivo tienes ahora mismo (leads, ventas, branding o tráfico) y qué presupuesto aproximado manejas?";
      try {
        const systemPrompt = getAgentSystemPrompt();
        const historyMessages = await getConversationMessages(currentConversationId, 12);
        const input = buildOpenAIInputFromHistory({ systemPrompt, historyMessages });

        const aiResponse = await openai.responses.create({ model: "gpt-4.1-mini", input });
        reply = aiResponse?.output_text?.trim() || fallback;
      } catch (err) {
        console.warn("OpenAI error:", err?.message || err);
        reply = fallback;
      }
    }

    // 6) guardar assistant
    await saveMessage({ conversation_id: currentConversationId, role: "assistant", content: reply });

    // 7) email new/update
    let email_notified = false;
    let email_type = null;
    let email_changed_fields = [];

    try {
      const latestLead = await getLeadByConversationId(currentConversationId);
      const last = getLastSent(currentConversationId);

      const decision = decideEmailSend({
        leadBefore: leadBefore || null,
        leadAfter: latestLead || null,
        lastSignatureSent: last.signature,
        lastSentAtMs: last.sentAtMs,
        minMinutesBetween: Number(process.env.LEADS_EMAIL_UPDATE_MIN_MINUTES || 10),
      });

      if (decision.sendType !== "none") {
        await sendLeadEmail({
          lead: latestLead,
          conversation_id: currentConversationId,
          type: decision.sendType,
          changedFields: decision.changedFields,
        });

        setLastSent(currentConversationId, buildLeadSignature(latestLead || {}));
        email_notified = true;
        email_type = decision.sendType;
        email_changed_fields = decision.changedFields;
      }
    } catch (e) {
      console.warn("Email warning:", e?.message || e);
    }

    return res.status(200).json({
      ok: true,
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
    return res.status(500).json({ ok: false, error: "Error interno al procesar el mensaje.", details: error?.message || String(error) });
  }
});

app.use((req, res) => res.status(404).json({ ok: false, error: "Ruta no encontrada" }));

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});