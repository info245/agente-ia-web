create extension if not exists "pgcrypto";

create table if not exists analysis_results (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  account_id text references accounts(id) on delete set null,
  title text not null default 'Analisis comercial',
  status text not null default 'draft' check (status in ('draft', 'sent')),
  recommended_service text,
  source_url text,
  content_json jsonb not null default '{}'::jsonb,
  html_snapshot text,
  sent_via text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_analysis_results_lead_id
  on analysis_results(lead_id);

create index if not exists idx_analysis_results_account_id
  on analysis_results(account_id);

create index if not exists idx_analysis_results_conversation_id
  on analysis_results(conversation_id);

create or replace function set_updated_at_analysis_results()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_analysis_results_updated_at on analysis_results;

create trigger trg_analysis_results_updated_at
before update on analysis_results
for each row
execute function set_updated_at_analysis_results();
