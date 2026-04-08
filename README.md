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
