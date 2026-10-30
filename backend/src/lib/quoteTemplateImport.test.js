import test from "node:test";
import assert from "node:assert/strict";
import { htmlToText, normalizeImportedTemplate } from "./quoteTemplateImport.js";

test("normaliza lo que devuelve la IA", () => {
  const t = normalizeImportedTemplate({
    name: "SEO mensual",
    billing_type: "anual",
    tax_rate: "21",
    items: [{ concept: "SEO", unit_price: "490" }, { concept: "" }],
    blocks: [{ type: "packs", packs: [{ name: "Pro", price: "490 €" }] }, { type: "raro" }],
  });
  assert.equal(t.billing_type, "monthly");
  assert.equal(t.tax_rate, 21);
  assert.deepEqual(t.items, [{ concept: "SEO", quantity: 1, unit_price: 490 }]);
  assert.equal(t.blocks.length, 1);
});

test("saca el texto de un HTML", () => {
  const text = htmlToText("<style>p{}</style><h1>Plan</h1><table><tr><td>Mes</td><td>1</td></tr></table><script>x()</script>");
  assert.match(text, /Plan/);
  assert.match(text, /Mes \| 1/);
  assert.doesNotMatch(text, /x\(\)|p\{\}/);
});
