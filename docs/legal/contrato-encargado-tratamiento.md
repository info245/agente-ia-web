# Contrato de encargado del tratamiento

> **Borrador para revisión por un abogado. No es asesoramiento legal.** Basado en el artículo 28 del Reglamento (UE) 2016/679 (RGPD)
> y la Ley Orgánica 3/2018 (LOPDGDD). Los textos entre corchetes son datos que hay que completar.

## Partes

**El Responsable del tratamiento**: [razón social del cliente], con NIF [·], domicilio en [·], representado por [nombre y cargo] (en adelante, "el Cliente").

**El Encargado del tratamiento**: [razón social de T-Media Global], con NIF [·], domicilio en [·], representado por [nombre y cargo] (en adelante, "T-Media Global").

Las partes firman este contrato como anexo al contrato de prestación del servicio de CRM y asistente con inteligencia artificial (en adelante, "el Servicio"), de fecha [·].

## 1. Objeto

T-Media Global tratará datos personales por cuenta del Cliente con el único fin de prestar el Servicio: recibir y responder consultas de los contactos del Cliente por el chat de su web, WhatsApp y formularios (incluidos los de Meta), registrarlos en el CRM, preparar propuestas y análisis, agendar citas y enviar los seguimientos que el Cliente configure.

## 2. Duración

Este contrato dura lo mismo que el Servicio. Al terminar se aplica la cláusula 12.

## 3. Datos y personas afectadas

- **Personas**: contactos, clientes potenciales y clientes del Cliente; usuarios del CRM del Cliente.
- **Datos**: identificativos (nombre, empresa), de contacto (email, teléfono, identificador de WhatsApp), contenido de las conversaciones y audios transcritos, datos que la persona facilita sobre su negocio y sus necesidades, presupuesto orientativo, origen de la campaña, citas, propuestas, registros de consentimiento y registros técnicos de acceso.
- **Categorías especiales**: el Servicio **no está pensado** para tratar datos de salud u otras categorías del art. 9 RGPD. Si el Cliente opera en un sector donde pueden aparecer (por ejemplo, clínicas), lo indicará por escrito y las partes acordarán medidas adicionales. [Revisar con abogado.]

## 4. Operaciones de tratamiento

Recogida, registro, organización, conservación, consulta, uso, análisis automatizado con modelos de IA para redactar respuestas y resumir, comunicación por los canales configurados, exportación, anonimización y supresión.

## 5. Obligaciones de T-Media Global

T-Media Global se compromete a:

1. Tratar los datos solo siguiendo las instrucciones documentadas del Cliente, que son este contrato y la configuración que el Cliente hace en el CRM. Si una instrucción le parece contraria a la normativa, avisará al Cliente de inmediato.
2. No usar los datos para fines propios ni para entrenar modelos de IA propios o de terceros.
3. Garantizar que las personas autorizadas a tratar los datos se han comprometido a la confidencialidad.
4. Aplicar las medidas de seguridad de la cláusula 8.
5. Recurrir a subencargados solo según la cláusula 7.
6. Ayudar al Cliente a responder a los derechos de las personas (cláusula 9).
7. Ayudar al Cliente con la seguridad, la notificación de brechas, las evaluaciones de impacto y las consultas previas, según la información de que disponga.
8. Poner a disposición del Cliente la información necesaria para demostrar el cumplimiento y permitir auditorías (cláusula 11).
9. Llevar un registro de actividades de tratamiento como encargado (art. 30.2 RGPD).

## 6. Obligaciones del Cliente

1. Tener una base legal válida para cada tratamiento y para cada comunicación comercial (incluido el consentimiento cuando sea necesario, por ejemplo para comunicaciones comerciales por email o WhatsApp según la LSSI).
2. Informar a las personas: publicar una política de privacidad, enlazarla en el aviso del chat y en sus formularios, e indicar a T-Media Global como encargado.
3. Configurar los textos legales de sus formularios y el aviso del chat.
4. Decidir los plazos de conservación (el CRM permite configurarlos).
5. No pedir a T-Media Global tratamientos contrarios a la normativa.

## 7. Subencargados

El Cliente autoriza de forma general a T-Media Global a recurrir a los subencargados listados en el anexo [Lista de subencargados](subencargados.md). T-Media Global avisará al Cliente por email con **30 días** de antelación antes de añadir o sustituir un subencargado; el Cliente podrá oponerse por motivos razonables y, si no hay solución, resolver el Servicio sin penalización. T-Media Global impondrá a cada subencargado las mismas obligaciones de protección de datos por contrato y responderá ante el Cliente de su cumplimiento.

## 8. Medidas de seguridad

Como mínimo [completar y verificar con el equipo técnico]:

- Cifrado en tránsito (HTTPS/TLS) en la web, el CRM, el widget y las integraciones.
- Base de datos con seguridad a nivel de fila activada y acceso solo desde el servidor con clave de servicio; los secretos de integraciones se guardan cifrados.
- Acceso al CRM con usuario y contraseña por persona, separado por cuenta; cada cliente solo ve sus datos.
- Registro de quién ve, exporta, anonimiza o borra los datos de un contacto.
- Límites de peticiones en el chat público y validación de los formularios recibidos.
- Copias de seguridad del proveedor de base de datos.
- Plazos de conservación configurables con anonimización o borrado automático.

## 9. Derechos de las personas

Si una persona ejerce un derecho ante T-Media Global, esta lo trasladará al Cliente en un plazo de **5 días hábiles**. El CRM permite al Cliente atenderlos directamente:

- **Acceso y portabilidad**: exportación de todos los datos del contacto en JSON o CSV desde su ficha.
- **Rectificación**: edición de la ficha.
- **Supresión**: borrado completo del contacto, su conversación y los datos asociados.
- **Oposición o limitación**: pausar el asistente en la conversación y desactivar seguimientos.

## 10. Brechas de seguridad

T-Media Global notificará al Cliente cualquier brecha que afecte a sus datos **sin dilación indebida y, como máximo, en 48 horas** desde que tenga constancia, con la información del art. 33.3 RGPD de que disponga. Corresponde al Cliente notificar a la autoridad de control y a los afectados cuando proceda.

## 11. Auditorías

T-Media Global facilitará la información necesaria para demostrar el cumplimiento. El Cliente podrá auditar, con un preaviso de 30 días, una vez al año salvo brecha o requerimiento de la autoridad, por sí mismo o mediante un auditor sujeto a confidencialidad, y a su cargo.

## 12. Fin del servicio

Al terminar el Servicio, T-Media Global pondrá a disposición del Cliente la exportación de sus datos durante **30 días** y después los suprimirá, incluidos los de sus subencargados, salvo obligación legal de conservarlos. Las copias de seguridad se eliminarán al cumplirse su ciclo de retención. T-Media Global confirmará la supresión por escrito si el Cliente lo pide.

## 13. Transferencias internacionales

Si algún subencargado trata datos fuera del Espacio Económico Europeo, T-Media Global se asegurará de que existe una garantía adecuada (decisión de adecuación, incluido el Marco de Privacidad de Datos UE-EE. UU., o Cláusulas Contractuales Tipo de la Comisión Europea).

## 14. Responsabilidad

Cada parte responde de sus incumplimientos según el art. 82 RGPD. [Limitación de responsabilidad: acordar con abogado en línea con el contrato del Servicio.]

## 15. Ley y jurisdicción

Ley española. Juzgados y tribunales de [ciudad].

---

Firmado en [lugar], a [fecha].

| El Cliente | T-Media Global |
|---|---|
| [nombre, cargo, firma] | [nombre, cargo, firma] |

**Anexo I**: [Lista de subencargados](subencargados.md).
