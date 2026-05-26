# agente-ia-web

Proyecto con backend para agente comercial con IA, chat web y canal de WhatsApp.

## Backend

El backend vive en [`backend`](./backend) y expone:

- `GET /health`
- `POST /messages` para el chat web
- `GET /webhooks/whatsapp` para verificar el webhook
- `POST /webhooks/whatsapp` para recibir mensajes de WhatsApp

## Variables de entorno

La configuracion activa del servidor se lee desde `backend/.env`.

Plantilla disponible en:

- [`backend/.env.example`](./backend/.env.example)

## Documentacion de WhatsApp

Guia completa de configuracion, pruebas locales, ngrok y Meta:

- [`docs/whatsapp-setup.md`](./docs/whatsapp-setup.md)

## Medicion

El backend puede registrar eventos unificados de conversacion para web y WhatsApp en la tabla `conversation_events`.

SQL nueva:

- [`sql/002_conversation_events.sql`](./sql/002_conversation_events.sql)
- [`sql/010_whatsapp_channels.sql`](./sql/010_whatsapp_channels.sql) para preparar WhatsApp multi-cuenta
