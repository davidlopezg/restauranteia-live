"""
agents.herramientas
====================

Capa de herramientas externas que el agente Chef Creativo puede invocar
para razonar más allá del LLM. Cada herramienta encapsula una fuente
de datos o API concreta y expone funciones Python tipadas.

Diseño "mobile-first":
- Sin dependencias pesadas.
- Caché local para minimizar llamadas de red.
- Funciona offline con datos cacheados.

Módulos:
- flavor_engine: motor de combinaciones moleculares (capa 1 - divergencia).
  - Usa mapping curado local (~84 ingredientes con PubChem CIDs).
  - Fallback a PubChem REST API con caché SQLite (~140 ingredientes más).
- pubchem_client: cliente REST de PubChem para resolver compuestos → CIDs.
- (futuro) spoonacular_client: capa 2 - validador de recipes reales.
"""

from agents.herramientas.flavor_engine import (
    Compound,
    IngredientProfile,
    Pairing,
    flavor_summary,
    get_compound_overlap,
    get_compounds,
    get_profile,
    suggest_pairings,
)
from agents.herramientas.pubchem_client import (
    PubchemCompound,
    cache_stats,
    get_compound_by_cid,
    search_compound_by_name,
)
from agents.herramientas.recetario import (
    Elaboration,
    FullRecipe,
    Machinery,
    Product,
    ProductWithRole,
    Technique,
    TechniqueWithStep,
    elaboration_summary,
    find_elaborations_with_all,
    get_elaborations_with,
    get_full_recipe,
    get_machinery_for,
    get_products_for,
    get_techniques_for,
    search_elaborations,
)

__all__ = [
    # flavor_engine
    "Compound",
    "IngredientProfile",
    "Pairing",
    "flavor_summary",
    "get_compound_overlap",
    "get_compounds",
    "get_profile",
    "suggest_pairings",
    # pubchem_client
    "PubchemCompound",
    "cache_stats",
    "get_compound_by_cid",
    "search_compound_by_name",
    # recetario
    "Elaboration",
    "FullRecipe",
    "Machinery",
    "Product",
    "ProductWithRole",
    "Technique",
    "TechniqueWithStep",
    "elaboration_summary",
    "find_elaborations_with_all",
    "get_elaborations_with",
    "get_full_recipe",
    "get_machinery_for",
    "get_products_for",
    "get_techniques_for",
    "search_elaborations",
]
