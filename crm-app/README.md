# crm-app — CRM nuevo (Fase 2)

Next.js 16 + shadcn/ui (Base UI) app, with the UI in Spanish. It replaces `backend/public-crm` screen by screen.
It talks **only** to the Express API. The browser never queries Supabase (RLS is deny-by-default, migration 013).

## Auth
- `next.config.ts` rewrites `/api/*` → `CRM_API_URL`. The browser only talks to this app's origin, so the
  HttpOnly `crm_session` cookie from `POST /api/auth/login` stays first-party. No CORS and no tokens in JS.
- On load the app calls `GET /api/auth/me`. Any 401 sends the user to `/login`.
- Super admins pick the account in the sidebar. The app sends it as `?account_id=` on `/api/crm/*`.
  Client users are locked to their own account by the server.

## Screen map
| Route | Screen | Status |
|---|---|---|
| `/login` | Acceso | ✅ |
| `/leads` | Leads: search, canal, estado, fecha, "Cargar más" | ✅ |
| `/leads/[conversationId]` | Ficha: gestión (estado, seguimiento, datos, notas), conversación, tomar conversación / reactivar IA | ✅ |
| `/agente` | Agente v2 (motor legacy/v2, `agent.policy`, `handoff_when`, `offer_meeting_when`), Canales (Google Calendar), draft → publish | ✅ partial |
| `/agente` other tabs | Identidad y tono, Estrategia y acciones, Conocimiento, Plantillas, Seguimientos, Etapas, Importar web | link to the current CRM |
| `/leads/[id]` presupuesto / análisis | Quote editor, analysis generate/send | todo |
| `/resultados` | Conversion and actions dashboards | todo |
| `/automatizaciones` | Flows with a warning when a WhatsApp step has no template or channel | todo |
| `/admin` | Superadmin | todo |

## Run locally
```bash
cp .env.example .env.local
npm install
npm run dev -- -p 3001
```
Run the backend next to it with `CHANNEL_INBOX_WORKER=off CRM_APP_URL=http://localhost:3001`. The worker flag stops
a local server from claiming production WhatsApp inbox events.

## Deploy (Vercel)
- Root directory: `crm-app`. Env: `CRM_API_URL=https://tmedia-global-ai.onrender.com`,
  `NEXT_PUBLIC_LEGACY_CRM_URL=https://tmedia-global-ai.onrender.com/crm`.
- On Render, set `CRM_APP_URL=<app domain>` so the Google Calendar OAuth started from `/agente` returns to the
  new app. The Google redirect URI stays the same (`/oauth/google/calendar/callback` on Render).
