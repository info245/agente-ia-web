alter table if exists leads
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create index if not exists leads_custom_fields_gin_idx
  on leads using gin (custom_fields);
