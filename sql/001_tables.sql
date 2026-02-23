create extension if not exists "pgcrypto";

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'web',
  external_user_id text,
  previous_response_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete set null,
  name text,
  email text,
  phone text,
  interest_service text,
  urgency text,
  budget_range text,
  summary text,
  lead_score text check (lead_score in ('hot','warm','cold')),
  consent boolean default false,
  consent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists tool_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete set null,
  tool_name text not null,
  tool_args jsonb,
  tool_result jsonb,
  created_at timestamptz not null default now()
);
