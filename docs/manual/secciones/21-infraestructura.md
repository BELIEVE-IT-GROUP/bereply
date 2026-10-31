# Infraestructura y despliegue

BeReply es un fork de OpenReply (MIT) en `github.com/BELIEVE-IT-GROUP/bereply`. Corre en el VPS **Contabo** (`ssh contabo-believe`) con Docker Compose, fuera de la interfaz de Coolify.

## Qué corre

`/root/openreply` es un checkout git del repo en `main`. `docker-compose.prod.yml` levanta cinco contenedores:

| Contenedor | Qué hace |
|---|---|
| `openreply-web` | Next.js: el panel y el endpoint que recibe los webhooks de Meta. Detrás de Traefik en `reply.believe-global.com` |
| `openreply-worker` | BullMQ: **es el que manda los DMs**, con reintentos y límite por cuenta |
| `openreply-cron` | `scripts/cron.sh`: los trabajos periódicos (ver abajo) |
| `openreply-postgres` | La base |
| `openreply-redis` | La cola |

Al arrancar, `openreply-web` aplica las migraciones pendientes (`npm run db:migrate`).

## Desplegar

```
ssh contabo-believe
cd /root/openreply && git pull
nohup docker compose -f docker-compose.prod.yml up -d --build openreply-web openreply-worker openreply-cron > /root/openreply-deploy.log 2>&1 &
```

Con `nohup` el build no depende de que la sesión SSH siga viva. Cuando el box está cargado, tarda de 10 a 15 minutos. Después:

- `docker ps | grep openreply-`: los cinco arriba y `openreply-web` en *healthy*.
- `docker exec openreply-web wget -qO- http://127.0.0.1:3000/api/health`: base, Redis, cola y latido del worker en `ok`.

> Para reiniciar sin reconstruir: `up -d --force-recreate`. `docker compose restart` no vuelve a leer el `.env`.

## Trabajos periódicos (`scripts/cron.sh`)

| Trabajo | Cuándo | Para qué |
|---|---|---|
| `attach-next-reel` | Cada 5 minutos | Amarra las campañas "next post or reel" al reel que se acaba de publicar |
| `refresh-tokens` | 05:00 UTC | Renueva los tokens de Instagram. Si se salta, el token vence y todo deja de enviar sin error |
| `snapshot-followers` | 05:00 UTC | La foto diaria de seguidores |
| `sync-maasy` | 05:00 UTC | Vuelve a traer de Maasy el conocimiento de las cuentas vinculadas |

## Monitoreo

El skill `believe-health` lo vigila: `bereply` (el endpoint de health), `bereply-cron` (`attach-next-reel` en los últimos 15 minutos) y `bereply-refresh-tokens`. La alerta llega al digest diario de Be Chat.

## Respaldo

`scripts/backup-db.sh` corre en el host todos los días a las 04:45 (`/etc/cron.d/bereply-backup`, latido `cron-bereply-backup`). Hace `pg_dump`, valida que el dump traiga el esquema y lo sube a `r2:believe-backups/bereply` (privado, 30 días). Quedan 3 copias locales en `/root/openreply-backups`. La restauración está probada.

## Secretos

Todo el `.env` del servidor está en Infisical con prefijo `BEREPLY_`, más `LLM_GATEWAY_KEY_BEREPLY`. Las que importan:

| Variable | Si se pierde |
|---|---|
| `ENCRYPTION_KEY` | Los tokens de Instagram guardados en la base no se pueden descifrar: hay que reconectar todas las cuentas |
| `INSTAGRAM_APP_SECRET` | No valida los webhooks ni el login con Instagram |
| `LLM_GATEWAY_KEY_BEREPLY` | Sin respuestas con IA ni resumen de Maasy |
| `MAASY_MCP_API_KEY` | No sincroniza con Maasy. En Infisical: `BEREPLY_MAASY_MCP_API_KEY` |

Rehacer el `.env`: `~/.believe/bin/infra env | grep '^BEREPLY_' | sed 's/^BEREPLY_//'`, y agregar `LLM_GATEWAY_KEY_BEREPLY` tal cual.
