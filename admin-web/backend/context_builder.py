"""
Context Builder: construye el contexto que se envia a la IA.

El contexto es EXPLICITO y AUDITABLE:
- Que producto es
- De donde viene
- Cual es la receta
- Que pruebas hubo y que resultado dieron
- Que feedback hubo
- Que modificaciones se hicieron
- Que vajilla hay disponible
- Que restricciones aplican

La IA NO modifica nada. Solo propone.
"""
import json
from typing import Optional

import supabase_client as sb
from config import config


SYSTEM_PROMPT_PLATING = """Eres un chef creativo senior y estilista gastronomico.
Tu trabajo: proponer emplatado para un plato de una pizzeria mediterranea en Cataluna.

REGLAS:
1. NO modificar la receta. Solo proponer como PRESENTAR el plato.
2. Las 3 propuestas deben ser DIFERENCIADAS entre si (no variaciones de lo mismo).
3. Tono profesional pero conciso. Nada de floritura innecesaria.
4. Considera las restricciones del restaurante.
5. Responde UNICAMENTE con JSON valido (sin texto antes ni despues).
"""


SYSTEM_PROMPT_WARE = """Eres un chef + estilista gastronomico.
Tu trabajo: proponer que vajilla del inventario disponible usar para emplatar un plato.

REGLAS:
1. SOLO usa piezas del inventario proporcionado. No inventes vajilla.
2. Las 3 propuestas deben ser DIFERENCIADAS entre si.
3. Cada propuesta debe ser PRACTICA (no decorativa).
4. Explica por que cada pieza encaja con el plato y el estilo.
5. Responde UNICAMENTE con JSON valido (sin texto antes ni despues).
"""


def build_plating_context(catalogo_id: str) -> dict:
    """
    Construye contexto completo para propuesta de emplatado.

    Devuelve dict con toda la informacion relevante.
    Tambien devuelve el system_prompt y user_prompt ya construidos.
    """
    # Producto
    catalogo = sb.query(
        f"SELECT id, titulo, categorias, ingredientes, receta_estructurada, "
        f"estado, precio FROM {config.TABLE_CATALOGOS} WHERE id = '{catalogo_id}' LIMIT 1"
    )
    if not catalogo:
        raise ValueError(f"Producto no encontrado: {catalogo_id}")
    cat = catalogo[0]

    # Agenda origen (si existe)
    agenda = sb.query(
        f"SELECT a.id, a.titulo, a.objetivo, a.estado_desarrollo, a.receta_final, a.timeline "
        f"FROM {config.TABLE_AGENDAS} a "
        f"JOIN {config.TABLE_AGENDA_CATALOGO} ac ON ac.agenda_id = a.id "
        f"WHERE ac.catalogo_id = '{catalogo_id}' LIMIT 1"
    )
    ag = agenda[0] if agenda else None

    # Pruebas (si hay agenda)
    pruebas = []
    if ag:
        tests = sb.query(
            f"SELECT numero, estado, fecha, objetivo, resultado, observaciones "
            f"FROM {config.TABLE_DEV_TESTS} WHERE agenda_id = '{ag['id']}' "
            f"ORDER BY numero ASC LIMIT 20"
        )
        for t in tests:
            # Feedback de cada prueba
            fb = sb.query(
                f"SELECT mesa, num_personas, valoracion, criterio, observacion "
                f"FROM {config.DB_SCHEMA}.test_feedback WHERE test_id IN "
                f"(SELECT id FROM {config.DB_SCHEMA}.development_tests "
                f"WHERE agenda_id = '{ag['id']}' AND numero = {t['numero']}) LIMIT 5"
            )
            pruebas.append({**t, "feedbacks": fb})

    # Vajilla disponible
    ware = sb.query(
        f"SELECT id, nombre, tipo, material, color, forma, tamano FROM {config.DB_SCHEMA}.ware "
        f"WHERE disponibilidad = true ORDER BY tipo, nombre"
    )

    # Construir contexto estructurado
    contexto = {
        "producto": {
            "titulo": cat.get("titulo"),
            "categorias": cat.get("categorias"),
            "estado": cat.get("estado"),
            "precio": cat.get("precio"),
            "ingredientes": cat.get("ingredientes"),
            "receta_estructurada": cat.get("receta_estructurada"),
        },
        "agenda_origen": {
            "titulo": ag.get("titulo") if ag else None,
            "objetivo": ag.get("objetivo") if ag else None,
            "estado_desarrollo": ag.get("estado_desarrollo") if ag else None,
            "receta_final": ag.get("receta_final") if ag else None,
            "timeline": ag.get("timeline") if ag else None,
        } if ag else None,
        "historial_pruebas": pruebas if pruebas else [],
        "vajilla_disponible": ware if ware else [],
        "restricciones_restaurante": [
            "Restaurante abierto viernes + sabado",
            "Ticket medio objetivo: 20-25 EUR",
            "Emplatado debe estar listo en <= 6 minutos desde pedido",
            "Vajilla disponible solo del inventario (ver arriba)",
        ],
    }

    # System prompt + user prompt
    user_prompt = f"""CONTEXTO DEL PRODUCTO:

{json.dumps(contexto, indent=2, ensure_ascii=False, default=str)}

TAREA:
Genera 3 propuestas DIFERENCIADAS de emplatado para este plato.

FORMATO DE RESPUESTA (JSON estricto, nada mas):
[
  {{
    "nombre": "Nombre corto de la propuesta",
    "descripcion": "2-3 frases describiendo como se presenta el plato",
    "vajilla_sugerida": "tipo de pieza recomendada (plato, bowl, tabla, etc.)",
    "razonamiento": "por que este emplatado encaja con el producto y el restaurante"
  }},
  {{...segunda propuesta...}},
  {{...tercera propuesta...}}
]
"""

    return {
        "system_prompt": SYSTEM_PROMPT_PLATING,
        "user_prompt": user_prompt,
        "contexto": contexto,
    }


def build_ware_context(catalogo_id: str, plating_proposal_id: str) -> dict:
    """Construye contexto para propuesta de vajilla."""
    # Producto
    catalogo = sb.query(
        f"SELECT id, titulo, categorias, ingredientes, receta_estructurada "
        f"FROM {config.TABLE_CATALOGOS} WHERE id = '{catalogo_id}' LIMIT 1"
    )
    if not catalogo:
        raise ValueError(f"Producto no encontrado: {catalogo_id}")
    cat = catalogo[0]

    # Propuesta de emplatado elegida
    proposal = sb.query(
        f"SELECT id, nombre, descripcion, vajilla_sugerida "
        f"FROM {config.DB_SCHEMA}.plating_proposals "
        f"WHERE id = '{plating_proposal_id}' LIMIT 1"
    )
    if not proposal:
        raise ValueError(f"Propuesta de emplatado no encontrada: {plating_proposal_id}")
    prop = proposal[0]

    # Inventario de vajilla
    ware = sb.query(
        f"SELECT id, nombre, tipo, marca, material, color, forma, tamano "
        f"FROM {config.DB_SCHEMA}.ware WHERE disponibilidad = true "
        f"ORDER BY tipo, nombre"
    )

    contexto = {
        "producto": cat,
        "emplatado_elegido": prop,
        "inventario_vajilla": ware,
        "restricciones": [
            "Usar SOLO piezas del inventario",
            "Las 3 propuestas deben ser DIFERENCIADAS entre si",
        ],
    }

    user_prompt = f"""CONTEXTO:

{json.dumps(contexto, indent=2, ensure_ascii=False, default=str)}

TAREA:
Elige 3 combinaciones DIFERENTES de vajilla del inventario para este plato.

FORMATO DE RESPUESTA (JSON estricto):
[
  {{
    "nombre": "Nombre de la combinacion (ej: Servicio clasico de pizzeria)",
    "piezas": ["nombre EXACTO de pieza 1", "nombre EXACTO de pieza 2", "..."],
    "explicacion": "Por que cada pieza encaja con el plato y el emplatado elegido"
  }},
  {{...segunda combinacion...}},
  {{...tercera combinacion...}}
]
IMPORTANTE: usa los nombres EXACTOS de las piezas del inventario."""

    return {
        "system_prompt": SYSTEM_PROMPT_WARE,
        "user_prompt": user_prompt,
        "contexto": contexto,
    }


def parse_json_strict(text: str) -> list:
    """Parsea JSON de la respuesta de la IA, tolerando markdown."""
    import re
    # Quitar markdown code blocks
    text = re.sub(r"^```(?:json)?\s*", "", text.strip())
    text = re.sub(r"\s*```$", "", text.strip())
    # Intentar parsear directo
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Buscar el primer [...] o {...} en el texto
    m = re.search(r"\[.*\]|\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    raise ValueError(f"No se pudo parsear JSON de la respuesta IA: {text[:200]}")
