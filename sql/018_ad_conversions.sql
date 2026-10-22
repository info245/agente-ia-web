-- 018: conversiones offline hacia Google Ads y Meta.
--
-- Ajustes por cuenta (IDs de Google Ads, Pixel de Meta, qué etapas cuentan). Los secretos
-- (refresh token de Google, token de Conversions API) van cifrados con SECRETS_ENCRYPTION_KEY
-- desde el backend. Los envíos usan la cola automation_jobs (job_type = 'conversion_upload'),
-- que ya tiene reintentos y el índice único (account_id, dedupe_key) que evita duplicados.

create table if not exists ad_conversion_settings (
  account_id text primary key references accounts(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ad_conversion_settings enable row level security;

drop trigger if exists trg_ad_conversion_settings_updated_at on ad_conversion_settings;
create trigger trg_ad_conversion_settings_updated_at
before update on ad_conversion_settings
for each row execute function set_runtime_updated_at();

-- Registro del CRM: últimos envíos de conversiones de una cuenta.
create index if not exists automation_jobs_account_type_created_idx
  on automation_jobs(account_id, job_type, created_at desc);
