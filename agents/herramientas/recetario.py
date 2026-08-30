"""
recetario.py
=============

API Python para el recetario del agente Chef Creativo (capa 2 operativa).

El recetario es una base SQLite con 4 entidades principales y 3 relaciones
many-to-many:

    products             ←→  elaboration_products  ←→  elaborations
    techniques           ←→  elaboration_techniques ←→  ┘
    machinery            ←→  elaboration_machinery  ←→  ┘

Esta capa responde preguntas del estilo:
- "¿Qué elaboraciones puedo hacer con X?"
- "¿Qué técnicas se usan en Y?"
- "¿Qué maquinaria necesito para Z?"
- "¿Hay alguna elaboración que use Q y R?"

API pública:
- get_elaborations_with(product)        → list[Elaboration]
- get_techniques_for(elaboration)        → list[Technique]
- get_machinery_for(elaboration)         → list[Machinery]
- get_products_for(elaboration)          → list[ProductWithRole]
- get_full_recipe(elaboration)           → dict con todo
- elaboration_summary(name)              → str legible para el LLM
- search_elaborations(query)              → list[Elaboration] (por nombre/tipo)

Diseñado mobile-first:
- SQLite local embebido (cero dependencias de red).
- <2 MB total.
- Reads-only (no writes en runtime — el seed es la fuente de verdad).
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

# ── Paths ────────────────────────────────────────────────────────────────────

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = (
    _PROJECT_ROOT
    / "conocimiento"
    / "interno_app"
    / "recursos"
    / "recetario.db"
)


# ── Tipos públicos ───────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Product:
    id: int
    name: str
    category: str
    subcategory: Optional[str]
    season: Optional[str]
    notes: Optional[str]


@dataclass(frozen=True)
class Technique:
    id: int
    name: str
    family: str
    description: Optional[str]
    difficulty: Optional[str]


@dataclass(frozen=True)
class Machinery:
    id: int
    name: str
    type: str
    capacity: Optional[str]
    power: Optional[str]
    notes: Optional[str]


@dataclass(frozen=True)
class Elaboration:
    id: int
    name: str
    type: str
    description: Optional[str]
    yield_: Optional[str]
    prep_time_min: Optional[int]
    difficulty: Optional[str]
    notes: Optional[str]


@dataclass(frozen=True)
class ProductWithRole:
    """Producto en una elaboración, con su rol y cantidad."""
    product: Product
    quantity: Optional[str]
    unit: Optional[str]
    role: Optional[str]


@dataclass(frozen=True)
class TechniqueWithStep:
    """Técnica en una elaboración, con paso y duración."""
    technique: Technique
    step_order: int
    duration_min: Optional[int]
    notes: Optional[str]


@dataclass(frozen=True)
class MachineryWithStep:
    """Maquinaria en una elaboración, con paso y notas."""
    machinery: Machinery
    step_order: Optional[int]
    usage_notes: Optional[str]


@dataclass(frozen=True)
class FullRecipe:
    """Receta completa de una elaboración."""
    elaboration: Elaboration
    products: tuple[ProductWithRole, ...]
    techniques: tuple[TechniqueWithStep, ...]
    machinery: tuple[MachineryWithStep, ...]


# ── Conexión a SQLite (cached) ───────────────────────────────────────────────


@lru_cache(maxsize=1)
def _connect() -> sqlite3.Connection:
    """Abre la DB una sola vez y la cachea. Modo row factory para acceder por nombre."""
    if not DB_PATH.exists():
        raise FileNotFoundError(
            f"Recetario DB no existe en {DB_PATH}. "
            f"Ejecutá: python scripts/seed_recetario.py"
        )
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    # Foreign keys ON (cascade)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _row_to_product(row: sqlite3.Row) -> Product:
    return Product(
        id=row["id"],
        name=row["name"],
        category=row["category"],
        subcategory=row["subcategory"],
        season=row["season"],
        notes=row["notes"],
    )


def _row_to_technique(row: sqlite3.Row) -> Technique:
    return Technique(
        id=row["id"],
        name=row["name"],
        family=row["family"],
        description=row["description"],
        difficulty=row["difficulty"],
    )


def _row_to_machinery(row: sqlite3.Row) -> Machinery:
    return Machinery(
        id=row["id"],
        name=row["name"],
        type=row["type"],
        capacity=row["capacity"],
        power=row["power"],
        notes=row["notes"],
    )


def _row_to_elaboration(row: sqlite3.Row) -> Elaboration:
    return Elaboration(
        id=row["id"],
        name=row["name"],
        type=row["type"],
        description=row["description"],
        yield_=row["yield"],
        prep_time_min=row["prep_time_min"],
        difficulty=row["difficulty"],
        notes=row["notes"],
    )


# ── Helpers de búsqueda ─────────────────────────────────────────────────────


def _normalize(s: str) -> str:
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", s.strip().lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c)).strip()


def _resolve_product_id(name: str, conn: sqlite3.Connection) -> Optional[int]:
    """Busca un producto por nombre (case-insensitive, accent-insensitive)."""
    target = _normalize(name)
    for row in conn.execute("SELECT id, name FROM products"):
        if _normalize(row["name"]) == target:
            return row["id"]
    return None


def _resolve_elaboration_id(name: str, conn: sqlite3.Connection) -> Optional[int]:
    target = _normalize(name)
    for row in conn.execute("SELECT id, name FROM elaborations"):
        if _normalize(row["name"]) == target:
            return row["id"]
    return None


# ── API pública ──────────────────────────────────────────────────────────────


def get_elaborations_with(product_name: str) -> list[Elaboration]:
    """
    Devuelve todas las elaboraciones que usan el producto dado.

    Args:
        product_name: nombre del producto (case/accent insensitive).

    Returns:
        Lista de elaboraciones. Vacía si el producto no existe.
    """
    conn = _connect()
    pid = _resolve_product_id(product_name, conn)
    if pid is None:
        return []
    rows = conn.execute(
        """
        SELECT e.*
        FROM elaborations e
        JOIN elaboration_products ep ON ep.elaboration_id = e.id
        WHERE ep.product_id = ?
        ORDER BY e.type, e.name
        """,
        (pid,),
    ).fetchall()
    return [_row_to_elaboration(r) for r in rows]


def get_products_for(elaboration_name: str) -> list[ProductWithRole]:
    """Devuelve los productos usados en una elaboración, con su rol y cantidad."""
    conn = _connect()
    eid = _resolve_elaboration_id(elaboration_name, conn)
    if eid is None:
        return []
    rows = conn.execute(
        """
        SELECT p.*, ep.quantity, ep.unit, ep.role
        FROM products p
        JOIN elaboration_products ep ON ep.product_id = p.id
        WHERE ep.elaboration_id = ?
        ORDER BY ep.role, p.name
        """,
        (eid,),
    ).fetchall()
    return [
        ProductWithRole(
            product=_row_to_product(r),
            quantity=r["quantity"],
            unit=r["unit"],
            role=r["role"],
        )
        for r in rows
    ]


def get_techniques_for(elaboration_name: str) -> list[TechniqueWithStep]:
    """Devuelve las técnicas usadas en una elaboración, ordenadas por paso."""
    conn = _connect()
    eid = _resolve_elaboration_id(elaboration_name, conn)
    if eid is None:
        return []
    rows = conn.execute(
        """
        SELECT t.*, et.step_order, et.duration_min, et.notes
        FROM techniques t
        JOIN elaboration_techniques et ON et.technique_id = t.id
        WHERE et.elaboration_id = ?
        ORDER BY et.step_order
        """,
        (eid,),
    ).fetchall()
    return [
        TechniqueWithStep(
            technique=_row_to_technique(r),
            step_order=r["step_order"],
            duration_min=r["duration_min"],
            notes=r["notes"],
        )
        for r in rows
    ]


def get_machinery_for(elaboration_name: str) -> list[MachineryWithStep]:
    """Devuelve la maquinaria usada en una elaboración, ordenada por paso."""
    conn = _connect()
    eid = _resolve_elaboration_id(elaboration_name, conn)
    if eid is None:
        return []
    rows = conn.execute(
        """
        SELECT m.*, em.step_order, em.usage_notes
        FROM machinery m
        JOIN elaboration_machinery em ON em.machinery_id = m.id
        WHERE em.elaboration_id = ?
        ORDER BY em.step_order
        """,
        (eid,),
    ).fetchall()
    return [
        MachineryWithStep(
            machinery=_row_to_machinery(r),
            step_order=r["step_order"],
            usage_notes=r["usage_notes"],
        )
        for r in rows
    ]


def get_full_recipe(elaboration_name: str) -> Optional[FullRecipe]:
    """
    Devuelve la receta completa: elaboración + productos + técnicas + maquinaria.

    Returns:
        FullRecipe o None si la elaboración no existe.
    """
    conn = _connect()
    eid = _resolve_elaboration_id(elaboration_name, conn)
    if eid is None:
        return None
    elab_row = conn.execute(
        "SELECT * FROM elaborations WHERE id = ?", (eid,)
    ).fetchone()
    if not elab_row:
        return None
    return FullRecipe(
        elaboration=_row_to_elaboration(elab_row),
        products=tuple(get_products_for(elaboration_name)),
        techniques=tuple(get_techniques_for(elaboration_name)),
        machinery=tuple(get_machinery_for(elaboration_name)),
    )


def search_elaborations(query: str) -> list[Elaboration]:
    """
    Busca elaboraciones por nombre o tipo (case/accent insensitive).
    Útil cuando el usuario dice "salsas" o "fondos".
    """
    conn = _connect()
    target = _normalize(query)
    results = []
    for row in conn.execute("SELECT * FROM elaborations ORDER BY name"):
        if target in _normalize(row["name"]) or target in _normalize(row["type"]):
            results.append(_row_to_elaboration(row))
    return results


def find_elaborations_with_all(*products: str) -> list[Elaboration]:
    """
    Devuelve las elaboraciones que usan TODOS los productos dados.
    Útil para "¿qué puedo hacer con X, Y y Z?".
    """
    if not products:
        return []
    conn = _connect()
    pids = []
    for p in products:
        pid = _resolve_product_id(p, conn)
        if pid is None:
            return []  # Si alguno no existe, no hay matches
        pids.append(pid)
    # Placeholders dinámicos
    placeholders = ",".join("?" * len(pids))
    rows = conn.execute(
        f"""
        SELECT e.*
        FROM elaborations e
        WHERE e.id IN (
            SELECT elaboration_id
            FROM elaboration_products
            WHERE product_id IN ({placeholders})
            GROUP BY elaboration_id
            HAVING COUNT(DISTINCT product_id) = ?
        )
        ORDER BY e.name
        """,
        (*pids, len(pids)),
    ).fetchall()
    return [_row_to_elaboration(r) for r in rows]


def elaboration_summary(elaboration_name: str) -> str:
    """
    Resumen legible de una elaboración, listo para inyectar como contexto
    en un prompt de LLM.
    """
    recipe = get_full_recipe(elaboration_name)
    if recipe is None:
        return f"No tengo datos sobre la elaboración '{elaboration_name}'."

    e = recipe.elaboration
    lines = [
        f"**{e.name}**  ({e.type})",
    ]
    if e.description:
        lines.append(f"  {e.description}")
    if e.yield_ or e.prep_time_min or e.difficulty:
        meta = []
        if e.yield_:
            meta.append(f"Rinde: {e.yield_}")
        if e.prep_time_min:
            meta.append(f"Tiempo: {e.prep_time_min} min")
        if e.difficulty:
            meta.append(f"Dificultad: {e.difficulty}")
        lines.append("  • " + " | ".join(meta))
    if e.notes:
        lines.append(f"  Nota: {e.notes}")

    if recipe.products:
        lines.append("")
        lines.append(f"  Ingredientes ({len(recipe.products)}):")
        for pr in recipe.products:
            qty = f"{pr.quantity} {pr.unit}" if pr.quantity else "c.s."
            role = f" ({pr.role})" if pr.role else ""
            lines.append(f"    - {pr.product.name}: {qty}{role}")

    if recipe.techniques:
        lines.append("")
        lines.append(f"  Técnicas ({len(recipe.techniques)} pasos):")
        for t in recipe.techniques:
            dur = f" ({t.duration_min} min)" if t.duration_min else ""
            lines.append(f"    {t.step_order}. {t.technique.name}{dur}")

    if recipe.machinery:
        lines.append("")
        lines.append(f"  Maquinaria ({len(recipe.machinery)}):")
        for m in recipe.machinery:
            step = f" (paso {m.step_order})" if m.step_order else ""
            lines.append(f"    - {m.machinery.name}{step}")

    return "\n".join(lines)


# ── CLI de demo ──────────────────────────────────────────────────────────────


if __name__ == "__main__":
    import sys

    examples = ["ajo", "tomate", "albahaca", "aceite oliva"]
    if len(sys.argv) > 1:
        examples = sys.argv[1:]

    print("📚 Recetario — demo\n")
    for prod in examples:
        elabs = get_elaborations_with(prod)
        print(f"=== Elaboraciones con '{prod}': {len(elabs)} ===")
        for e in elabs[:5]:
            print(f"  · {e.name} ({e.type}, {e.difficulty or '?'})")
        if len(elabs) > 5:
            print(f"  · ... y {len(elabs) - 5} más")
        print()
