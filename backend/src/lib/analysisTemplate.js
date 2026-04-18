function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderList(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return `<li>Sin puntos destacados todavia.</li>`;
  }

  return items
    .map((item) => {
      if (typeof item === "string") {
        return `<li>${escapeHtml(item)}</li>`;
      }

      return `<li><strong>${escapeHtml(item?.title || "Punto clave")}:</strong> ${escapeHtml(
        item?.detail || item?.text || ""
      )}</li>`;
    })
    .join("");
}

export function renderAnalysisPreviewHtml({
  lead = {},
  analysis = {},
  logoUrl = "",
  brandName = "TMedia Global",
} = {}) {
  const content = analysis?.content_json || {};
  const findings = Array.isArray(content.findings) ? content.findings : [];
  const quickWins = Array.isArray(content.quick_wins) ? content.quick_wins : [];
  const priorities = Array.isArray(content.priorities) ? content.priorities : [];
  const leadName = lead?.name || lead?.company_name || lead?.email || "Cliente";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(analysis?.title || "Analisis comercial")}</title>
  <style>
    :root {
      --bg: #eef3ff;
      --paper: #ffffff;
      --line: #d6e1ff;
      --ink: #172554;
      --muted: #5c6b92;
      --accent: #6d41f3;
      --accent-2: #8f68ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(109,65,243,0.12), transparent 30%),
        linear-gradient(180deg, #eff4ff 0%, #eaf1ff 100%);
      padding: 28px;
    }
    .sheet {
      max-width: 980px;
      margin: 0 auto;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 28px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(37, 54, 110, 0.12);
    }
    .hero {
      padding: 34px 36px 28px;
      background: linear-gradient(135deg, #6d41f3, #8f68ff 58%, #a58bff);
      color: #fff;
    }
    .hero-top {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
    }
    .hero-copy h1 {
      margin: 0 0 10px;
      font-size: 2rem;
      line-height: 1.1;
    }
    .eyebrow {
      display: inline-block;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 0.78rem;
      font-weight: 800;
      color: rgba(255,255,255,0.78);
    }
    .hero-logo {
      width: 140px;
      max-width: 100%;
      border-radius: 18px;
      background: rgba(255,255,255,0.12);
      padding: 10px;
      border: 1px solid rgba(255,255,255,0.18);
    }
    .hero-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-top: 24px;
    }
    .hero-card {
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.12);
      padding: 14px 16px;
    }
    .hero-card strong {
      display: block;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.72);
      margin-bottom: 6px;
    }
    .section {
      padding: 28px 36px;
      border-top: 1px solid var(--line);
    }
    .section h2 {
      margin: 0 0 14px;
      font-size: 1.1rem;
    }
    .summary {
      margin: 0;
      line-height: 1.7;
      color: var(--muted);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .box {
      border: 1px solid var(--line);
      background: linear-gradient(180deg, #fbfdff, #f7faff);
      border-radius: 22px;
      padding: 18px 20px;
    }
    .box ul {
      margin: 0;
      padding-left: 18px;
      line-height: 1.7;
      color: var(--muted);
    }
    .next-step {
      border-radius: 22px;
      padding: 20px;
      background: linear-gradient(135deg, rgba(109,65,243,0.08), rgba(255,255,255,0.96));
      border: 1px solid var(--line);
    }
    .next-step strong {
      display: block;
      margin-bottom: 10px;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.78rem;
    }
    .footer {
      padding: 20px 36px 32px;
      color: var(--muted);
      font-size: 0.95rem;
    }
    @media (max-width: 760px) {
      body { padding: 14px; }
      .hero, .section, .footer { padding-left: 18px; padding-right: 18px; }
      .hero-top, .hero-grid, .grid { grid-template-columns: 1fr; display: grid; }
    }
  </style>
</head>
<body>
  <article class="sheet">
    <header class="hero">
      <div class="hero-top">
        <div class="hero-copy">
          <span class="eyebrow">Analisis comercial</span>
          <h1>${escapeHtml(analysis?.title || "Analisis comercial inicial")}</h1>
          <p>${escapeHtml(content?.headline || "Lectura estructurada del caso con foco en captacion y siguiente paso comercial.")}</p>
        </div>
        ${logoUrl ? `<img class="hero-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" />` : ""}
      </div>
      <div class="hero-grid">
        <div class="hero-card">
          <strong>Cliente</strong>
          <div>${escapeHtml(leadName)}</div>
        </div>
        <div class="hero-card">
          <strong>Servicio recomendado</strong>
          <div>${escapeHtml(
            analysis?.recommended_service || lead?.interest_service || content?.recommended_service || "Pendiente"
          )}</div>
        </div>
        <div class="hero-card">
          <strong>Marca</strong>
          <div>${escapeHtml(brandName)}</div>
        </div>
      </div>
    </header>

    <section class="section">
      <h2>Resumen ejecutivo</h2>
      <p class="summary">${escapeHtml(
        content?.summary ||
          "Hemos preparado una lectura inicial del caso para detectar prioridades y siguiente paso comercial."
      )}</p>
    </section>

    <section class="section">
      <div class="grid">
        <div class="box">
          <h2>Que estamos viendo</h2>
          <ul>${renderList(findings)}</ul>
        </div>
        <div class="box">
          <h2>Quick wins</h2>
          <ul>${renderList(quickWins)}</ul>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="grid">
        <div class="box">
          <h2>Prioridades</h2>
          <ul>${renderList(priorities)}</ul>
        </div>
        <div class="next-step">
          <strong>Siguiente paso recomendado</strong>
          <div>${escapeHtml(
            content?.next_step ||
              "Convertir este analisis en una propuesta accionable y priorizada."
          )}</div>
        </div>
      </div>
    </section>

    <footer class="footer">
      Preparado por ${escapeHtml(brandName)} para ${escapeHtml(leadName)}.
    </footer>
  </article>
</body>
</html>`;
}

export function renderAnalysisEmailHtml({
  lead = {},
  analysis = {},
  previewUrl = "",
  humanAgentUrl = "",
  brandName = "TMedia Global",
} = {}) {
  const content = analysis?.content_json || {};
  return `
  <div style="font-family: Inter, Arial, sans-serif; line-height:1.65; color:#14213d;">
    <h2 style="margin-bottom:10px;">Hola${lead?.name ? ` ${escapeHtml(lead.name)}` : ""}</h2>
    <p>Te compartimos un analisis inicial preparado por ${escapeHtml(brandName)} para ayudarte a avanzar con ${escapeHtml(
      analysis?.recommended_service || lead?.interest_service || "tu caso"
    )}.</p>
    <p><strong>Resumen:</strong> ${escapeHtml(
      content?.summary || "Hemos detectado varias oportunidades de mejora con impacto comercial."
    )}</p>
    <p style="margin:20px 0;">
      <a href="${escapeHtml(
        previewUrl
      )}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#6d41f3;color:#fff;text-decoration:none;font-weight:700;">Abrir analisis</a>
    </p>
    ${
      humanAgentUrl
        ? `<p>Si prefieres comentarlo con una persona, puedes hacerlo aqui:</p>
      <p><a href="${escapeHtml(
        humanAgentUrl
      )}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#16a34a;color:#fff;text-decoration:none;font-weight:700;">Hablar con un agente</a></p>`
        : ""
    }
    <p>Si te encaja, el siguiente paso natural es convertir este analisis en una propuesta accionable y priorizada.</p>
  </div>`;
}
