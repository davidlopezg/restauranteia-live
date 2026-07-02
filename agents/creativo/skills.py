"""
skills.py — Registry de skills del Chef Creativo.

Cada skill tiene:
  - key: identificador único (snake_case)
  - nombre: nombre visible para el usuario
  - descripcion: una línea para tooltip / opción de UI
  - prompt_path: ruta al archivo .md con el system prompt
  - ejemplos: lista de peticiones de ejemplo (para mostrar en UI)

Para agregar una skill nueva:
  1. Crear el archivo .md en prompts/system_<nombre>.md
  2. Agregar el dict en SKILLS
  3. Commit + push

El registro es una lista cerrada y explícita. No se descubren skills por filesystem
ni por convención de nombres — eso evita magia y mantiene auditabilidad.
"""

from __future__ import annotations

from pathlib import Path

PROMPTS_DIR = Path(__file__).parent / "prompts"


SKILLS: list[dict] = [
    {
        "key": "ficha",
        "nombre": "Ficha técnica",
        "descripcion": "Genera la ficha estructurada del plato (nombre, historia, ficha técnica, maridaje, prompt de imagen).",
        "prompt_path": PROMPTS_DIR / "system_chef.md",
        "ejemplos": [
            "Entrante vegetariano con calabaza y queso de cabra",
            "Postre con chocolate y aceite de oliva",
            "Principal de carne para menú degustación de 7 pasos",
            "Plato de verano con tomate y anchoas",
            "Risotto de setas con trufa, para noche de gala",
        ],
    },
    {
        "key": "proceso_creativo",
        "nombre": "Proceso creativo",
        "descripcion": "Muestra paso a paso cómo pensás el plato (alma, métodos creativos, equilibrio, técnica, alternativas descartadas) y luego la ficha final.",
        "prompt_path": PROMPTS_DIR / "system_proceso_creativo.md",
        "ejemplos": [
            "Pasta fresca con pesto y ragout de costilla",
            "Postre con fresas, albahaca y vinagre balsámico",
            "Tarta tibia de manzana con helado de avellana",
            "Principal vegano con garbanzos, berenjena y ras el hanout",
            "Pizza contemporánea con masa de fermentación larga y toppings de temporada",
        ],
    },
    {
        "key": "ideas_creativas",
        "nombre": "Ideas creativas",
        "descripcion": "Genera 10 ideas creativas que encajen con tu restaurante (ticket, línea, carta actual). Después podés aplicar métodos creativos de ElBulli para refinar, o convertir una idea en ficha.",
        "prompt_path": PROMPTS_DIR / "system_ideas_creativas.md",
        "ejemplos": [
            "Ideas para menú de otoño",
            "Ideas para renovar la sección de postres",
            "Ideas para un hueco de la carta (postres con chocolate)",
            "Ideas de temporada con producto local",
            "Ideas de pizzas contemporáneas para la carta de primavera",
        ],
    },
    {
        "key": "chat",
        "nombre": "Chat con el chef",
        "descripcion": "Conversación libre con el chef. Hacele preguntas sobre producto, técnica, carta, estacionalidad, proveedores — usa todo el contexto del restaurante.",
        "prompt_path": PROMPTS_DIR / "system_chat.md",
        "ejemplos": [
            "¿Qué te parece la alcachofa a la brasa como entrante de primavera?",
            "Estoy pensando en sacar el tartar de la carta, ¿qué opinás?",
            "¿Cómo maridás un risotto de setas con algo que no sea el clásico Barolo?",
            "Tengo un cliente con celiaquía estricta, ¿qué puedo ofrecerle como principal?",
            "¿Vale la pena meter cócteles sin alcohol en la carta de verano?",
        ],
    },
]


def get_skill(key: str) -> dict:
    """Devuelve la skill por key. Lanza KeyError si no existe."""
    for s in SKILLS:
        if s["key"] == key:
            return s
    disponibles = ", ".join(s["key"] for s in SKILLS)
    raise KeyError(
        f"Skill '{key}' no existe. Skills disponibles: {disponibles}"
    )


def list_skills() -> list[dict]:
    """Devuelve la lista completa de skills (para construir UIs dinámicas)."""
    return SKILLS


def load_skill_prompt(key: str) -> str:
    """Carga el contenido del system prompt de una skill desde su .md."""
    skill = get_skill(key)
    path = skill["prompt_path"]
    if not path.exists():
        raise FileNotFoundError(
            f"No se encontró el prompt de la skill '{key}' en {path}. "
            f"Asegúrate de que el archivo existe."
        )
    return path.read_text(encoding="utf-8")


def skill_names_for_ui() -> list[tuple[str, str]]:
    """
    Devuelve lista de (key, nombre) para usar en componentes Gradio tipo Radio/Dropdown.
    El usuario ve el nombre, el código usa la key.
    """
    return [(s["key"], s["nombre"]) for s in SKILLS]


def skill_examples(key: str) -> list[str]:
    """Devuelve los ejemplos de una skill."""
    return list(get_skill(key).get("ejemplos", []))