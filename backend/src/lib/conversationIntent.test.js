import test from "node:test";
import assert from "node:assert/strict";

import {
  detectPriorityIntent,
  isGreetingOnly,
  isSupportRequest,
} from "./conversationIntent.js";

test("recognizes natural greetings addressed to Sancho", () => {
  assert.equal(isGreetingOnly("hola sanchito como estas"), true);
  assert.equal(detectPriorityIntent("Buenas Sancho"), "greeting");
});

test("does not mistake a product question about invoices for a support incident", () => {
  assert.equal(isSupportRequest("¿Se puede integrar con las facturas de Odoo?"), false);
  assert.equal(isSupportRequest("La factura está duplicada y no corresponde"), true);
});
