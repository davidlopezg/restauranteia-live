#!/usr/bin/env bash
# setup-aliases.sh — Configura los aliases git en este repo.
#
# Uso:
#   ./scripts/setup-aliases.sh
#
# Después podés correr desde este repo:
#   git sync      → ejecuta ./scripts/restauranteai-sync
#   git pushall   → push a hf + origin (útil solo en el template)

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "==> Configurando aliases git en este repo..."
echo

# git sync → ejecuta restauranteai-sync desde el directorio actual
git config alias.sync '!./scripts/restauranteai-sync'

# git pushall → push a hf + origin (solo útil en el template)
git config alias.pushall '!git push hf main && git push origin main'

echo "✅ Aliases configurados en .git/config:"
echo
git config --get-regexp '^alias\.' | sed 's/^/    /'
echo
echo "Ahora podés usar:"
echo "    git sync      → ejecuta restauranteai-sync (en cualquier directorio dentro del repo)"
echo "    git pushall   → push a hf + origin (útil solo en el template)"
