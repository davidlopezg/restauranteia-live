#!/usr/bin/env bash
# Arranca la aplicación completa en uso normal:
# 1. Si no existe admin-web-frontend/dist/index.html → hace npm install + build.
# 2. Levanta FastAPI que sirve dist/ + /api/* + /docs/*.
#
# Uso: ./start.sh
# Abre la app en: http://127.0.0.1:8765
#
# Para desarrollo con HMR: cd admin-web-frontend && npm run dev (en otra terminal)
# y deja este script corriendo para el backend.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DIST="$ROOT/admin-web-frontend/dist"
BACKEND_DIR="$ROOT/admin-web/backend"

# Sanity checks
[ -d "$ROOT/admin-web-frontend" ] || { echo "ERROR: falta admin-web-frontend/"; exit 1; }
[ -d "$BACKEND_DIR" ] || { echo "ERROR: falta admin-web/backend/"; exit 1; }

# Build solo si no existe dist/index.html (asume deps ya instaladas).
if [ ! -f "$DIST/index.html" ]; then
    echo "→ dist/ no existe. Construyendo frontend por primera vez..."
    cd "$ROOT/admin-web-frontend"
    if [ ! -d node_modules ]; then
        echo "→ Instalando dependencias (puede tardar unos minutos)..."
        npm install --no-audit --no-fund --loglevel=error
    fi
    npm run build
    cd "$ROOT"
    echo "✓ Build completado en admin-web-frontend/dist/"
else
    echo "→ dist/ ya existe. Si quieres forzar rebuild: rm -rf admin-web-frontend/dist && ./start.sh"
fi

# Aviso si falta .env (no bloquea, pero el backend fallará al primer query real).
if [ ! -f "$BACKEND_DIR/.env" ] && [ -f "$BACKEND_DIR/.env.example" ]; then
    echo "⚠ Falta admin-web/backend/.env — copia de .env.example y rellena credenciales Supabase."
fi

echo ""
echo "→ Arrancando FastAPI en http://127.0.0.1:8765 (Ctrl+C para parar)"
echo ""
cd "$BACKEND_DIR"
exec python main.py
