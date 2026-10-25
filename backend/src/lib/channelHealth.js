// Configuración → Canales → «Estado de los canales»: qué funciona, qué no y qué hacer.
// Cada comprobación: { key, label, status: ok | warn | error | off, detail, action?: { label, href } }.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? t : null;
};

export function timeAgo(iso, now = Date.now()) {
  const t = at(iso);
  if (t === null) return "nunca";
  const diff = Math.max(0, now - t);
  if (diff < HOUR) return `hace ${Math.max(1, Math.round(diff / 60_000))} min`;
  if (diff < DAY) return `hace ${Math.round(diff / HOUR)} h`;
  const days = Math.round(diff / DAY);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
}

const REASONS = {
  "missing-app-secret": "falta la clave secreta de la app de Meta en el servidor",
  "missing-signature": "llegan sin firma",
  "invalid-signature": "la firma no coincide con la clave secreta",
  "unknown-phone-number": "el número no está vinculado a ninguna cuenta",
};

function whatsappCheck(w = {}, now) {
  const base = { key: "whatsapp", label: "WhatsApp" };
  if (!w.configured) return { ...base, status: "off", detail: "Sin conectar.", action: { label: "Conectar", href: "/agencia" } };
  if (!w.app_secret) {
    return { ...base, status: "error", detail: "El servidor no puede verificar los mensajes que envía Meta (falta WHATSAPP_APP_SECRET), así que no entra ninguno.", action: { label: "Avisar a la agencia", href: "mailto:info@t-mediaglobal.com?subject=WhatsApp%20no%20recibe" } };
  }
  const rejected = w.rejections || null;
  if (rejected?.count && now - (at(rejected.last_at) || 0) < DAY) {
    return { ...base, status: "error", detail: `Meta ha intentado entregar ${rejected.count} aviso${rejected.count === 1 ? "" : "s"} y los hemos rechazado: ${REASONS[rejected.reason] || rejected.reason}. Último ${timeAgo(rejected.last_at, now)}.` };
  }
  // Cada envío genera avisos de «entregado/leído» por el webhook: si enviamos y no llega nada, el webhook está roto.
  const sent = at(w.last_outbound_at);
  const heard = at(w.last_webhook_at);
  if (sent && now - sent > 30 * 60_000 && now - sent < 14 * DAY && (heard === null || heard < sent)) {
    return {
      ...base,
      status: "error",
      detail: `Enviamos WhatsApp (${timeAgo(w.last_outbound_at, now)}) pero Meta no nos ha confirmado nada desde ${heard ? timeAgo(w.last_webhook_at, now) : "nunca"}: no están entrando los mensajes de los clientes. Revisa la URL del webhook en Meta.`,
      action: { label: "Abrir Meta", href: "https://developers.facebook.com/apps" },
    };
  }
  if (w.token_readable === false) {
    return {
      ...base,
      status: w.using_fallback ? "warn" : "error",
      detail: w.using_fallback
        ? "Funciona, pero el token guardado no se puede leer y se usa el de reserva del servidor. Vuelve a pegar el token del canal."
        : "El token guardado no se puede leer: no se pueden enviar WhatsApp. Vuelve a pegar el token del canal.",
      action: { label: "Revisar canal", href: "/agencia" },
    };
  }
  if (!w.templates) return { ...base, status: "warn", detail: "Sin plantillas aprobadas: fuera de las 24 h desde su último mensaje no se le puede escribir a nadie." };
  return { ...base, status: "ok", detail: `Recibiendo · último aviso de Meta ${timeAgo(w.last_webhook_at, now)} · ${w.templates} plantilla${w.templates === 1 ? "" : "s"} aprobada${w.templates === 1 ? "" : "s"}.` };
}

export function buildChannelHealth({ whatsapp, email = {}, calendar = {}, forms = {}, conversions = {}, push = {} } = {}, now = Date.now()) {
  const checks = [
    whatsappCheck(whatsapp, now),
    !email.connected
      ? { key: "email", label: "Email", status: "off", detail: "Los emails automáticos están desactivados." }
      : email.failed_7d
        ? { key: "email", label: "Email", status: "warn", detail: `${email.failed_7d} email${email.failed_7d === 1 ? "" : "s"} no se pudieron enviar en los últimos 7 días. Envía desde ${email.from}.` }
        : { key: "email", label: "Email", status: "ok", detail: `Envía desde ${email.from}${email.last_sent_at ? ` · última campaña o automatización ${timeAgo(email.last_sent_at, now)}` : ""}.` },
    calendar.connected
      ? { key: "calendar", label: "Calendario", status: "ok", detail: "Conectado: el asistente puede reservar videollamadas." }
      : { key: "calendar", label: "Calendario", status: "off", detail: "Sin conectar: el asistente no puede reservar citas." },
    forms.autocontact && !forms.template
      ? { key: "forms", label: "Formularios", status: "warn", detail: "El primer WhatsApp está activado pero sin plantilla aprobada." }
      : { key: "forms", label: "Formularios", status: forms.last_lead_at ? "ok" : "off", detail: forms.last_lead_at ? `Último lead de formulario ${timeAgo(forms.last_lead_at, now)}${forms.autocontact ? " · primer WhatsApp activado" : ""}.` : "Todavía no ha entrado ningún lead de formulario." },
    !conversions.enabled
      ? { key: "conversions", label: "Conversiones", status: "off", detail: "Google Ads y Meta no reciben conversiones.", action: { label: "Configurar", href: "/conversiones" } }
      : conversions.failed_7d
        ? { key: "conversions", label: "Conversiones", status: "warn", detail: `${conversions.failed_7d} envío${conversions.failed_7d === 1 ? "" : "s"} fallaron en 7 días.`, action: { label: "Ver historial", href: "/conversiones" } }
        : { key: "conversions", label: "Conversiones", status: "ok", detail: `Activadas · último envío ${timeAgo(conversions.last_sent_at, now)}.` },
    push.devices
      ? { key: "push", label: "Avisos en el móvil", status: "ok", detail: push.devices === 1 ? "1 dispositivo recibe avisos." : `${push.devices} dispositivos reciben avisos.` }
      : { key: "push", label: "Avisos en el móvil", status: "off", detail: "Ningún móvil recibe avisos de leads nuevos." },
  ];
  return { checks, errors: checks.filter((c) => c.status === "error").length, warnings: checks.filter((c) => c.status === "warn").length };
}
