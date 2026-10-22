-- 016: registro RGPD de quién vio, exportó, anonimizó o borró los datos de un contacto.
-- lead_id no tiene clave ajena a propósito: el registro debe sobrevivir al borrado del contacto.
-- El consentimiento se guarda como conversation_events (event_type = 'consent') y la
-- configuración de aviso y plazos en la config de cada cuenta (clave "privacy"): no necesitan tablas.

create table if not exists data_access_log (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  lead_id uuid,
  action text not null check (action in ('view', 'export', 'delete', 'anonymize')),
  actor_id text,
  actor_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table data_access_log enable row level security;

create index if not exists idx_data_access_log_lead on data_access_log(account_id, lead_id, created_at desc);
create index if not exists idx_leads_account_updated on leads(account_id, updated_at);
