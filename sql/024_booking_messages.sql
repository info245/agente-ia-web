-- 024: confirmación y recordatorios de cita al cliente (Configuración → Agenda).
alter table bookings add column if not exists confirmation_sent_at timestamptz;
alter table bookings add column if not exists reminders_sent jsonb not null default '{}'::jsonb;
-- Las citas que ya existían no reciben una confirmación atrasada.
update bookings set confirmation_sent_at = created_at where confirmation_sent_at is null;
create index if not exists idx_bookings_upcoming on bookings(status, starts_at);
