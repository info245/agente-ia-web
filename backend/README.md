# Backend (Inbox Gateway + Orquestador)

Este backend hará:
- recibir mensajes del widget web (`POST /messages`)
- guardar conversaciones y mensajes
- llamar al agente (OpenAI Responses API)
- ejecutar tools (`create_lead`, `get_slots`, `book_meeting`)
- devolver respuesta al usuario

## Variables de entorno (pendiente)
- OPENAI_API_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- PORT
