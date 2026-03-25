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
} from "./lib/chatStore.js";

import { mergeLeadData } from "./lib/leadMerge.js";

import { openai } from "./lib/openaiClient.js";
import { getAgentSystemPrompt } from "./lib/agentPrompt.js";

import { retrieveWebsiteContext } from "./lib/kbRetriever.js";
import { getServiceFacts } from "./lib/websiteFacts.js";
import {
  sendLeadEmail,
  sendClientConfirmationEmail,
} from "./lib/emailService.js";

import {
  buildMemoryPatch,
  buildLeadMemoryContext,
} from "./lib/memoryUtils.js";

const app = express();

app.use(cors());
app.options("*", cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const BUILD_TAG =
  "memory-v11-staged-questions-valid-name-business-negative-safe";

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const lastLeadEmailSent = new Map();
const clientConfirmationSent = new Map();
const processedWhatsAppMessages = new Map();
const PROCESSED_MESSAGE_TTL_MS = 1000 * 60 * 60;

function cleanupProcessedMessages() {
  const now = Date.now();
  for (const [id, ts] of processedWhatsAppMessages.entries()) {
    if (now - ts > PROCESSED_MESSAGE_TTL_MS) {
      processedWhatsAppMessages.delete(id);
    }
  }
}

function markWhatsAppMessageProcessed(messageId) {
  if (!messageId) return;
  cleanupProcessedMessages();
  processedWhatsAppMessages.set(messageId, Date.now());
}

function hasProcessedWhatsAppMessage(messageId) {
  if (!messageId) return false;
  cleanupProcessedMessages();
  return processedWhatsAppMessages.has(messageId);
}

function norm(v) {
  return String(v || "").trim();
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isUserQuestion(text) {
  const t = String(text || "").trim().toLowerCase();

  if (!t) return false;
  if (t.includes("?")) return true;

  return /^(que|qué|como|cómo|cuanto|cuánto|cual|cuál|precio|precios|presupuesto|coste|costes|tarifa|tarifas)\b/i.test(
    t
  );
}

function isLikelyServiceIntent(text) {
  const t = normalizeText(text);

  return (
    t.includes("google ads") ||
    t.includes("seo") ||
    t.includes("meta ads") ||
    t.includes("redes sociales") ||
    t.includes("publicidad") ||
    t.includes("diseno web") ||
    t.includes("diseño web") ||
    t.includes("consultoria") ||
    t.includes("consultoría") ||
    t.includes("web") ||
    t.includes("campanas") ||
    t.includes("campañas")
  );
}

function isLikelyQuestionOrIntent(text) {
  const t = normalizeText(text);

  return (
    isUserQuestion(text) ||
    t.includes("quiero") ||
    t.includes("necesito") ||
    t.includes("busco") ||
    t.includes("me interesa") ||
    t.includes("cuanto cuesta") ||
    t.includes("cuánto cuesta") ||
    t.includes("precio") ||
    t.includes("presupuesto")
  );
}

function isNegativeResponse(text) {
  const t = normalizeText(text);

  return (
    t === "no" ||
    t === "nop" ||
    t === "nope" ||
    t === "no tengo" ||
    t === "no tengo empresa" ||
    t === "no empresa" ||
    t === "no tengo negocio"
  );
}

function isLikelyValidName(value) {
  const raw = String(value || "").trim();
  const t = normalizeText(raw);

  if (!raw) return false;
  if (raw.length < 2 || raw.length > 40) return false;
  if (/\d/.test(raw)) return false;
  if (/[?@]/.test(raw)) return false;

  const blockedPhrases = [
    "quiero",
    "necesito",
    "google ads",
    "seo",
    "diseno web",
    "diseño web",
    "consultoria",
    "consultoría",
    "publicidad",
    "redes sociales",
    "meta ads",
    "declaras a hacienda",
    "precio",
    "presupuesto",
    "cuanto cuesta",
    "cuánto cuesta",
  ];

  if (blockedPhrases.some((p) => t.includes(p))) return false;
  if (isLikelyServiceIntent(raw)) return false;

  const words = raw
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  if (!words.length || words.length > 4) return false;

  const allowedWord = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü'-]+$/;
  if (!words.every((w) => allowedWord.test(w))) return false;

  return true;
}

function getSafeLeadName(lead) {
  const candidate = lead?.name;
  return isLikelyValidName(candidate) ? String(candidate).trim() : null;
}

function hasName(lead) {
  return !!getSafeLeadName(lead);
}

function hasService(lead) {
  return norm(lead?.interest_service).length >= 2;
}

function hasBudget(lead) {
  return norm(lead?.budget_range).length >= 2;
}

function hasContact(lead) {
  return norm(lead?.email).length >= 3 || norm(lead?.phone).length >= 6;
}

function hasBusinessType(lead) {
  return norm(lead?.business_type).length >= 2;
}

function hasMainGoal(lead) {
  return norm(lead?.main_goal).length >= 4;
}

function hasUrgency(lead) {
  return norm(lead?.urgency).length >= 2;
}

function isCompletedLeadData(lead) {
  return hasName(lead) && hasService(lead) && hasBusinessType(lead) && hasContact(lead);
}

function isClosingReply(reply) {
  const t = String(reply || "").toLowerCase();

  if (!t) return false;

  return (
    /te contactar[ée]/i.test(t) ||
    /gracias por confiar/i.test(t) ||
    /quedo atento/i.test(t) ||
    /te escribir[ée]/i.test(t) ||
    /nos pondremos en contacto/i.test(t) ||
    /hemos recibido/i.test(t) ||
    /en breve recibirás/i.test(t) ||
    /te enviaremos/i.test(t) ||
    /recibirás la propuesta/i.test(t)
  );
}

function shouldMarkChatCompleted(lead, reply) {
  return isCompletedLeadData(lead) && isClosingReply(reply);
}

function normalizeBudget(text) {
  const t = String(text || "").trim();

  const m1 = t.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(€|eur)\b/i);
  if (m1) {
    const n = Number(String(m1[1]).replace(/[.,](?=\d{3}\b)/g, ""));
    if (Number.isFinite(n) && n >= 10) return `${n} €`;
  }

  const m2 = t.match(/\b(\d{2,6})\b/);
  if (m2) {
    const n = Number(m2[1]);
    if (Number.isFinite(n) && n >= 10) return `${n} €`;
  }

  return null;
}

function buildOpenAIInput(systemPrompt, history) {
  const input = [{ role: "system", content: systemPrompt }];

  for (const msg of history) {
    if (msg.role === "user" || msg.role === "assistant") {
      input.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  return input;
}

function buildLeadSignature(lead) {
  return JSON.stringify({
    name: lead?.name || null,
    email: lead?.email || null,
    phone: lead?.phone || null,
    interest_service: lead?.interest_service || null,
    urgency: lead?.urgency || null,
    budget_range: lead?.budget_range || null,
    business_type: lead?.business_type || null,
    main_goal: lead?.main_goal || null,
    current_situation: lead?.current_situation || null,
    pain_points: lead?.pain_points || null,
    preferred_contact_channel: lead?.preferred_contact_channel || null,
    last_intent: lead?.last_intent || null,
    summary: lead?.summary || null,
  });
}

function buildTranscript(messages = []) {
  return messages
    .filter((m) => m?.role === "user" || m?.role === "assistant")
    .map(
      (m) =>
        `${m.role === "user" ? "Usuario" : "Asistente"}: ${String(
          m.content || ""
        ).trim()}`
    )
    .join("\n");
}

function cleanReply(reply) {
  let text = String(reply || "").trim();
  text = text.replace(/\n{3,}/g, "\n\n");

  const paragraphs = text
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length <= 2) return text;

  return paragraphs.slice(0, 2).join("\n\n");
}

async function generateFinalConversationSummary({ lead, messages }) {
  const transcript = buildTranscript(messages);

  const prompt = `
Eres un asistente comercial de TMedia Global.

Tu tarea es redactar un resumen final único de todo el lead usando TODA la conversación, no solo el último tramo.

REGLAS:
- Escribe el resumen en español.
- Haz un resumen comercial útil, claro y breve.
- Longitud: 4 a 7 frases.
- Incluye solo información útil para ventas.
- Si falta un dato, no lo inventes.
- Prioriza: servicio de interés, necesidad principal, urgencia, presupuesto, datos de contacto, contexto del negocio y siguiente paso comercial.
- No pongas etiquetas tipo "Nombre:", "Email:", etc.
- No repitas literalmente frases vacías como "gracias" o "ok".
- Devuelve solo el resumen final, sin introducciones ni viñetas.

Lead estructurado actual:
${JSON.stringify(lead || {}, null, 2)}

Conversación completa:
${transcript}
`;

  const result = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  return result.output_text?.trim() || "";
}

async function sendWhatsAppText(to, bodyText) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error(
      `Faltan variables WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID. TOKEN=${!!WHATSAPP_TOKEN} PHONE_ID=${!!WHATSAPP_PHONE_NUMBER_ID}`
    );
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      body: String(bodyText || "").slice(0, 4096),
    },
  };

  const response = await fetch(
    `https://graph.facebook.com/v23.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.log("whatsapp send error", data);
    throw new Error(data?.error?.message || "Error enviando mensaje por WhatsApp");
  }

  return data;
}

function getWhatsAppTextFromMessage(message) {
  if (!message) return null;

  if (message.type === "text") {
    return String(message?.text?.body || "").trim() || null;
  }

  if (message.type === "interactive") {
    const buttonReply = message?.interactive?.button_reply?.title;
    const listReply = message?.interactive?.list_reply?.title;
    const value = String(buttonReply || listReply || "").trim();
    return value || null;
  }

  return null;
}

async function processIncomingMessage({
  text,
  conversation_id,
  external_user_id,
  channel,
}) {
  if (!text || typeof text !== "string") {
    throw new Error("El campo 'text' es obligatorio y debe ser texto.");
  }

  let currentConversationId = conversation_id;

  if (!currentConversationId) {
    const conversation = await createConversation({
      channel: channel || "web",
      external_user_id: external_user_id || null,
    });
    currentConversationId = conversation.id;
  }

  await saveMessage({
    conversation_id: currentConversationId,
    role: "user",
    content: text,
  });

  const history = await getConversationMessages(currentConversationId, 30);
  const leadBefore = await getLeadByConversationId(currentConversationId);

  const extracted = extractLeadDataFromText(text, leadBefore);

  const incoming = {
    conversation_id: currentConversationId,
    name: extracted?.name ?? null,
    email: extracted?.email ?? null,
    phone: extracted?.phone ?? null,
    interest_service: extracted?.interest_service ?? null,
    urgency: extracted?.urgency ?? null,
    budget_range: extracted?.budget_range ?? null,
    summary: leadBefore?.summary ?? null,
    lead_score: extracted?.lead_score ?? extracted?.lead_Score ?? null,
    consent: extracted?.consent ?? null,
    consent_at: extracted?.consent_at ?? null,
    business_type: extracted?.business_type ?? null,
    main_goal: extracted?.main_goal ?? null,
    current_situation: extracted?.current_situation ?? null,
    pain_points: extracted?.pain_points ?? null,
    preferred_contact_channel: extracted?.preferred_contact_channel ?? null,
    last_intent: extracted?.last_intent ?? null,
  };

  if (!incoming.budget_range) {
    const detectedBudget = normalizeBudget(text);
    if (detectedBudget) {
      incoming.budget_range = detectedBudget;
    }
  }

  const mergedLeadBase = mergeLeadData({
    currentLead: leadBefore || {},
    extractedLead: incoming,
    lastUserMessage: text,
  });

  const memoryPatch = buildMemoryPatch({
    text,
    leadBefore,
    extracted,
    mergedLead: mergedLeadBase,
  });

  const mergedLead = mergeLeadData({
    currentLead: mergedLeadBase,
    extractedLead: memoryPatch || {},
    lastUserMessage: text,
  });

  await upsertLeadFromConversation({
    ...mergedLead,
    conversation_id: currentConversationId,
  });

  let leadAfter = await getLeadByConversationId(currentConversationId);

  // Si el extractor ha guardado una frase como nombre, la invalidamos
  if (!isLikelyValidName(leadAfter?.name) && leadAfter?.name) {
    await upsertLeadFromConversation({
      ...leadAfter,
      conversation_id: currentConversationId,
      name: null,
    });

    leadAfter = await getLeadByConversationId(currentConversationId);
  }

  // Si responde "no" a la pregunta de empresa/proyecto, lo tratamos como proyecto personal
  if (!hasBusinessType(leadAfter) && isNegativeResponse(text)) {
    await upsertLeadFromConversation({
      ...leadAfter,
      conversation_id: currentConversationId,
      business_type: "proyecto personal",
    });

    leadAfter = await getLeadByConversationId(currentConversationId);
  }

  console.log("---- LEAD DEBUG ----");
  console.log("text:", text);
  console.log("leadBefore:", leadBefore);
  console.log("extracted:", extracted);
  console.log("incoming:", incoming);
  console.log("memoryPatch:", memoryPatch);
  console.log("mergedLead:", mergedLead);
  console.log("leadAfter:", leadAfter);
  console.log("--------------------");

  let reply = null;
  const userIntent = isLikelyQuestionOrIntent(text);

  if (!hasName(leadAfter)) {
    if (userIntent) {
      reply = "Claro. Antes de orientarte mejor, ¿cómo te llamas?";
    } else {
      reply = "Perfecto. Antes de seguir, ¿cómo te llamas?";
    }
  } else if (!hasBusinessType(leadAfter)) {
    reply = `Encantado, ${getSafeLeadName(
      leadAfter
    )}. ¿Tienes una empresa o es un proyecto que estás empezando?`;
  } else if (!hasMainGoal(leadAfter)) {
    reply =
      "Perfecto. ¿A qué os dedicáis exactamente o cuál es vuestra actividad principal?";
  } else if (!hasService(leadAfter)) {
    reply =
      "Gracias. ¿Qué servicio te interesa ahora mismo: SEO, Google Ads, Redes Sociales, Diseño Web o Consultoría Digital?";
  } else if (!hasBudget(leadAfter)) {
    reply = `Entendido. Para ${
      leadAfter.interest_service
    }, ¿con qué presupuesto aproximado te gustaría trabajar?`;
  } else if (!hasUrgency(leadAfter)) {
    reply =
      "Perfecto. ¿Qué prioridad tiene para ti? ¿Te gustaría empezar cuanto antes o lo estás valorando a medio plazo?";
  } else if (!hasContact(leadAfter)) {
    reply =
      "Genial. Para poder enviarte una propuesta orientativa o contactarte, ¿me dejas tu email o tu teléfono?";
  } else {
    const serviceFacts = getServiceFacts(leadAfter.interest_service);

    let factsBlock = "";

    if (serviceFacts) {
      factsBlock = `
INFORMACIÓN VERIFICADA DE LA WEB

Servicio: ${leadAfter.interest_service}

Precio mínimo: ${serviceFacts.min_monthly_fee || serviceFacts.min_project_fee}

Página oficial:
${serviceFacts.url}

Notas:
${serviceFacts.notes}
`;
    }

    let ragContext = "";

    try {
      const docs = await retrieveWebsiteContext(
        `
Servicio: ${leadAfter.interest_service || ""}
Pregunta usuario: ${text}
Presupuesto: ${leadAfter.budget_range || ""}
Objetivo: ${leadAfter.main_goal || ""}
Negocio: ${leadAfter.business_type || ""}
`
      );

      ragContext = docs
        .map(
          (d) => `
Fuente: ${d.url}

${d.chunk}
`
        )
        .join("\n");
    } catch (e) {
      console.log("RAG error", e.message);
    }

    const memoryContext = buildLeadMemoryContext(leadAfter);

    const systemPrompt = `
${getAgentSystemPrompt()}

REGLAS IMPORTANTES

1. RESPONDE SIEMPRE LA PREGUNTA DEL USUARIO
2. USA INFORMACIÓN DE LA WEB SI ESTÁ DISPONIBLE
3. LOS PRECIOS SIEMPRE DEBEN INCLUIR "+ IVA"
4. NO INVENTES PRECIOS
5. USA LA MEMORIA DEL LEAD PARA DAR CONTINUIDAD
6. SI EL USUARIO HACE UNA PREGUNTA DIRECTA, RESPÓNDELA PRIMERO
7. DESPUÉS DE RESPONDER, HAZ COMO MÁXIMO UNA PREGUNTA COMERCIAL
8. SI EXISTE INFORMACIÓN VERIFICADA DE LA WEB, USA SOLO ESA INFORMACIÓN PARA HABLAR DE PRECIOS
9. NO DES RANGOS DE PRECIOS SI NO ESTÁN EXPLÍCITAMENTE EN LA INFORMACIÓN VERIFICADA
10. RESPUESTAS BREVES: MÁXIMO 2 PÁRRAFOS CORTOS
11. NO HAGAS VARIAS PREGUNTAS SEGUIDAS EN EL MISMO MENSAJE

${memoryContext}

${factsBlock}

CONTEXTO WEB

${ragContext}
`;

    const openaiInput = buildOpenAIInput(systemPrompt, history);

    const ai = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: openaiInput,
    });

    reply = ai.output_text?.trim();

    if (!reply) {
      reply = "Cuéntame un poco más sobre tu proyecto para poder orientarte mejor.";
    }

    let nextQuestion = "";

    if (!hasBudget(leadAfter)) {
      nextQuestion = `\n\nSi te parece, lo siguiente es ver el presupuesto aproximado que quieres dedicar a ${leadAfter.interest_service}.`;
    } else if (!hasUrgency(leadAfter)) {
      nextQuestion =
        "\n\nTambién me ayudaría saber si lo necesitas cuanto antes o si lo estás valorando sin prisa.";
    } else if (!hasContact(leadAfter)) {
      nextQuestion =
        "\n\nY cuando quieras, me puedes dejar tu email o teléfono para enviarte una propuesta orientativa.";
    }

    if (nextQuestion) {
      reply += nextQuestion;
    }

    reply = cleanReply(reply);
  }

  await saveMessage({
    conversation_id: currentConversationId,
    role: "assistant",
    content: reply,
  });

  leadAfter = await getLeadByConversationId(currentConversationId);

  const chatCompleted = shouldMarkChatCompleted(leadAfter, reply);

  if (chatCompleted) {
    try {
      const fullMessages = await getConversationMessages(currentConversationId, 100);

      const finalSummary = await generateFinalConversationSummary({
        lead: leadAfter,
        messages: fullMessages,
      });

      if (finalSummary) {
        await upsertLeadFromConversation({
          ...leadAfter,
          conversation_id: currentConversationId,
          summary: finalSummary,
        });

        leadAfter = await getLeadByConversationId(currentConversationId);
      }
    } catch (e) {
      console.log("final summary error", e.message);
    }
  }

  try {
    const latestLead = await getLeadByConversationId(currentConversationId);
    const signature = buildLeadSignature(latestLead);
    const previousSignature = lastLeadEmailSent.get(currentConversationId);

    if (signature !== previousSignature) {
      await sendLeadEmail({
        lead: latestLead,
        conversation_id: currentConversationId,
        type: previousSignature ? "update" : "new",
        changedFields: [],
      });

      lastLeadEmailSent.set(currentConversationId, signature);
    }
  } catch (e) {
    console.log("lead email error", e.message);
  }

  try {
    const latestLead = await getLeadByConversationId(currentConversationId);

    if (
      latestLead?.email &&
      chatCompleted &&
      !clientConfirmationSent.get(currentConversationId)
    ) {
      await sendClientConfirmationEmail({
        lead: latestLead,
        conversation_id: currentConversationId,
      });

      clientConfirmationSent.set(currentConversationId, true);
    }
  } catch (e) {
    console.log("client email error", e.message);
  }

  return {
    ok: true,
    build: BUILD_TAG,
    conversation_id: currentConversationId,
    reply,
    lead: leadAfter || null,
    chat_completed: chatCompleted,
  };
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    build: BUILD_TAG,
    time: new Date().toISOString(),
  });
});

app.get("/debug/extract", async (req, res) => {
  try {
    const text = String(req.query.text || "");
    const existingLead = null;
    const extracted = extractLeadDataFromText(text, existingLead);

    res.json({
      ok: true,
      build: BUILD_TAG,
      input: text,
      extracted,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

app.get("/debug/lead/:conversationId", async (req, res) => {
  try {
    const lead = await getLeadByConversationId(req.params.conversationId);
    res.json({
      ok: true,
      build: BUILD_TAG,
      lead,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

app.post("/messages", async (req, res) => {
  try {
    const { text, conversation_id, external_user_id, channel } = req.body || {};

    const result = await processIncomingMessage({
      text,
      conversation_id,
      external_user_id,
      channel,
    });

    res.json(result);
  } catch (error) {
    console.log("error", error);

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get("/webhooks/whatsapp", (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
      console.log("whatsapp webhook verified");
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  } catch (error) {
    console.log("whatsapp verify error", error);
    return res.sendStatus(500);
  }
});

app.post("/webhooks/whatsapp", async (req, res) => {
  try {
    res.sendStatus(200);

    const entries = req.body?.entry || [];

    for (const entry of entries) {
      const changes = entry?.changes || [];

      for (const change of changes) {
        const value = change?.value || {};

        if (Array.isArray(value?.statuses) && value.statuses.length > 0) {
          continue;
        }

        const messages = value?.messages || [];
        if (!messages.length) continue;

        for (const message of messages) {
          const messageId = message?.id;

          if (hasProcessedWhatsAppMessage(messageId)) {
            console.log("whatsapp duplicate skipped", { messageId });
            continue;
          }

          markWhatsAppMessageProcessed(messageId);

          const from = message?.from;
          const text = getWhatsAppTextFromMessage(message);

          if (!from) continue;

          if (!text) {
            try {
              await sendWhatsAppText(
                from,
                "Ahora mismo solo puedo procesar mensajes de texto."
              );
            } catch (e) {
              console.log("non-text reply error", e.message);
            }
            continue;
          }

          console.log("incoming whatsapp", {
            from,
            text,
            messageId,
            type: message?.type,
          });

          const result = await processIncomingMessage({
            text,
            conversation_id: null,
            external_user_id: from,
            channel: "whatsapp",
          });

          if (result?.reply) {
            await sendWhatsAppText(from, result.reply);
          }
        }
      }
    }
  } catch (error) {
    console.log("whatsapp webhook error", error);
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});