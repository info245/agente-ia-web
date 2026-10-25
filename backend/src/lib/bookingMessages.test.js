import test from "node:test";
import assert from "node:assert/strict";
import { bookingMessageText, dueBookingMessages } from "./bookingMessages.js";

const now = Date.parse("2026-10-25T10:00:00Z");
const booking = (patch) => ({ id: "b", status: "confirmed", attendee_email: "ana@x.es", attendee_name: "Ana López", starts_at: "2026-10-26T09:00:00Z", created_at: "2026-10-20T10:00:00Z", confirmation_sent_at: "2026-10-20T10:01:00Z", reminders_sent: {}, ...patch });
const kinds = (list) => list.map((d) => `${d.kind}${d.hours ? `:${d.hours}` : ""}${d.skip ? ":omitir" : ""}`);

test("confirmación y recordatorios: cuándo tocan y cuándo se omiten", () => {
  const meeting = { reminders: [24, 2] };
  assert.deepEqual(kinds(dueBookingMessages([booking()], meeting, now)), ["reminder:24"], "a 23 h de la cita toca el de 24 h, aún no el de 2 h");
  assert.deepEqual(kinds(dueBookingMessages([booking({ reminders_sent: { 24: "x" } })], meeting, now)), [], "no se repite");
  assert.deepEqual(kinds(dueBookingMessages([booking({ confirmation_sent_at: null, created_at: "2026-10-25T09:30:00Z" })], meeting, now)), ["confirmation", "reminder:24:omitir"], "reservada con menos de 24 h: el de 24 h se omite");
  assert.deepEqual(kinds(dueBookingMessages([booking({ confirmation_sent_at: null, attendee_email: "" })], meeting, now)), ["confirmation:omitir", "reminder:24"]);
  assert.deepEqual(kinds(dueBookingMessages([booking({ status: "cancelled" }), booking({ starts_at: "2026-10-25T09:00:00Z" })], meeting, now)), [], "canceladas y pasadas no");
  assert.deepEqual(kinds(dueBookingMessages([booking({ confirmation_sent_at: null })], { reminders: [], confirmation_email: false }, now)), ["confirmation:omitir"]);
});

test("textos de confirmación y recordatorio", () => {
  const b = booking({ starts_at: "2026-10-26T09:00:00Z" });
  assert.match(bookingMessageText({ kind: "confirmation", booking: b, brandName: "TMedia Global" }).text, /^Hola Ana, tu cita con TMedia Global queda confirmada para el lunes, 26 de octubre/);
  assert.equal(bookingMessageText({ kind: "reminder", hours: 24, booking: b }).subject, "Recordatorio: tu cita es mañana");
  assert.equal(bookingMessageText({ kind: "reminder", hours: 2, booking: b }).subject, "Recordatorio: tu cita es en 2 horas");
});
