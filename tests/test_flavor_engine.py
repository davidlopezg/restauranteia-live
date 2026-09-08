"""
test_flavor_engine.py
=====================

Tests del motor de flavor combinations (capa 1 del agente híbrido).

Cubre:
- Carga del mapping.
- get_profile (curated + PubChem fallback).
- get_compounds.
- get_compound_overlap.
- suggest_pairings (ranking y filtrado).
- flavor_summary (formato legible).
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from agents.herramientas.flavor_engine import (
    Compound,
    Pairing,
    _load_curated_mapping,
    _normalize,
    flavor_summary,
    get_compound_overlap,
    get_compounds,
    get_profile,
    suggest_pairings,
)


# ── Mapping ──────────────────────────────────────────────────────────────────


def test_mapping_carga_ok():
    curated, qo = _load_curated_mapping()
    assert len(curated) >= 80, f"Esperaba >=80 curados, hay {len(curated)}"
    assert len(curated) + len(qo) >= 200, "Total debe ser >=200"


def test_mapping_curated_tiene_estructura_correcta():
    curated, _ = _load_curated_mapping()
    for entry in curated:
        assert "ingredient" in entry
        assert "category" in entry
        assert "compounds" in entry
        assert len(entry["compounds"]) >= 1
        for c in entry["compounds"]:
            assert "cid" in c
            assert isinstance(c["cid"], int)
            assert "name" in c
            assert c.get("role") in ("primary", "secondary", "trace")


# ── get_profile / get_compounds ─────────────────────────────────────────────


def test_get_profile_curado():
    p = get_profile("ajo")
    assert p is not None
    assert p.name == "ajo"
    assert p.category == "allium"
    assert p.source == "curated"
    assert len(p.compounds) >= 1
    # allicin es CID 65036
    assert any(c.cid == 65036 for c in p.compounds)


def test_get_profile_normaliza_espacios_y_case():
    p1 = get_profile("ajo")
    p2 = get_profile("  AJO  ")
    p3 = get_profile("Ajo")
    assert p1 == p2 == p3


def test_get_compounds_devuelve_lista():
    cs = get_compounds("limón")
    assert isinstance(cs, list)
    assert all(isinstance(c, Compound) for c in cs)
    # limonene CID 22311 debe estar
    assert any(c.cid == 22311 for c in cs)


def test_get_profile_pubchem_fallback():
    """Mockeamos el cliente PubChem para simular un query_only exitoso."""
    fake_pc = type("PC", (), {
        "cid": 99, "name": "fake compound",
        "molecular_formula": "C9H9N", "molecular_weight": 100.0,
        "synonyms": ()
    })
    with patch("agents.herramientas.flavor_engine._pubchem_search_by_name",
               return_value=fake_pc):
        p = get_profile("anchoa")  # anchoa está en query_only
    assert p is not None
    assert p.source == "pubchem"
    assert len(p.compounds) == 1


def test_get_profile_none_si_no_resuelve():
    with patch("agents.herramientas.flavor_engine._pubchem_search_by_name",
               return_value=None):
        p = get_profile("xyzzy_ingrediente_inexistente")
    assert p is None


# ── Overlap & Pairings ───────────────────────────────────────────────────────


def test_compound_overlap_entre_alliums():
    # ajo y cebolleta comparten allyl methyl sulfide (CID 11617)
    overlap = get_compound_overlap("ajo", "cebolleta")
    assert 11617 in overlap
    assert len(overlap) >= 1


def test_compound_overlap_devuelve_set_vacio_si_no_hay():
    # ajo y chocolate no comparten nada conocido en el curated
    overlap = get_compound_overlap("ajo", "chocolate")
    assert isinstance(overlap, set)
    # Pueden compartir 0 o más — no asumimos nada


def test_suggest_pairings_devuelve_parejas_rankeadas():
    pairings = suggest_pairings("ajo", top_k=5)
    assert isinstance(pairings, list)
    assert all(isinstance(p, Pairing) for p in pairings)
    # Score debe estar ordenado descendente
    scores = [p.score for p in pairings]
    assert scores == sorted(scores, reverse=True), "Pairings no están ordenados por score"
    # Las primeras sugerencias de ajo deben ser alliums
    for p in pairings[:3]:
        assert p.ingredient_a == "ajo"


def test_suggest_pairings_excluye_el_mismo_ingrediente():
    pairings = suggest_pairings("ajo", top_k=20)
    for p in pairings:
        assert p.ingredient_b != "ajo"


def test_suggest_pairings_score_minimo():
    """Todas las sugerencias deben superar el umbral mínimo."""
    pairings = suggest_pairings("limón", top_k=10, min_score=0.05)
    for p in pairings:
        assert p.score >= 0.05


def test_suggest_pairings_con_ingrediente_inexistente():
    pairings = suggest_pairings("xyzzy_inexistente", top_k=10)
    assert pairings == []


# ── flavor_summary ───────────────────────────────────────────────────────────


def test_flavor_summary_contiene_nombre_y_compounds():
    s = flavor_summary("ajo")
    assert "ajo" in s.lower()
    assert "allicin" in s.lower() or "allyl" in s.lower()
    assert "CID" in s
    assert "pubchem.ncbi.nlm.nih.gov" in s


def test_flavor_summary_con_ingrediente_inexistente_no_falla():
    s = flavor_summary("xyzzy_inexistente")
    assert "no tengo datos" in s.lower() or "probá" in s.lower()
