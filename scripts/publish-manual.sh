#!/usr/bin/env bash
#
# Publica los manuales de BeReply (usuario, operacion) a sus tres destinos desde una
# sola fuente (docs/manual/secciones/*.md). Mismo sistema que el Manual de George (george/scripts/publish-manual.sh):
#   1. repo     el Markdown, versionado en git (acá solo se comprueba que esté commiteado)
#   2. R2       la página con marca: files.believe-global.com/bereply/manual/<manual>/index.html
#   3. BeNotes  una nota por manual en el cuaderno BELIEVE (scripts/manual/benotes.mjs)
#
# Sin --publish es un ENSAYO: construye y dice exactamente qué subiría y a dónde. No toca nada.
#
# Reglas del versionado (las hace cumplir este script, por manual):
#   - mismo contenido que lo publicado          → no sube nada
#   - contenido distinto con la misma versión   → se niega: sube docs/manual/<manual>/MANUAL-VERSION y agrega
#     la entrada en docs/manual/<manual>/CHANGELOG.md (o --force si de verdad es lo que quieres)
#
# Ningún secreto pasa por este script: `publish-r2` y `infra` los leen de Infisical.
#
# Uso:  scripts/publish-manual.sh [--publish] [--only r2|benotes] [--force] [usuario|operacion|arquitectura ...]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${ROOT}/docs/manual/dist"
PUBLISH=0; ONLY=""; FORCE=0; MANUALS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --publish) PUBLISH=1 ;;
    --force) FORCE=1 ;;
    --only) ONLY="${2:-}"; shift ;;
    usuario|operacion|arquitectura) MANUALS+=("$1") ;;
    *) echo "Uso: scripts/publish-manual.sh [--publish] [--only r2|benotes] [--force] [usuario|operacion|arquitectura ...]" >&2; exit 2 ;;
  esac
  shift
done
[[ -z "$ONLY" || "$ONLY" == "r2" || "$ONLY" == "benotes" ]] || { echo "--only acepta r2 o benotes" >&2; exit 2; }
[[ ${#MANUALS[@]} -gt 0 ]] || MANUALS=(usuario operacion)

# launchd y algunos shells no traen node 24 en el PATH.
NODE=""
for candidate in /opt/homebrew/opt/node@24/bin/node "$(command -v node || true)" "${HOME}/.local/bin/node"; do
  [[ -x "$candidate" ]] && { NODE="$candidate"; break; }
done
[[ -n "$NODE" ]] || { echo "ERROR: no encuentro node." >&2; exit 1; }
field() { "$NODE" -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(m[process.argv[2]]??"")' "$1" "$2"; }

if grep -qE '^[`]{3}mermaid' "${ROOT}"/docs/manual/secciones/*.md && [[ ! -d "${ROOT}/scripts/manual/node_modules/mermaid" ]]; then
  (cd "${ROOT}/scripts/manual" && npm install --no-audit --no-fund --silent)
fi

[[ $PUBLISH -eq 1 ]] && echo "==> PUBLICANDO los manuales: ${MANUALS[*]}" || echo "==> ENSAYO (no se sube nada; con --publish se publica): ${MANUALS[*]}"
"$NODE" "${ROOT}/scripts/manual/build.mjs" "${MANUALS[@]}"

echo
echo "==> 1. Repo"
DIRTY="$(git -C "$ROOT" status --porcelain -- docs/manual scripts/manual scripts/publish-manual.sh)"
if [[ -n "$DIRTY" ]]; then
  echo "    Hay cambios sin commitear:"; sed 's/^/      /' <<<"$DIRTY"
  [[ $PUBLISH -eq 0 ]] || { echo "ERROR: se publica solo lo que está en git. Haz commit primero." >&2; exit 1; }
else
  echo "    docs/manual/ está commiteado ($(git -C "$ROOT" rev-parse --short HEAD)). El Markdown ya es el destino 1."
fi

FAILED=0
for MANUAL in "${MANUALS[@]}"; do
  OUT="${DIST}/${MANUAL}"
  VERSION="$(field "${OUT}/manual.json" manual_version)"
  HASH="$(field "${OUT}/manual.json" content_sha256)"
  URL="$(field "${OUT}/manual.json" url)"
  URL_BASE="$(field "${OUT}/manual.json" url_base)"
  TITLE="$(field "${OUT}/manual.json" title)"
  PUBLIC_BASE="${URL_BASE%%/bereply/*}"

  if [[ -z "$ONLY" || "$ONLY" == "r2" ]]; then
    echo
    echo "==> 2. R2 · ${TITLE} (${URL})"
    REMOTE="${OUT}/.publicado.json"; rm -f "$REMOTE"
    CODE="$(curl -sS -m 20 -o "$REMOTE" -w '%{http_code}' "${URL_BASE}/manual.json?t=$(date +%s)" 2>/dev/null || true)"
    UPLOAD=1
    case "$CODE" in
      200)
        RVERSION="$(field "$REMOTE" manual_version)"; RHASH="$(field "$REMOTE" content_sha256)"
        if [[ "$RHASH" == "$HASH" ]]; then
          echo "    Publicado: v${RVERSION} con este mismo contenido. Nada que subir."; UPLOAD=0
        elif [[ "$RVERSION" == "$VERSION" && $FORCE -eq 0 ]]; then
          echo "    BLOQUEADO: el contenido cambió y ${MANUAL}/MANUAL-VERSION sigue en ${VERSION}."
          echo "    Sube docs/manual/${MANUAL}/MANUAL-VERSION y agrega la entrada en docs/manual/${MANUAL}/CHANGELOG.md."
          UPLOAD=0; [[ $PUBLISH -eq 0 ]] || FAILED=1
        else
          echo "    Publicado: v${RVERSION}. Se reemplaza por v${VERSION}."
        fi ;;
      404) echo "    Todavía no hay nada publicado: primera publicación (v${VERSION})." ;;
      *)
        echo "    No pude consultar lo publicado (respuesta: ${CODE:-sin red})."
        if [[ $PUBLISH -eq 1 && $FORCE -eq 0 ]]; then
          echo "    ERROR: sin saber qué hay publicado no subo nada (--force para subir igual)." >&2; UPLOAD=0; FAILED=1
        fi ;;
    esac
    if [[ $UPLOAD -eq 1 ]]; then
      # El plan ya viene en orden: imágenes y diagramas, Markdown, la página y al final el marcador de versión.
      while IFS=$'\t' read -r file key; do
        if [[ $PUBLISH -eq 1 ]]; then
          "${HOME}/.believe/bin/publish-r2" "${OUT}/${file}" --key "$key" >/dev/null
        else
          printf '    subiría  %-40s %8s bytes  →  %s/%s\n' "$file" "$(wc -c < "${OUT}/${file}" | tr -d ' ')" "$PUBLIC_BASE" "$key"
        fi
      done < "${OUT}/publish-plan.tsv"
      if [[ $PUBLISH -eq 1 ]]; then
        # Un 200 no prueba que renderice: se baja la página y se busca la versión adentro, y una imagen.
        PAGE="$(curl -fsS -m 20 "${URL}?t=$(date +%s)")"
        if ! grep -q "bereply-manual-version\" content=\"${VERSION}\"" <<<"$PAGE"; then
          echo "ERROR: ${URL} no trae la versión ${VERSION}." >&2; FAILED=1
        elif ! curl -fsS -m 20 -o /dev/null "${URL_BASE}/assets/bereply-positive.svg?t=$(date +%s)"; then
          echo "ERROR: la página quedó sin su logo." >&2; FAILED=1
        else
          echo "    Verificado: ${URL} sirve la v${VERSION} con sus imágenes."
        fi
      else
        echo "    con: ~/.believe/bin/publish-r2 <archivo> --key <key>  (igual que el Manual de George)"
      fi
    fi
  fi

  if [[ -z "$ONLY" || "$ONLY" == "benotes" ]]; then
    echo
    echo "==> 3. BeNotes · ${TITLE}"
    if [[ $PUBLISH -eq 0 ]]; then
      "$NODE" "${ROOT}/scripts/manual/benotes.mjs" plan "$MANUAL"
    elif ! "${HOME}/.believe/bin/infra" "$NODE" "${ROOT}/scripts/manual/benotes.mjs" push "$MANUAL"; then
      FAILED=1
    fi
  fi
done

echo
if [[ $FAILED -eq 1 ]]; then echo "==> Terminó con errores (ver arriba)." >&2; exit 1; fi
[[ $PUBLISH -eq 1 ]] && echo "==> Listo: ${MANUALS[*]}" || echo "==> Ensayo terminado (nada se publicó)"
