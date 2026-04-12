alter table leads
  add column if not exists source_platform text,
  add column if not exists source_campaign text,
  add column if not exists source_form_name text,
  add column if not exists source_ad_name text,
  add column if not exists source_adset_name text;

create index if not exists leads_source_platform_idx
  on leads (source_platform, created_at desc);

create index if not exists leads_source_campaign_idx
  on leads (source_campaign, created_at desc);
