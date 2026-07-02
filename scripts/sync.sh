#!/usr/bin/env bash
# sync.sh — Sincroniza la instancia viva con el template público.
#
# Uso:
#   ./scripts/sync.sh
#
# Qué hace:
#   1. Hace commit de cambios locales no commiteados (en .agent_knowledge/
#      u otros) con un mensaje automático.
#   2. Hace pull --rebase desde el remote 'template' (rama main).
#   3. Pushea al remote 'origin' (tu repo privado en GitHub).
#
# Resultado: template → instancia viva, en un comando.

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "==> Sincronizando instancia viva con template..."
echo

# 1. Commitear cambios locales no commiteados (si los hay)
if ! git diff --cached --quiet 2>/dev/null || ! git diff --quiet 2>/dev/null; then
  echo "[1/3] Hay cambios locales sin commitear. Commiteando..."
  git add -A
  if git diff --cached --quiet; then
    echo "        No hay nada que commitear realmente. Sigo."
  else
    mensaje="chore(sync): sync automático $(date +%Y-%m-%d\ %H:%M:%S)"
    git commit -m "$mensaje"
    echo "        Commit creado."
  fi
else
  echo "[1/3] Working tree limpio."
fi
echo

# 2. Pull con rebase desde el template
echo "[2/3] Pull --rebase desde template/main..."
if git pull --rebase template main; then
  echo "        Sin conflictos."
else
  echo "        ⚠️  Hubo conflictos. Resolvelos manualmente y después corré:"
  echo "            git rebase --continue"
  echo "            git push origin main"
  exit 1
fi
echo

# 3. Push al repo privado (backup de datos)
echo "[3/3] Push a origin/main (tu repo privado)..."
if git push origin main 2>/dev/null; then
  echo "        ✅ Push exitoso (sin rebase previo)."
elif git pull --rebase origin main && git push origin main; then
  echo "        ✅ Push exitoso (después de rebase con origin)."
else
  echo "        ⚠️  Push falló. Resolvelos manualmente:"
  echo "            git pull --rebase origin main"
  echo "            git push origin main"
  exit 1
fi
echo

echo "==> ✅ Sincronización completa."
echo "    Template → instancia viva, todo al día."
