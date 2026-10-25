-- 021: permisos separados por contacto.
--   consent            → privacidad: atender su solicitud (ya existía).
--   whatsapp_consent   → escribirle por WhatsApp sobre su solicitud.
--   marketing_consent  → comunicaciones comerciales (campañas y automatizaciones de email marketing).
-- null = el formulario no lo preguntó (contactos antiguos): se mantiene el comportamiento anterior.

alter table leads add column if not exists whatsapp_consent boolean;
alter table leads add column if not exists marketing_consent boolean;
alter table leads add column if not exists marketing_consent_at timestamptz;
