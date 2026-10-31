# Respuestas con IA

Con la IA prendida, una campaña ya no manda siempre el mismo mensaje: lee lo que la persona escribió y contesta con base en el conocimiento de la marca y en las instrucciones de la campaña.

## Prenderla

En el editor de la campaña, **Advanced → Responder con IA**. Ahí escribes las instrucciones de esa campaña (el *system prompt*): cómo debe responder y qué no debe hacer.

```pedido
Eres el asistente de @marca. Tono cercano y corto, máximo dos frases.
Nunca prometas descuentos.
Si preguntan por precios de proyectos, invita a agendar una llamada.
```

La IA pasa por BeGateway, el gateway de modelos de Believe. BeReply nunca usa una llave directa de un proveedor.

## Reglas que la IA no puede romper

Estas reglas van siempre, por encima de las instrucciones de la campaña:

1. **No inventa** precios, disponibilidad ni tiempos de envío. Si le preguntan algo comercial que no está en el conocimiento ni en las instrucciones, escala.
2. **Respeta la baja.** Si la persona pide que no le escriban ("stop", "no me escribas", "cancelar"), no responde y escala.
3. **No maneja quejas** ni reclamos, devoluciones o temas legales: escala.
4. **Ante la duda, escala.** Es mejor que conteste una persona que arriesgar una respuesta equivocada.
5. **Nunca dice que es humana.**

## Qué pasa cuando escala

Cuando la IA escala, **no se envía nada**. La conversación queda:

- En **DM Logs**, con estado *Escalated* y el motivo.
- En **Diagnostics**, como alerta: "Escalated to human: conversation with …".

Alguien tiene que contestar desde la **Bandeja** (ver *Contactos, bandeja y resultados*). Hoy BeReply no manda una notificación cuando escala: revisa DM Logs o Diagnostics a diario mientras haya campañas con IA.

## Cuánto gasta

En **Settings** ves los tokens que gastó la IA en el periodo, sumando entrada y salida de todas las respuestas.
