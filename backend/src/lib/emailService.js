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

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    ["Resumen", lead?.summary],
    ["Creado", lead?.created_at],
  ];

  const changedHtml =
    type === "update" && changedFields.length
      ? `<p><b>Campos actualizados:</b> ${escapeHtml(changedFields.join(", "))}</p>`
      : "";

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.4">
    <h2>${typeLabel} lead capturado</h2>
    ${changedHtml}
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse: collapse; font-size: 14px">
      <tbody>
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v ?? "")}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`;

  const textBase = rows.map(([k, v]) => `${k}: ${v ?? ""}`).join("\n");
  const text =
    type === "update" && changedFields.length
      ? `Campos actualizados: ${changedFields.join(", ")}\n\n${textBase}`
      : textBase;

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

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.5">
    <h2>Gracias${lead?.name ? ", " + escapeHtml(lead.name) : ""}</h2>
    <p>Hemos recibido correctamente tu solicitud en TMedia Global.</p>
    <p><b>Servicio de interés:</b> ${escapeHtml(lead?.interest_service || "No indicado")}</p>
    <p><b>Presupuesto indicado:</b> ${escapeHtml(lead?.budget_range || "No indicado")}</p>
    <p><b>Resumen:</b><br>${escapeHtml(lead?.summary || "")}</p>
    <p>Revisaremos la información y te contactaremos lo antes posible.</p>
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

Resumen:
${lead?.summary || ""}

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