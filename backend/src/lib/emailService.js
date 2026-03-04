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
    secure, // true para 465 (SSL), false para 587 (STARTTLS)
    auth: { user, pass },

    // Si te sale error de certificado TLS desde Render/Plesk, descomenta:
    // tls: { rejectUnauthorized: false },
  });

  return transporter;
}

export async function sendLeadEmail({ lead, conversation_id }) {
  if (!enabled) return { skipped: true };
  if (!to.length) throw new Error("LEADS_EMAIL_TO está vacío");
  if (!from) throw new Error("LEADS_EMAIL_FROM o SMTP_USER está vacío");

  const subject = `Nuevo lead (${lead?.lead_score ?? "N/A"}) - ${lead?.name || "Sin nombre"} - ${lead?.interest_service || "Sin interés"}`;

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

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.4">
    <h2>Nuevo lead capturado</h2>
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

  const text = rows.map(([k, v]) => `${k}: ${v ?? ""}`).join("\n");

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