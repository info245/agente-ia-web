// Google Calendar por cuenta: freeBusy para huecos reales y events.insert para reservar.
// El refresh token sale del OAuth de /oauth/google/calendar/callback (mismo cliente que Gmail).

const API = "https://www.googleapis.com/calendar/v3";

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return value;
}

function offsetMs(date, timeZone) {
  const v = zonedParts(date, timeZone);
  return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - Math.floor(date.getTime() / 1000) * 1000;
}

// Hora de pared en `timeZone` -> instante UTC (dos pasadas para cruzar cambios de horario).
export function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(new Date(guess), timeZone);
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

// Tramos del día en minutos desde las 00:00. Sin `ranges` (configuración antigua), de start_hour a end_hour.
function dayRanges(meeting = {}) {
  const toMin = (v) => {
    const [h, m] = String(v || "").split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const ranges = (meeting.ranges || []).map((r) => [toMin(r.start), toMin(r.end)]).filter(([a, b]) => a !== null && b !== null && a < b);
  return ranges.length ? ranges : [[(meeting.start_hour ?? 9) * 60, (meeting.end_hour ?? 18) * 60]];
}

// Límites de reserva: antelación mínima y días vista. También los usa bookMeeting para no aceptar huecos fuera.
export function bookingWindow(meeting = {}, now = new Date()) {
  const notice = Number.isFinite(Number(meeting.min_notice_hours)) ? Number(meeting.min_notice_hours) : 1;
  const maxDays = Number(meeting.max_days_ahead) || 14;
  return { earliest: now.getTime() + notice * 3_600_000, latest: now.getTime() + maxDays * 86_400_000 };
}

export function computeFreeSlots({ busy = [], meeting = {}, now = new Date(), fromDate = null, days = 5, limit = 12 } = {}) {
  const timeZone = meeting.timezone || "Europe/Madrid";
  const duration = (meeting.duration_minutes || 30) * 60_000;
  const step = (meeting.slot_step_minutes || meeting.duration_minutes || 30) * 60_000;
  const buffer = (meeting.buffer_minutes || 0) * 60_000;
  const workDays = meeting.days || [1, 2, 3, 4, 5];
  const { earliest, latest } = bookingWindow(meeting, now);
  // El descanso se respeta a ambos lados de cada cita ocupada.
  const busyRanges = busy.map((item) => [Date.parse(item.start) - buffer, Date.parse(item.end) + buffer]);
  const base = fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)
    ? fromDate.split("-").map(Number)
    : (({ year, month, day }) => [year, month, day])(zonedParts(now, timeZone));

  const slots = [];
  for (let offset = 0; offset < Math.min(Math.max(days || 5, 1), 60) && slots.length < limit; offset += 1) {
    const date = new Date(Date.UTC(base[0], base[1] - 1, base[2] + offset));
    if (!workDays.includes(date.getUTCDay())) continue;
    const [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
    for (const [from, to] of dayRanges(meeting)) {
      const rangeEnd = zonedTimeToUtc(y, m, d, Math.floor(to / 60), to % 60, timeZone).getTime();
      for (let start = zonedTimeToUtc(y, m, d, Math.floor(from / 60), from % 60, timeZone).getTime(); start + duration <= rangeEnd; start += step) {
        if (start < earliest || start > latest) continue;
        if (busyRanges.some(([busyStart, busyEnd]) => start < busyEnd && start + duration > busyStart)) continue;
        slots.push({
          start: new Date(start).toISOString(),
          end: new Date(start + duration).toISOString(),
          label: new Date(start).toLocaleString("es-ES", { timeZone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }),
        });
        if (slots.length >= limit) break;
      }
      if (slots.length >= limit) break;
    }
  }
  return slots;
}

async function getAccessToken(refreshToken) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: String(process.env.GOOGLE_OAUTH_CLIENT_ID || ""),
      client_secret: String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || ""),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || "Google Calendar: no se pudo renovar el token");
  }
  return payload.access_token;
}

async function googleFetch(accessToken, path, body, method = "POST") {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null);
  // Borrar un evento que ya no existe (410) no es un error.
  if (!response.ok && !(method === "DELETE" && response.status === 410)) {
    throw new Error(payload?.error?.message || `Google Calendar ${response.status}`);
  }
  return payload;
}

export function isCalendarConnected(calendarConfig = null) {
  return Boolean(
    String(calendarConfig?.google_refresh_token || "").trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
}

export function createGoogleCalendar(calendarConfig = {}, meeting = {}) {
  const calendarId = calendarConfig.calendar_id || "primary";
  const timeZone = meeting.timezone || "Europe/Madrid";

  async function busyBetween(accessToken, timeMin, timeMax) {
    const payload = await googleFetch(accessToken, "/freeBusy", {
      timeMin,
      timeMax,
      timeZone,
      items: [{ id: calendarId }],
    });
    return payload?.calendars?.[calendarId]?.busy || [];
  }

  return {
    async getAvailableSlots({ from_date = null, days = 5, now = new Date() } = {}) {
      const accessToken = await getAccessToken(calendarConfig.google_refresh_token);
      const span = Math.min(Math.max(days || 5, 1), Number(meeting.max_days_ahead) || 14);
      const timeMin = from_date ? new Date(`${from_date}T00:00:00Z`) : now;
      const timeMax = new Date(timeMin.getTime() + (span + 1) * 86_400_000);
      const busy = await busyBetween(accessToken, timeMin.toISOString(), timeMax.toISOString());
      return computeFreeSlots({ busy, meeting, now, fromDate: from_date, days: span });
    },

    async bookMeeting({ start, name, email, notes = null, summary = "Reunión" }) {
      const startMs = Date.parse(start);
      if (!Number.isFinite(startMs)) throw new Error("Hora de inicio no válida");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""))) throw new Error("Email no válido");
      const { earliest, latest } = bookingWindow(meeting);
      if (startMs < earliest || startMs > latest) return { ok: false, error: "slot_out_of_window" };
      const end = new Date(startMs + (meeting.duration_minutes || 30) * 60_000).toISOString();
      const startIso = new Date(startMs).toISOString();
      const accessToken = await getAccessToken(calendarConfig.google_refresh_token);
      // El hueco puede haberse ocupado desde que se ofreció (con el descanso alrededor).
      const buffer = (meeting.buffer_minutes || 0) * 60_000;
      const busy = await busyBetween(accessToken, new Date(startMs - buffer).toISOString(), new Date(Date.parse(end) + buffer).toISOString());
      if (busy.length) return { ok: false, error: "slot_taken" };
      const event = await googleFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`, {
        summary: `${summary} con ${name}`,
        description: notes || "",
        start: { dateTime: startIso, timeZone },
        end: { dateTime: end, timeZone },
        attendees: [{ email, displayName: name }],
      });
      return { ok: true, event_id: event?.id || null, start: startIso, end, timezone: timeZone };
    },

    // Mueve la reunión a otra hora; Google envía la invitación actualizada al cliente.
    async rescheduleMeeting({ eventId, start }) {
      const startMs = Date.parse(start);
      if (!Number.isFinite(startMs)) throw new Error("Hora de inicio no válida");
      if (!eventId) throw new Error("Esta cita no tiene evento en Google Calendar");
      const startIso = new Date(startMs).toISOString();
      const end = new Date(startMs + (meeting.duration_minutes || 30) * 60_000).toISOString();
      const accessToken = await getAccessToken(calendarConfig.google_refresh_token);
      const busy = await busyBetween(accessToken, startIso, end);
      if (busy.length) return { ok: false, error: "slot_taken" };
      await googleFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
        { start: { dateTime: startIso, timeZone }, end: { dateTime: end, timeZone } },
        "PATCH"
      );
      return { ok: true, start: startIso, end };
    },

    async cancelMeeting({ eventId }) {
      if (!eventId) return { ok: true };
      const accessToken = await getAccessToken(calendarConfig.google_refresh_token);
      await googleFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
        undefined,
        "DELETE"
      );
      return { ok: true };
    },
  };
}
