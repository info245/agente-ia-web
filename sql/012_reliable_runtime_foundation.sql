begin;

create extension if not exists "pgcrypto";
create extension if not exists vector;

-- This migration is intentionally defensive: it repairs partially provisioned
-- environments as well as upgrading databases created by migrations 001-011.
create table if not exists accounts (
  id text primary key,
  slug text unique not null,
  name text not null,
  status text not null default 'active',
  plan text not null default 'trial',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into accounts (id, slug, name, status, plan, is_default)
values ('default', 'tmedia-global', 'TMedia Global', 'active', 'internal', true)
on conflict (id) do nothing;

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  account_id text references accounts(id) on delete set null,
  channel text not null default 'web',
  external_user_id text,
  previous_response_id text,
  inbox_status text not null default 'new',
  ai_status text not null default 'active',
  assigned_to text,
  snoozed_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table conversations
  add column if not exists account_id text references accounts(id) on delete set null,
  add column if not exists inbox_status text not null default 'new',
  add column if not exists ai_status text not null default 'active',
  add column if not exists assigned_to text,
  add column if not exists snoozed_until timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conversations_inbox_status_check') then
    alter table conversations add constraint conversations_inbox_status_check
      check (inbox_status in ('new', 'open', 'pending', 'snoozed', 'closed')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'conversations_ai_status_check') then
    alter table conversations add constraint conversations_ai_status_check
      check (ai_status in ('active', 'paused')) not valid;
  end if;
end $$;

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  account_id text references accounts(id) on delete set null,
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table messages
  add column if not exists account_id text references accounts(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  account_id text references accounts(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  name text,
  email text,
  phone text,
  company_name text,
  interest_service text,
  urgency text,
  budget_range text,
  summary text,
  lead_score integer not null default 0,
  consent boolean not null default false,
  consent_at timestamptz,
  business_type text,
  business_activity text,
  main_goal text,
  current_situation text,
  pain_points text,
  preferred_contact_channel text,
  last_intent text,
  current_step text,
  last_question text,
  crm_status text not null default 'nuevo',
  quote_status text not null default 'sin_presupuesto',
  assigned_to text,
  internal_notes text,
  next_action text,
  follow_up_at timestamptz,
  notes_ai text,
  chat_completed boolean not null default false,
  source_platform text,
  source_campaign text,
  source_form_name text,
  source_ad_name text,
  source_adset_name text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table leads
  add column if not exists account_id text references accounts(id) on delete set null,
  add column if not exists company_name text,
  add column if not exists business_type text,
  add column if not exists business_activity text,
  add column if not exists main_goal text,
  add column if not exists current_situation text,
  add column if not exists pain_points text,
  add column if not exists preferred_contact_channel text,
  add column if not exists last_intent text,
  add column if not exists current_step text,
  add column if not exists last_question text,
  add column if not exists crm_status text not null default 'nuevo',
  add column if not exists quote_status text not null default 'sin_presupuesto',
  add column if not exists assigned_to text,
  add column if not exists internal_notes text,
  add column if not exists next_action text,
  add column if not exists follow_up_at timestamptz,
  add column if not exists notes_ai text,
  add column if not exists chat_completed boolean not null default false,
  add column if not exists source_platform text,
  add column if not exists source_campaign text,
  add column if not exists source_form_name text,
  add column if not exists source_ad_name text,
  add column if not exists source_adset_name text,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- 001 used hot/warm/cold while the application writes a 0-100 score. Drop any
-- legacy CHECK mentioning lead_score, then convert existing values without loss.
do $$
declare
  score_type text;
  constraint_row record;
begin
  select data_type into score_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'leads' and column_name = 'lead_score';

  if score_type is not null and score_type <> 'integer' then
    for constraint_row in
      select conname
      from pg_constraint
      where conrelid = 'public.leads'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%lead_score%'
    loop
      execute format('alter table public.leads drop constraint %I', constraint_row.conname);
    end loop;

    alter table public.leads alter column lead_score drop default;
    alter table public.leads alter column lead_score type integer using (
      case
        when lower(trim(lead_score::text)) = 'hot' then 90
        when lower(trim(lead_score::text)) = 'warm' then 60
        when lower(trim(lead_score::text)) = 'cold' then 25
        when trim(lead_score::text) ~ '^[+-]?[0-9]+([.][0-9]+)?$'
          then greatest(0, least(100, round(lead_score::text::numeric)::integer))
        else 0
      end
    );
  end if;
end $$;

update leads
set lead_score = greatest(0, least(100, coalesce(lead_score, 0)));
alter table leads alter column lead_score set default 0;
alter table leads alter column lead_score set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.leads'::regclass and conname = 'leads_lead_score_range_check'
  ) then
    alter table public.leads
      add constraint leads_lead_score_range_check check (lead_score between 0 and 100) not valid;
    alter table public.leads validate constraint leads_lead_score_range_check;
  end if;
end $$;

-- Preserve every duplicate lead but detach older duplicates from the conversation
-- before enforcing the one-conversation/one-lead invariant used by upsert().
with duplicate_conversations as (
  select
    id,
    row_number() over (
      partition by conversation_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as duplicate_rank
  from leads
  where conversation_id is not null
)
update leads
set conversation_id = null,
    internal_notes = concat_ws(
      E'\n',
      nullif(internal_notes, ''),
      'Migración 012: conversation_id duplicado retirado; el lead se conserva para revisión.'
    )
where id in (select id from duplicate_conversations where duplicate_rank > 1);

create unique index if not exists leads_conversation_id_uidx on leads(conversation_id);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  account_id text references accounts(id) on delete set null,
  lead_id uuid not null references leads(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  title text not null default 'Propuesta comercial',
  status text not null default 'draft',
  currency text not null default 'EUR',
  subtotal numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  content_json jsonb not null default '{}'::jsonb,
  html_snapshot text,
  sent_via text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversation_events (
  id uuid primary key default gen_random_uuid(),
  account_id text references accounts(id) on delete set null,
  conversation_id uuid not null references conversations(id) on delete cascade,
  event_type text not null,
  channel text,
  external_user_id text,
  payload jsonb,
  created_at timestamptz not null default now()
);
alter table conversation_events add column if not exists account_id text references accounts(id) on delete set null;

create table if not exists tool_logs (
  id uuid primary key default gen_random_uuid(),
  account_id text references accounts(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  tool_name text not null,
  tool_args jsonb,
  tool_result jsonb,
  created_at timestamptz not null default now()
);
alter table tool_logs add column if not exists account_id text references accounts(id) on delete set null;

create table if not exists app_settings (
  key text primary key,
  account_id text references accounts(id) on delete cascade,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app_settings add column if not exists account_id text references accounts(id) on delete cascade;

create table if not exists kb_docs (
  id bigint generated by default as identity primary key,
  account_id text references accounts(id) on delete cascade,
  url text not null,
  title text,
  chunk text not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table kb_docs
  add column if not exists account_id text references accounts(id) on delete cascade,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  account_id text references accounts(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  agent_id text not null,
  intent text,
  input_summary text,
  output_summary text,
  tools_used jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now()
);
alter table agent_runs add column if not exists account_id text references accounts(id) on delete set null;

create table if not exists intake_events (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  source text not null,
  idempotency_key text not null,
  external_event_id text,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'processing', 'completed', 'failed', 'rejected')),
  conversation_id uuid references conversations(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, idempotency_key)
);

create table if not exists channel_inbox_events (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  channel text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists automation_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  job_type text not null,
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  lock_token uuid,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table automation_jobs add column if not exists result jsonb not null default '{}'::jsonb;

create table if not exists outbox_events (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  aggregate_type text not null,
  aggregate_id text,
  event_type text not null,
  destination text not null,
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts > 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists config_versions (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  config jsonb not null default '{}'::jsonb,
  change_summary text,
  created_by uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, version)
);

-- Preserve the configuration already serving production as version 1.
insert into config_versions (
  account_id, version, status, config, change_summary, published_at
)
select
  account.id,
  1,
  'published',
  existing.value,
  'Importación de la configuración previa a versiones',
  now()
from accounts account
cross join lateral (
  select setting.value
  from app_settings setting
  where setting.key = 'crm_agent_config:' || account.id
     or (account.is_default and setting.key = 'crm_agent_config')
  order by case when setting.key = 'crm_agent_config:' || account.id then 0 else 1 end
  limit 1
) existing
where not exists (
  select 1 from config_versions version
  where version.account_id = account.id
)
on conflict (account_id, version) do nothing;

-- Repair account scoping for installations that predate multi-account columns.
update conversations set account_id = 'default' where account_id is null;
update leads set account_id = 'default' where account_id is null;
update messages set account_id = coalesce(
  (select conversations.account_id from conversations where conversations.id = messages.conversation_id),
  'default'
) where account_id is null;

create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  key text not null,
  label text not null,
  category text not null default 'open' check (category in ('open', 'won', 'lost')),
  color text not null default '#64748b' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position integer not null default 0 check (position >= 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, key),
  constraint pipeline_stages_account_position_key
    unique (account_id, position) deferrable initially deferred
);

create table if not exists agent_feedback (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  message_id uuid references messages(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  feedback_type text not null check (feedback_type in ('positive', 'negative', 'correction', 'missing_knowledge')),
  original_content text,
  corrected_content text,
  comment text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied')),
  metadata jsonb not null default '{}'::jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_account_channel_external_idx
  on conversations(account_id, channel, external_user_id, created_at desc);
create index if not exists messages_conversation_created_idx on messages(conversation_id, created_at);
create index if not exists messages_account_created_idx on messages(account_id, created_at desc);
create index if not exists leads_account_created_idx on leads(account_id, created_at desc);
create index if not exists leads_account_status_idx on leads(account_id, crm_status, created_at desc);
create index if not exists leads_account_follow_up_idx on leads(account_id, follow_up_at) where follow_up_at is not null;
create index if not exists leads_contact_email_idx on leads(account_id, lower(email)) where email is not null;
create index if not exists leads_custom_fields_gin_idx on leads using gin(custom_fields);
create index if not exists quotes_lead_created_idx on quotes(lead_id, created_at desc);
create index if not exists quotes_account_status_idx on quotes(account_id, status, created_at desc);
create index if not exists conversation_events_conversation_id_idx on conversation_events(conversation_id, created_at desc);
create index if not exists conversation_events_account_type_idx on conversation_events(account_id, event_type, created_at desc);
create index if not exists kb_docs_account_url_idx on kb_docs(account_id, url);
create index if not exists agent_runs_conversation_id_created_at_idx on agent_runs(conversation_id, created_at desc);
create index if not exists intake_events_status_available_idx on intake_events(account_id, status, created_at);
create index if not exists intake_events_external_event_idx on intake_events(account_id, source, external_event_id) where external_event_id is not null;
create index if not exists channel_inbox_events_status_available_idx on channel_inbox_events(status, available_at, created_at);
create index if not exists channel_inbox_events_account_status_idx on channel_inbox_events(account_id, status, available_at);
create index if not exists automation_jobs_status_available_idx on automation_jobs(status, available_at, created_at);
create unique index if not exists automation_jobs_account_dedupe_uidx on automation_jobs(account_id, dedupe_key) where dedupe_key is not null;
create index if not exists outbox_events_status_available_idx on outbox_events(status, available_at, created_at);
create unique index if not exists outbox_events_account_dedupe_uidx on outbox_events(account_id, dedupe_key) where dedupe_key is not null;
create unique index if not exists config_versions_one_published_uidx on config_versions(account_id) where status = 'published';
create unique index if not exists pipeline_stages_one_default_uidx on pipeline_stages(account_id) where is_default and is_active;
create index if not exists agent_feedback_account_status_idx on agent_feedback(account_id, status, created_at desc);

insert into pipeline_stages (account_id, key, label, category, color, position, is_default)
select account.id, stage.key, stage.label, stage.category, stage.color, stage.position, stage.is_default
from accounts account
cross join (values
  ('nuevo', 'Nuevo', 'open', '#3b82f6', 0, true),
  ('contactado', 'Contactado', 'open', '#06b6d4', 1, false),
  ('cualificado', 'Cualificado', 'open', '#8b5cf6', 2, false),
  ('presupuesto_borrador', 'Presupuesto borrador', 'open', '#f59e0b', 3, false),
  ('presupuesto_enviado', 'Presupuesto enviado', 'open', '#f97316', 4, false),
  ('negociacion', 'Negociación', 'open', '#ec4899', 5, false),
  ('ganado', 'Ganado', 'won', '#22c55e', 6, false),
  ('perdido', 'Perdido', 'lost', '#ef4444', 7, false)
) as stage(key, label, category, color, position, is_default)
on conflict (account_id, key) do nothing;

create or replace function set_runtime_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts', 'conversations', 'leads', 'quotes', 'app_settings', 'kb_docs',
    'intake_events', 'channel_inbox_events', 'automation_jobs', 'outbox_events',
    'config_versions', 'pipeline_stages', 'agent_feedback'
  ]
  loop
    execute format('drop trigger if exists %I on %I', 'trg_' || table_name || '_updated_at', table_name);
    execute format(
      'create trigger %I before update on %I for each row execute function set_runtime_updated_at()',
      'trg_' || table_name || '_updated_at',
      table_name
    );
  end loop;
end $$;

create or replace function claim_channel_inbox_events(p_limit integer default 20)
returns setof channel_inbox_events
language sql
security definer
set search_path = public
as $$
  with claimable as (
    select event.id
    from channel_inbox_events event
    where (
        (event.status in ('pending', 'failed') and event.available_at <= now())
        or (
          event.status = 'processing'
          and event.locked_at < now() - interval '5 minutes'
        )
      )
      and event.attempts < event.max_attempts
    order by event.available_at asc, event.created_at asc
    for update of event skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update channel_inbox_events event
  set status = 'processing',
      attempts = event.attempts + 1,
      locked_at = now(),
      last_error = null,
      updated_at = now()
  from claimable
  where event.id = claimable.id
  returning event.*;
$$;

revoke all on function claim_channel_inbox_events(integer) from public;
revoke all on function claim_channel_inbox_events(integer) from anon;
revoke all on function claim_channel_inbox_events(integer) from authenticated;
grant execute on function claim_channel_inbox_events(integer) to service_role;

create or replace function claim_automation_jobs(p_limit integer default 20)
returns setof automation_jobs
language sql
security definer
set search_path = public
as $$
  with claimable as (
    select job.id
    from automation_jobs job
    where (
      (job.status = 'pending' and job.available_at <= now())
      or (job.status = 'processing' and job.locked_at < now() - interval '5 minutes')
    )
      and job.attempts < job.max_attempts
    order by job.available_at asc, job.created_at asc
    for update of job skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update automation_jobs job
  set status = 'processing', attempts = job.attempts + 1,
      locked_at = now(), lock_token = gen_random_uuid(), last_error = null, updated_at = now()
  from claimable
  where job.id = claimable.id
  returning job.*;
$$;

revoke all on function claim_automation_jobs(integer) from public, anon, authenticated;
grant execute on function claim_automation_jobs(integer) to service_role;

create or replace function save_draft_config_version(
  p_account_id text,
  p_config jsonb,
  p_change_summary text default null,
  p_created_by uuid default null
)
returns config_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  draft config_versions;
begin
  perform pg_advisory_xact_lock(hashtext('config_version:' || p_account_id));
  select * into draft
  from config_versions
  where account_id = p_account_id and status = 'draft'
  order by version desc
  limit 1
  for update;
  if draft.id is null then
    insert into config_versions (account_id, version, status, config, change_summary, created_by)
    values (
      p_account_id,
      coalesce((select max(version) + 1 from config_versions where account_id = p_account_id), 1),
      'draft', p_config, p_change_summary, p_created_by
    ) returning * into draft;
  else
    update config_versions
    set config = p_config,
        change_summary = coalesce(nullif(p_change_summary, ''), change_summary),
        updated_at = now()
    where id = draft.id
    returning * into draft;
  end if;
  return draft;
end;
$$;

revoke all on function save_draft_config_version(text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function save_draft_config_version(text, jsonb, text, uuid) to service_role;

create or replace function publish_config_version(
  p_account_id text,
  p_config jsonb,
  p_change_summary text default null,
  p_created_by uuid default null
)
returns config_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  draft config_versions;
  published config_versions;
begin
  perform pg_advisory_xact_lock(hashtext('config_version:' || p_account_id));
  select * into draft
  from config_versions
  where account_id = p_account_id and status = 'draft'
  order by version desc
  limit 1
  for update;

  update config_versions
  set status = 'archived', updated_at = now()
  where account_id = p_account_id and status = 'published';

  if draft.id is null then
    insert into config_versions (
      account_id, version, status, config, change_summary, created_by, published_at
    ) values (
      p_account_id,
      coalesce((select max(version) + 1 from config_versions where account_id = p_account_id), 1),
      'published', p_config, p_change_summary, p_created_by, now()
    ) returning * into published;
  else
    update config_versions
    set status = 'published', config = p_config,
        change_summary = coalesce(nullif(p_change_summary, ''), change_summary),
        published_at = now(), updated_at = now()
    where id = draft.id
    returning * into published;
  end if;
  return published;
end;
$$;

revoke all on function publish_config_version(text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function publish_config_version(text, jsonb, text, uuid) to service_role;

create or replace function replace_kb_docs_for_url(
  p_account_id text,
  p_url text,
  p_title text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('kb_url:' || p_account_id || ':' || p_url));
  delete from kb_docs where account_id = p_account_id and url = p_url;
  insert into kb_docs (account_id, url, title, chunk, embedding, metadata)
  select
    p_account_id,
    p_url,
    p_title,
    item->>'chunk',
    (item->>'embedding')::vector,
    coalesce(item->'metadata', '{}'::jsonb)
  from jsonb_array_elements(p_rows) item;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function replace_kb_docs_for_url(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function replace_kb_docs_for_url(text, text, text, jsonb) to service_role;

create or replace function kb_match_docs_for_account(
  query_embedding vector(1536),
  match_count integer default 5,
  match_threshold double precision default 0.75,
  filter_account_id text default 'default'
)
returns table (id bigint, url text, title text, chunk text, similarity double precision)
language sql stable
as $$
  select
    docs.id,
    docs.url,
    docs.title,
    docs.chunk,
    (1 - (docs.embedding <=> query_embedding))::double precision as similarity
  from kb_docs docs
  where docs.account_id = filter_account_id
    and 1 - (docs.embedding <=> query_embedding) >= match_threshold
  order by docs.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 5), 50));
$$;

commit;
