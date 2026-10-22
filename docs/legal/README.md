# Paquete RGPD de T-Media Global (borradores)

> **Aviso importante.** Estos documentos son **borradores de trabajo** preparados a partir de cómo funciona hoy el producto.
> **No son asesoramiento legal.** Un abogado o un delegado de protección de datos tiene que revisarlos y adaptarlos
> antes de firmarlos, publicarlos o enviarlos a un cliente. Los huecos entre corchetes (`[así]`) son datos que hay que rellenar.

## Documentos

| Documento | Para quién | Uso |
|---|---|---|
| [Contrato de encargado del tratamiento](contrato-encargado-tratamiento.md) | Cada cliente de T-Media Global | Se firma con el alta (anexo al contrato de servicio). |
| [Lista de subencargados](subencargados.md) | Clientes y su abogado | Anexo del contrato; se avisa de cambios con 30 días. |
| [Registro de actividades de tratamiento](registro-actividades-tratamiento.md) | Interno de T-Media Global | Art. 30 RGPD; se actualiza cuando cambie el producto. |
| [Política de privacidad modelo](politica-privacidad-modelo.md) | Web de cada cliente | El cliente la adapta y la publica; su enlace va en el aviso del chat. |
| [Texto del aviso del chat](aviso-chat.md) | Widget del chat | Se configura en el CRM → Mi asistente → Privacidad. |

## Qué hace ya el producto

- **Registro de consentimiento por contacto** (ficha → Privacidad): fecha, canal y texto.
  - Formularios (Meta, web): se guarda el valor de la casilla y, si el formulario lo envía, el texto legal (`consent_text`, `texto_consentimiento`, `privacy_text`, `texto_legal`). **Conviene que cada formulario envíe ese texto**; si no, solo queda "casilla marcada".
  - Chat web: el texto del aviso que vio la persona y el enlace a la política, guardados con el primer mensaje.
  - WhatsApp: que la persona escribió primero (no hay casilla en WhatsApp).
- **Aviso de privacidad en el widget**, visible antes del primer mensaje, con enlace a la política de la cuenta. Si la cuenta no escribe un texto propio se usa uno por defecto.
- **Acceso y portabilidad**: ficha → Privacidad → *Exportar JSON* o *Exportar CSV* (contacto, conversación, mensajes, eventos, consentimientos, propuestas, análisis, citas, formularios recibidos, valoraciones y registros técnicos).
- **Supresión**: *Eliminar* en Contactos borra el contacto y todo lo que cuelga de él (mismas tablas que la exportación más los seguimientos pendientes). Si la conversación la comparte otro contacto, se conserva.
- **Plazos de conservación** por cuenta (Mi asistente → Privacidad): 6, 12, 24, 36 o 60 meses sin actividad → anonimizar o borrar. Se revisa una vez al día. Además, los webhooks de WhatsApp ya procesados se borran a los 30 días.
- **Registro de accesos**: quién vio la conversación (como mucho una entrada cada 30 min por persona), exportó, borró o anonimizó, y cuándo. Se conserva aunque se borre el contacto (sin datos personales del contacto, solo su identificador).

## Pendiente fuera del código

1. Ejecutar `sql/016_data_access_log.sql` en Supabase.
2. Rellenar los datos de T-Media Global y confirmar las regiones de alojamiento en [subencargados.md](subencargados.md).
3. Revisión por abogado de los cinco documentos.
4. Firmar los acuerdos de encargado (DPA) con cada subencargado y guardar copia.
5. Pedir a cada cliente el enlace a su política de privacidad y configurarlo.

## Límites conocidos

- La retirada del consentimiento se refleja cambiando el consentimiento del contacto; no hay todavía un botón "retirar" con su propio registro.
- El flujo de alta beta por chat marca el consentimiento en el contacto, pero no guarda el texto mostrado en el registro.
- El registro de accesos no anota quién ve la lista de Contactos, solo quién abre una conversación.
- Las copias de seguridad de Supabase conservan datos borrados durante su ciclo de retención (ver subencargados).
