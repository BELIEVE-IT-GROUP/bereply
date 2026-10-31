# Manuales de BeReply: fuente única

Este directorio es la **única fuente** de los manuales de BeReply. Las páginas con marca en R2, las notas de BeNotes y el Markdown de descarga se generan desde acá. Nunca se edita una copia. Es el mismo sistema de los manuales de George y de BeCommerce Agent (de este último salen las herramientas de `scripts/manual/`).

| Manual | Para quién | Dirección |
|---|---|---|
| Usuario | Quien opera las cuentas de Instagram de una marca | https://files.believe-global.com/bereply/manual/usuario/index.html |
| Operación | Believe: el de usuario más cómo se administra | https://files.believe-global.com/bereply/manual/operacion/index.html |

R2 no sirve índices de carpeta: la dirección termina en `index.html`.

## Qué hay

| Archivo | Qué es |
|---|---|
| `secciones/NN-*.md` | Las secciones. El título es el primer `#`. 01 a 09 son de usuario, 20 a 23 de operación |
| `manual.config.json` | Qué secciones tiene cada manual, destino en R2, nota de BeNotes, portada y el mapeo sección → fuentes (`sources`) |
| `<manual>/MANUAL-VERSION` | El número de esa edición (`N.N.N`) |
| `<manual>/CHANGELOG.md` | Su historial. Cada versión necesita su entrada `## N.N.N (AAAA-MM-DD)` |
| `img/` | Capturas reales del panel. Sin bandeja, contactos ni logs: traen conversaciones de personas reales y el manual es público |
| `marca/` | Símbolo y wordmark de BeReply, hechos con las reglas del brand kit (rejilla 48, trazo 4, punto cyan en 41,39; "Be" del wordmark oficial y "Reply" en Fraunces 700 a trazos), y el wordmark de Believe |
| `dist/` | Salida generada. No se versiona |

El manual de operación declara `"incluye": "usuario"`: trae todas las secciones del de usuario y suma las suyas.

## Versionado

| Número | Cuándo sube |
|---|---|
| Primero | Se reorganizó el manual o cambió la forma de usar BeReply |
| Segundo | Sección nueva o capacidad nueva documentada |
| Tercero | Correcciones y precisiones (lo sube solo el autoupdate) |

## Editar y publicar a mano

```bash
# Edita la sección, sube el MANUAL-VERSION de cada manual que la contiene, agrega su entrada al CHANGELOG, commit.
node scripts/manual/build.mjs                 # genera docs/manual/dist/
scripts/publish-manual.sh                     # ENSAYO: qué subiría y a dónde
scripts/publish-manual.sh --publish           # publica a R2 y a BeNotes
scripts/publish-manual.sh --publish usuario   # uno solo
```

`publish-manual.sh` publica solo lo que está en git, no sube nada si el contenido ya está publicado, se niega si el contenido cambió y `MANUAL-VERSION` no (salvo `--force`), y después de subir baja la página y comprueba la versión y el logo.

Los diagramas ` ```mermaid ` necesitan las herramientas de `scripts/manual/package.json` (`npm install` ahí). Hoy los manuales no traen diagramas y el build no las usa.

## Destinos

| Destino | Cómo |
|---|---|
| Repo | git |
| R2 | `~/.believe/bin/publish-r2 <archivo> --key bereply/manual/<manual>/<archivo>` |
| BeNotes | `scripts/manual/benotes.mjs push <manual>`: `BECHAT_GEORGE_REFRESH_TOKEN` (Infisical, no rota) → sesión de BeChat → broker de Cuadernos → `/api/pages`. El id de cada nota queda en `manual.config.json` (`benotes_page_id`) |

## Autoupdate

`scripts/manual/autoupdate.mjs` regenera solo las secciones cuyas fuentes cambiaron (`sources` en la config) con `claude -p` contra BeGateway (`believe-smart`, llave `LLM_GATEWAY_KEY_BEREPLY`). Valida la respuesta (título intacto, sin rayas largas ni voseo, completa), sube el tercer número de cada manual afectado, escribe el CHANGELOG, commitea solo `docs/manual` en `main`, empuja y publica.

```bash
node scripts/manual/autoupdate.mjs                    # ENSAYO, no gasta tokens
node scripts/manual/autoupdate.mjs --apply            # regenera, commitea en main, empuja y publica
node scripts/manual/autoupdate.mjs --apply --only 04  # una sección
node scripts/manual/autoupdate.mjs --self-test
```

No corre fuera de `main`, no pisa cambios sin commitear en `docs/manual` y no hace merges: si `origin/main` va adelante, deja el commit local y lo dice.

**Disparador:** un LaunchAgent diario a las 09:40, desde `/Volumes/DEV/Developer/bereply`.

```bash
install -m 755 scripts/manual/launchd/bereply-manual-autoupdate.sh ~/.believe/bin/
cp scripts/manual/launchd/com.believe.bereply-manual-autoupdate.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.believe.bereply-manual-autoupdate.plist
tail -f ~/Library/Logs/bereply-manual-autoupdate.log
```

Para apagarlo: `launchctl bootout gui/$(id -u)/com.believe.bereply-manual-autoupdate`.

## Cómo escribir

- Español neutro, de tú, sin voseo y sin rayas largas.
- El manual de usuario habla desde quien opera las cuentas: nada de archivos ni variables. Operación sí los nombra.
- Si el manual y el código no coinciden, manda el código y se corrige el manual.
- Lo que no esté verificado se dice como pendiente.
