-- 023: plan(es) que se le proponen al contacto (p. ej. "SEO Avanzado, Google Ads"). Se rellena al guardar la propuesta.
alter table leads add column if not exists interest_plan text;
