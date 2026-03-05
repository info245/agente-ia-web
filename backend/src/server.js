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
const BUILD_TAG = "field-capture-v1";

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
function hasBudget(lead) {
  return norm(lead?.budget_range).length >= 2;
}
function hasEmailOrPhone(lead) {
  return norm(lead?.email).length >= 3 || norm(lead?.phone).length >= 6;
}

function cleanNameInput(text) {
  const t = norm(text).replace(/[.,;:!?]+$/g, "");
  // Si la persona responde "Claro, Antonio" -> quedarnos con la última palabra si parece nombre
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && /^claro,?$/i.test(parts[0])) return parts.slice(1).join(" ");
  return t;
}

function looksLikeBudget(text) {
  const t = String(text || "");
  return /(\d{2,6}\s*(€|eur)\b)|(\b\d{2,6}\b)/i.test(t);
}

function normalizeBudget(text) {
  const t = String(text || "").trim();

  // 300€ / 300 eur
  const m1 = t.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(€|eur)\b/i);
  if (m1) return `${Number(String(m1[1]).replace(/[.,](?=\d{3}\b)/g, ""))} €`;

  // "300" suelto -> interpretarlo como €
  const m2 = t.match(/\b(\d{2,6})\b/);
  if (m2) return `${Number(m2[1])} €`;

  return null;
}

// Detecta qué estaba preguntando el bot en el último mensaje
function detectExpectedField(historyMessages = []) {
  const lastAssistant = [...historyMessages].reverse().find((m) => m?.role === "assistant");
  const q = String(lastAssistant?.content || "").toLowerCase();

  if (q.includes("¿cómo te llamas") || q.includes("como te llamas") || q.includes("tu nombre")) {
    return "name";
  }
  if (q.includes("presupuesto") || q.includes("€/mes") || q.includes("mensual")) {
    return "budget";
  }
  if (q.includes("email") || q.includes("correo") || q.includes("teléfono") || q.includes("telefono")) {
    return "contact";
  }
  if (q.includes("¿qué servicio") || q.includes("que servicio") || q.includes("servicio te interesa")) {
    return "service";
  }
  return null;
}

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "agente-ia-web-backend",
    build: BUILD_TAG,
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.send("Backend del agente IA web activo ✅");
});

app.post("/messages", async (req, res) => {
  try {
    const { text, conversation_id, external_user_id, channel } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({
        ok: false,
        error: "El campo 'text' es obligatorio y debe ser texto.",
      });
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

    // 3) obtener historial y lead actual
    const historyMessages = await getConversationMessages(currentConversationId, 12);
    const expected = detectExpectedField(historyMessages);

    let leadBefore = await getLeadByConversationId(currentConversationId);

    // 4) extraer + aplicar “campo esperado”
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

    // ✅ CAPTURA DETERMINISTA según lo que preguntó el bot
    if (expected === "name" && !hasName(leadBefore)) {
      const candidate = cleanNameInput(text);
      // Evitar que "Quiero Google Ads" entre como nombre
      if (!/google\s*ads|seo|meta\s*ads|quiero|necesito|busco/i.test(candidate)) {
        incoming.name = candidate;
      }
    }

    if (expected === "budget" && !hasBudget(leadBefore)) {
      const b = normalizeBudget(text);
      if (b) incoming.budget_range = b;
    }

    // 5) merge + upsert + LEER LEAD REAL guardado
    const merged = mergeLeadData(leadBefore, incoming);
    await upsertLeadFromConversation(merged);
    const leadAfter = await getLeadByConversationId(currentConversationId);

    // 6) GATING (flujo fijo)
    let reply = null;

    if (!hasName(leadAfter)) {
      reply = "Perfecto. Antes de seguir, ¿cómo te llamas?";
    } else if (!hasService(leadAfter)) {
      reply = "Gracias. ¿Qué servicio te interesa: SEO, Google Ads, Meta Ads, Diseño Web, Automatización o IA?";
    } else if (!hasBudget(leadAfter)) {
      reply = `Gracias, ${leadAfter.name}. ¿Qué presupuesto aproximado mensual tienes para ${leadAfter.interest_service}?`;
    } else if (!hasEmailOrPhone(leadAfter)) {
      reply = `Genial, ${leadAfter.name}. Para enviarte una propuesta rápida, ¿me dejas tu email o tu teléfono?`;
    }

    // 7) si ya tenemos lo mínimo -> OpenAI para asesorar
    if (!reply) {
      const fallback =
        "Perfecto. Cuéntame tu objetivo principal (leads/ventas/tráfico), tu sector y si ya has hecho campañas antes.";
      try {
        const systemPrompt = getAgentSystemPrompt();
        const input = [{ role: "system", content: systemPrompt }, ...historyMessages.map(m => ({ role: m.role, content: m.content }))];

        const aiResponse = await openai.responses.create({
          model: "gpt-4.1-mini",
          input,
        });

        reply = aiResponse?.output_text?.trim() || fallback;
      } catch (err) {
        console.warn("OpenAI error:", err?.message || err);
        reply = fallback;
      }
    }

    // 8) guardar assistant
    await saveMessage({ conversation_id: currentConversationId, role: "assistant", content: reply });

    // 9) email new/update
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
        minMinutesBetween: Number(process.env.LEADS_EMAIL_UPDATE_MIN_MINUTES || 2),
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
      build: BUILD_TAG,
      conversation_id: currentConversationId,
      received_text: text,
      expected_field: expected,
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

app.use((req, res) => res.status(404).json({ ok: false, error: "Ruta no encontrada" }));

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});