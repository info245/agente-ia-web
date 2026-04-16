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

export function renderQuotePreviewHtml({ lead = {}, quote = {}, logoUrl = "", autoPrint = false } = {}) {
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
  const humanWhatsAppNumber = "34614149270";
  const humanWhatsAppText = `Hola, vengo de la propuesta de ${lead?.interest_service || "TMedia Global"} y quiero hablar con un agente humano.`;
  const humanWhatsAppUrl = `https://wa.me/${humanWhatsAppNumber}?text=${encodeURIComponent(
    humanWhatsAppText
  )}`;

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

  const mobileItems = items.length
    ? items
        .map((item) => {
          const quantity = Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 0;
          const unitPrice = Number.isFinite(Number(item?.unit_price)) ? Number(item.unit_price) : 0;
          const lineTotal = quantity * unitPrice;

          return `
            <article class="mobile-item">
              <div class="mobile-item-title">${escapeHtml(item?.concept || "-")}</div>
              <div class="mobile-item-grid">
                <div class="mobile-item-cell">
                  <span>Cantidad</span>
                  <strong>${quantity}</strong>
                </div>
                <div class="mobile-item-cell">
                  <span>Precio unitario</span>
                  <strong>${formatMoney(unitPrice, currency)}</strong>
                </div>
                <div class="mobile-item-cell">
                  <span>Importe</span>
                  <strong>${formatMoney(lineTotal, currency)}</strong>
                </div>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty">Todavia no hay partidas en este presupuesto.</div>`;

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
      break-inside: avoid;
      page-break-inside: avoid;
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
      break-inside: avoid;
      page-break-inside: avoid;
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
    .mobile-items {
      display: none;
    }
    .mobile-item {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 12px;
      background: rgba(255,255,255,0.82);
    }
    .mobile-item-title {
      font-weight: 700;
      margin-bottom: 8px;
      line-height: 1.35;
    }
    .mobile-item-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .mobile-item-cell span {
      display: block;
      color: var(--muted);
      font-size: 0.78rem;
      margin-bottom: 3px;
    }
    .mobile-item-cell strong {
      display: block;
      font-size: 0.94rem;
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
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .totals-meta {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
      break-inside: avoid;
      page-break-inside: avoid;
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
    .print-bar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 18px 32px 0;
    }
    .print-button {
      border: 0;
      border-radius: 999px;
      padding: 12px 18px;
      background: #1f5eff;
      color: #fff;
      font: 700 14px/1 Arial, sans-serif;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(31, 94, 255, 0.22);
    }
    .cta-box {
      margin-top: 18px;
      padding: 18px;
      border: 1px solid #cfe7d8;
      border-radius: 18px;
      background: linear-gradient(180deg, #f3fff7, #ecfbf2);
    }
    .cta-box p {
      margin: 0 0 12px;
      line-height: 1.6;
    }
    .cta-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 18px;
      border-radius: 999px;
      background: #1faa59;
      color: #fff;
      text-decoration: none;
      font-weight: 700;
      box-shadow: 0 10px 24px rgba(31, 170, 89, 0.18);
    }
    @media print {
      html {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body {
        background: #fff;
        padding: 0;
      }
      .print-bar {
        display: none;
      }
      .sheet {
        max-width: none;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
      .hero {
        padding: 24px 28px 20px;
      }
      .brand-logo {
        width: 110px;
        margin-bottom: 12px;
      }
      .brand h1 {
        font-size: 1.75rem;
        margin-bottom: 8px;
      }
      .hero-grid {
        gap: 10px;
        margin-top: 18px;
      }
      .hero-card {
        padding: 10px 12px;
        border-radius: 14px;
      }
      .section {
        padding: 18px 28px;
      }
      .section h2 {
        margin-bottom: 10px;
        font-size: 1.05rem;
      }
      .copy {
        font-size: 0.95rem;
        line-height: 1.45;
      }
      th, td {
        padding: 10px 10px;
        font-size: 0.92rem;
      }
      .totals {
        width: min(320px, 100%);
        gap: 8px;
        margin-top: 14px;
      }
      .total-row {
        padding: 10px 12px;
      }
      .totals-meta {
        margin-top: 10px;
      }
      .billing-pill {
        padding: 7px 12px;
        font-size: 0.9rem;
      }
      .footer {
        font-size: 0.82rem;
        line-height: 1.45;
      }
    }
    @media (max-width: 860px) {
      body {
        padding: 16px;
      }
      .sheet {
        border-radius: 22px;
      }
      .hero {
        padding: 24px 22px 22px;
      }
      .brand {
        flex-direction: column;
        align-items: flex-start;
      }
      .status {
        align-self: flex-start;
      }
      .hero-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .brand-box {
        max-width: 100%;
      }
      .section {
        padding: 22px;
      }
      .totals,
      .totals-meta {
        width: 100%;
      }
      .totals-meta {
        justify-content: flex-start;
      }
    }
    @media (max-width: 640px) {
      body {
        padding: 10px;
      }
      .print-bar {
        padding: 10px 10px 0;
      }
      .sheet {
        border-radius: 18px;
      }
      .hero {
        padding: 18px 16px 18px;
      }
      .brand-logo {
        width: 118px;
        margin-bottom: 12px;
      }
      .brand h1 {
        font-size: 1.75rem;
        line-height: 1.1;
      }
      .copy {
        line-height: 1.55;
      }
      .hero-grid {
        grid-template-columns: 1fr;
        margin-top: 16px;
      }
      .hero-card {
        padding: 12px 14px;
        border-radius: 16px;
      }
      .section {
        padding: 18px 16px;
      }
      .section h2 {
        font-size: 1.15rem;
        margin-bottom: 12px;
      }
      table {
        display: none;
      }
      .mobile-items {
        display: grid;
        gap: 10px;
      }
      .total-row {
        padding: 10px 12px;
      }
      .billing-pill {
        width: 100%;
        justify-content: center;
      }
    }
    @media (max-width: 420px) {
      .mobile-item-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="print-button" type="button" onclick="window.print()">Guardar como PDF</button>
  </div>
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

      <div class="mobile-items">
        ${mobileItems}
      </div>

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
      <div class="cta-box">
        <p>Si prefieres resolver dudas o comentar la propuesta con una persona, puedes contactar directamente con un agente humano por WhatsApp.</p>
        <a class="cta-button" href="${escapeHtml(humanWhatsAppUrl)}" target="_blank" rel="noopener noreferrer">Contactar con un agente humano</a>
      </div>
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
  ${autoPrint ? `
  <script>
    window.addEventListener("load", () => {
      setTimeout(() => window.print(), 250);
    });
  </script>` : ""}
</body>
</html>`;
}
