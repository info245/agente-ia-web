create table if not exists whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  provider text not null default 'meta_cloud',
  status text not null default 'active',
  waba_id text,
  phone_number_id text not null unique,
  display_phone_number text,
  verified_name text,
  access_token text,
  token_label text,
  connected_at timestamptz,
  last_validated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_channels_account_id
  on whatsapp_channels(account_id);

create index if not exists idx_whatsapp_channels_phone_number_id
  on whatsapp_channels(phone_number_id);

create or replace function set_updated_at_whatsapp_channels()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_whatsapp_channels_updated_at on whatsapp_channels;

create trigger trg_whatsapp_channels_updated_at
before update on whatsapp_channels
for each row
execute function set_updated_at_whatsapp_channels();
