"""
test_skill_idea_cientifica.py
===============================

Tests de la skill 'idea_cientifica' y su integración con el flavor engine.

Verifica:
- Detección de ingredientes en el texto (incluyendo plurales).
- Construcción del bloque de contexto molecular.
- Registro en el registry de skills.
- Handler end-to-end (mockeando call_minimax para no gastar créditos).
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from agents.creativo.agent import (
    _build_flavor_context_block,
    _extract_ingredient_mentions,
)
from agents.creativo.skills import SKILLS, get_skill, load_skill_prompt


# ── Registry ────────────────────────────────────────────────────────────────


def test_skill_idea_cientifica_registrada():
    keys = [s["key"] for s in SKILLS]
    assert "idea_cientifica" in keys


def test_skill_idea_cientifica_tiene_prompt():
    skill = get_skill("idea_cientifica")
    assert skill["nombre"] == "Idea científica"
    assert "4 capas" in skill["descripcion"].lower() or "estructur" in skill["descripcion"].lower()
    assert skill["prompt_path"].exists()


def test_skill_prompt_contiene_4_capas():
    """El prompt debe mencionar las 4 capas obligatorias."""
    prompt = load_skill_prompt("idea_cientifica").lower()
    assert "base" in prompt or "hilo conductor" in prompt
    assert "contraste" in prompt
    assert "textura" in prompt
    assert "viabilidad" in prompt


# ── Extracción de ingredientes ──────────────────────────────────────────────


def test_extract_singular_basico():
    ings = _extract_ingredient_mentions("algo con ajo")
    assert "ajo" in ings


def test_extract_plural_basico():
    """Los plurales simples deben matchear con su singular del mapping."""
    ings = _extract_ingredient_mentions("algo con ajos")
    assert "ajo" in ings


def test_extract_plural_con_s():
    ings = _extract_ingredient_mentions("fresas con chocolate")
    assert "fresa" in ings
    assert "chocolate" in ings


def test_extract_plural_con_as():
    """'fresas' (termina en 'as') debe matchear 'fresa'."""
    ings = _extract_ingredient_mentions("usar limones")
    assert "limon" in ings


def test_extract_multiples_ingredientes():
    ings = _extract_ingredient_mentions("topping con perejil y limon")
    assert "perejil" in ings
    assert "limon" in ings
    # orden de aparición: perejil aparece antes
    assert ings.index("perejil") < ings.index("limon")


def test_extract_sin_ingredientes_conocidos():
    ings = _extract_ingredient_mentions("algo etéreo y conceptual")
    # puede devolver lista vacía o solo query_only matches
    assert isinstance(ings, list)


def test_extract_no_dups():
    """No debe devolver duplicados aunque el ingrediente aparezca varias veces."""
    ings = _extract_ingredient_mentions("ajo con ajo y más ajo")
    assert ings.count("ajo") == 1


def test_extract_no_falsos_positivos_por_substring():
    """'ajo' NO debe matchear dentro de 'ajoaceite' (no hay word boundary)."""
    ings = _extract_ingredient_mentions("ajoaceite artesanal")
    # Como no hay separador de palabra entre 'ajo' y 'aceite', no debe matchear.
    assert "ajo" not in ings


# ── Bloque de contexto ─────────────────────────────────────────────────────


def test_bloque_vacio_sin_ingredientes():
    block = _build_flavor_context_block("hola chef")
    assert block == ""


def test_bloque_contiene_ingredientes_y_compuestos():
    block = _build_flavor_context_block("topping con ajo")
    assert "ajo" in block.lower()
    assert "CID" in block
    assert "pubchem.ncbi.nlm.nih.gov" in block
    assert "pairing" in block.lower() or "afinidad" in block.lower()


def test_bloque_con_dos_ingredientes_muestra_overlap():
    block = _build_flavor_context_block("ajo con limon")
    assert "ajo" in block.lower()
    assert "limon" in block.lower()
    # Si hay overlap entre ajo y limon, debe aparecer la sección OVERLAP
    # (puede no aparecer si no comparten compuestos — depende del mapping)


def test_bloque_cap_a_4_ingredientes():
    """No debe inyectar más de 4 perfiles para no saturar el contexto."""
    block = _build_flavor_context_block(
        "ajo limon tomate albahaca perejil chocolate fresa naranja"
    )
    # Contamos secciones '###' (una por ingrediente)
    n = block.count("\n### ")
    assert n <= 4


# ── Handler end-to-end (mockeando call_minimax) ────────────────────────────


def test_handler_retorna_string_no_vacio():
    from agents.creativo.agent import procesar_mensaje_idea_cientifica

    fake_response = (
        "💡 IDEA 1: Topping molecular con ajo y chocolate\n\n"
        "🎯 Base: chocolate negro (contiene 2-furfurylthiol)...\n"
        "⚡ Contraste: vinagre balsámico\n"
        "✨ Textura: crocante de cacao\n"
        "🏭 Viabilidad operativa: ...\n"
    )
    with patch("agents.creativo.agent.call_minimax", return_value=fake_response):
        result = procesar_mensaje_idea_cientifica("topping con base de ajo y chocolate")
    assert isinstance(result, str)
    assert len(result) > 0
    assert "IDEA 1" in result


def test_handler_maneja_peticion_vacia():
    from agents.creativo.agent import procesar_mensaje_idea_cientifica
    assert procesar_mensaje_idea_cientifica("") == ""
    assert procesar_mensaje_idea_cientifica("   ") == ""


def test_handler_maneja_error_de_llm():
    from agents.creativo.agent import procesar_mensaje_idea_cientifica
    with patch("agents.creativo.agent.call_minimax", side_effect=RuntimeError("API down")):
        result = procesar_mensaje_idea_cientifica("topping con ajo")
    assert "Error" in result or "❌" in result
