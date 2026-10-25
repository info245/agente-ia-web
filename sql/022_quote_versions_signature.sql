-- 022: propuestas con versiones, aceptación firmada y plantillas por servicio.
--   version     → v1, v2…: editar una propuesta ya enviada crea una versión nueva (la enviada no cambia).
--   acceptance  → prueba de la aceptación: nombre, NIF, firma dibujada, fecha, IP y navegador.

alter table quotes add column if not exists version integer not null default 1;
alter table quotes add column if not exists acceptance jsonb;
create index if not exists idx_quotes_lead_created on quotes(lead_id, created_at desc);

create table if not exists quote_templates (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references accounts(id) on delete cascade,
  name text not null default '',
  service text not null default '',
  title text not null default '',
  billing_type text not null default 'monthly',
  tax_rate numeric not null default 21,
  items jsonb not null default '[]'::jsonb,
  summary text not null default '',
  scope text not null default '',
  body text not null default '',
  assumptions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_quote_templates_account on quote_templates(account_id, service);
alter table quote_templates enable row level security;
