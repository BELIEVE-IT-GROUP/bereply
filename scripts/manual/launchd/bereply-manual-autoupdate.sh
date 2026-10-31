#!/usr/bin/env bash
# Mantiene al día los manuales de BeReply: lo dispara launchd una vez al día
# (com.believe.bereply-manual-autoupdate).
# Se instala en ~/.believe/bin/.
#
# Regenera las secciones cuyas fuentes cambiaron, commitea docs/manual en main, empuja y publica en R2 y
# BeNotes. Si el checkout no está en main o hay cambios sin commitear en docs/manual, no toca nada y lo dice.
# La llave del gateway la saca el script de Infisical; acá no pasa ningún secreto.
set -euo pipefail
export PATH="/opt/homebrew/opt/node@24/bin:${HOME}/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:${PATH:-}"
cd /Volumes/DEV/Developer/bereply
echo "--- $(date '+%Y-%m-%d %H:%M') ---"
exec node scripts/manual/autoupdate.mjs --apply
