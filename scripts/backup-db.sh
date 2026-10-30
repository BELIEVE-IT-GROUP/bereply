#!/usr/bin/env bash
# Respaldo diario de la base de BeReply (Postgres del compose de produccion).
#
# Sin esto, perder el box es perder campanas, contactos, logs de DM y los tokens
# de Instagram guardados. Los secretos (incluida ENCRYPTION_KEY, que descifra
# esos tokens) viven en Infisical con prefijo BEREPLY_.
#
# Corre en el host, no en un contenedor:
#   45 4 * * * root /usr/local/bin/latir -m '...' cron-bereply-backup -- /root/openreply/scripts/backup-db.sh
#
# Restaurar (con el stack levantado y la base vacia):
#   rclone copy r2:believe-backups/bereply/<archivo>.sql.gz .
#   gunzip -c <archivo>.sql.gz | docker exec -i openreply-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

set -euo pipefail

CONTAINER="${CONTAINER:-openreply-postgres}"
LOCAL_DIR="${LOCAL_DIR:-/root/openreply-backups}"
REMOTE="${REMOTE:-r2:believe-backups/bereply}"
LOCAL_KEEP="${LOCAL_KEEP:-3}"
REMOTE_DAYS="${REMOTE_DAYS:-30}"

mkdir -p "$LOCAL_DIR"
OUT="$LOCAL_DIR/openreply-$(date -u +%Y%m%d-%H%M).sql.gz"

docker exec "$CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' | gzip > "$OUT"

# Un dump vacio o cortado tambien sale con exito del pipe: se valida antes de subirlo.
gzip -t "$OUT"
# Sin -q: grep -q corta el pipe, gunzip muere por SIGPIPE y pipefail lo cuenta como fallo.
gunzip -c "$OUT" | grep -F 'CREATE TABLE public."DmLog"' >/dev/null || { echo "[backup] dump sin el esquema esperado: $OUT" >&2; exit 1; }

rclone copy "$OUT" "$REMOTE/"
echo "[backup] $(date -u +%FT%TZ) $OUT ($(wc -c < "$OUT") bytes) -> $REMOTE"

# ponytail: retencion por edad en R2 y por cantidad en el disco; versionado de R2 si algun dia hace falta mas.
rclone delete "$REMOTE/" --min-age "${REMOTE_DAYS}d"
ls -1t "$LOCAL_DIR"/openreply-*.sql.gz | tail -n +"$((LOCAL_KEEP + 1))" | xargs -r rm -f
