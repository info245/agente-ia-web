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

import { retrieveWebsiteContext } from "./lib/kbRetriever.js";
import { getServiceFacts } from "./lib/websiteFacts.js";
import { sendLeadEmail, sendClientConfirmationEmail } from "./lib/emailService.js";

import { buildMemoryPatch, buildLeadMemoryContext } from "./lib/memoryUtils.js";

const app = express();

app.use(cors());
app.options("*", cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "memory-v4-chat-completed-enabled";

const lastLeadEmailSent = new Map();
const clientConfirmationSent = new Map();

function norm(v) {
  return String(v || "").trim();
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

function hasContact(lead) {
  return norm(lead?.email).length >= 3 || norm(lead?.phone).length >= 6;
}

function isCompletedLead(lead) {
  const hasLeadName = norm(lead?.name).length >= 2;
  const hasLeadService = norm(lead?.interest_service).length >= 2;
  const hasLeadContact =
    norm(lead?.email).length >= 3 || norm(lead?.phone).length >= 6;

  return hasLeadName && hasLeadService && hasLeadContact;
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
  });
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

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        ok: false,
        error: "El campo 'text' es obligatorio y debe ser texto.",
      });
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

    const history = await getConversationMessages(currentConversationId, 15);
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
      summary: text,
      lead_score: extracted?.lead_score ?? null,
      consent: extracted?.consent ?? null,
      consent_at: extracted?.consent_at ?? null,
    };

    if (!incoming.budget_range) {
      const detectedBudget = normalizeBudget(text);
      if (detectedBudget) {
        incoming.budget_range = detectedBudget;
      }
    }

    const mergedLeadBase = mergeLeadData(leadBefore, incoming);

    const memoryPatch = buildMemoryPatch({
      text,
      leadBefore,
      extracted,
      mergedLead: mergedLeadBase,
    });

    const mergedLead = mergeLeadData(mergedLeadBase, memoryPatch);

    await upsertLeadFromConversation(mergedLead);

    const leadAfter = await getLeadByConversationId(currentConversationId);

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
    let contactCTA = null;

    if (!hasName(leadAfter)) {
      reply = "Perfecto. Antes de seguir, ¿cómo te llamas?";
    } else if (!hasService(leadAfter)) {
      reply =
        "¿Qué servicio te interesa? SEO, Google Ads, Publicidad en Redes Sociales, Diseño Web o Consultoría Digital.";
    } else if (!hasBudget(leadAfter)) {
      reply = `Gracias, ${leadAfter.name}. ¿Qué presupuesto aproximado tienes para ${leadAfter.interest_service}?`;
    } else {
      if (!hasContact(leadAfter)) {
        contactCTA = `

Si quieres, puedo enviarte una propuesta orientativa para ${leadAfter.interest_service}.

¿Me dejas tu email o tu teléfono?`;
      }

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
Servicio: ${leadAfter.interest_service}
Pregunta usuario: ${text}
Presupuesto: ${leadAfter.budget_range}
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

      if (contactCTA) {
        reply += contactCTA;
      }
    }

    await saveMessage({
      conversation_id: currentConversationId,
      role: "assistant",
      content: reply,
    });

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

      if (latestLead?.email && !clientConfirmationSent.get(currentConversationId)) {
        await sendClientConfirmationEmail({
          lead: latestLead,
          conversation_id: currentConversationId,
        });

        clientConfirmationSent.set(currentConversationId, true);
      }
    } catch (e) {
      console.log("client email error", e.message);
    }

    res.json({
      ok: true,
      build: BUILD_TAG,
      conversation_id: currentConversationId,
      reply,
      lead: leadAfter || null,
      chat_completed: isCompletedLead(leadAfter),
    });
  } catch (error) {
    console.log("error", error);

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});