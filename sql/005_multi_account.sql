create extension if not exists "pgcrypto";

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
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  status = excluded.status,
  plan = excluded.plan,
  is_default = excluded.is_default,
  updated_at = now();

alter table if exists conversations add column if not exists account_id text references accounts(id) on delete set null;
alter table if exists leads add column if not exists account_id text references accounts(id) on delete set null;
alter table if exists quotes add column if not exists account_id text references accounts(id) on delete set null;
alter table if exists conversation_events add column if not exists account_id text references accounts(id) on delete set null;
alter table if exists tool_logs add column if not exists account_id text references accounts(id) on delete set null;
alter table if exists messages add column if not exists account_id text references accounts(id) on delete set null;

update conversations set account_id = 'default' where account_id is null;
update leads set account_id = 'default' where account_id is null;
update quotes set account_id = 'default' where account_id is null;
update conversation_events set account_id = 'default' where account_id is null;
update tool_logs set account_id = 'default' where account_id is null;
update messages set account_id = 'default' where account_id is null;

create index if not exists idx_conversations_account_id on conversations(account_id);
create index if not exists idx_leads_account_id on leads(account_id);
create index if not exists idx_quotes_account_id on quotes(account_id);
create index if not exists idx_conversation_events_account_id on conversation_events(account_id);
create index if not exists idx_tool_logs_account_id on tool_logs(account_id);
create index if not exists idx_messages_account_id on messages(account_id);

create or replace function set_updated_at_accounts()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_accounts_updated_at on accounts;

create trigger trg_accounts_updated_at
before update on accounts
for each row
execute function set_updated_at_accounts();
