-- 020: constructor visual de email marketing.
-- Automatizaciones como mapa de nodos: cada ejecución guarda el id del nodo en el que está
-- (step_id) y cada email de una automatización, el nodo que lo envió. Plantillas de email
-- reutilizables por campañas y automatizaciones.

alter table email_automation_runs add column if not exists step_id text;
alter table email_messages add column if not exists step_id text;
create unique index if not exists idx_email_messages_run_step on email_messages(run_id, step_id) where step_id is not null;
create index if not exists idx_email_runs_automation_step on email_automation_runs(automation_id, status, step_id);

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  name text not null default '',
  subject text not null default '',
  preheader text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_email_templates_account on email_templates(account_id, updated_at desc);
alter table email_templates enable row level security;
