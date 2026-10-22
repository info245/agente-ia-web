# Conversiones offline (Google Ads y Meta)

El CRM avisa a las plataformas de anuncios cuando un contacto:

| Evento | Cuándo | Valor |
| --- | --- | --- |
| Lead cualificado | Pasa a una de las etapas elegidas (por defecto «Cualificado» y las posteriores) | Fijo (opcional) |
| Cita reservada | Se crea una reserva en `bookings` | Fijo (opcional) |
| Venta | Pasa a «Ganado» o acepta la propuesta | Total de la propuesta, o un valor fijo |

Cada evento se envía una sola vez por contacto y plataforma (clave `conversion:<plataforma>:<evento>:<lead>` en `automation_jobs`).

## Cómo funciona

- **Captura**: `widget.js` lee `gclid`, `gbraid`, `wbraid`, `fbclid` y `utm_*` de la URL, y las cookies `_gcl_aw`, `_fbc` y `_fbp` que ya pone la web. Lo guarda solo durante la visita (`sessionStorage`). Lo envía con el chat y rellena los campos ocultos de los formularios de la página que se llamen igual. Para desactivarlo, añade `data-attribution="off"` al `<script>`. Todo acaba en `leads.custom_fields`, y el primer valor guardado no se sobrescribe.
- **Meta Lead Ads**: `/api/integrations/external-lead` guarda el `leadgen_id` en `custom_fields.meta_lead_id`.
- **Cola**: los trabajos `conversion_upload` van en `automation_jobs`, el mismo worker de siempre. Los errores de red, 429 y 5xx se reintentan con espera creciente (hasta 5 intentos). Un rechazo definitivo (datos o permisos) queda como «Falló» en el CRM y se puede reintentar a mano.
- **Disparadores**: un cambio de etapa en el CRM o una propuesta aceptada encolan al momento. Cada 5 minutos (`CONVERSION_SWEEP_INTERVAL_MS`) un barrido revisa leads y reservas de las últimas 72 h para cubrir el resto: el agente, las reservas y otras integraciones. El barrido nunca mira antes de la fecha en que se activaron las conversiones.
- **Google Ads**: usa la Data Manager API (`POST https://datamanager.googleapis.com/v1/events:ingest`). Google la recomienda en lugar de `uploadClickConversions` para importar conversiones offline y conversiones mejoradas para leads. Envía `gclid`/`gbraid`/`wbraid` y, si el contacto dio consentimiento, el email y el teléfono normalizados y hasheados con SHA-256. No hace falta developer token.
- **Meta**: usa Conversions API (`POST graph.facebook.com/<versión>/<pixel>/events`) con `action_source: system_generated` y `custom_data.event_source: crm`. Envía `lead_id`, `fbc` y `fbp`, y `em`/`ph` hasheados si hay consentimiento. Meta solo acepta eventos de los últimos 7 días.
- **Privacidad**: sin `leads.consent = true` no salen email ni teléfono, aunque vayan hasheados. Solo se envían los identificadores del clic.

## Puesta en marcha

1. Aplica `sql/018_ad_conversions.sql` en Supabase.
2. Google Cloud, en el proyecto del cliente OAuth de Gmail y Calendar:
   - habilita **Data Manager API**;
   - añade el redirect URI `https://<backend>/oauth/google/ads/callback`;
   - añade el scope `https://www.googleapis.com/auth/datamanager` a la pantalla de consentimiento.
3. Opcional: `META_GRAPH_API_VERSION`. Si no está, se usa `WHATSAPP_API_VERSION` y, si tampoco, `v25.0`.
4. En el CRM nuevo, como super admin: **Canales → Campañas**. Rellena los IDs, conecta Google Ads, pega el token de Meta, pulsa **Probar** y activa «Enviar conversiones». La propia tarjeta explica paso a paso dónde está cada dato.

Los secretos (el refresh token de Google y el token de Meta) se guardan cifrados con `SECRETS_ENCRYPTION_KEY` en `ad_conversion_settings` y nunca vuelven al navegador.
