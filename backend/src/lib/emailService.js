import nodemailer from "nodemailer";

const internalEnabled =
  String(process.env.LEADS_EMAIL_ENABLED || "").toLowerCase() === "true";

const clientEnabled =
  String(process.env.LEADS_CLIENT_EMAIL_ENABLED || "").toLowerCase() === "true";

const internalTo = (process.env.LEADS_EMAIL_TO || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const fallbackFrom = process.env.LEADS_EMAIL_FROM || process.env.SMTP_USER || "";
const fallbackClientFrom = process.env.LEADS_CLIENT_EMAIL_FROM || fallbackFrom;
const whatsappPublicNumber = String(process.env.WHATSAPP_PUBLIC_NUMBER || "").replace(/\D/g, "");
const globalGoogleOauthClientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
const globalGoogleOauthClientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();

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

let defaultTransporter = null;

function getProviderDefaults(provider = "smtp") {
  const normalized = String(provider || "").trim().toLowerCase();
  if (normalized === "gmail") {
    return { host: "smtp.gmail.com", port: 465, secure: true };
  }
  if (normalized === "google_oauth") {
    return { host: "smtp.gmail.com", port: 465, secure: true };
  }
  if (normalized === "resend") {
    return { host: "smtp.resend.com", port: 465, secure: true };
  }
  if (normalized === "sendgrid") {
    return { host: "smtp.sendgrid.net", port: 587, secure: false };
  }
  return { host: "", port: 465, secure: true };
}

function resolveEmailRuntimeConfig(emailConfig = null) {
  const provider = String(emailConfig?.provider || "smtp").trim().toLowerCase();
  const providerDefaults = getProviderDefaults(provider);

  const host = String(
    emailConfig?.smtp_host || providerDefaults.host || process.env.SMTP_HOST || ""
  ).trim();
  const port = Number(emailConfig?.smtp_port || providerDefaults.port || process.env.SMTP_PORT || 465);
  const secure =
    typeof emailConfig?.smtp_secure === "boolean"
      ? emailConfig.smtp_secure
      : providerDefaults.host
        ? providerDefaults.secure
        : String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
  const user = String(emailConfig?.smtp_user || process.env.SMTP_USER || "").trim();
  const pass = String(emailConfig?.smtp_pass || process.env.SMTP_PASS || "").trim();
  const googleClientId = String(
    process.env.GOOGLE_OAUTH_CLIENT_ID || emailConfig?.google_client_id || ""
  ).trim();
  const googleClientSecret = String(
    process.env.GOOGLE_OAUTH_CLIENT_SECRET || emailConfig?.google_client_secret || ""
  ).trim();
  const googleRefreshToken = String(emailConfig?.google_refresh_token || "").trim();
  const googleAccessToken = String(emailConfig?.google_access_token || "").trim();
  const googleConnectedEmail = String(
    emailConfig?.google_connected_email || emailConfig?.from_email || ""
  ).trim();
  const fromAddress = String(
    emailConfig?.from_email || googleConnectedEmail || fallbackFrom || user || ""
  ).trim();
  const clientFromAddress = String(
    emailConfig?.from_email ||
      googleConnectedEmail ||
      process.env.LEADS_CLIENT_EMAIL_FROM ||
      fallbackClientFrom ||
      user ||
      ""
  ).trim();
  const replyToAddress = String(
    emailConfig?.reply_to_email ||
      googleConnectedEmail ||
      process.env.LEADS_EMAIL_REPLY_TO ||
      user ||
      ""
  ).trim();

  return {
    provider,
    host,
    port,
    secure,
    user,
    pass,
    fromAddress,
    clientFromAddress,
    replyToAddress,
    googleClientId,
    googleClientSecret,
    googleRefreshToken,
    googleAccessToken,
    googleConnectedEmail,
  };
}

function createTransporter(runtime) {
  if (runtime.provider === "google_oauth") {
    if (
      !globalGoogleOauthClientId ||
      !globalGoogleOauthClientSecret ||
      !runtime.googleRefreshToken ||
      !runtime.googleConnectedEmail
    ) {
      throw new Error(
        "Falta configurar Google OAuth global o conectar la cuenta de Gmail."
      );
    }

    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: runtime.googleConnectedEmail,
        clientId: globalGoogleOauthClientId,
        clientSecret: globalGoogleOauthClientSecret,
        refreshToken: runtime.googleRefreshToken,
        accessToken: runtime.googleAccessToken || undefined,
      },
    });
  }

  if (!runtime.host || !runtime.user || !runtime.pass) {
    throw new Error("Faltan SMTP host, usuario o password para este proveedor.");
  }

  return nodemailer.createTransport({
    host: runtime.host,
    port: runtime.port,
    secure: runtime.secure,
    auth: { user: runtime.user, pass: runtime.pass },
  });
}

function getTransporter(emailConfig = null) {
  if (!emailConfig && defaultTransporter) return defaultTransporter;
  const runtime = resolveEmailRuntimeConfig(emailConfig);
  const transporter = createTransporter(runtime);
  if (!emailConfig) {
    defaultTransporter = transporter;
  }
  return transporter;
}

export async function verifyEmailTransport(emailConfig = null) {
  const t = getTransporter(emailConfig);
  await t.verify();
  return { ok: true };
}

export async function sendLeadEmail({
  lead,
  conversation_id,
  type = "new",
  changedFields = [],
  emailConfig = null,
}) {
  if (!internalEnabled) return { skipped: true, reason: "internal-disabled" };
  if (!internalTo.length) throw new Error("LEADS_EMAIL_TO esta vacio");

  const runtime = resolveEmailRuntimeConfig(emailConfig);
  if (!runtime.fromAddress) throw new Error("Falta el email de salida.");

  const typeLabel = type === "update" ? "Actualizacion" : "Nuevo";
  const subject = `${typeLabel} lead - ${lead?.interest_service || "Sin servicio"} - ${lead?.name || "Sin nombre"} (${lead?.lead_score ?? "N/A"})`;

  const rows = [
    ["Nombre", lead?.name],
    ["Email", lead?.email],
    ["Telefono", lead?.phone],
    ["Servicio de interes", lead?.interest_service],
    ["Urgencia", lead?.urgency],
    ["Presupuesto", lead?.budget_range],
    ["Lead score", lead?.lead_score],
    ["Consentimiento", lead?.consent ? "Si" : "No"],
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
          .map(([k, v]) => `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v ?? "")}</td></tr>`)
          .join("")}
      </tbody>
    </table>
    <h3 style="margin: 18px 0 8px;">Resumen final de la conversacion</h3>
    <div style="font-size: 14px; background: #f7f7f7; border: 1px solid #ddd; padding: 12px; border-radius: 6px;">
      ${nl2br(summaryText)}
    </div>
  </div>`;

  const textBase = rows.map(([k, v]) => `${k}: ${v ?? ""}`).join("\n");
  const text =
    type === "update" && changedFields.length
      ? `Campos actualizados: ${changedFields.join(", ")}\n\n${textBase}\n\nResumen final de la conversacion:\n${summaryText}`
      : `${textBase}\n\nResumen final de la conversacion:\n${summaryText}`;

  const t = getTransporter(emailConfig);
  const info = await t.sendMail({
    from: runtime.fromAddress,
    to: internalTo,
    subject,
    text,
    html,
    replyTo: runtime.replyToAddress || undefined,
  });

  return { ok: true, messageId: info.messageId };
}

export async function sendClientConfirmationEmail({
  lead,
  conversation_id,
  emailConfig = null,
}) {
  if (!clientEnabled) return { skipped: true, reason: "client-disabled" };
  if (!lead?.email) return { skipped: true, reason: "no-email" };

  const runtime = resolveEmailRuntimeConfig(emailConfig);
  if (!runtime.clientFromAddress) throw new Error("Falta el email de salida.");

  const subject = "Hemos recibido tu solicitud - TMedia Global";
  const summaryText = buildClientFriendlySummary(lead);
  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
    <h2>Gracias${lead?.name ? ", " + escapeHtml(lead.name) : ""}</h2>
    <p>Hemos recibido correctamente tu solicitud en TMedia Global.</p>
    <p><b>Servicio de interes:</b> ${escapeHtml(lead?.interest_service || "No indicado")}</p>
    <p><b>Presupuesto indicado:</b> ${escapeHtml(lead?.budget_range || "No indicado")}</p>
    <h3 style="margin: 18px 0 8px;">Resumen de tu solicitud</h3>
    <div style="font-size: 14px; background: #f7f7f7; border: 1px solid #ddd; padding: 12px; border-radius: 6px;">
      ${nl2br(summaryText)}
    </div>
    <p style="margin-top: 16px;">Revisaremos la informacion y te contactaremos lo antes posible.</p>
    <hr/>
    <p style="font-size: 13px; color: #444;">
      TMedia Global<br/>
      Referencia de conversacion: ${escapeHtml(conversation_id || lead?.conversation_id || "")}
    </p>
  </div>`;

  const text = `
Gracias${lead?.name ? ", " + lead.name : ""}

Hemos recibido correctamente tu solicitud en TMedia Global.

Servicio de interes: ${lead?.interest_service || "No indicado"}
Presupuesto indicado: ${lead?.budget_range || "No indicado"}

Resumen de tu solicitud:
${summaryText}

Revisaremos la informacion y te contactaremos lo antes posible.

Referencia de conversacion: ${conversation_id || lead?.conversation_id || ""}
`;

  const t = getTransporter(emailConfig);
  const info = await t.sendMail({
    from: runtime.clientFromAddress,
    to: lead.email,
    subject,
    text,
    html,
    replyTo: runtime.replyToAddress || undefined,
  });

  return { ok: true, messageId: info.messageId };
}

export async function sendQuoteEmailToLead({
  lead,
  quote,
  previewUrl,
  emailConfig = null,
}) {
  if (!clientEnabled) return { skipped: true, reason: "client-disabled" };
  if (!lead?.email) return { skipped: true, reason: "no-email" };

  const runtime = resolveEmailRuntimeConfig(emailConfig);
  if (!runtime.clientFromAddress) throw new Error("Falta el email de salida.");

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
    <p>Puedes revisarla aqui:</p>
    <p><a href="${escapeHtml(previewUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1f5eff;color:#fff;text-decoration:none;font-weight:bold;">Abrir propuesta</a></p>
    ${
      whatsappUrl
        ? `<p style="margin-top:14px;">Si prefieres resolver cualquier duda por WhatsApp, tambien puedes seguir por aqui:</p>
    <p><a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1faa59;color:#fff;text-decoration:none;font-weight:bold;">Resolver dudas por WhatsApp</a></p>`
        : ""
    }
    <p>Si quieres, podemos comentarla contigo y ajustarla antes de cerrarla.</p>
  </div>`;

  const text = `Hola${lead?.name ? ", " + lead.name : ""}\n\nTe compartimos tu propuesta preparada por TMedia Global.\n\nServicio: ${lead?.interest_service || "No indicado"}\nImporte total: ${totalText}\n\nAbrir propuesta:\n${previewUrl}${
    whatsappUrl ? `\n\nResolver dudas por WhatsApp:\n${whatsappUrl}` : ""
  }\n\nSi quieres, podemos comentarla contigo y ajustarla antes de cerrarla.`;

  const t = getTransporter(emailConfig);
  const info = await t.sendMail({
    from: runtime.clientFromAddress,
    to: lead.email,
    subject,
    text,
    html,
    replyTo: runtime.replyToAddress || undefined,
  });

  return { ok: true, messageId: info.messageId };
}

export async function sendTransactionalEmail({
  to,
  subject,
  text,
  html,
  replyTo = null,
  emailConfig = null,
} = {}) {
  if (!clientEnabled) return { skipped: true, reason: "client-disabled" };
  if (!to) return { skipped: true, reason: "no-email" };

  const runtime = resolveEmailRuntimeConfig(emailConfig);
  if (!runtime.clientFromAddress) throw new Error("Falta el email de salida.");

  const t = getTransporter(emailConfig);
  const info = await t.sendMail({
    from: runtime.clientFromAddress,
    to,
    subject: subject || "Mensaje comercial",
    text: text || "",
    html: html || nl2br(text || ""),
    replyTo: replyTo || runtime.replyToAddress || undefined,
  });

  return { ok: true, messageId: info.messageId };
}
