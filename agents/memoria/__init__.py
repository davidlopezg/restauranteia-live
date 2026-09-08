"""
agents/memoria — Módulo de Memoria (Archivo de Ideas + Memoria automática).

Proporciona persistencia local para ideas del usuario con almacenamiento
durable en SQLite. Los comandos se añaden en commands.py.

v4.1 — añade memoria automática del chat (triggers.py) + estado
persistente del toggle (config.py).

Exports:
  - storage functions (init_db, save_idea, load_ideas, etc.)
  - formatters (format_counter, format_idea_list, etc.)
  - commands (handle_command, get_contador_state, toggle_contador_state)
  - config (is_memoria_activa, set_memoria_activa, get_memoria_modo, etc.) — v4.1
  - triggers (analizar_mensaje, guardar_automatico, etc.) — v4.1
"""

from agents.memoria.storage import (
    init_db,
    save_idea,
    load_ideas,
    get_idea,
    edit_idea,
    delete_idea,
    delete_all_ideas,
    count_ideas,
    export_ideas,
    check_duplicate,
)
from agents.memoria.commands import handle_command, get_contador_state, toggle_contador_state
from agents.memoria import formatters
from agents.memoria import config  # v4.1
from agents.memoria import triggers  # v4.1

__all__ = [
    # storage
    "init_db",
    "save_idea",
    "load_ideas",
    "get_idea",
    "edit_idea",
    "delete_idea",
    "delete_all_ideas",
    "count_ideas",
    "export_ideas",
    "check_duplicate",
    # commands
    "handle_command",
    "get_contador_state",
    "toggle_contador_state",
    # formatters module
    "formatters",
    # v4.1 — config (toggle persistente)
    "config",
    # v4.1 — triggers (detección automática)
    "triggers",
]