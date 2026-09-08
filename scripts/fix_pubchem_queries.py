#!/usr/bin/env python3
"""
fix_pubchem_queries.py
=======================

Script utilitario que itera sobre el mapping de flavor_data/flavor_mapping.json
y arregla automáticamente los `pubchem_query` que no resuelven en PubChem.

Para cada query_only:
1. Prueba el pubchem_query actual.
2. Si falla, prueba variantes progresivamente más simples:
   a) El nombre del ingrediente solo.
   b) La primera palabra del nombre.
   c) Sin acentos.
   d) Algunos patrones comunes traducidos.
3. Actualiza el JSON con el primer query que funcione.
4. Reporta lo que no se pudo arreglar.

USO:
    python scripts/fix_pubchem_queries.py [--dry-run] [--verbose]

--dry-run: solo reporta, no modifica el JSON.
--verbose: muestra cada intento de query.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# Hacer importable el paquete agents
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from agents.herramientas.pubchem_client import search_compound_by_name

FLAVOR_MAPPING_PATH = (
    PROJECT_ROOT
    / "conocimiento"
    / "fuentes_externas"
    / "flavor_data"
    / "flavor_mapping.json"
)

# Rate limit: 4 req/s holgadamente bajo el límite de 5/s de PubChem
INTER_QUERY_SLEEP = 0.27


def _strip_accents(s: str) -> str:
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", s.strip())
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def _candidate_queries(entry: dict) -> list[str]:
    """Genera una lista priorizada de queries para probar."""
    ing = entry["ingredient"]
    candidates = []

    # 1. Query actual
    if entry.get("pubchem_query"):
        candidates.append(entry["pubchem_query"])

    # 2. Nombre del ingrediente solo
    candidates.append(ing)

    # 3. Primera palabra (para frases largas tipo "jamon iberico")
    first = ing.split()[0] if ing.split() else ing
    if first not in candidates:
        candidates.append(first)

    # 4. Sin acentos
    no_acc = _strip_accents(ing)
    if no_acc != ing.lower() and no_acc not in candidates:
        candidates.append(no_acc)

    # 5. Traducciones comunes ES → EN para categorías específicas
    TRANSLATIONS = {
        "ajo": "garlic",
        "cebolla": "onion",
        "puerro": "leek",
        "tomate": "tomato",
        "pimiento": "pepper",
        "albahaca": "basil",
        "romero": "rosemary",
        "oregano": "oregano",
        "alcaparra": "caper",
        "anchoa": "anchovy",
        "sardina": "sardine",
        "atun": "tuna",
        "salmon": "salmon",
        "bacalao": "cod",
        "pulpo": "octopus",
        "calamar": "squid",
        "gamba": "shrimp",
        "mejillón": "mussel",
        "pollo": "chicken",
        "pavo": "turkey",
        "cordero": "lamb",
        "ternera": "beef",
        "cerdo": "pork",
        "conejo": "rabbit",
        "pato": "duck",
        "almendra": "almond",
        "avellana": "hazelnut",
        "nuez": "walnut",
        "pistacho": "pistachio",
        "sesamo": "sesame",
        "lentejas": "lentils",
        "garbanzos": "chickpea",
        "soja": "soybean",
        "arroz": "rice",
        "avena": "oats",
        "trigo": "wheat",
        "maíz": "corn",
        "vino": "wine",
        "cerveza": "beer",
        "queso": "cheese",
        "mantequilla": "butter",
        "leche": "milk",
        "yogur": "yogurt",
        "miel": "honey",
        "cafe": "coffee",
        "chocolate": "chocolate",
        "limon": "limonene",
        "naranja": "limonene",
    }
    no_acc_first = _strip_accents(first)
    if no_acc_first in TRANSLATIONS:
        candidates.append(TRANSLATIONS[no_acc_first])

    # 6. Patrones compuestos comunes (muchos query_only apuntaban a "essential oil")
    # Si la categoría es herb/spice, intentar el compuesto principal del curated
    if entry.get("category") in ("herb", "spice"):
        candidates.append("linalool")
        candidates.append("eugenol")

    # 7. Variantes finales
    if no_acc not in candidates:
        candidates.append(no_acc)

    return candidates


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Solo reporta, no modifica el JSON.",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Muestra cada intento de query.",
    )
    args = parser.parse_args()

    print("🔧 Arreglando pubchem_query del mapping...")
    print(f"   Path: {FLAVOR_MAPPING_PATH.relative_to(PROJECT_ROOT)}")
    print()

    with FLAVOR_MAPPING_PATH.open(encoding="utf-8") as f:
        data = json.load(f)

    query_only = data.get("query_only", [])
    total = len(query_only)
    fixed: list[dict] = []
    already_ok: list[dict] = []
    unresolved: list[dict] = []

    for i, entry in enumerate(query_only, 1):
        ing = entry["ingredient"]
        original = entry.get("pubchem_query", ing)

        if args.verbose:
            print(f"[{i}/{total}] {ing} (query='{original}')")

        # Probar el query actual primero
        result = search_compound_by_name(original)
        if result is not None:
            already_ok.append(entry)
            if args.verbose:
                print(f"   ✅ OK con query actual (CID {result.cid})")
            time.sleep(INTER_QUERY_SLEEP)
            continue

        # Probar variantes
        new_query = None
        for candidate in _candidate_queries(entry):
            if candidate == original:
                continue  # ya probado
            if args.verbose:
                print(f"   probando '{candidate}'...")
            result = search_compound_by_name(candidate)
            if result is not None:
                new_query = candidate
                if args.verbose:
                    print(f"   ✅ Funciona con '{candidate}' (CID {result.cid})")
                break
            time.sleep(INTER_QUERY_SLEEP)

        if new_query is not None:
            entry["pubchem_query"] = new_query
            fixed.append({"ingredient": ing, "old": original, "new": new_query})
        else:
            unresolved.append({"ingredient": ing, "query": original})

        # Sleep entre entradas para no saturar PubChem
        if not args.verbose:
            print(f"[{i}/{total}] {ing}: ", end="", flush=True)
            if new_query:
                print(f"✅ arreglado → '{new_query}'")
            else:
                print(f"❌ no se pudo arreglar")
        time.sleep(INTER_QUERY_SLEEP)

    # Reporte
    print()
    print("=" * 60)
    print("📊 Reporte")
    print("=" * 60)
    print(f"  Total query_only:     {total}")
    print(f"  Ya funcionaban:       {len(already_ok)}")
    print(f"  Arreglados:           {len(fixed)}")
    print(f"  Sin solución:         {len(unresolved)}")
    print()

    if fixed:
        print("═══ Cambios aplicados ═══")
        for f in fixed:
            print(f"  · {f['ingredient']}: '{f['old']}' → '{f['new']}'")
        print()

    if unresolved:
        print("═══ No se pudieron arreglar ═══")
        print("  (Estos ingredientes no tienen una entrada clara en PubChem")
        print("   o requieren un mapeo manual más profundo.)")
        for u in unresolved:
            print(f"  · {u['ingredient']}: query='{u['query']}'")
        print()

    # Guardar si no es dry-run
    if not args.dry_run and fixed:
        with FLAVOR_MAPPING_PATH.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"💾 {FLAVOR_MAPPING_PATH.relative_to(PROJECT_ROOT)} actualizado.")
    elif args.dry_run:
        print("ℹ️  Modo dry-run: no se modificó el archivo.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
