# crm-app — CRM para clientes (Fase 2)

App Next.js 16 que sustituye a `backend/public-crm` para los clientes. Sigue el diseño aprobado el 19 oct 2026: cinco secciones, sin jerga técnica, en español. CSS propio en `src/app/globals.css` (sin librería de componentes).

Habla **solo** con la API Express: `next.config.ts` reescribe `/api/*` → `CRM_API_URL`, así la cookie `crm_session` es de primera parte. El navegador nunca consulta Supabase (RLS deny-by-default, migración 013).

## Pantallas
| Ruta | Qué hace | API |
|---|---|---|
| `/inicio` | Leads de la semana, atendidos por la IA, "te esperan a ti", videollamadas, leads por día | `GET /crm/leads`, `GET /crm/bookings` |
| `/conversaciones` | Bandeja de WhatsApp, web y formularios. Responder, Asistente/Yo, ✨ sugerir respuesta, ficha del lead (etapa, nota) | `GET /crm/conversations/:id/messages`, `POST …/reply`, `PATCH …/state`, `POST /crm/agent/try` (`mode: "suggest"`), `PATCH /crm/leads/:id` |
| `/contactos` | Tablero por etapas (arrastrar para mover) y vista de lista | `PATCH /crm/leads/:id` (`crm_status`) |
| `/asistente` | Tono, saludo, servicios y precios, preguntas frecuentes; chat "Probar" con los cambios sin guardar; "Guardar y activar" publica | `POST /crm/agent/try`, `POST /crm/assistant` |
| `/canales` | WhatsApp, código del chat web, formularios, Google Calendar | `GET /crm/integrations/whatsapp/channel`, `POST /crm/integrations/calendar/google/connect-url` |

Responder:
- **WhatsApp:** solo dentro de las 24 h desde el último mensaje del cliente (fuera: 409 `whatsapp_window_closed`).
- **Web:** el widget recoge la respuesta con `GET /messages/updates` cada 8 s.
- Al responder, la IA se pausa en esa conversación hasta que se reactive con "Asistente".

El selector de cuenta solo aparece para `super_admin` (agencia). La configuración técnica completa sigue en el CRM de agencia (`/crm` del backend).

## Ejecutar en local
```bash
cp .env.example .env.local   # CRM_API_URL=http://localhost:3000
npm install
npm run dev -- -p 3001
```
Backend al lado con `CHANNEL_INBOX_WORKER=off ENABLE_INTERNAL_SCHEDULER=false CRM_APP_URL=http://localhost:3001`, para que un servidor local no reclame eventos reales de WhatsApp. Si apunta a la base de datos de producción, prueba con la cuenta `prueba-v2`.

## Desplegar (Vercel)
- Root directory: `crm-app`. Env: `CRM_API_URL=https://tmedia-global-ai.onrender.com`.
- En Render, `CRM_APP_URL=<dominio de la app>` para que Google Calendar vuelva a `/canales` tras conectar.
