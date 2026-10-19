import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.OPENAI_API_KEY ||= "test-key";
const { runAgentTurn, TOOL_DEFINITIONS } = await import("./engine.js");
const { STATIC_INSTRUCTIONS } = await import("./instructions.js");
const { computeFreeSlots, zonedTimeToUtc } = await import("./googleCalendar.js");
const { cleanLeadPatch, isLeadComplete } = await import("./orchestrator.js");
const { getWhatsAppContactKey, isWhatsAppBsuid } = await import("../lib/whatsappMessage.js");
const { sanitizeAppConfig } = await import("../lib/appConfig.js");

function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    responses: {
      async create(request) {
        calls.push(structuredClone(request));
        return responses.shift();
      },
    },
  };
}

const final = (reply, intent = "other") => ({ id: "r", output: [], output_text: JSON.stringify({ reply, intent }) });
const appConfig = {
  brand: { name: "Acme" },
  lead_capture: { fields: { name: true, email: true, main_goal: true, budget_range: false } },
  agent: { policy: "Política de prueba" },
};

test("ejecuta las herramientas que pide el modelo y devuelve la respuesta estructurada", async () => {
  const client = fakeClient([
    {
      id: "r1",
      output: [{ type: "function_call", name: "save_lead_fields", call_id: "c1", arguments: JSON.stringify({ name: "Ana" }) }],
    },
    final("Encantado, Ana.", "lead_capture"),
  ]);
  const saved = [];
  const result = await runAgentTurn({
    appConfig,
    messages: [{ role: "user", content: "Soy Ana" }],
    handlers: { save_lead_fields: async (args) => (saved.push(args), { ok: true }) },
    client,
  });

  assert.equal(result.reply, "Encantado, Ana.");
  assert.equal(result.intent, "lead_capture");
  assert.deepEqual(saved, [{ name: "Ana" }]);
  // Solo se ofrecen las herramientas con handler: sin calendario, no hay reserva.
  assert.deepEqual(client.calls[0].tools.map((tool) => tool.name), ["save_lead_fields"]);
  assert.ok(client.calls[0].instructions.startsWith(STATIC_INSTRUCTIONS));
  assert.match(client.calls[0].instructions, /Política de prueba/);
  const secondInput = client.calls[1].input;
  assert.equal(secondInput.at(-1).type, "function_call_output");
  assert.equal(secondInput.at(-1).call_id, "c1");
});

test("el estado del lead va justo antes del último mensaje del usuario", async () => {
  const client = fakeClient([final("Hola")]);
  await runAgentTurn({
    appConfig,
    lead: { name: "Ana" },
    messages: [
      { role: "user", content: "hola" },
      { role: "assistant", content: "¿En qué te ayudo?" },
      { role: "user", content: "precio" },
    ],
    client,
  });
  const input = client.calls[0].input;
  assert.equal(input.at(-1).content, "precio");
  assert.equal(input.at(-2).role, "developer");
  assert.match(input.at(-2).content, /Ya sabemos: name=Ana/);
  assert.match(input.at(-2).content, /Falta: email, main_goal/);
  assert.equal(client.calls[0].tool_choice, "none");
});

test("una respuesta idéntica a otra anterior se reescribe una vez", async () => {
  const client = fakeClient([final("Lo mismo de antes."), final("Dicho de otra forma.")]);
  const result = await runAgentTurn({
    appConfig,
    messages: [
      { role: "user", content: "a" },
      { role: "assistant", content: "Lo mismo de antes" },
      { role: "user", content: "b" },
    ],
    client,
  });
  assert.equal(result.reply, "Dicho de otra forma.");
  assert.equal(client.calls.length, 2);
});

test("un error de herramienta llega al modelo como dato, no rompe el turno", async () => {
  const client = fakeClient([
    { id: "r1", output: [{ type: "function_call", name: "search_knowledge", call_id: "c1", arguments: '{"query":"x"}' }] },
    final("No puedo confirmarlo."),
  ]);
  const result = await runAgentTurn({
    appConfig,
    messages: [{ role: "user", content: "x" }],
    handlers: { search_knowledge: async () => { throw new Error("db caída"); } },
    client,
  });
  assert.equal(result.reply, "No puedo confirmarlo.");
  assert.match(client.calls[1].input.at(-1).output, /db caída/);
});

test("los esquemas de herramientas son strict y exigen todas sus propiedades", () => {
  for (const tool of Object.values(TOOL_DEFINITIONS)) {
    assert.equal(tool.strict, true);
    assert.equal(tool.parameters.additionalProperties, false);
    assert.deepEqual(tool.parameters.required, Object.keys(tool.parameters.properties));
  }
});

test("el núcleo v2 no contiene nombres de clientes", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".js") && !name.endsWith(".test.js"))) {
    assert.doesNotMatch(fs.readFileSync(path.join(dir, file), "utf8"), /sancho|t-mediaglobal|tmedia global/i, file);
  }
});

test("save_lead_fields guarda contacto siempre y el resto solo si la cuenta lo captura", () => {
  const { patch, ignored } = cleanLeadPatch(
    { name: " Ana ", email: "ANA@ACME.COM", phone: "12", company: "Acme", budget_range: "1k", main_goal: "Vender más", urgency: null },
    appConfig
  );
  assert.deepEqual(patch, { name: "Ana", email: "ana@acme.com", main_goal: "Vender más" });
  assert.deepEqual(ignored.sort(), ["budget_range", "company_name", "phone"]);
});

test("el lead se cierra solo cuando tiene todo lo que la cuenta captura", () => {
  assert.equal(isLeadComplete({ name: "Ana", email: "ana@acme.com" }, appConfig), false);
  assert.equal(isLeadComplete({ name: "Ana", email: "ana@acme.com", main_goal: "Vender más" }, appConfig), true);
  // Una cuenta que no captura nada nunca cierra conversaciones.
  assert.equal(isLeadComplete({ name: "Ana" }, { lead_capture: { fields: {} } }), false);
  // business_type cuenta si la cuenta lo pide y save_lead_fields lo admite.
  const withType = { lead_capture: { fields: { name: true, business_type: true } } };
  assert.equal(isLeadComplete({ name: "Ana" }, withType), false);
  assert.deepEqual(cleanLeadPatch({ business_type: "Ecommerce" }, withType).patch, { business_type: "Ecommerce" });
});

test("con email y teléfono pedidos basta uno; los campos personalizados estándar cuentan", () => {
  const config = {
    lead_capture: {
      fields: { name: true, email: true, phone: true },
      custom_fields: [
        { key: "main_goal", label: "Objetivo", required: true },
        { key: "urgency", label: "Urgencia", required: false },
      ],
    },
  };
  assert.equal(isLeadComplete({ name: "Ana", email: "ana@acme.com" }, config), false);
  assert.equal(isLeadComplete({ name: "Ana", email: "ana@acme.com", main_goal: "Vender" }, config), true);
  assert.equal(isLeadComplete({ name: "Ana", phone: "600111222", main_goal: "Vender" }, config), true);
  // urgency es opcional: se puede guardar, pero no bloquea el cierre.
  assert.deepEqual(cleanLeadPatch({ urgency: "este mes" }, config).patch, { urgency: "este mes" });
});

test("huecos libres: horario laboral en la zona de la cuenta, sin solapes ni pasado", () => {
  const now = new Date("2026-10-19T06:00:00Z"); // lunes 08:00 en Madrid (CEST)
  const meeting = { timezone: "Europe/Madrid", duration_minutes: 60, days: [1, 2, 3, 4, 5], start_hour: 9, end_hour: 12 };
  const slots = computeFreeSlots({
    now,
    meeting,
    days: 1,
    busy: [{ start: "2026-10-19T08:00:00Z", end: "2026-10-19T09:00:00Z" }], // 10:00-11:00 local
  });
  assert.deepEqual(slots.map((slot) => slot.start), ["2026-10-19T07:00:00.000Z", "2026-10-19T09:00:00.000Z"]);
  // Fin de semana excluido.
  assert.deepEqual(computeFreeSlots({ now: new Date("2026-10-24T06:00:00Z"), meeting, days: 2 }), []);
  // Cambio de hora: en invierno Madrid es UTC+1.
  assert.equal(zonedTimeToUtc(2026, 11, 2, 9, 0, "Europe/Madrid").toISOString(), "2026-11-02T08:00:00.000Z");
});

test("WhatsApp: usa el teléfono si existe y el BSUID si el usuario lo oculta", () => {
  assert.equal(getWhatsAppContactKey({ from: "34600111222" }, []), "34600111222");
  assert.equal(
    getWhatsAppContactKey({ from_user_id: "ES.123abc" }, [{ user_id: "ES.123abc", profile: { name: "Ana" } }]),
    "ES.123abc"
  );
  assert.equal(getWhatsAppContactKey({}, [{ user_id: "US.99z" }]), "US.99z");
  assert.equal(getWhatsAppContactKey({}, []), null);
  assert.equal(isWhatsAppBsuid("ES.123abc"), true);
  assert.equal(isWhatsAppBsuid("34600111222"), false);
});

test("agent_engine es legacy salvo que la cuenta elija v2", () => {
  assert.equal(sanitizeAppConfig({}).agent_engine, "legacy");
  assert.equal(sanitizeAppConfig({ agent_engine: "whatever" }).agent_engine, "legacy");
  assert.equal(sanitizeAppConfig({ agent_engine: "v2" }).agent_engine, "v2");
  assert.equal(sanitizeAppConfig({ agent: { policy: " Regla " } }).agent.policy, "Regla");
});

test("las preguntas frecuentes de Mi asistente llegan al contexto del agente", async () => {
  const { buildAccountContext } = await import("./instructions.js");
  const { sanitizeAppConfig } = await import("../lib/appConfig.js");
  const config = sanitizeAppConfig({
    agent: {
      faq: [
        { question: "¿Hay permanencia?", answer: "No, ningún servicio tiene permanencia." },
        { question: "Sin respuesta", answer: "" },
        "basura",
      ],
    },
  });
  assert.deepEqual(config.agent.faq, [{ question: "¿Hay permanencia?", answer: "No, ningún servicio tiene permanencia." }]);
  const context = buildAccountContext(config);
  assert.match(context, /PREGUNTAS FRECUENTES/);
  assert.match(context, /¿Hay permanencia\?\n  No, ningún servicio tiene permanencia\./);
  assert.doesNotMatch(buildAccountContext(sanitizeAppConfig({})), /PREGUNTAS FRECUENTES/);
});
