// Bloques extra de una propuesta (y de sus plantillas): tablas, packs, fases, imágenes, texto y testimonios.
// Se guardan en quotes.content_json.blocks y en quote_templates.blocks (sql/025).

export const BLOCK_TYPES = ["text", "table", "packs", "steps", "image", "testimonial"];

const clean = (v, max = 2000) => String(v ?? "").trim().slice(0, max);
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

function sanitizeBlock(block = {}) {
  const type = BLOCK_TYPES.includes(block?.type) ? block.type : null;
  if (!type) return null;
  const title = clean(block.title, 200);
  if (type === "text") return { type, title, text: clean(block.text, 6000) };
  if (type === "table") {
    const columns = list(block.columns, 6).map((c) => clean(c, 80));
    const rows = list(block.rows, 40).map((r) => columns.map((_, i) => clean(list(r, 6)[i], 400)));
    return columns.length ? { type, title, columns, rows } : null;
  }
  if (type === "packs") {
    const packs = list(block.packs, 4).map((p) => ({
      name: clean(p?.name, 80),
      price: clean(p?.price, 80),
      features: clean(p?.features, 1500),
      highlight: p?.highlight === true,
    }));
    return { type, title, packs };
  }
  if (type === "steps") {
    return { type, title, steps: list(block.steps, 12).map((s) => ({ name: clean(s?.name, 120), text: clean(s?.text, 600) })) };
  }
  if (type === "image") {
    const url = clean(block.url, 1000);
    return /^https:\/\//.test(url) ? { type, title, url, caption: clean(block.caption, 300) } : null;
  }
  return { type, title, text: clean(block.text, 1500), author: clean(block.author, 120) };
}

export function sanitizeQuoteBlocks(blocks) {
  return list(blocks, 20).map(sanitizeBlock).filter(Boolean);
}

const esc = (v) =>
  String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const lines = (v) => String(v || "").split("\n").map((l) => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean);
const heading = (b) => (b.title ? `<h2>${esc(b.title)}</h2>` : "");

function renderBlock(b) {
  if (b.type === "text") return `${heading(b)}<div class="copy">${esc(b.text)}</div>`;
  if (b.type === "table") {
    return `${heading(b)}<div class="qb-scroll"><table class="qb-table"><thead><tr>${b.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${b.rows
      .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
  }
  if (b.type === "packs") {
    return `${heading(b)}<div class="qb-packs">${b.packs
      .map(
        (p) => `<div class="qb-pack${p.highlight ? " is-top" : ""}">
          ${p.highlight ? `<span class="qb-badge">Recomendado</span>` : ""}
          <h3>${esc(p.name)}</h3>
          ${p.price ? `<div class="qb-price">${esc(p.price)}</div>` : ""}
          <ul>${lines(p.features).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        </div>`
      )
      .join("")}</div>`;
  }
  if (b.type === "steps") {
    return `${heading(b)}<ol class="qb-steps">${b.steps
      .map((s) => `<li><b>${esc(s.name)}</b>${s.text ? `<span>${esc(s.text)}</span>` : ""}</li>`)
      .join("")}</ol>`;
  }
  if (b.type === "image") {
    return `${heading(b)}<figure class="qb-figure"><img src="${esc(b.url)}" alt="${esc(b.caption || b.title)}" />${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`;
  }
  return `${heading(b)}<blockquote class="qb-quote">“${esc(b.text)}”${b.author ? `<cite>${esc(b.author)}</cite>` : ""}</blockquote>`;
}

export function renderQuoteBlocksHtml(blocks) {
  return sanitizeQuoteBlocks(blocks)
    .map((b) => `<section class="section qb">${renderBlock(b)}</section>`)
    .join("");
}

// Usa las variables de color de la propuesta (--accent, --accent-soft, --line…).
export const QUOTE_BLOCKS_CSS = `
    .qb-scroll { overflow-x: auto; }
    .qb-table { display: table !important; width: 100%; border-collapse: collapse; }
    .qb-table th { background: var(--accent-soft); color: var(--accent-ink); text-align: left; }
    .qb-table th, .qb-table td { padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .qb-packs { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
    .qb-pack { position: relative; border: 1px solid var(--line); border-radius: 18px; padding: 20px; background: #fff; }
    .qb-pack.is-top { border: 2px solid var(--accent); box-shadow: 0 10px 30px color-mix(in srgb, var(--accent) 18%, transparent); }
    .qb-pack h3 { margin: 0 0 6px; font-size: 1.1rem; }
    .qb-price { font-size: 1.4rem; font-weight: 700; color: var(--accent); margin-bottom: 10px; }
    .qb-pack ul { margin: 0; padding-left: 18px; color: var(--muted); }
    .qb-pack li { margin: 4px 0; }
    .qb-badge { position: absolute; top: -11px; left: 20px; background: var(--accent); color: #fff; font-size: 0.75rem; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
    .qb-steps { list-style: none; counter-reset: qb; margin: 0; padding: 0; display: grid; gap: 10px; }
    .qb-steps li { counter-increment: qb; display: grid; grid-template-columns: 34px 1fr; column-gap: 12px; align-items: start; }
    .qb-steps li::before { content: counter(qb); grid-row: span 2; width: 34px; height: 34px; border-radius: 50%; background: var(--accent); color: #fff; display: grid; place-items: center; font-weight: 700; }
    .qb-steps span { color: var(--muted); }
    .qb-figure { margin: 0; }
    .qb-figure img { max-width: 100%; border-radius: 14px; display: block; }
    .qb-figure figcaption { color: var(--muted); font-size: 0.9rem; margin-top: 6px; }
    .qb-quote { margin: 0; padding: 18px 22px; border-left: 4px solid var(--accent); background: var(--accent-soft); border-radius: 0 14px 14px 0; font-size: 1.05rem; }
    .qb-quote cite { display: block; margin-top: 8px; font-style: normal; font-weight: 700; color: var(--accent-ink); }
    .section.qb, .qb-pack, .qb-steps li, .qb-figure { break-inside: avoid; }
`;
