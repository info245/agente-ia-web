import test from "node:test";
import assert from "node:assert/strict";
import { renderQuoteBlocksHtml, sanitizeQuoteBlocks } from "./quoteBlocks.js";

test("limpia bloques: descarta tipos desconocidos e imágenes sin https", () => {
  const blocks = sanitizeQuoteBlocks([
    { type: "script", text: "x" },
    { type: "image", url: "javascript:alert(1)" },
    { type: "table", title: "Fases", columns: ["Mes", "Tarea"], rows: [["1", "Auditoría", "sobra"]] },
  ]);
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].rows, [["1", "Auditoría"]]);
});

test("escapa el contenido al pintar", () => {
  const html = renderQuoteBlocksHtml([
    { type: "packs", title: "Planes", packs: [{ name: "<b>Pro</b>", price: "490 €/mes", features: "• SEO\n• Informes", highlight: true }] },
    { type: "testimonial", text: "Muy bien", author: "Ana" },
  ]);
  assert.match(html, /&lt;b&gt;Pro/);
  assert.match(html, /<li>SEO<\/li><li>Informes<\/li>/);
  assert.match(html, /Recomendado/);
  assert.match(html, /<cite>Ana<\/cite>/);
});
