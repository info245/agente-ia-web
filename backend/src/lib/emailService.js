// backend/src/lib/emailService.js
import nodemailer from "nodemailer";

const enabled = String(process.env.LEADS_EMAIL_ENABLED || "").toLowerCase() === "true";

const to = (process.env.LEADS_EMAIL_TO || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const from = process.env.LEADS_EMAIL_FROM || process.env.SMTP_USER;

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
  if (!enabled) return null;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
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
    // Si alguna vez te diera error de certificado, descomenta:
    // tls: { rejectUnauthorized: false },
  });

  return transporter;
}

export async function sendLeadEmail({ lead, conversation_id, type = "new", changedFields = [] }) {
  if (!enabled) return { skipped: true };
  if (!to.length) throw new Error("LEADS_EMAIL_TO está vacío");
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
    to,
    subject,
    text,
    html,
  });

  return { ok: true, messageId: info.messageId };
}