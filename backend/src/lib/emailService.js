import nodemailer from "nodemailer";

const internalEnabled =
  String(process.env.LEADS_EMAIL_ENABLED || "").toLowerCase() === "true";

const clientEnabled =
  String(process.env.LEADS_CLIENT_EMAIL_ENABLED || "").toLowerCase() === "true";

const internalTo = (process.env.LEADS_EMAIL_TO || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const from = process.env.LEADS_EMAIL_FROM || process.env.SMTP_USER;
const clientFrom = process.env.LEADS_CLIENT_EMAIL_FROM || from;
const whatsappPublicNumber = String(process.env.WHATSAPP_PUBLIC_NUMBER || "").replace(/\D/g, "");

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nl2br(str = "") {
  return escapeHtml(str).replace(/\n/g, "<br>");
}

function buildClientFriendlySummary(lead = {}) {
  const parts = [];

  if (lead?.interest_service) {
    parts.push(`Servicio solicitado: ${lead.interest_service}.`);
  }

  if (lead?.budget_range) {
    parts.push(`Presupuesto indicado: ${lead.budget_range}.`);
  }

  if (lead?.urgency) {
    parts.push(`Prioridad indicada: ${lead.urgency}.`);
  }

  if (lead?.main_goal) {
    parts.push(`Objetivo principal: ${lead.main_goal}.`);
  }

  if (!parts.length) {
    return "Hemos recibido correctamente tu solicitud y revisaremos la informacion para poder ayudarte.";
  }

  return parts.join(" ");
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure =
    String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("Faltan variables SMTP_HOST / SMTP_USER / SMTP_PASS");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return transporter;
}

export async function sendLeadEmail({
  lead,
  conversation_id,
  type = "new",
  changedFields = [],
}) {
  if (!internalEnabled) return { skipped: true, reason: "internal-disabled" };
  if (!internalTo.length) throw new Error("LEADS_EMAIL_TO está vacío");
  if (!from) throw new Error("LEADS_EMAIL_FROM o SMTP_USER está vacío");

  const typeLabel = type === "update" ? "Actualización" : "Nuevo";
  const subject = `${typeLabel} lead - ${lead?.interest_service || "Sin servicio"} - ${lead?.name || "Sin nombre"} (${lead?.lead_score ?? "N/A"})`;

  const rows = [
    ["Nombre", lead?.name],
    ["Email", lead?.email],
    ["Teléfono", lead?.phone],
    ["Servicio de interés", lead?.interest_service],
    ["Urgencia", lead?.urgency],
    ["Presupuesto", lead?.budget_range],
    ["Lead score", lead?.lead_score],
    ["Consentimiento", lead?.consent ? "Sí" : "No"],
    ["Conversation ID", conversation_id || lead?.conversation_id],
    ["Creado", lead?.created_at],
  ];

  const summaryText = lead?.summary || "Sin resumen disponible";

  const changedHtml =
    type === "update" && changedFields.length
      ? `<p><b>Campos actualizados:</b> ${escapeHtml(changedFields.join(", "))}</p>`
      : "";

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
    <h2 style="margin-bottom: 12px;">${typeLabel} lead capturado</h2>
    ${changedHtml}

    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse: collapse; font-size: 14px; margin-bottom: 18px;">
      <tbody>
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v ?? "")}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>

    <h3 style="margin: 18px 0 8px;">Resumen final de la conversación</h3>
    <div style="font-size: 14px; background: #f7f7f7; border: 1px solid #ddd; padding: 12px; border-radius: 6px;">
      ${nl2br(summaryText)}
    </div>
  </div>`;

  const textBase = rows.map(([k, v]) => `${k}: ${v ?? ""}`).join("\n");
  const text =
    type === "update" && changedFields.length
      ? `Campos actualizados: ${changedFields.join(", ")}\n\n${textBase}\n\nResumen final de la conversación:\n${summaryText}`
      : `${textBase}\n\nResumen final de la conversación:\n${summaryText}`;

  const t = getTransporter();

  const info = await t.sendMail({
    from,
    to: internalTo,
    subject,
    text,
    html,
  });

  return { ok: true, messageId: info.messageId };
}

export async function sendClientConfirmationEmail({ lead, conversation_id }) {
  if (!clientEnabled) return { skipped: true, reason: "client-disabled" };
  if (!lead?.email) return { skipped: true, reason: "no-email" };
  if (!clientFrom) throw new Error("LEADS_CLIENT_EMAIL_FROM está vacío");

  const subject = "Hemos recibido tu solicitud - TMedia Global";
  const summaryText = buildClientFriendlySummary(lead);

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
    <h2>Gracias${lead?.name ? ", " + escapeHtml(lead.name) : ""}</h2>
    <p>Hemos recibido correctamente tu solicitud en TMedia Global.</p>
    <p><b>Servicio de interés:</b> ${escapeHtml(lead?.interest_service || "No indicado")}</p>
    <p><b>Presupuesto indicado:</b> ${escapeHtml(lead?.budget_range || "No indicado")}</p>

    <h3 style="margin: 18px 0 8px;">Resumen de tu solicitud</h3>
    <div style="font-size: 14px; background: #f7f7f7; border: 1px solid #ddd; padding: 12px; border-radius: 6px;">
      ${nl2br(summaryText)}
    </div>

    <p style="margin-top: 16px;">Revisaremos la información y te contactaremos lo antes posible.</p>

    <hr/>
    <p style="font-size: 13px; color: #444;">
      TMedia Global<br/>
      Referencia de conversación: ${escapeHtml(conversation_id || lead?.conversation_id || "")}
    </p>
  </div>`;

  const text = `
Gracias${lead?.name ? ", " + lead.name : ""}

Hemos recibido correctamente tu solicitud en TMedia Global.

Servicio de interés: ${lead?.interest_service || "No indicado"}
Presupuesto indicado: ${lead?.budget_range || "No indicado"}

Resumen de tu solicitud:
${summaryText}

Revisaremos la información y te contactaremos lo antes posible.

Referencia de conversación: ${conversation_id || lead?.conversation_id || ""}
`;

  const t = getTransporter();

  const info = await t.sendMail({
    from: clientFrom,
    to: lead.email,
    subject,
    text,
    html,
    replyTo: process.env.LEADS_EMAIL_REPLY_TO || process.env.SMTP_USER,
  });

  return { ok: true, messageId: info.messageId };
}

export async function sendQuoteEmailToLead({ lead, quote, previewUrl }) {
  if (!clientEnabled) return { skipped: true, reason: "client-disabled" };
  if (!lead?.email) return { skipped: true, reason: "no-email" };
  if (!clientFrom) throw new Error("LEADS_CLIENT_EMAIL_FROM está vacío");

  const subject = quote?.title
    ? `${quote.title} - TMedia Global`
    : "Tu propuesta - TMedia Global";

  const whatsappText = [
    `Hola${lead?.name ? `, soy ${lead.name}` : ""}.`,
    `Vengo de la propuesta de ${lead?.interest_service || "TMedia Global"} y quiero resolver una duda antes de avanzar.`,
  ].join(" ");
  const whatsappUrl = whatsappPublicNumber
    ? `https://wa.me/${whatsappPublicNumber}?text=${encodeURIComponent(whatsappText)}`
    : null;
  const totalText =
    quote?.total != null
      ? `${String(quote.total)} ${quote?.currency || "EUR"}`
      : "No indicado";

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
    <h2>Hola${lead?.name ? ", " + escapeHtml(lead.name) : ""}</h2>
    <p>Te compartimos tu propuesta preparada por TMedia Global.</p>
    <p><b>Servicio:</b> ${escapeHtml(lead?.interest_service || "No indicado")}</p>
    <p><b>Importe total:</b> ${escapeHtml(totalText)}</p>
    <p>Puedes revisarla aquí:</p>
    <p><a href="${escapeHtml(previewUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1f5eff;color:#fff;text-decoration:none;font-weight:bold;">Abrir propuesta</a></p>
    ${
      whatsappUrl
        ? `<p style="margin-top:14px;">Si prefieres resolver cualquier duda por WhatsApp, también puedes seguir por aquí:</p>
    <p><a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1faa59;color:#fff;text-decoration:none;font-weight:bold;">Resolver dudas por WhatsApp</a></p>`
        : ""
    }
    <p>Si quieres, podemos comentarla contigo y ajustarla antes de cerrarla.</p>
  </div>`;

  const text = `Hola${lead?.name ? ", " + lead.name : ""}\n\nTe compartimos tu propuesta preparada por TMedia Global.\n\nServicio: ${lead?.interest_service || "No indicado"}\nImporte total: ${totalText}\n\nAbrir propuesta:\n${previewUrl}${
    whatsappUrl ? `\n\nResolver dudas por WhatsApp:\n${whatsappUrl}` : ""
  }\n\nSi quieres, podemos comentarla contigo y ajustarla antes de cerrarla.`;

  const t = getTransporter();
  const info = await t.sendMail({
    from: clientFrom,
    to: lead.email,
    subject,
    text,
    html,
    replyTo: process.env.LEADS_EMAIL_REPLY_TO || process.env.SMTP_USER,
  });

  return { ok: true, messageId: info.messageId };
}
