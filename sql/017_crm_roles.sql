-- Roles dentro de cada cuenta cliente: Propietario (owner), Gestor (manager), Comercial (sales), Solo lectura (viewer).
-- client_admin (el usuario único que tenía cada cuenta) sigue valiendo y el CRM lo trata como Propietario.
-- La opción "los comerciales solo ven sus contactos" se guarda en app_settings (team_settings:<cuenta>): no necesita tabla nueva.

alter table crm_users drop constraint if exists crm_users_role_check;

alter table crm_users add constraint crm_users_role_check
  check (role in ('super_admin', 'client_admin', 'owner', 'manager', 'sales', 'viewer'));

-- Un usuario de cliente siempre pertenece a una cuenta (solo la agencia va sin cuenta).
-- not valid: no falla por filas antiguas huérfanas, pero sí impide crear nuevas.
alter table crm_users drop constraint if exists crm_users_account_required;
alter table crm_users add constraint crm_users_account_required
  check (role = 'super_admin' or account_id is not null) not valid;

-- Contactos asignados a un usuario (leads.assigned_to guarda el id de crm_users).
create index if not exists idx_leads_account_assigned_to on leads(account_id, assigned_to);
