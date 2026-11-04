# El tablero de MAAS2

El cliente nunca entra a BeFeed. Ve, comenta y aprueba en el tablero de su proyecto en MAAS2, y BeFeed se entera solo.

## Lo que va de BeFeed al tablero

| Cuándo | Qué pasa en el tablero |
|---|---|
| La pieza pasa los dos filtros | Se crea en el tablero de su semana, en **revisión del cliente**. Si el tablero de esa semana no existe, BeFeed lo crea con el nombre de siempre, por ejemplo *Semana 12 - 18 nov* |
| Cambia el texto o el responsable | Se actualiza |
| Llega un MP4 o imágenes | Se actualiza y vuelve a **revisión del cliente** |
| Se marca publicada | Pasa a **publicada** |

**Los borradores nunca salen.** Lo que no ha pasado los dos filtros no existe para el cliente.

## Lo que vuelve del tablero a BeFeed

Cada 5 minutos, BeFeed revisa los tableros:

| En el tablero | En BeFeed |
|---|---|
| El cliente aprueba | Se abre la puerta que sigue: primero **Cliente** y, si ya hay video, **MP4** |
| El cliente rechaza | La pieza vuelve a guion con las puertas cerradas y su comentario queda como motivo |
| Alguien comenta | El comentario aparece en la pieza, en **Comentarios del tablero**, y en la tarjeta de la semana |
| Alguien sube un archivo | Entra a la pieza. Un video nuevo vuelve a pedir aprobación |

Si el cliente aprueba una pieza que está frenada en BeFeed, la puerta no se abre: queda en el historial y se resuelve en BeFeed.

## Si la copia falla

Una caída de MAAS2 no frena nada en BeFeed. Queda en el historial de la pieza como error, y cada 5 minutos se reintenta lo que no haya llegado.

## Lo que BeFeed no borra

Borrar en BeFeed nunca borra en el tablero. Una semana con piezas en el tablero no se borra desde BeFeed: primero se quitan allá. Si alguien quita una pieza del tablero, BeFeed lo nota en el siguiente ciclo y no la vuelve a copiar, hasta que vuelva a pasar los filtros.
