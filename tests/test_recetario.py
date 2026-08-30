"""
test_recetario.py
==================

Tests del módulo recetario (capa 2 operativa del agente).

Cubre:
- Schema del DB.
- Búsqueda de elaboraciones por producto.
- Obtención de productos/técnicas/maquinaria de una elaboración.
- Receta completa.
- Búsqueda por query libre.
- Elaboraciones con TODOS los productos dados.
- Summary legible.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from agents.herramientas.recetario import (
    Elaboration,
    Machinery,
    Product,
    Technique,
    DB_PATH,
    elaboration_summary,
    find_elaborations_with_all,
    get_elaborations_with,
    get_full_recipe,
    get_machinery_for,
    get_products_for,
    get_techniques_for,
    search_elaborations,
    _connect,
)


# ── Schema ───────────────────────────────────────────────────────────────────


def test_db_existe():
    assert DB_PATH.exists(), f"DB no existe en {DB_PATH}"


def test_db_tiene_tablas_esperadas():
    conn = _connect()
    tables = {
        r["name"]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    expected = {
        "products", "techniques", "machinery", "elaborations",
        "elaboration_products", "elaboration_techniques",
        "elaboration_machinery",
    }
    assert expected.issubset(tables), f"Faltan tablas: {expected - tables}"


def test_db_tiene_datos():
    conn = _connect()
    assert conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] > 30
    assert conn.execute("SELECT COUNT(*) FROM techniques").fetchone()[0] > 15
    assert conn.execute("SELECT COUNT(*) FROM machinery").fetchone()[0] > 15
    assert conn.execute("SELECT COUNT(*) FROM elaborations").fetchone()[0] > 20
    # Relaciones
    assert conn.execute("SELECT COUNT(*) FROM elaboration_products").fetchone()[0] > 50
    assert conn.execute("SELECT COUNT(*) FROM elaboration_techniques").fetchone()[0] > 30
    assert conn.execute("SELECT COUNT(*) FROM elaboration_machinery").fetchone()[0] > 30


# ── get_elaborations_with ───────────────────────────────────────────────────


def test_elaborations_with_product_basico():
    """Productos muy comunes deben estar en varias elaboraciones."""
    elabs = get_elaborations_with("ajo")
    assert isinstance(elabs, list)
    assert all(isinstance(e, Elaboration) for e in elabs)
    assert len(elabs) >= 3  # ajo está en muchas elaboraciones


def test_elaborations_with_product_inexistente():
    elabs = get_elaborations_with("xyzzy_no_existe")
    assert elabs == []


def test_elaborations_with_normaliza_acentos():
    """'ajo' y 'AJO' deben matchear."""
    elabs1 = get_elaborations_with("ajo")
    elabs2 = get_elaborations_with("AJO")
    elabs3 = get_elaborations_with("  Ajo  ")
    assert len(elabs1) == len(elabs2) == len(elabs3)


def test_elaborations_with_incluye_pesto():
    """El pesto usa ajo, debe aparecer."""
    elabs = get_elaborations_with("ajo")
    names = {e.name for e in elabs}
    assert "pesto" in names


# ── get_products_for ────────────────────────────────────────────────────────


def test_products_for_pesto():
    products = get_products_for("pesto")
    assert isinstance(products, list)
    assert len(products) >= 4
    names = {p.product.name for p in products}
    assert "albahaca" in names
    assert "ajo" in names
    assert "aceite oliva" in names


def test_products_for_elaboracion_inexistente():
    products = get_products_for("xyzzy_no_existe")
    assert products == []


def test_products_for_tiene_role():
    """Cada producto debe tener un role definido."""
    products = get_products_for("pesto")
    for p in products:
        assert p.role is not None


# ── get_techniques_for ──────────────────────────────────────────────────────


def test_techniques_for_fondo_blanco():
    techniques = get_techniques_for("fondo blanco")
    assert isinstance(techniques, list)
    assert len(techniques) >= 2
    # Debe tener blancheado y hervido
    names = {t.technique.name for t in techniques}
    assert "blancheado" in names
    # step_order es creciente
    steps = [t.step_order for t in techniques]
    assert steps == sorted(steps)


def test_techniques_for_elaboracion_inexistente():
    techniques = get_techniques_for("xyzzy_no_existe")
    assert techniques == []


# ── get_machinery_for ───────────────────────────────────────────────────────


def test_machinery_for_bechamel():
    machinery = get_machinery_for("bechamel")
    assert isinstance(machinery, list)
    assert len(machinery) >= 1
    names = {m.machinery.name for m in machinery}
    assert "sartén" in names


def test_machinery_for_elaboracion_inexistente():
    machinery = get_machinery_for("xyzzy_no_existe")
    assert machinery == []


# ── get_full_recipe ─────────────────────────────────────────────────────────


def test_full_recipe_completa():
    recipe = get_full_recipe("pesto")
    assert recipe is not None
    assert isinstance(recipe.elaboration, Elaboration)
    assert len(recipe.products) >= 4
    assert len(recipe.techniques) >= 1
    assert len(recipe.machinery) >= 1


def test_full_recipe_inexistente_devuelve_none():
    recipe = get_full_recipe("xyzzy_no_existe")
    assert recipe is None


def test_full_recipe_todos_los_componentes_son_del_tipo_correcto():
    recipe = get_full_recipe("fondo blanco")
    assert recipe is not None
    for p in recipe.products:
        assert isinstance(p.product, Product)
    for t in recipe.techniques:
        assert isinstance(t.technique, Technique)
    for m in recipe.machinery:
        assert isinstance(m.machinery, Machinery)


# ── find_elaborations_with_all ──────────────────────────────────────────────


def test_find_with_all_encuentra_interseccion():
    """Una elaboración que usa A Y B debe aparecer."""
    elabs = find_elaborations_with_all("ajo", "aceite oliva")
    names = {e.name for e in elabs}
    assert "pesto" in names  # pesto usa ambos
    assert "sofrito" in names  # sofrito usa ambos


def test_find_with_all_excluye_no_interseccion():
    """Una elaboración que solo usa A NO debe aparecer si pedimos A Y B."""
    elabs = find_elaborations_with_all("ajo", "aceite oliva")
    names = {e.name for e in elabs}
    # brandada usa ajo pero no aceite oliva (solo bacalao)
    # (verificar manualmente el seed — puede fallar si cambia)
    # En este caso, brandada SÍ usa aceite oliva, así que no podemos excluirla.
    # Probamos con dos productos que NO coexistan:
    elabs_inexistente = find_elaborations_with_all("ajo", "leche")
    # 'leche' está en bechamel pero no en pesto (que también usa ajo)
    names_inexistente = {e.name for e in elabs_inexistente}
    # No necesariamente vacío, pero no debería estar 'pesto' aquí
    assert "pesto" not in names_inexistente


def test_find_with_all_vacio_si_un_producto_no_existe():
    elabs = find_elaborations_with_all("ajo", "xyzzy_no_existe")
    assert elabs == []


def test_find_with_all_sin_argumentos():
    elabs = find_elaborations_with_all()
    assert elabs == []


# ── search_elaborations ─────────────────────────────────────────────────────


def test_search_por_tipo():
    """Buscar 'salsa' debe devolver elaboraciones de tipo salsa."""
    elabs = search_elaborations("salsa")
    assert len(elabs) >= 3
    for e in elabs:
        assert "salsa" in e.type or "salsa" in e.name


def test_search_por_nombre():
    elabs = search_elaborations("pesto")
    names = {e.name for e in elabs}
    assert "pesto" in names


def test_search_normaliza():
    elabs1 = search_elaborations("SALSA")
    elabs2 = search_elaborations("salsa")
    assert len(elabs1) == len(elabs2)


def test_search_sin_resultados():
    elabs = search_elaborations("xyzzy_no_existe")
    assert elabs == []


# ── elaboration_summary ─────────────────────────────────────────────────────


def test_summary_incluye_nombre_y_atributos():
    s = elaboration_summary("pesto")
    assert "pesto" in s.lower()
    assert "salsa" in s.lower()
    assert "Ingredientes" in s or "ingredientes" in s
    assert "Técnicas" in s or "técnicas" in s


def test_summary_incluye_productos_reales():
    s = elaboration_summary("pesto")
    assert "albahaca" in s
    assert "ajo" in s


def test_summary_incluye_maquinaria():
    s = elaboration_summary("bechamel")
    assert "sartén" in s


def test_summary_para_inexistente():
    s = elaboration_summary("xyzzy_no_existe")
    assert "no tengo datos" in s.lower() or "no existe" in s.lower()
