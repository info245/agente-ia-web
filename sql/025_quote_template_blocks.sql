-- 025: bloques extra en plantillas de propuesta (tablas, packs, fases, imágenes, texto, testimonios).
alter table quote_templates add column if not exists blocks jsonb not null default '[]'::jsonb;
