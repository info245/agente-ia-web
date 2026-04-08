# Backend (Inbox Gateway + Orquestador)

Este backend:
- recibe mensajes del widget web en `POST /messages`
- recibe mensajes de WhatsApp en `POST /webhooks/whatsapp`
- guarda conversaciones y mensajes
- llama al agente con OpenAI Responses API
- devuelve respuesta al usuario

## Variables de entorno

Minimas:
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT`

WhatsApp:
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_API_VERSION`

Email:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `LEADS_EMAIL_ENABLED`
- `LEADS_EMAIL_TO`
- `LEADS_EMAIL_FROM`
- `LEADS_EMAIL_REPLY_TO`
- `LEADS_CLIENT_EMAIL_ENABLED`
- `LEADS_CLIENT_EMAIL_FROM`

Plantilla:
- `backend/.env.example`

## Despliegue estable recomendado

El repositorio incluye un blueprint de Render en `render.yaml` para desplegar el backend como Web Service con health check en `/health`.

Nota:
- Si usas Render Free, el webhook y la URL estable pueden funcionar, pero Render anuncio el 16 de septiembre de 2025 que los servicios web free bloquean trafico SMTP saliente en los puertos `25`, `465` y `587`.
- Si mantienes el envio con Nodemailer por SMTP, conviene usar una instancia de pago o migrar el email a una API transaccional.
