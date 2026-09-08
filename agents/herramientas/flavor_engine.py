"""
flavor_engine.py
=================

Motor de combinaciones moleculares para el agente Chef Creativo (capa 1).

¿Qué hace?
----------
Dado uno o dos ingredientes, devuelve los compuestos volátiles/aromáticos
que los definen, y sugiere otros ingredientes con los que comparte
familia química. Es el "divergence engine" del sistema híbrido:

    LLM (intuición)  ←→  Flavor engine (química)  ←→  Spoonacular (recipes)

Fuentes de datos:
- Local: `conocimiento/fuentes_externas/flavor_data/flavor_mapping.json`
  (mapping curado de 84 ingredientes mediterráneos → PubChem CIDs).
- Remoto (cacheado): PubChem REST API (resuelve on-demand los query-only).

API pública:
- get_compounds(ingredient)        → perfil aromático.
- get_compound_overlap(a, b)        → compuestos compartidos.
- suggest_pairings(ingredient, k)   → candidatos con afinidad química.
- flavor_summary(ingredient)        → descripción legible para el LLM.

Diseño mobile-first:
- Sin dependencias pesadas.
- Caché PubChem en SQLite (vacío al inicio, crece con uso).
- Funciona 100% offline para los ingredientes curados.
- Funciona online (con caché progresiva) para los query-only.
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Optional

from agents.herramientas.pubchem_client import (
    PubchemCompound,
    _init_cache as _pubchem_init_cache,
    search_compound_by_name as _pubchem_search_by_name,
)

# ── Paths ────────────────────────────────────────────────────────────────────

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
FLAVOR_MAPPING_PATH = (
    _PROJECT_ROOT
    / "conocimiento"
    / "fuentes_externas"
    / "flavor_data"
    / "flavor_mapping.json"
)


# ── Tipos públicos ───────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Compound:
    """Compuesto químico con su CID PubChem y rol en el perfil de sabor."""

    cid: int
    name: str
    role: str  # "primary" | "secondary" | "trace"

    def pubchem_url(self) -> str:
        return f"https://pubchem.ncbi.nlm.nih.gov/compound/{self.cid}"


@dataclass(frozen=True)
class IngredientProfile:
    """Perfil de sabor de un ingrediente: nombre + compuestos asociados."""

    name: str
    category: str
    compounds: tuple[Compound, ...]
    source: str  # "curated" | "pubchem" | "merged" (curated + resolved)


@dataclass(frozen=True)
class Pairing:
    """Sugerencia de pairing basada en afinidad química."""

    ingredient_a: str
    ingredient_b: str
    shared_compounds: tuple[Compound, ...]
    score: float  # 0..1 — mayor = más afinidad
    rationale: str  # descripción legible


# ── Carga del mapping curado ─────────────────────────────────────────────────


@lru_cache(maxsize=1)
def _load_curated_mapping() -> tuple[tuple[dict, ...], tuple[dict, ...]]:
    """Lee el JSON de mapping. Cacheado en memoria (lru_cache)."""
    with FLAVOR_MAPPING_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    curated = tuple(data.get("curated", ()))
    query_only = tuple(data.get("query_only", ()))
    return curated, query_only


def _normalize(s: str) -> str:
    """Normaliza nombre de ingrediente para lookup: lowercase + sin acentos + espacios colapsados."""
    import unicodedata

    # Quitar diacríticos: 'limón' -> 'limon'
    nfkd = unicodedata.normalize("NFKD", s.strip().lower())
    without_accents = "".join(c for c in nfkd if not unicodedata.combining(c))
    return " ".join(without_accents.split())


# ── Construcción de perfiles ─────────────────────────────────────────────────


def _build_curated_profile(ingredient: str) -> Optional[IngredientProfile]:
    """Busca el ingrediente en el mapping curado."""
    target = _normalize(ingredient)
    curated, _ = _load_curated_mapping()
    for entry in curated:
        if _normalize(entry["ingredient"]) == target:
            compounds = tuple(
                Compound(
                    cid=int(c["cid"]),
                    name=c["name"],
                    role=c.get("role", "secondary"),
                )
                for c in entry["compounds"]
            )
            return IngredientProfile(
                name=entry["ingredient"],
                category=entry["category"],
                compounds=compounds,
                source="curated",
            )
    return None


def _resolve_via_pubchem(ingredient: str) -> Optional[IngredientProfile]:
    """Resuelve un ingrediente vía PubChem usando su 'pubchem_query' o el nombre."""
    _, query_only = _load_curated_mapping()
    target = _normalize(ingredient)

    query = ingredient
    category = "unknown"
    for entry in query_only:
        if _normalize(entry["ingredient"]) == target:
            query = entry.get("pubchem_query") or entry["ingredient"]
            category = entry.get("category", "unknown")
            break

    pc = _pubchem_search_by_name(query)
    if pc is None:
        return None

    compound = Compound(cid=pc.cid, name=pc.name, role="primary")
    return IngredientProfile(
        name=ingredient,
        category=category,
        compounds=(compound,),
        source="pubchem",
    )


def get_profile(ingredient: str) -> Optional[IngredientProfile]:
    """
    Devuelve el perfil de sabor de un ingrediente. Prioriza curated, fallback
    a PubChem. Si tampoco PubChem lo resuelve, devuelve None.
    """
    profile = _build_curated_profile(ingredient)
    if profile is not None:
        return profile
    return _resolve_via_pubchem(ingredient)


def get_compounds(ingredient: str) -> list[Compound]:
    """
    Lista los compuestos asociados al ingrediente (curated o vía PubChem).
    Lista vacía si no se puede resolver.
    """
    profile = get_profile(ingredient)
    if profile is None:
        return []
    return list(profile.compounds)


# ── Solapamiento y pairings ──────────────────────────────────────────────────


def _score_overlap(
    compounds_a: tuple[Compound, ...],
    compounds_b: tuple[Compound, ...],
) -> tuple[float, tuple[Compound, ...]]:
    """Calcula afinidad por compuesto compartido, ponderado por role."""
    cids_a = {c.cid: c for c in compounds_a}
    cids_b = {c.cid: c for c in compounds_b}
    shared_ids = set(cids_a.keys()) & set(cids_b.keys())
    if not shared_ids:
        return 0.0, ()

    weight = {"primary": 3.0, "secondary": 1.5, "trace": 0.5}
    score = 0.0
    shared = []
    for cid in shared_ids:
        role_a = cids_a[cid].role
        role_b = cids_b[cid].role
        # El peso es el mayor de los dos roles (un primary + secondary = primary).
        best_role = role_a if weight.get(role_a, 1) >= weight.get(role_b, 1) else role_b
        score += weight.get(best_role, 1.0)
        shared.append(cids_a[cid])

    # Normalizamos por el tamaño del perfil más pequeño para tener un score estable.
    denom = max(min(len(compounds_a), len(compounds_b)), 1)
    return min(score / (denom * 3.0), 1.0), tuple(shared)


def get_compound_overlap(
    ingredient_a: str,
    ingredient_b: str,
) -> set[int]:
    """
    Devuelve el conjunto de CIDs compartidos entre dos ingredientes.
    Útil para que el LLM razone sobre qué moléculas tienen en común.
    """
    pa = get_profile(ingredient_a)
    pb = get_profile(ingredient_b)
    if pa is None or pb is None:
        return set()
    cids_a = {c.cid for c in pa.compounds}
    cids_b = {c.cid for c in pb.compounds}
    return cids_a & cids_b


def suggest_pairings(
    ingredient: str,
    *,
    top_k: int = 10,
    min_score: float = 0.1,
    include_query_only: bool = False,
) -> list[Pairing]:
    """
    Sugiere ingredientes que comparten compuestos químicos con el dado.

    Args:
        ingredient: nombre del ingrediente base.
        top_k: máximo de sugerencias a devolver.
        min_score: umbral mínimo de afinidad (0..1).
        include_query_only: si False (default), solo busca en el mapping curado
            (instantáneo, offline). Si True, también prueba los query-only
            vía PubChem (más cobertura, pero O(N) llamadas HTTP cacheadas).

    Estrategia:
    1. Resuelve el perfil del ingrediente base.
    2. Itera sobre los candidatos buscando overlaps.
    3. Rankea por score (compuestos compartidos × peso de role).
    4. Devuelve los top_k que superen min_score.
    """
    base = get_profile(ingredient)
    if base is None:
        return []

    curated, query_only = _load_curated_mapping()
    candidates: list[str] = []

    # Curados primero (offline, instantáneo).
    seen: set[str] = set()
    for entry in curated:
        cand_name = entry["ingredient"]
        if _normalize(cand_name) == _normalize(ingredient):
            continue
        norm = _normalize(cand_name)
        if norm in seen:
            continue
        seen.add(norm)
        candidates.append(cand_name)

    # Query-only solo si el usuario lo pide (con caché, segunda iteración).
    if include_query_only:
        for entry in query_only:
            cand_name = entry["ingredient"]
            norm = _normalize(cand_name)
            if norm == _normalize(ingredient) or norm in seen:
                continue
            seen.add(norm)
            candidates.append(cand_name)

    results: list[Pairing] = []
    for cand in candidates:
        cand_profile = get_profile(cand)
        if cand_profile is None:
            continue
        score, shared = _score_overlap(base.compounds, cand_profile.compounds)
        if score < min_score:
            continue
        if not shared:
            continue
        rationale = _format_rationale(ingredient, cand, shared, score)
        results.append(
            Pairing(
                ingredient_a=ingredient,
                ingredient_b=cand,
                shared_compounds=shared,
                score=score,
                rationale=rationale,
            )
        )

    results.sort(key=lambda p: p.score, reverse=True)
    return results[:top_k]


# ── Resumen legible (para inyectar en el prompt del LLM) ─────────────────────


def _format_rationale(
    ingredient_a: str,
    ingredient_b: str,
    shared: tuple[Compound, ...],
    score: float,
) -> str:
    """Genera una línea de justificación humana."""
    if not shared:
        return f"Sin compuestos compartidos."
    names = ", ".join(c.name for c in shared[:3])
    more = f" (+{len(shared) - 3} más)" if len(shared) > 3 else ""
    return (
        f"Afinidad química ({score:.0%}): comparten {names}{more}. "
        f"Sugerencia: explorar el bridge element (grasa/ácido/crujiente) que los une."
    )


def flavor_summary(ingredient: str) -> str:
    """
    Descripción legible del perfil de sabor de un ingrediente, lista para
    inyectar como contexto en un system prompt o user message de un LLM.
    """
    profile = get_profile(ingredient)
    if profile is None:
        return f"No tengo datos sobre '{ingredient}'. Probá con una variante ortográfica o un ingrediente más común."

    lines = [
        f"**{profile.name}** (categoría: {profile.category}, fuente: {profile.source})",
        "Compuestos clave:",
    ]
    for c in profile.compounds:
        lines.append(f"  - {c.name} [CID {c.cid}, {c.role}] — {c.pubchem_url()}")

    pairings = suggest_pairings(profile.name, top_k=5)
    if pairings:
        lines.append("")
        lines.append("Sugerencias de pairing por afinidad química:")
        for p in pairings:
            lines.append(f"  - {p.ingredient_b} ({p.score:.0%})")

    return "\n".join(lines)


# ── CLI de demo ──────────────────────────────────────────────────────────────


if __name__ == "__main__":
    import sys

    examples = ["ajo", "limón", "alcachofa", "tomate", "almendra"]
    if len(sys.argv) > 1:
        examples = sys.argv[1:]

    print("🔬 Flavor engine — demo\n")
    for ing in examples:
        print("=" * 60)
        print(flavor_summary(ing))
        print()
