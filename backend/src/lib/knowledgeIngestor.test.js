import test from "node:test";
import assert from "node:assert/strict";

process.env.OPENAI_API_KEY ||= "test-key";
const { htmlToSections, chunkSections } = await import("./knowledgeIngestor.js");

test("los fragmentos llevan la ruta de encabezados y no mezclan secciones", () => {
  const html = `<html><head><style>.x{}</style></head><body><nav>Menú</nav>
    <h1>Precios</h1><p>Elige plan.</p>
    <h2>Plan <b>Growth</b></h2><p>490 EUR / mes</p><ul><li>3 usuarios</li></ul>
    <h2>Enterprise</h2><p>Desde 1.200 EUR &amp; setup</p>
    <h1>FAQ</h1><p>¿Hay prueba? Sí, 14 días.</p></body></html>`;
  assert.deepEqual(chunkSections(htmlToSections(html)), [
    "Precios\nElige plan.",
    "Precios > Plan Growth\n490 EUR / mes\n3 usuarios",
    "Precios > Enterprise\nDesde 1.200 EUR & setup",
    "FAQ\n¿Hay prueba? Sí, 14 días.",
  ]);
});

test("un párrafo enorme se trocea con solape sin perder el prefijo", () => {
  const chunks = chunkSections([{ path: ["A"], paragraphs: ["x".repeat(2500)] }], 1200, 200);
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.startsWith("A\n")));
});

test("una tabla de referencias se trocea por filas con el nombre de cada columna", async () => {
  const { chunkSpreadsheetRows, spreadsheetSourceUrl } = await import("./knowledgeIngestor.js");
  const chunks = chunkSpreadsheetRows({
    name: "Casos de éxito",
    headers: ["Cliente", "Sector", "", "Resultado"],
    rows: [["Clínica Sol", "Dental", "x", "-40 % CPL"], ["", "", "", ""], ["Óptica Mar", "Óptica", "", "+30 citas"]],
  });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], "Casos de éxito\nCliente: Clínica Sol · Sector: Dental · Columna 3: x · Resultado: -40 % CPL\nCliente: Óptica Mar · Sector: Óptica · Resultado: +30 citas");
  const many = chunkSpreadsheetRows({ name: "T", headers: ["A"], rows: Array.from({ length: 300 }, (_, i) => [`fila ${i} ${"x".repeat(40)}`]) });
  assert.ok(many.length > 1 && many.every((c) => c.length <= 1200 + 2));
  assert.equal(spreadsheetSourceUrl("Casos de éxito 2026"), "tabla://casos-de-exito-2026");
});
