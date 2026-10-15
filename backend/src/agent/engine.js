import { openai, AGENT_V2_MODEL } from "../lib/openaiClient.js";
import { STATIC_INSTRUCTIONS, buildAccountContext, buildTurnState } from "./instructions.js";

export const INTENTS = [
  "greeting",
  "product_question",
  "pricing_question",
  "use_case",
  "integration_question",
  "guided_discovery",
  "lead_capture",
  "booking_request",
  "beta_access_request",
  "quote_request",
  "human_request",
  "support",
  "loop_complaint",
  "prompt_injection",
  "agent_question",
  "objection",
  "other",
];

const REPLY_FORMAT = {
  type: "json_schema",
  name: "agent_reply",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    // Clasificar antes de redactar: el modelo decide qué caso es y luego escribe.
    required: ["intent", "reply"],
    properties: {
      intent: { type: "string", enum: INTENTS },
      reply: { type: "string" },
    },
  },
};

const nullableString = { type: ["string", "null"] };

function tool(name, description, properties) {
  return {
    type: "function",
    name,
    description,
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(properties),
      properties,
    },
  };
}

export const TOOL_DEFINITIONS = {
  search_knowledge: tool(
    "search_knowledge",
    "Busca en la base de conocimiento de la cuenta (web, precios, casos de uso, FAQs). Devuelve fragmentos con su URL.",
    { query: { type: "string", description: "Consulta concreta, con los términos clave." } }
  ),
  save_lead_fields: tool(
    "save_lead_fields",
    "Guarda en el CRM los datos que la persona ha dado. null en lo que no haya dicho.",
    {
      name: nullableString,
      email: nullableString,
      phone: nullableString,
      company: nullableString,
      interest_service: nullableString,
      budget_range: nullableString,
      urgency: nullableString,
      main_goal: nullableString,
    }
  ),
  get_available_slots: tool(
    "get_available_slots",
    "Huecos libres reales en el calendario del equipo.",
    {
      from_date: { type: ["string", "null"], description: "YYYY-MM-DD; null = desde hoy." },
      days: { type: ["integer", "null"], description: "Días a revisar (1-14); null = 5." },
    }
  ),
  book_meeting: tool(
    "book_meeting",
    "Reserva la reunión en un hueco devuelto por get_available_slots.",
    {
      start: { type: "string", description: "Inicio exacto del hueco elegido, en ISO 8601." },
      name: { type: "string" },
      email: { type: "string" },
      notes: nullableString,
    }
  ),
  handoff_to_human: tool(
    "handoff_to_human",
    "Pasa la conversación al equipo humano y pausa al asistente.",
    { reason: { type: "string", description: "Motivo y contexto en una frase." } }
  ),
  send_quote: tool(
    "send_quote",
    "Registra una petición de presupuesto o propuesta para que el equipo la prepare y la envíe.",
    { summary: { type: "string", description: "Qué necesita la persona, con los datos que ha dado." } }
  ),
};

function toInputMessages(messages = []) {
  return (messages || [])
    .filter((message) => ["user", "assistant"].includes(message?.role))
    .map((message) => ({ role: message.role, content: String(message.content || message.text || "").trim() }))
    .filter((message) => message.content)
    .slice(-20);
}

function normalize(text = "") {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function parseReply(text = "") {
  try {
    const parsed = JSON.parse(text);
    return { reply: String(parsed.reply || "").trim(), intent: INTENTS.includes(parsed.intent) ? parsed.intent : "other" };
  } catch {
    return { reply: String(text || "").trim(), intent: "other" };
  }
}

async function runTool(handler, call) {
  try {
    const args = JSON.parse(call.arguments || "{}");
    return { args, result: await handler(args) };
  } catch (error) {
    return { args: null, result: { ok: false, error: error?.message || String(error) } };
  }
}

/**
 * Un turno del agente: el modelo decide, llama herramientas y escribe la respuesta.
 * `handlers` decide qué herramientas existen para esta cuenta (sin calendario, no hay reserva).
 */
export async function runAgentTurn({
  appConfig = null,
  lead = {},
  messages = [],
  channel = "web",
  handlers = {},
  client = openai,
  model = AGENT_V2_MODEL,
  maxSteps = 4,
  now = new Date(),
} = {}) {
  const toolNames = Object.keys(handlers).filter((name) => TOOL_DEFINITIONS[name]);
  const tools = toolNames.map((name) => TOOL_DEFINITIONS[name]);
  const instructions = `${STATIC_INSTRUCTIONS}\n\n${buildAccountContext(appConfig)}`;
  const history = toInputMessages(messages);
  const state = { role: "developer", content: buildTurnState({ lead, appConfig, channel, now, tools: toolNames }) };
  // El estado justo antes del último mensaje: el modelo responde al usuario, no al sistema.
  let input = [...history.slice(0, -1), state, ...history.slice(-1)];
  const toolCalls = [];
  const previousReplies = new Set(history.filter((item) => item.role === "assistant").map((item) => normalize(item.content)));
  let retriedRepeat = false;

  for (let step = 0; step < maxSteps; step += 1) {
    const lastStep = step === maxSteps - 1;
    const response = await client.responses.create({
      model,
      instructions,
      input,
      tools,
      tool_choice: lastStep || !tools.length ? "none" : "auto",
      text: { format: REPLY_FORMAT },
      // Con modelos de razonamiento, "low" mantiene la latencia de un chat comercial.
      ...(/^(gpt-5|o\d)/.test(model) ? { reasoning: { effort: process.env.OPENAI_AGENT_V2_REASONING_EFFORT || "low" } } : {}),
    });

    const calls = (response.output || []).filter((item) => item.type === "function_call");
    if (!calls.length) {
      const parsed = parseReply(response.output_text);
      // Repetir literalmente un mensaje anterior es el fallo que más irrita: una sola reescritura.
      if (!retriedRepeat && !lastStep && previousReplies.has(normalize(parsed.reply))) {
        retriedRepeat = true;
        input = [
          ...input,
          { role: "assistant", content: response.output_text },
          { role: "developer", content: "Ese mensaje repite literalmente uno anterior. Reescríbelo con otras palabras respondiendo al último mensaje." },
        ];
        continue;
      }
      return { ...parsed, tool_calls: toolCalls, response_id: response.id || null };
    }

    const outputs = [];
    for (const call of calls) {
      const { args, result } = await runTool(handlers[call.name] || (() => ({ ok: false, error: "tool not available" })), call);
      toolCalls.push({ name: call.name, args, result });
      outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result ?? null) });
    }
    input = [...input, ...response.output, ...outputs];
  }

  return { reply: "", intent: "other", tool_calls: toolCalls, response_id: null };
}
