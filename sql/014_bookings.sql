-- 014: reuniones reservadas por el agente v2 en el Google Calendar de cada cuenta.

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  attendee_name text,
  attendee_email text,
  notes text,
  provider text not null default 'google_calendar',
  provider_event_id text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table bookings enable row level security;

create index if not exists idx_bookings_account_starts on bookings(account_id, starts_at);
create index if not exists idx_bookings_conversation on bookings(conversation_id);
