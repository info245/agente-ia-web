function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value, currency = "EUR") {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amount);
}

export function renderQuotePreviewHtml({ lead = {}, quote = {}, logoUrl = "" } = {}) {
  const content = quote?.content_json || {};
  const items = Array.isArray(content.items) ? content.items : [];
  const currency = quote?.currency || "EUR";
  const subtotal = Number.isFinite(Number(quote?.subtotal)) ? Number(quote.subtotal) : 0;
  const tax = Number.isFinite(Number(quote?.tax)) ? Number(quote.tax) : 0;
  const total = Number.isFinite(Number(quote?.total)) ? Number(quote.total) : 0;
  const taxRate = Number.isFinite(Number(content.tax_rate)) ? Number(content.tax_rate) : 0;
  const leadName = lead?.name || lead?.phone || lead?.email || "Cliente";
  const assumptions = String(content.assumptions || "").trim();
  const billingType = String(content.billing_type || "monthly").trim();
  const billingLabel = String(content.billing_label || "").trim();
  const priceMode =
    billingLabel ||
    (billingType === "monthly"
      ? "Mensual"
      : billingType === "one_time"
      ? "Pago unico"
      : billingType === "custom"
      ? "Personalizado"
      : "Mensual");

  const itemsRows = items.length
    ? items
        .map((item) => {
          const quantity = Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 0;
          const unitPrice = Number.isFinite(Number(item?.unit_price)) ? Number(item.unit_price) : 0;
          const lineTotal = quantity * unitPrice;

          return `
            <tr>
              <td>${escapeHtml(item?.concept || "-")}</td>
              <td class="num">${quantity}</td>
              <td class="num">${formatMoney(unitPrice, currency)}</td>
              <td class="num">${formatMoney(lineTotal, currency)}</td>
            </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td colspan="4" class="empty">Todavia no hay partidas en este presupuesto.</td>
      </tr>
    `;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(quote?.title || "Propuesta comercial")}</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    :root {
      --bg: #f7f1e4;
      --paper: #fffdfa;
      --line: #d9cfbf;
      --text: #221d18;
      --muted: #756b61;
      --accent: #ff5d6d;
      --accent-2: #cb4ea1;
      --accent-3: #7f54ff;
      --accent-soft: #f5edff;
      --ink-soft: rgba(255,255,255,0.85);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(255,93,109,0.14), transparent 24%),
        radial-gradient(circle at top right, rgba(127,84,255,0.16), transparent 26%),
        linear-gradient(135deg, #f7efe1, #f2e8d7);
      padding: 32px;
    }
    .sheet {
      max-width: 980px;
      margin: 0 auto;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: 0 18px 50px rgba(61, 45, 26, 0.08);
      overflow: hidden;
    }
    .hero {
      padding: 34px 38px 28px;
      color: #fff;
      background:
        radial-gradient(circle at top left, rgba(255,255,255,0.08), transparent 26%),
        linear-gradient(120deg, var(--accent), var(--accent-2) 54%, var(--accent-3));
      border-bottom: 1px solid var(--line);
    }
    .brand {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
    }
    .brand h1 {
      margin: 0 0 10px;
      font-size: 2rem;
    }
    .eyebrow {
      color: rgba(255,255,255,0.8);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.82rem;
      margin-bottom: 8px;
      font-weight: 700;
    }
    .brand-logo {
      width: 150px;
      max-width: 100%;
      display: block;
      margin-bottom: 18px;
      border-radius: 16px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.12);
    }
    .brand-box {
      max-width: 64%;
    }
    .status {
      display: inline-flex;
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.16);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.22);
      font-size: 0.9rem;
      font-weight: 700;
    }
    .hero-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-top: 24px;
    }
    .hero-card {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 14px 16px;
      background: rgba(255,255,255,0.12);
      border-color: rgba(255,255,255,0.16);
      color: #fff;
    }
    .hero-card strong {
      display: block;
      margin-bottom: 6px;
      color: rgba(255,255,255,0.78);
    }
    .hero-card-value {
      overflow-wrap: anywhere;
      word-break: break-word;
      line-height: 1.45;
    }
    .section {
      padding: 26px 38px;
      border-bottom: 1px solid var(--line);
    }
    .section:last-child {
      border-bottom: 0;
    }
    .section h2 {
      margin: 0 0 16px;
      font-size: 1.25rem;
    }
    .copy {
      line-height: 1.7;
      white-space: pre-wrap;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 14px 12px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: linear-gradient(180deg, #f3e7ff, #ead8ff);
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .empty {
      color: var(--muted);
      text-align: center;
      padding: 20px;
    }
    .totals {
      margin-left: auto;
      width: min(360px, 100%);
      display: grid;
      gap: 10px;
      margin-top: 18px;
    }
    .totals-meta {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
    }
    .billing-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      background: linear-gradient(180deg, #f3e7ff, #ecdfff);
      border: 1px solid #d8c0ff;
      color: #5a2aa8;
      font-weight: 700;
      font-size: 0.95rem;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px 14px;
      background: rgba(255,255,255,0.86);
    }
    .grand {
      border: 2px solid #cba8ff;
      background: linear-gradient(180deg, #f3e7ff, #ecdfff);
      font-size: 1.06rem;
    }
    .footer {
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.7;
    }
    @media print {
      body {
        background: #fff;
        padding: 0;
      }
      .sheet {
        max-width: none;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
    }
    @media (max-width: 860px) {
      .hero-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .brand-box {
        max-width: 100%;
      }
    }
    @media (max-width: 640px) {
      .hero-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <article class="sheet">
    <header class="hero">
      <div class="brand">
        <div class="brand-box">
          ${logoUrl ? `<img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="TMedia Global" />` : ""}
          <div class="eyebrow">TMedia Global</div>
          <h1>${escapeHtml(quote?.title || "Propuesta comercial")}</h1>
          <div class="copy">${escapeHtml(content.summary || "Propuesta personalizada preparada a partir de la informacion recogida en el CRM.")}</div>
        </div>
        <div class="status">${escapeHtml(quote?.status || "draft")}</div>
      </div>

      <div class="hero-grid">
        <div class="hero-card">
          <strong>Cliente</strong>
          <div class="hero-card-value">${escapeHtml(leadName)}</div>
        </div>
        <div class="hero-card">
          <strong>Servicio</strong>
          <div class="hero-card-value">${escapeHtml(lead?.interest_service || "-")}</div>
        </div>
        <div class="hero-card">
          <strong>Contacto</strong>
          <div class="hero-card-value">${escapeHtml(lead?.email || lead?.phone || "-")}</div>
        </div>
      </div>
    </header>

    <section class="section">
      <h2>Alcance</h2>
      <div class="copy">${escapeHtml(content.scope || quote?.title || "")}</div>
    </section>

    <section class="section">
      <h2>Partidas</h2>
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th class="num">Cantidad</th>
            <th class="num">Precio unitario</th>
            <th class="num">Importe</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row">
          <span>Subtotal</span>
          <strong>${formatMoney(subtotal, currency)}</strong>
        </div>
        <div class="total-row">
          <span>IVA (${taxRate}%)</span>
          <strong>${formatMoney(tax, currency)}</strong>
        </div>
        <div class="total-row grand">
          <span>Total</span>
          <strong>${formatMoney(total, currency)}</strong>
        </div>
      </div>

      <div class="totals-meta">
        <div class="billing-pill">Precio ${escapeHtml(priceMode.toLowerCase())}</div>
      </div>
    </section>

    <section class="section">
      <h2>Mensaje de la propuesta</h2>
      <div class="copy">${escapeHtml(content.body || "")}</div>
    </section>

    ${assumptions ? `
    <section class="section">
      <h2>Supuestos y notas</h2>
      <div class="copy">${escapeHtml(assumptions)}</div>
    </section>` : ""}

    <section class="section footer">
      Esta propuesta ha sido generada desde el CRM interno de TMedia Global y puede editarse antes de su envio definitivo por email o WhatsApp.
    </section>
  </article>
</body>
</html>`;
}
