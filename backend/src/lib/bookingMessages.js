// Mensajes de cita al cliente: confirmación por email al reservar y recordatorios N horas antes.
// Columnas en bookings (sql/024): confirmation_sent_at y reminders_sent ({ "24": iso, "2": iso }).
const HOUR = 3_600_000;

// Qué toca enviar ahora. Un recordatorio cuyo momento ya pasó cuando se reservó (p. ej. el de 24 h
// en una cita reservada 3 h antes) no se envía: se marca como omitido para no volver a mirarlo.
export function dueBookingMessages(bookings = [], meeting = {}, now = Date.now()) {
  const due = [];
  const reminders = (meeting.reminders || []).map(Number).filter((h) => h > 0);
  for (const b of bookings) {
    const start = Date.parse(b.starts_at);
    const created = Date.parse(b.created_at);
    if (b.status !== "confirmed" || !Number.isFinite(start) || start <= now) continue;
    if (!b.confirmation_sent_at) due.push({ booking: b, kind: "confirmation", skip: meeting.confirmation_email === false || !b.attendee_email });
    const sent = b.reminders_sent || {};
    for (const hours of reminders) {
      const at = start - hours * HOUR;
      if (sent[hours] || now < at) continue;
      due.push({ booking: b, kind: "reminder", hours, skip: Number.isFinite(created) && created > at });
    }
  }
  return due;
}

export function formatBookingDate(iso, timeZone = "Europe/Madrid") {
  return new Date(iso).toLocaleString("es-ES", { timeZone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

const whenText = (hours) => (hours >= 24 && hours % 24 === 0 ? (hours === 24 ? "mañana" : `en ${hours / 24} días`) : `en ${hours} hora${hours === 1 ? "" : "s"}`);

export function bookingMessageText({ kind, hours, booking = {}, brandName = "", timeZone = "Europe/Madrid" }) {
  const first = String(booking.attendee_name || "").trim().split(/\s+/)[0] || "";
  const date = formatBookingDate(booking.starts_at, timeZone);
  const hola = `Hola${first ? ` ${first}` : ""}`;
  if (kind === "confirmation") {
    return {
      subject: `Cita confirmada: ${date}`,
      text: `${hola}, tu cita con ${brandName || "nosotros"} queda confirmada para el ${date}.\n\nTe llegará también la invitación del calendario con el enlace de la videollamada. Si necesitas cambiarla, responde a este mensaje.`,
    };
  }
  return {
    subject: `Recordatorio: tu cita es ${whenText(hours)}`,
    text: `${hola}, te recordamos tu cita con ${brandName || "nosotros"} ${whenText(hours)}: ${date}.\n\nEl enlace de la videollamada está en la invitación del calendario. Si no puedes asistir, responde a este mensaje y la cambiamos.`,
  };
}
