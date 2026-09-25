import test from "node:test";
import assert from "node:assert/strict";

import { getAgentSystemPrompt } from "./agentPrompt.js";

test("adds the strict Sancho product boundary to the shared model prompt", () => {
  const prompt = getAgentSystemPrompt({
    brand: { name: "Sancho AI" },
    offers: {
      "Sancho AI": {
        description: "Conecta, interpreta y prioriza datos de negocio, marketing y ventas.",
      },
    },
  });

  assert.match(prompt, /CONTRATO DE PRODUCTO SANCHO AI/);
  assert.match(prompt, /No presta atención al cliente/i);
  assert.match(prompt, /no automatiza comunicaciones con clientes/i);
  assert.match(prompt, /no gestiona ni hace seguimiento de leads o contactos/i);
  assert.match(prompt, /no significa ejecutarlas ni automatizarlas de forma autónoma/i);
});
