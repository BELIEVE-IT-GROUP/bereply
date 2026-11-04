# Cómo se opera

Esta sección es para Believe.

## Dónde corre

BeFeed es un módulo del repo `BELIEVE-IT-GROUP/bereply`, en `/root/openreply` del Contabo. Comparte web, base de datos y usuarios con BeReply.

| Servicio | Qué hace |
|---|---|
| `openreply-web` | El panel y el MCP en `/api/mcp` |
| `openreply-reels` | Produce Reels, genera semanas y sincroniza tableros |
| `openreply-cron` | Llama `feed-metrics` cada hora |

El volumen `openreply-reels` guarda el trabajo de cada Reel y los skills. La web también lo monta: ahí recibe los skills.

## Los skills

`believe-instagram` y `motion-video-believe` viven en sus propios repos privados de `BELIEVE-IT-GROUP`. **Una mejora se commitea y se pushea a `main`.** La GitHub Action `.github/workflows/befeed.yml` de cada repo empaqueta el repo y lo manda a `POST /api/feed/skills/<nombre>`. BeFeed lo instala en el volumen, sin construir imagen: `tools/reel.py`, `tools/lint_es.py`, `references/` y `SKILL.md` se leen de ahí. La imagen trae una copia de `reel.py` por si el skill todavía no ha llegado.

La Action usa el secreto `BEFEED_SKILLS_TOKEN` del repo, igual al del `.env` del servidor y al de Infisical. Se usa este camino porque la organización tiene deshabilitadas las llaves de despliegue.

## Variables

Además de las de BeReply: `FAL_API_KEY`, `elevenlabs_api_key`, `R2_*`, `MAAS2_SUPABASE_SELFHOST_URL`, `MAAS2_SUPABASE_SERVICE_ROLE_KEY`, `MAASY_MCP_API_TOKEN`, `BEFEED_SKILLS_TOKEN` y `FEED_MAX_REELS_DAY`. Las copias a MAAS2 las firma el perfil de `MAAS2_FEED_USER_EMAIL`, por defecto `jorge@believe-global.com`.

## Desplegar

```bash
cd /root/openreply && git pull --ff-only origin main
docker compose -f docker-compose.prod.yml build openreply-web openreply-reels
docker compose -f docker-compose.prod.yml up -d --no-build --no-deps openreply-web openreply-reels
```

Con el host cargado, exportar la imagen tarda más de 20 minutos: no cortarla. Tras recrear la web hay unos 3 minutos de 503 mientras Traefik espera el healthcheck. Un trabajo que corría durante el reinicio queda en **Falló**, con el motivo, y se vuelve a pedir.

## El tablero en la base

`media_assets.metadata.befeed_piece_id` une cada archivo del tablero con su pieza. BeFeed guarda `maasBoardId` por semana, `maasAssetId` y `maasStage` por pieza. `maasStage` es la última etapa que vio: si en el tablero cambia, la cambió alguien allá. El código está en `lib/feed/maas2.ts` y `lib/feed/board-sync.ts`.

## Este manual

Vive en `docs/manual` y se mantiene con el mismo sistema de los manuales de BeReply: `scripts/manual/autoupdate.mjs` corre a diario y `scripts/publish-manual.sh --publish befeed` lo sube a R2 y a BeNotes.
