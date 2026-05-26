create table if not exists conversation_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  event_type text not null,
  channel text,
  external_user_id text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversation_events_conversation_id_idx
  on conversation_events (conversation_id, created_at desc);

create index if not exists conversation_events_event_type_idx
  on conversation_events (event_type, created_at desc);
