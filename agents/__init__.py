"""
agents — paquete de agentes con bootstrap automático del contexto compartido.

Cualquier agente del proyecto comparte `conocimiento/interno_restaurante/` (gestionádo por
`agents/knowledge_context.py`). La fase init es idempotente y se corre solo
la primera vez.

Uso típico en un nuevo agente (entry point):

    from agents.knowledge_context import ensure_initialized, cargar_restaurante

    # Si falta el init, lo corre interactivamente.
    # Si ya estaba inicializado, no pregunta nada.
    ensure_initialized()

    # Cargar contexto ya disponible para todos los agentes.
    restaurante = cargar_restaurante()
"""

from agents.knowledge_context import (
    bootstrap_necesario,
    cargar_restaurante,
    cargar_catalogo,
    ensure_initialized,
)

__all__ = [
    "bootstrap_necesario",
    "cargar_restaurante",
    "cargar_catalogo",
    "ensure_initialized",
]
