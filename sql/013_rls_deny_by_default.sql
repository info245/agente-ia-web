-- 013: cerrar la API pública de Supabase (anon / authenticated).
--
-- El backend usa solo la service role, que ignora RLS, así que esto no cambia su
-- comportamiento. Sin RLS, cualquiera con la anon key del proyecto podía leer
-- leads, mensajes y crm_users (hashes de contraseña) vía PostgREST, y llamar a
-- kb_match_docs_for_account para leer el conocimiento de cualquier cuenta.
--
-- RLS sin políticas = denegar todo a anon/authenticated. Las políticas por
-- account_id llegarán con el panel nuevo (fase 2), cuando haya sesiones Supabase Auth.

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- Las funciones nacen con EXECUTE para PUBLIC; las RPC del backend solo las usa la service role.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Lo que se cree a partir de ahora tampoco queda expuesto por defecto.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public grant execute on functions to service_role;

-- Verificación (debe devolver 0 filas):
-- select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity;
