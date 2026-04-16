create extension if not exists "pgcrypto";

create table if not exists crm_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  role text not null check (role in ('super_admin', 'client_admin')),
  account_id text references accounts(id) on delete set null,
  display_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_users_account_id on crm_users(account_id);

create or replace function set_updated_at_crm_users()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_crm_users_updated_at on crm_users;

create trigger trg_crm_users_updated_at
before update on crm_users
for each row
execute function set_updated_at_crm_users();
