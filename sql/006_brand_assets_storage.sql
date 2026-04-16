insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crm-brand-assets',
  'crm-brand-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy if not exists "Public read for CRM brand assets"
on storage.objects
for select
to public
using (bucket_id = 'crm-brand-assets');

create policy if not exists "Service role manages CRM brand assets"
on storage.objects
for all
to service_role
using (bucket_id = 'crm-brand-assets')
with check (bucket_id = 'crm-brand-assets');
