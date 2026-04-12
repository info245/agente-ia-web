# Entrada Unificada De Lead Ads

## Recomendacion

La herramienta mas practica para automatizar Google Lead Ads, Meta Lead Ads y formularios externos hacia este CRM es `n8n`.

Motivos:
- controlas la logica sin depender de varios zaps separados
- puedes transformar campos antes de enviarlos al CRM
- puedes reutilizar el mismo flujo para Google, Meta y formularios web
- puedes anadir filtros, enrichment y notificaciones internas en el mismo sitio

## Endpoint unificado

`POST /api/integrations/external-lead`

Header requerido:

`x-integrations-secret: TU_INTEGRATIONS_SECRET`

## Payload base

```json
{
  "source_platform": "google_ads",
  "source_campaign": "Lead Ads SEO Abril",
  "source_form_name": "Formulario SEO",
  "source_ad_name": "Anuncio SEO 1",
  "source_adset_name": "Grupo SEO Madrid",
  "external_user_id": "google:lead:12345",
  "name": "Antonio",
  "email": "antonio@example.com",
  "phone": "34608339316",
  "interest_service": "SEO",
  "budget_range": "300 €",
  "main_goal": "Captar mas ventas organicas",
  "business_activity": "Venta de zapatos",
  "summary": "Lead recibido desde formulario de Google Ads interesado en SEO para ecommerce.",
  "preferred_contact_channel": "whatsapp",
  "consent": true,
  "auto_start": true
}
```

## Comportamiento

- crea una `conversation` con canal `lead_form`
- guarda el lead en el CRM
- registra el origen: plataforma, campaña, formulario y anuncio
- crea evento `external_lead_imported`
- opcionalmente inicia contacto automatico si `auto_start=true`
  - `whatsapp` si el canal preferido es WhatsApp
  - `email` si el canal preferido es email

## Flujo recomendado en n8n

1. Trigger del origen
   - Google Lead Form
   - Meta Lead Ads
   - Webhook propio

2. Nodo de normalizacion
   - mapear nombres de campos al payload unificado
   - limpiar telefono
   - decidir `preferred_contact_channel`

3. HTTP Request
   - `POST https://tmedia-global-ai.onrender.com/api/integrations/external-lead`
   - header `x-integrations-secret`
   - body JSON

4. Opcional
   - notificacion a Slack
   - asignacion automatica
   - etiquetado interno

## Nota

Si quieres mantener toda la automatizacion comercial unificada, lo ideal es que Google y Meta nunca escriban directo a herramientas separadas. Ambos deben entrar por este endpoint y dejar que el CRM y las automatizaciones hagan el resto.
