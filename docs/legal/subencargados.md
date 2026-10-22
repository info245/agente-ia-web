# Lista de subencargados del tratamiento

> **Borrador para revisión por un abogado. No es asesoramiento legal.**
> Versión: [fecha]. Se actualiza cuando se añade o cambia un proveedor; los clientes reciben aviso con 30 días de antelación.

T-Media Global ([razón social], [NIF]) presta el servicio de CRM y asistente con IA usando estos proveedores.
Cada uno trata datos de los contactos de nuestros clientes solo para prestar su parte del servicio.

| Proveedor | Para qué | Datos que trata | Ubicación | Garantías para transferencias |
|---|---|---|---|---|
| **Supabase, Inc.** | Base de datos y almacenamiento de ficheros (contactos, conversaciones, mensajes, propuestas, análisis, citas, configuración) | Todos los datos de contactos y conversaciones | [Región del proyecto: confirmar en Supabase → Settings → General] | DPA de Supabase con Cláusulas Contractuales Tipo (CCT) si hay acceso desde fuera del EEE |
| **Render Services, Inc.** | Servidor de la aplicación (API, asistente, tareas programadas, widget del chat) | Todos los datos en tránsito y en memoria; registros técnicos | [Región del servicio: confirmar en Render] | DPA de Render; Marco de Privacidad de Datos UE-EE. UU. (DPF) / CCT |
| **Vercel Inc.** | Aplicación web del CRM (crm.t-mediaglobal.com) | Datos que el equipo del cliente ve en pantalla, en tránsito; registros de acceso | [Región: confirmar] | DPA de Vercel; DPF / CCT |
| **OpenAI, L.L.C. / OpenAI Ireland Ltd** | Modelos de IA que redactan las respuestas del asistente, extraen datos del contacto, transcriben audios de WhatsApp y generan análisis y propuestas | Texto de las conversaciones, datos del contacto incluidos en el contexto, audios | EE. UU. / EEE según contrato | DPA de OpenAI con CCT. Datos de la API sin uso para entrenamiento según sus condiciones de API [confirmar retención aplicable] |
| **Meta Platforms Ireland Ltd** (WhatsApp Business Platform y formularios de Meta) | Envío y recepción de mensajes de WhatsApp; recepción de leads de formularios de Facebook e Instagram | Teléfono, nombre de perfil, mensajes, datos del formulario | EEE / EE. UU. | Condiciones de tratamiento de datos de WhatsApp Business y de Meta; DPF / CCT |
| **Google Ireland Ltd / Google LLC** | Google Calendar (citas), Gmail (envío de emails si la cuenta lo conecta), inicio de sesión con Google | Nombre y email de quien reserva, contenido de los emails enviados | EEE / EE. UU. | Anexo de tratamiento de datos de Google Workspace / Cloud; DPF / CCT |
| **Proveedor de email de la cuenta** (SMTP propio del cliente o Gmail) | Envío de emails de seguimiento, propuestas y avisos | Email, nombre y contenido del mensaje | Según el proveedor que configure el cliente | Si el SMTP es del propio cliente, el proveedor es encargado del cliente, no de T-Media Global |
| **Langfuse GmbH** (cloud.langfuse.com, región UE) | Trazas de calidad, coste y latencia de las llamadas a la IA (solo si está activado) | Textos enviados a la IA y sus respuestas | UE (Alemania) | DPA de Langfuse |
| **Servicios de notificaciones push del navegador** (Google FCM, Mozilla, Apple) | Avisos en el móvil del equipo del cliente | Texto corto del aviso (puede incluir el nombre del contacto) | EE. UU. / EEE | Condiciones de cada servicio [revisar con abogado si procede listarlos] |
| **Google Ads y Meta (API de conversiones)** — solo si la cuenta lo activa | Enviar conversiones a las campañas | Email y teléfono **cifrados con hash SHA-256**, identificadores de clic | EE. UU. / EEE | Condiciones de tratamiento de datos de Google Ads y de Meta. **Revisar con abogado** si el cliente actúa aquí como responsable con base legal propia |
| **Stripe Payments Europe, Ltd** — cobro del servicio | Cobrar a los clientes de T-Media Global | Datos de facturación del **cliente** (no de sus contactos) | EEE / EE. UU. | Para estos datos T-Media Global es **responsable**, no encargado; se incluye solo por transparencia |

## Notas para la revisión

- Las regiones marcadas como *confirmar* dependen de cómo se crearon los proyectos. Si alguno está fuera del EEE, hay transferencia internacional.
- Las copias de seguridad de Supabase conservan durante su plazo los datos ya borrados en la aplicación; indicar ese plazo en la política del cliente.
- Antes de usar un proveedor nuevo con datos de contactos, añadirlo aquí y avisar a los clientes.
