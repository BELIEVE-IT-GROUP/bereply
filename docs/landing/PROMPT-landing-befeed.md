> Si algo de este documento choca con el skill `believe-landing`, gana el skill. El arte y las respuestas verificadas están en `ARTE.md`, en esta misma carpeta.

Construye la landing pública de **BeFeed**, sub-marca de Believe. Debe verse y comportarse como una hermana de BeSeo: mismo sistema de marca, HTML prerenderizado, formulario de solicitud. Pero no copies su estructura: la de BeFeed es la de este documento.

## Material

- **Manual, fuente de verdad del producto:** https://files.believe-global.com/bereply/manual/befeed/index.html (copia local: `/Volumes/DEV/Developer/bereply/docs/manual/dist/befeed/manual.md`). Léelo completo antes de escribir. Todo lo que afirmes debe estar ahí o en este documento. El capítulo "Cómo se opera" es interno: no uses nada de él.
- **Capturas reales:** `/Volumes/DEV/Developer/bereply/docs/landing/capturas/`. Cópialas a `public/capturas/`. Si no alcanzas esa ruta, pídeselas a Jorge; nunca las reemplaces por mockups.
- **Reel producido en BeFeed:** https://files.believe-global.com/clientes/befeed/cmw2l402d00020wp66metxiu4/mw2opyc9-reel.mp4, póster `.../mw2opyc9-poster.jpg`. Úsalo solo si Jorge lo aprueba. Mientras tanto, usa el póster.
- **Referencia técnica:** `~/Believable/beseo-web`: `LeadForm`, `submit-lead`, `Footer`, `llms.txt`, `site.ts`. Usa también los skills `brand-kit-believe` y `believe-footer`.

| Archivo | Muestra | Dónde va |
|---|---|---|
| `01-semana.jpg` | Tablero de la semana completo | Hero |
| `12-semana-columnas.jpg` | Columnas, de cerca | Ciclo, versión móvil del hero |
| `02-generar-semana.jpg` | Formulario Generar la semana | Generar |
| `03-pieza-reel.jpg` | Pieza lista, con video y puertas | Puertas |
| `04-pieza-guion.jpg` | Guion por segundos y puertas abiertas | Generar |
| `11-puertas.jpg` | Las puertas, de cerca | Puertas, móvil |
| `05-estudio-del-guion-al-mp4.jpg` | Pasos del Estudio y medición de audio | Estudio |
| `10-estudio-lista.jpg` | Lista del Estudio | Opcional |
| `06-ideas-ganadores.jpg` | Ganador a 6,9× la mediana | Aprender |
| `08-metricas-retencion.jpg` | Tiempo medio y tasa de salto | Aprender |
| `09-cierre.jpg` | Cierre pieza por pieza | Aprender |
| `07-metricas-completa.jpg` | Métricas con vistas reales, muy bajas | **No la uses grande.** Es solo respaldo |

No existen capturas del tablero de MAAS2 ni de la conversación con el agente: esas dos se construyen en código.

## La idea

Jorge lo dijo así: por chat con un agente "no hay orden, no hay visibilidad del flow, ni control; solo llegan outputs". Esa es la tesis. El agente ya sabe escribir. Lo que falta es la operación alrededor: quién hace qué, qué está frenado, quién aprobó y qué se aprendió.

- **Una frase:** BeFeed convierte el Instagram de una marca en una semana con orden: el agente propone, tu equipo decide y cada semana aprende de la anterior.
- **El enemigo:** los resultados sueltos que llegan por chat, no otros productos. No nombres competidores.
- **La decisión memorable:** "No es una regla que se le pide respetar: esas herramientas no existen para él". El agente no puede aprobar, publicar, comentar ni mandar mensajes. Esta es la frase que el lector debe recordar.
- **Para quién:** equipos y agencias que llevan el Instagram de una o varias marcas, con cliente que aprueba y con agentes de IA en su trabajo diario.
- **Voz:** Believe. Editorial, declarativa, de tú, en español neutro. Sustantivos antes que adjetivos.

Titular recomendado:

> La IA ya escribe tu contenido. Falta quién lleve *la semana*.

Subtítulo: "BeFeed es donde se genera, se produce, se aprueba y se mide el Instagram de cada marca. El agente propone desde tu Claude. Aprobar y publicar siempre lo hace una persona."

Puedes proponerle dos alternativas a Jorge, pero construye con este.

## Estructura

Cada sección tiene una sola idea. Los titulares son una dirección: mejóralos sin cambiar lo que afirman.

1. **Hero.** Titular, subtítulo, botón "Solicitar acceso" al formulario y `01-semana.jpg` grande. Sin cifras.
2. **El problema: "Por chat llegan resultados. No una operación."** Tres columnas: sin orden (cada pieza vive en un hilo distinto), sin visibilidad (nadie sabe qué está frenado ni por qué), sin control (lo que se aprobó y quién lo aprobó no queda en ningún lado). Sin porcentajes.
3. **El ciclo, la pieza central.** Una pieza avanza en scroll por Guion, Filtros, Cliente, Video, Lista y Publicada, y el cierre vuelve al jueves siguiente. Constrúyelo en código con los nombres reales de las columnas. Remata con: "Los jueves, con la semana vigente corriendo, se genera la siguiente".
4. **Generar: "Nada inventado."** Se le da una sola acción que se mide y la materia prima real. Sale la semana con ganchos, guion por segundos y qué debe mover cada pieza. Lo que no está en la estrategia, la voz o la materia prima queda como dato por resolver: la pieza se frena con el nombre de quien lo tiene. Esto es lo que más la separa de un generador de texto. Muéstralo con `02` y `04`, y con el ejemplo de una pieza frenada construido en código.
5. **Puertas: "El agente propone. Las personas deciden."** La decisión memorable, en grande. Filtros internos, OK del cliente, aprobación del MP4 y publicación. Todo queda en el historial de la pieza. Usa `03`, y `11` en móvil.
6. **Estudio: "Del guion al MP4."** Reels con voz, música, imágenes y clips generados. Revisas los cuadros antes del gasto grande, rehaces solo el plano que no sirve y volver a armar no se paga de nuevo. Puede hacer el video que se te ocurra. Lo único que no entra en la ficha es material grabado, que se edita aparte y se sube a la pieza. Usa `05` y el Reel si está aprobado.
7. **El cliente: "Tu cliente no aprende otra herramienta."** Al pasar los filtros, la pieza se copia sola a su tablero. Ahí la ve, aprueba y comenta, y todo vuelve a BeFeed en minutos. Si rechaza, regresa a guion con el comentario. Queda como repositorio de media de la marca. Diagrama en código, de ida y vuelta.
8. **Aprender: "Lo que esta semana le enseña a la siguiente."** Métricas por la API oficial de Meta: vistas, alcance, guardados, compartidos, tiempo medio y tasa de salto. Un ganador es el Reel que hace al menos 2× la mediana de la propia cuenta. El cierre decide qué se repite y qué se suelta, y alimenta la semana siguiente. Usa `08`, `06` y `09`.
9. **El agente: "Desde tu Claude, sin perder el control."** Conversación construida en código con pedidos reales del capítulo "Hablar con el agente", cambiando los nombres de cliente por "tu marca". Cada acceso firma lo que hace y se revoca con un clic. El método se actualiza solo.
10. **Pauta.** Corta. Las piezas de pauta se crean y aprueban en el mismo lugar, y BeAds solo toma las aprobadas para pauta. Lo orgánico que gana puede pasar a pauta sin reaprobarse si el texto no cambia, y lo que gana en pauta vuelve como idea. Usa este ángulo: "Cada resultado dice qué cuenta. 795 vistas de página no son una venta".
11. **Para quién, y para quién no.** Sí: equipos con cliente que aprueba, varias marcas y una acción que medir. No: quien busca que una IA publique sola, o solo un programador de posts.
12. **Preguntas frecuentes.** ¿Publica sola? (No.) ¿Reemplaza a mis diseñadores? (No: una parte la hace el Estudio y otra tu equipo.) ¿Qué pasa si falta un dato? ¿Mi cliente necesita cuenta en BeFeed? (Aprueba en su tablero.) ¿Qué agentes se conectan? (Claude o George.) ¿Qué mide y qué no? (No hay curva de retención por segundo.)
13. **Cierre y formulario.** Banda completa en Blue 900. "Instala una semana, no otra campaña." Formulario: nombre, correo, empresa, cuántas marcas llevan. El equipo de Believe responde. Leads a Maasy CRM con tag `befeed`, con el mismo patrón de BeSeo. Footer con `believe-footer`.

## Reglas duras de contenido

- Cero cifras, testimonios ni logos de clientes inventados. No hay casos publicados: no los insinúes.
- No nombres a ningún cliente, aunque salgan en el manual (Uniplaza, Villa Elcira, etc.).
- No prometas alcance, ventas ni retención. BeFeed mide y ordena; no garantiza resultados.
- No uses como afirmaciones de la landing lo que se lee dentro de las capturas: "35 % más conversión", "cien proyectos" y similares son contenido de ejemplo.
- No digas "publica automáticamente": publica una persona.
- No digas que solo cierta persona puede abrir una puerta. Di que la abre una persona, nunca el agente.
- No prometas cuánto tarda ni cuánto cuesta un Reel, ni precios. No hay plan público: el camino es el formulario.
- No menciones proveedores ni infraestructura: modelos de video, ElevenLabs, fal, servidores, tokens, repos o skills.
- Prohibido: rayas largas, voseo, signos de exclamación, emoji, "revolucionario", "potente", "de nueva generación", "game changer".

## Dirección visual

- Believe Brand System: fondo Paper `#fafaf7`, tinta `#1a1a1a`, Blue 700 `#0c3bb9`, Blue 900 `#062778`, Cyan `#00aaff` solo en el punto final de titulares y logo. Fraunces en titulares con un único énfasis en itálica, Inter en cuerpo y JetBrains Mono en etiquetas.
- Wordmark: "Be" azul y "Feed" en Fraunces, con "BY BELIEVE" en mono, igual que en el panel. Si no hay logo en `brand-kit-believe`, constrúyelo en SVG y avísale a Jorge.
- **Contraste:** la página es clara y editorial; las capturas son navy oscuro. Deja que el producto sea lo más oscuro y denso de la página, en marcos limpios, sin mockups de laptop ni perspectiva falsa.
- Una sola pieza de movimiento ambiciosa: el ciclo de la sección 3. El resto son entradas discretas. Sin 3D, sin partículas, sin degradados decorativos. Respeta `prefers-reduced-motion`.
- Si usas Lenis con GSAP, intégralos desde el arranque con `lenis.on('scroll', ScrollTrigger.update)` y `gsap.ticker`. El método es `lagSmoothing`.
- **Móvil de verdad:** nada de scroll horizontal ni captura de escritorio encogida hasta ser ilegible. Cambia a los recortes `12`, `11` y `08`, y convierte el ciclo en una secuencia vertical.
- Revisa `ver_preview` con cuidado: las secciones con reveal pueden verse en blanco ahí. Verifica con scroll real.

## Técnico

- Título: `BeFeed: la semana de Instagram con orden · Believe`. Dominio propuesto `getbefeed.believe-global.com`, a confirmar con Jorge antes de publicar.
- Imagen social desde `01-semana.jpg`, recortada a proporción Open Graph. `alt` real en cada captura, describiendo lo que se ve.
- `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt` y `brand.json`, como en BeSeo. El contenido debe leerse sin ejecutar JavaScript.

## Verificación antes de entregar

1. Escritorio y 375 px, con scroll real de principio a fin. Cero desbordes.
2. Envía el formulario de prueba y confirma que el lead llegó a Maasy con el tag `befeed`. Dime qué lead usaste para poder borrarlo.
3. Cada afirmación de la página tiene su respaldo en el manual o aquí. Lista las que no pudiste respaldar y quítalas.
4. Busca en el HTML final rayas largas, voseo y nombres de clientes.

No publiques ni conectes el dominio sin el OK de Jorge. Muéstrale primero el preview, con las capturas de escritorio y móvil.
