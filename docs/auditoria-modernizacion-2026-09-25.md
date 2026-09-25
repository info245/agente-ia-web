# Auditoría y modernización del CRM + agentes IA

Fecha: 25 de septiembre de 2026

## Resultado ejecutivo

El proyecto tenía una interfaz de configuración más avanzada que su runtime real. Formularios, WhatsApp, acciones, conocimiento y automatizaciones podían parecer configurados sin que existiera una ruta operativa, durable y verificable detrás. La actualización unifica el runtime, añade persistencia e idempotencia, convierte WhatsApp en un canal real, hace configurable el pipeline y separa borrador de publicación.

La dirección de producto combina:

- CRM y pipeline: Attio + reglas de HubSpot.
- Inbox y takeover: respond.io + WATI + Close.
- Agent Studio: Botpress + Intercom + HighLevel.
- Automatizaciones: n8n + Zapier + Make.
- WhatsApp: reglas oficiales de Meta/Twilio.

## Arquitectura resultante

1. Formularios externos entran por un endpoint server-side autenticado.
2. `intake_events` persiste el evento e impide duplicados mediante `Idempotency-Key`.
3. El lead y su conversación se guardan en el CRM con cuenta, origen y consentimiento normalizados.
4. WhatsApp persiste cada webhook antes de confirmar a Meta y lo procesa desde `channel_inbox_events`.
5. El runtime activo ejecuta acciones configuradas, memoria, scoring y siguiente mejor acción.
6. El takeover humano pausa la IA hasta que un operador la reactive.
7. Los seguimientos comerciales se encolan en `automation_jobs`, con bloqueo, reintentos, backoff e historial.
8. La configuración se guarda como borrador y solo el snapshot publicado alimenta al agente, widget y automatizaciones.
9. Las fuentes web se sincronizan de forma segura y se reemplazan transaccionalmente en `kb_docs`.

## Cambios principales

### Formularios y CRM

- Normalización común para Meta Lead Ads, Elementor y formularios genéricos.
- Consentimiento estricto; un texto ambiguo nunca se convierte en autorización.
- Idempotencia durable y validación de email, teléfono, tamaño y campos maliciosos.
- Autenticación solo por cabecera; el secreto ya no se acepta en URL ni en navegador.
- Paginación de leads y aislamiento multicuenta en mensajes, propuestas y análisis.
- Pipeline editable con etapas abiertas, ganadas y perdidas, nombre, color y orden.

### WhatsApp e inbox

- Canal real por cuenta, token cifrado, prueba de conexión y desconexión desde CRM.
- Webhook con firma Meta, persistencia previa al `200`, deduplicación y worker durable.
- Estados de entrega, timeout de llamadas a Meta y recuperación de jobs bloqueados.
- Regla de 24 horas: texto libre dentro de ventana y plantilla aprobada fuera de ella.
- Primer contacto de un formulario solo se envía mediante plantilla aprobada.
- Takeover humano visible en CRM; pausa inmediata y reactivación explícita de IA.

### Agentes y conocimiento

- El orquestador activo usa tono, instrucciones, conocimiento, acciones y siguiente mejor acción configurados.
- Eliminada la divergencia entre configuración visible y runtime efectivo.
- Los errores de persistencia de lead dejan de ocultarse y pasan a reintentarse.
- Sincronización de URLs desde el CRM con embeddings y protección SSRF.
- El conocimiento externo se trata como datos no confiables, nunca como instrucciones.

### Automatizaciones y publicación

- Cola `automation_jobs` con claves de deduplicación, locks, backoff y máximo de intentos.
- Ejecuciones en curso se recuperan tras expiración del lock.
- Snapshots inmutables de paso y plantilla para que una ejecución no cambie a mitad.
- Borrador, versión publicada, historial y restauración.
- Publicación y reemplazo de conocimiento mediante RPC transaccional.

### Seguridad y experiencia

- Stored XSS corregido en tablas, tarjetas, mensajes, timeline, analítica y presupuestos.
- Secretos SMTP/Gmail no salen al navegador, se preservan al guardar y se cifran en reposo.
- Login y `/messages` con rate limit; usuarios deshabilitados pierden acceso.
- `CRM_AUTH_SECRET` inseguro bloquea el arranque en producción.
- Debug autenticado, CORS cacheado, análisis web con timeout, límite de tamaño y bloqueo de redes privadas.
- Dirty state, navegación accesible, editor único de servicios, WhatsApp operativo y sincronización de conocimiento desde la UI.

## Verificación

- 173/173 pruebas automatizadas superadas.
- Todos los archivos JavaScript de `backend/src` y el CRM pasan `node --check`.
- Express 5 arranca correctamente; `/health` devuelve `200`.
- `npm audit --omit=dev`: 0 vulnerabilidades conocidas.
- `git diff --check`: sin errores de whitespace.

## Activación en producción

La base técnica quedó activada el 25 de septiembre de 2026:

- `sql/012_reliable_runtime_foundation.sql` aplicado correctamente al proyecto Supabase `BETA CHAT`.
- Secretos de autenticación, cifrado, integraciones y tareas generados y guardados directamente en Render.
- `CHANNEL_INBOX_INTERVAL_MS=5000` configurado.
- Commit `edd3b07` desplegado en `agente-ia-web-backend` y marcado `Live`.
- `/health` y configuración pública del widget verificados con HTTP `200`; configuración privada del CRM devuelve `401` sin sesión.
- Workers de inbox y automatizaciones verificados en logs, sin errores y con ejecución cada cinco segundos.

La activación funcional por cliente requiere completar desde el CRM:

1. Configurar y probar el canal WhatsApp de cada cuenta con las credenciales de Meta.
2. Elegir plantillas aprobadas para primer contacto y seguimientos fuera de 24 horas.
3. Sincronizar las fuentes de conocimiento.
4. Ejecutar escenarios del Agent Studio y publicar la versión.
5. Configurar cada formulario server-side con `x-integrations-secret` e `Idempotency-Key`.

## Endurecimiento posterior recomendado

- Si el backend se ejecuta con varias réplicas, mover los límites de peticiones y el estado OAuth a un almacén compartido como Redis.
- En entornos con DNS potencialmente hostil, fijar la IP ya validada durante las descargas de conocimiento para cerrar también la ventana de DNS rebinding.
- Mantener reconciliación y alertas para efectos externos: WhatsApp y correo no ofrecen una transacción distribuida exactamente una vez, aunque la cola, los checkpoints y las claves de deduplicación reducen el riesgo de duplicados.

## Referencias de producto

- [HubSpot Customer Agent](https://knowledge.hubspot.com/customer-agent/set-up-the-customer-agent)
- [HubSpot pipeline rules](https://knowledge.hubspot.com/object-settings/set-up-pipeline-rules)
- [Intercom Fin workflows](https://www.intercom.com/help/en/articles/10032299-use-fin-ai-agent-in-workflows)
- [Attio workflows](https://attio.com/help/reference/automations/workflows/overview-of-workflows)
- [respond.io AI Agents](https://respond.io/help/ai-agents)
- [WATI Team Inbox](https://support.wati.io/en/articles/11463002-how-to-use-the-multi-channel-team-inbox-in-wati)
- [Twilio WhatsApp concepts](https://www.twilio.com/docs/whatsapp/key-concepts)
- [n8n queue mode](https://docs.n8n.io/hosting/scaling/queue-mode)
- [Zapier replay](https://help.zapier.com/hc/en-us/articles/19220226086797-What-is-replay)
- [Botpress versions](https://botpress.com/docs/studio/concepts/versions/)
