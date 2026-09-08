#!/bin/bash
# probar_app.sh — Verifica que la app arranca y todo está en orden.
#
# Uso:
#   chmod +x scripts/probar_app.sh
#   ./scripts/probar_app.sh
#
# Requiere: .env con MINIMAX_API_KEY (al menos).

set -e
cd "$(dirname "$0")/.."

echo "=== 1. Verificar .env ==="
python -c "
from dotenv import load_dotenv; load_dotenv()
import os
assert os.getenv('MINIMAX_API_KEY'), 'Falta MINIMAX_API_KEY en .env'
print('✓ .env OK')
"

echo ""
echo "=== 2. Suite de tests ==="
python -m pytest tests/ -q 2>&1 | tail -3

echo ""
echo "=== 3. Parser del Proceso Creativo ==="
python -c "
from agents.creativo.proceso_creativo_md import parse_proceso_creativo_md
fases = parse_proceso_creativo_md()
assert len(fases) == 7, f'Esperaba 7 fases, encontré {len(fases)}'
print(f'✓ {len(fases)} fases cargadas del .md')
print('  Keys:', ', '.join(f['key'] for f in fases))
"

echo ""
echo "=== 4. Paths del conocimiento ==="
python -c "
from agents.knowledge_context import KNOWLEDGE_DIR, RESTAURANTE_PATH, CATALOGO_PATH
from agents.creativo.skills import PROMPTS_DIR
from agents.creativo.sessions import SESSIONS_DIR
print(f'✓ KNOWLEDGE_DIR: {KNOWLEDGE_DIR}')
print(f'✓ RESTAURANTE_PATH: {RESTAURANTE_PATH}')
print(f'✓ CATALOGO_PATH: {CATALOGO_PATH}')
print(f'✓ SESSIONS_DIR: {SESSIONS_DIR}')
print(f'✓ PROMPTS_DIR: {PROMPTS_DIR}')
"

echo ""
echo "=== 5. Estado de git ==="
git log --oneline -3

echo ""
echo "=== Listo para arrancar ==="
echo "Para arrancar la app: python app.py"
echo "URL: http://localhost:7860"