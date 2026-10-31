# La app de Meta

BeReply habla con Instagram a través de una app de Meta propia. Todo lo que BeReply puede o no puede hacer depende de cómo está esa app.

| Dato | Valor |
|---|---|
| App de Meta | **BeReply**, `1639023537659541` |
| App de Instagram | **BeReply-IG**, `1733213324399676` (la que usa el servidor como `INSTAGRAM_APP_ID`) |
| Portafolio | Believe It Group, negocio **verificado** |
| Estado | **Publicada** desde el 2026-10-30 |
| Acceso | **Estándar** en los permisos de Instagram |
| Webhook | `https://reply.believe-global.com/api/webhook`, campos `comments`, `messages`, `message_edit`, `message_reactions`, `messaging_postbacks`, `messaging_referral`, `messaging_seen`, `live_comments` |

> No es la app MAASY (`1427432382256060`). MAASY tampoco tiene acceso avanzado en los permisos de Instagram, así que cambiarse a ella no resuelve nada.

## Por qué tiene que estar publicada

Meta solo entrega webhooks de comentarios y mensajes a apps publicadas. Mientras BeReply estuvo en modo desarrollo (de septiembre al 30 de octubre de 2026) llegaron eventos de lectura y edición, pero ningún comentario, y por eso no salió ningún DM. Si alguien la devuelve a desarrollo con **Anular publicación**, BeReply se queda mudo sin dar error.

## Acceso estándar y evaluadores

Con acceso estándar, BeReply solo puede operar cuentas que tienen un rol en la app. Por eso cada cuenta nueva se agrega como **Evaluador de Instagram**:

1. `developers.facebook.com/apps/1639023537659541/roles/roles/` → **Agregar personas** → **Evaluador de Instagram** → usuario de Instagram → **Agregar**.
2. La cuenta acepta en `instagram.com/accounts/manage_access/` → **Invitaciones de evaluador** (solo en web).
3. Se conecta en BeReply desde **Settings**.

Así funcionan todas las cuentas que opera Believe, sean marcas propias o de clientes, mientras Believe tenga acceso a ellas.

## App Review: para que un cliente conecte su cuenta solo

Si un cliente va a conectar su cuenta sin pasar por Believe, hace falta **acceso avanzado** de `instagram_business_manage_comments` e `instagram_business_manage_messages`, y eso pide App Review:

- Meta exige al menos una llamada exitosa por permiso en los últimos 30 días. Desde el 2026-10-31 ya hay llamadas de los dos.
- Se manda con un screencast del flujo completo: conectar la cuenta, crear una campaña, comentar y recibir el DM.
- Guía de textos para la solicitud: `META_APP_REVIEW.md` en el repo.

Estado: **enviado el 2026-10-31**, en revisión (Meta estima unos 20 días). Solicitud `1639023590992869` con `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages` y `public_profile`. Mientras dure, la campaña "Meta App Review demo" (palabra REVIEW en el reel `DfIJjORt63j`) tiene que seguir activa: es la que prueba el revisor.

## Configuración básica

Verificada el 2026-10-31: dominio de la app `believe-global.com`, privacidad `https://reply.believe-global.com/privacy`, condiciones `https://reply.believe-global.com/terms` y eliminación de datos `https://reply.believe-global.com/data-deletion/`. Las tres páginas dicen BeReply, nombran a Believe It Group y dan `hola@believe-global.com` como contacto. Esta página se edita a mano: tiene un iframe de otra extensión de Chrome que bloquea a `bsk`.
