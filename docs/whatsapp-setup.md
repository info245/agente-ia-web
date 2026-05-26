# Integracion de WhatsApp

## Objetivo

Este proyecto permite que convivan dos canales sobre la misma logica de IA:

- Chat web por `POST /messages`
- WhatsApp por `GET/POST /webhooks/whatsapp`

Ambos canales terminan usando la misma funcion interna `processIncomingMessage` del backend, por lo que la captura de datos del lead, la memoria y la respuesta de IA siguen el mismo flujo.

## Variables necesarias

Configurar estas variables en `backend/.env`:

```env
PORT=3000
OPENAI_API_KEY=tu_api_key
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
WHATSAPP_TOKEN=tu_whatsapp_token
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=tu_business_account_id
WHATSAPP_VERIFY_TOKEN=tu_verify_token
WHATSAPP_API_VERSION=v25.0
WHATSAPP_APP_SECRET=tu_app_secret_de_meta
```

Estas variables siguen funcionando como fallback para la cuenta interna de TMedia. Para evolucionar a Sancho multi-cliente, cada numero conectado debe guardarse en la tabla `whatsapp_channels` creada por:

```text
sql/010_whatsapp_channels.sql
```

Campos clave:

- `account_id`: cuenta/cliente del CRM.
- `phone_number_id`: ID del numero de WhatsApp en Meta.
- `waba_id`: WhatsApp Business Account ID.
- `access_token`: token del canal si no se usa el fallback global.
- `status`: usar `active` para el canal operativo.

Ejemplo para registrar el canal actual de TMedia despues de ejecutar el SQL:

```sql
insert into whatsapp_channels (
  account_id,
  provider,
  status,
  waba_id,
  phone_number_id,
  display_phone_number,
  verified_name,
  token_label,
  connected_at
) values (
  'default',
  'meta_cloud',
  'active',
  '2028905611388376',
  '1168546906332736',
  '+34 624 87 17 95',
  'TMedia Global',
  'env:WHATSAPP_TOKEN',
  now()
)
on conflict (phone_number_id) do update set
  account_id = excluded.account_id,
  provider = excluded.provider,
  status = excluded.status,
  waba_id = excluded.waba_id,
  display_phone_number = excluded.display_phone_number,
  verified_name = excluded.verified_name,
  token_label = excluded.token_label,
  updated_at = now();
```

## Rutas activas del backend

- `GET /health`: comprobacion de salud
- `POST /messages`: canal del chat web
- `GET /webhooks/whatsapp`: verificacion del webhook de Meta
- `POST /webhooks/whatsapp`: entrada de mensajes de WhatsApp

## Como funciona la convivencia de canales

### Chat web

El frontend envia mensajes a `POST /messages`.

El backend procesa el mensaje con:

- `channel: "web"` por defecto
- creacion o recuperacion de conversacion
- guardado de mensajes
- enriquecimiento del lead
- logica de slots y memoria
- respuesta con OpenAI

### WhatsApp

Meta envia eventos a `POST /webhooks/whatsapp`.

El backend:

- ignora estados de entrega
- resuelve el canal/cuenta usando `metadata.phone_number_id`
- deduplica mensajes por `message.id`
- extrae el texto del mensaje entrante
- llama a la misma logica central `processIncomingMessage`
- guarda la conversacion como `channel: "whatsapp"`
- envia la respuesta al usuario por la API de WhatsApp

Conclusión: WhatsApp no usa una IA distinta ni un flujo paralelo separado. Reutiliza la misma logica comercial que el chat web.

## Comprobacion local

### 1. Arrancar backend

Desde `backend/`:

```bash
npm run dev
```

### 2. Salud del backend

Abrir:

```text
http://localhost:3000/health
```

Debe devolver un JSON con `ok: true`.

### 3. Verificacion local del webhook

Abrir:

```text
http://localhost:3000/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=TU_VERIFY_TOKEN&hub.challenge=12345
```

Debe devolver:

```text
12345
```

### 4. Probar chat web

Ejemplo en PowerShell:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/messages" `
  -ContentType "application/json" `
  -Body '{"text":"Hola, quiero informacion sobre SEO","channel":"web"}'
```

Debe devolver `ok: true` y un `reply`.

## Comprobacion con Meta

### 1. Exponer local con ngrok

```bash
ngrok http 3000
```

Ejemplo de URL publica:

```text
https://tu-subdominio.ngrok-free.dev
```

### 2. Configurar webhook en Meta

En `WhatsApp > Configuration`:

- `Callback URL`: `https://tu-subdominio.ngrok-free.dev/webhooks/whatsapp`
- `Verify token`: el valor de `WHATSAPP_VERIFY_TOKEN`

Despues pulsar `Verify and save`.

### 3. Suscribirse al campo correcto

En la configuracion del webhook, suscribirse al campo:

- `messages`

### 4. Probar mensaje real

En `WhatsApp > API Setup`:

- usar el numero de prueba que da Meta
- anadir tu movil como destinatario de prueba si hace falta
- enviar un WhatsApp real desde el movil al numero de prueba

## Que deberias ver si todo va bien

- En Meta, el webhook queda verificado
- En ngrok aparece un `POST /webhooks/whatsapp`
- En el backend aparece el log del mensaje entrante
- El usuario recibe una respuesta automatica

## Recomendaciones antes de produccion

- Rotar el `WHATSAPP_TOKEN` si se ha compartido durante pruebas
- Mantener `backend/.env` fuera del repositorio
- Pasar de ngrok a una URL publica estable
- Repetir una prueba end-to-end con chat web y WhatsApp para confirmar convivencia
- Revisar los permisos y la suscripcion del campo `messages` en Meta

## Paso a URL estable con Render

El repositorio incluye un blueprint en `render.yaml` para desplegar el backend como servicio web.

### Flujo recomendado

1. Subir el repositorio a GitHub
2. Crear un nuevo servicio en Render desde ese repositorio
3. Importar el blueprint `render.yaml`
4. Cargar las variables de entorno del backend
5. Esperar a que Render publique la URL `onrender.com`
6. Cambiar en Meta el webhook a la nueva URL estable
7. Repetir prueba de verificacion y prueba real por WhatsApp

### URL del webhook en produccion

Cuando Render genere la URL publica, el webhook sera:

```text
https://tmedia-global-ai.onrender.com/webhooks/whatsapp
```

### Variables a cargar en Render

- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_API_VERSION`
- `WHATSAPP_APP_SECRET`

Si mantienes los correos activos:

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

### Advertencia sobre email en Render Free

Render publico el 16 de septiembre de 2025 que los servicios web free bloquean trafico SMTP saliente en los puertos `25`, `465` y `587`.

Impacto en este proyecto:

- el chat web y el webhook de WhatsApp pueden funcionar
- los envios por Nodemailer SMTP pueden fallar en free

Si quieres mantener email interno y email al cliente en Render:

- usar una instancia de pago
- o migrar el envio de email a una API transaccional en lugar de SMTP

## Nota tecnica

Existen archivos auxiliares bajo `backend/src/routes` y `backend/src/lib` relacionados con WhatsApp que no son la ruta activa montada en el servidor principal. La ruta que actualmente atiende las peticiones reales es la declarada directamente en `backend/src/server.js`.

## Seguridad de Meta

Para endurecer el webhook frente a llamadas falsificadas, el backend puede validar la cabecera `X-Hub-Signature-256` usando el `App Secret` de Meta.

Configura en produccion:

- `WHATSAPP_APP_SECRET`

Sin ese valor, el webhook puede seguir funcionando, pero la verificacion criptografica de origen queda desactivada.
