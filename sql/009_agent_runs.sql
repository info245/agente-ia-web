create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete set null,
  agent_id text not null,
  intent text,
  input_summary text,
  output_summary text,
  tools_used jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists agent_runs_conversation_id_created_at_idx
  on agent_runs (conversation_id, created_at desc);

create index if not exists agent_runs_agent_id_created_at_idx
  on agent_runs (agent_id, created_at desc);
