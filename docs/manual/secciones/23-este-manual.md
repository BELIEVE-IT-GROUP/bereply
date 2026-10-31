# Este manual

El manual se escribe una sola vez, en `docs/manual/secciones/` del repo, y de ahí se genera todo lo demás. Nunca se edita una copia.

| Destino | Dirección |
|---|---|
| Repo | `docs/manual/` en `BELIEVE-IT-GROUP/bereply` |
| R2, usuario | `https://files.believe-global.com/bereply/manual/usuario/index.html` |
| R2, operación | `https://files.believe-global.com/bereply/manual/operacion/index.html` |
| BeNotes | Cuaderno BELIEVE: "BeReply · Manual de usuario" y "BeReply · Manual de operación" |

## Se actualiza solo

Todos los días a las 09:40, un LaunchAgent del Mac de Jorge (`com.believe.bereply-manual-autoupdate`) corre `scripts/manual/autoupdate.mjs --apply`:

1. Compara, sección por sección, las rutas del repo que la alimentan (`sources` en `manual.config.json`) contra el último commit revisado.
2. A cada sección desactualizada le pasa el diff a un modelo vía BeGateway, que la reescribe o contesta `SIN_CAMBIOS`.
3. Si algo cambió, sube el tercer número de la versión del manual, escribe el CHANGELOG, commitea solo `docs/manual` en `main`, empuja y publica en R2 y BeNotes.

Corre desde `/Volumes/DEV/Developer/bereply`. Si ese checkout no está en `main` o tiene cambios sin commitear en `docs/manual`, no toca nada y lo deja en el log: `~/Library/Logs/bereply-manual-autoupdate.log`.

## A mano

```
node scripts/manual/build.mjs
scripts/publish-manual.sh
scripts/publish-manual.sh --publish
node scripts/manual/autoupdate.mjs
```

En orden: construir, ensayar la publicación, publicar, y ver qué secciones están desactualizadas sin gastar tokens. Detalle completo en `docs/manual/README.md`.
