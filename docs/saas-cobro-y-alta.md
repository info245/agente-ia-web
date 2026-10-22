# Vender el CRM como SaaS: alta guiada y cobro con Stripe

## Qué hace

**Alta guiada** (`/alta` en el CRM). Son seis pasos cortos: negocio y web (el asistente lee la web), servicios y precios, tono y saludo, canales (código del chat, WhatsApp y calendario), probar el asistente y activar.
- Cada paso se guarda como borrador. El cliente puede salir y volver cuando quiera.
- Mientras no termine, Inicio le muestra la tarjeta «Te falta poco…».
- Al pulsar «Activar» se publica la configuración y el asistente empieza a responder.
- Se abre sola al aceptar una invitación (`/activar`) o al crear una cuenta en `/registro`.

**Cobro** (`Plan y pago`, en `/facturacion`). El cliente elige un plan, paga con Stripe Checkout y gestiona su tarjeta y sus facturas en el portal de Stripe.

| Situación | Qué ve el cliente | ¿Responde el agente? |
|---|---|---|
| Gestionada por la agencia | Nada que pagar | Sí |
| En prueba (14 días por defecto) | Días que le quedan. Aviso arriba los 3 últimos | Sí |
| Pagando | Fecha de renovación | Sí |
| Impago | Aviso rojo: «actualiza tu tarjeta antes del…» | Sí, durante 7 días de gracia |
| Gracia agotada, prueba terminada o suscripción cancelada | Aviso de pausa | **No.** Contesta un mensaje fijo y se paran los seguimientos automáticos. **No se borra nada**, y en cuanto paga vuelve a funcionar |

- **Las cuentas que ya existen no cambian.** Una cuenta sin datos de cobro cuenta como «gestionada por la agencia».
- La cuenta principal (TMedia) nunca se cobra.
- En Agencia hay una columna «Cobro» y, en Datos, la casilla «Gestionada por la agencia».
- Al crear una cuenta desde Agencia, la casilla viene marcada (sin cobro). Desmárcala para que el cliente empiece la prueba y pague con tarjeta.

Los datos se guardan en `app_settings` (claves `billing:<cuenta>` y `onboarding:<cuenta>`). **No hace falta ninguna migración SQL.**

## Variables de entorno (Render, servicio tmedia-global-ai)

| Variable | Qué es |
|---|---|
| `STRIPE_SECRET_KEY` | Clave secreta de Stripe (`sk_test_...` en pruebas y `sk_live_...` en real) |
| `STRIPE_WEBHOOK_SECRET` | Secreto del webhook (`whsec_...`) |
| `BILLING_PLANS` | Lista de planes en JSON (ver el ejemplo de abajo) |
| `BILLING_TRIAL_DAYS` | Días de prueba gratis (14 por defecto) |
| `BILLING_GRACE_DAYS` | Días de gracia tras un impago antes de pausar (7 por defecto) |
| `PUBLIC_SIGNUP_ENABLED` | `true` abre el alta pública en `/registro`. Viene en `false` |
| `CRM_APP_URL` | Ya existe. Stripe vuelve aquí tras pagar (`/facturacion`) |

Ejemplo de `BILLING_PLANS` (en una sola línea):

```
[{"key":"basico","name":"Básico","price_id":"price_123","price_label":"49 €/mes","description":"Asistente en tu web y WhatsApp"},{"key":"pro","name":"Pro","price_id":"price_456","price_label":"99 €/mes","description":"Con calendario y seguimientos"}]
```

Si falta alguna de las tres primeras variables, el CRM dice «El pago online todavía no está activado» y no cobra nada.

## Crear todo en Stripe en modo test, paso a paso

1. Entra en https://dashboard.stripe.com y activa el interruptor **«Modo de prueba»** (arriba a la derecha). Todo lo que sigue se hace en modo de prueba.
2. **Producto y precio:** ve a Catálogo de productos → «Añadir producto».
   - Nombre: «Plan Básico». Precio: 49 €, **recurrente, mensual**.
   - Guarda y copia el **ID del precio** (empieza por `price_`).
   - Repite el paso con cada plan que quieras vender.
3. **Clave secreta:** ve a Desarrolladores → Claves de API y copia la **clave secreta** (`sk_test_...`). No la pegues en ningún chat ni en el código: va solo en Render (o en tu `.env` local).
4. **Portal de cliente:** ve a Configuración → Facturación → Portal de clientes.
   - Activa que el cliente pueda actualizar la forma de pago, ver facturas, cancelar y cambiar de plan (añade tus productos).
   - Guarda.
5. **Webhook:** ve a Desarrolladores → Webhooks → «Añadir endpoint».
   - URL: `https://tmedia-global-ai.onrender.com/webhooks/stripe`
   - Eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` y `customer.subscription.deleted`.
   - Guarda y copia el **secreto de firma** (`whsec_...`).
6. **Avisos de impago por email** (recomendado): ve a Configuración → Facturación → Suscripciones y emails, y activa los emails a clientes cuando falla un pago. Stripe también reintenta el cobro solo.
7. En Render, servicio tmedia-global-ai → Environment, añade `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y `BILLING_PLANS` con tus `price_...`. Después guarda y redespliega.
8. **Probar:**
   - En Agencia, abre una cuenta de prueba y desmarca «Gestionada por la agencia».
   - Entra con un usuario de esa cuenta, ve a «Plan y pago» y elige un plan.
   - Paga con la tarjeta de prueba `4242 4242 4242 4242`, una fecha futura y cualquier CVC.
   - Para simular un impago usa `4000 0000 0000 0341`: se acepta al guardarla, pero falla al cobrar.

Para pasar a real, repite los pasos 2 a 7 con el modo de prueba desactivado y cambia las tres variables por las de real.

## Probar en local con Stripe CLI (solo modo test)

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

Ese comando imprime un `whsec_...` temporal: ponlo en `STRIPE_WEBHOOK_SECRET` de tu `backend/.env` local, junto con la `sk_test_...`. Después, `stripe trigger customer.subscription.updated` envía eventos de prueba. Esos eventos de ejemplo no llevan `account_id`, así que el servidor los ignora. Para ver cambios reales, haz un pago de prueba desde el CRM local.

## Tests

`backend/src/lib/saas.test.js` cubre:
- El cálculo del estado: prueba, activa, impago con gracia y pausa.
- Los webhooks: el orden de los eventos y el impago que se limpia al pagar.
- La firma de Stripe: buena, falsa y caducada.
