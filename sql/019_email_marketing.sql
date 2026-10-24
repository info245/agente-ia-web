-- 019: email marketing (campañas, automatizaciones, seguimiento y bajas).
-- Los destinatarios son los contactos del CRM (leads). Cada email enviado es una fila de
-- email_messages: su id es el token de apertura, clic y baja. Las bajas viven en
-- email_suppressions para que sobrevivan al borrado o a una nueva importación del contacto.

alter table leads add column if not exists tags text[] not null default '{}';
create index if not exists idx_leads_tags on leads using gin(tags);

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  name text not null default '',
  subject text not null default '',
  preheader text not null default '',
  from_name text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  segment jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  sent_at timestamptz,
  recipients_count integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_email_campaigns_account on email_campaigns(account_id, created_at desc);

create table if not exists email_automations (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  name text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  trigger jsonb not null default '{}'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_email_automations_account on email_automations(account_id, status);

create table if not exists email_automation_runs (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  automation_id uuid not null references email_automations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  step_index integer not null default 0,
  status text not null default 'active' check (status in ('active', 'done', 'exited')),
  next_at timestamptz not null default now(),
  exit_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_id, lead_id)
);
create index if not exists idx_email_runs_due on email_automation_runs(status, next_at);

create table if not exists email_messages (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  campaign_id uuid references email_campaigns(id) on delete cascade,
  run_id uuid references email_automation_runs(id) on delete cascade,
  step_index integer,
  lead_id uuid references leads(id) on delete set null,
  email text not null,
  subject text not null default '',
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  error text,
  sent_at timestamptz,
  opened_at timestamptz,
  open_count integer not null default 0,
  clicked_at timestamptz,
  click_count integer not null default 0,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, lead_id),
  unique (run_id, step_index)
);
create index if not exists idx_email_messages_campaign on email_messages(campaign_id, status);
create index if not exists idx_email_messages_lead on email_messages(lead_id, created_at desc);

create table if not exists email_suppressions (
  account_id text not null references accounts(id) on delete cascade,
  email text not null,
  reason text not null check (reason in ('unsubscribed', 'bounced', 'complained', 'manual')),
  message_id uuid,
  created_at timestamptz not null default now(),
  primary key (account_id, email)
);

alter table email_campaigns enable row level security;
alter table email_automations enable row level security;
alter table email_automation_runs enable row level security;
alter table email_messages enable row level security;
alter table email_suppressions enable row level security;
