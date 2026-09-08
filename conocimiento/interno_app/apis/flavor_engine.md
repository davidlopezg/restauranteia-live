# Flavor Engine — capa 1 del agente híbrido

> 📌 **Estado**: MVP (Fase 1) — funcional. Datos curados: 84 ingredientes con CIDs PubChem verificados + 141 ingredientes adicionales resolubles vía PubChem API.

## ¿Qué es?

El **flavor engine** es el "motor de divergencia molecular" del agente Chef Creativo. Dado uno o más ingredientes, devuelve:

- **Perfil aromático**: lista de compuestos volátiles clave (CID PubChem + nombre + role).
- **Solapamiento**: qué compuestos comparten dos ingredientes.
- **Sugerencias de pairing**: ingredientes ordenados por afinidad química.

Es la **capa 1** del sistema híbrido recomendado para evitar alucinaciones:

```
LLM (intuición culinaria)  ←→  Flavor engine (química)  ←→  Spoonacular (recipes reales)
```

## Por qué este enfoque y no FlavorDB

| Aspecto | FlavorDB | Este enfoque |
|---|---|---|
| Datos | 50 MB JSON a descargar | ~330 KB de mapping curado + cache PubChem |
| Espacio en móvil | Significativo | Mínimo |
| Latencia | 0 (local) | ~250ms/lookup PubChem (cacheado) |
| Cobertura | ~1000 ingredientes con datos verificados | 225 ingredientes (84 curados + 141 PubChem) |
| Creditos/coste | 0 | 0 (PubChem es libre) |
| Offline | ✅ Sí | ⚠️ Parcial (curados sí, query-only requieren primera conexión) |

**Decisión**: priorizamos mobile-first y crecimiento progresivo. Se puede ampliar el mapping curado en cualquier momento editando `flavor_mapping.json`.

## Arquitectura

```
conocimiento/fuentes_externas/flavor_data/
└── flavor_mapping.json    # 84 curados + 141 query-only

agents/herramientas/
├── __init__.py
├── flavor_engine.py       # API pública (get_profile, suggest_pairings, etc.)
└── pubchem_client.py      # Cliente REST de PubChem con caché SQLite
```

## API pública (`agents.herramientas.flavor_engine`)

```python
from agents.herramientas import (
    Compound,
    IngredientProfile,
    Pairing,
    get_profile,
    get_compounds,
    get_compound_overlap,
    suggest_pairings,
    flavor_summary,
)

# Perfil aromático de un ingrediente
profile = get_profile("ajo")
# → IngredientProfile(name="ajo", category="allium", compounds=(...))

# Compuestos clave
cs = get_compounds("limón")
# → [Compound(cid=22311, name="d-limonene", role="primary"), ...]

# Overlap entre dos ingredientes
overlap = get_compound_overlap("ajo", "cebolleta")
# → {11617}  # comparten allyl methyl sulfide

# Sugerencias de pairing (default: solo curados, instantáneo)
pairings = suggest_pairings("ajo", top_k=5)
# → [Pairing(ingredient_a="ajo", ingredient_b="cebolleta", score=1.0, ...), ...]

# Con query-only (incluye PubChem, más cobertura)
pairings_full = suggest_pairings("ajo", top_k=10, include_query_only=True)

# Resumen legible (para inyectar en system prompt del LLM)
print(flavor_summary("ajo"))
```

## Skill que lo usa

`idea_cientifica` invoca el flavor engine automáticamente:

- **CLI**: `python -m agents.creativo.agent ideas-cien "topping con base de alcachofa"`
- **CLI REPL**: `/ideas-cien <texto>` dentro del chat
- **UI Gradio**: `/ideas-cien <texto>` como comando del chat
- **Como skill dedicada**: `/skill idea_cientifica` (cambio de skill)

Ver `conocimiento/interno_app/prompts/system_idea_cientifica.md` para el system prompt.

## Cómo extender el mapping

Para agregar un ingrediente nuevo al mapping curado:

1. Editar `conocimiento/fuentes_externas/flavor_data/flavor_mapping.json`.
2. Agregar entrada en el array `curated` con:
   - `ingredient`: nombre canónico en español (lowercase).
   - `category`: una de las categorías existentes (allium, citrus, herb, spice, etc.).
   - `compounds`: lista de `{cid, name, role}` donde:
     - `cid`: PubChem CID del compuesto (verificar en pubchem.ncbi.nlm.nih.gov).
     - `name`: nombre del compuesto (en inglés o IUPAC, según convención PubChem).
     - `role`: `"primary"` (define el sabor), `"secondary"` (aporta carácter), `"trace"`.
3. Commit + push.

Para ingredientes menos comunes, agregarlos a `query_only` con `pubchem_query` apuntando al nombre resoluble más directo:

```json
{"ingredient": "miso", "category": "fermented", "pubchem_query": "miso paste"}
```

El motor intentará resolverlo vía PubChem API y cachearlo.

## Tests

```bash
python -m pytest tests/test_flavor_engine.py tests/test_skill_idea_cientifica.py -v
```

- `test_flavor_engine.py`: 15 tests del motor puro.
- `test_skill_idea_cientifica.py`: 18 tests de integración con la skill.

## Limitaciones actuales y roadmap

| Hoy | Roadmap |
|---|---|
| 84 curados / 225 totales | Crecer a 500+ con curaduría progresiva |
| Solo afinidad molecular | Sumar Spoonacular (recipes reales) cuando haya key |
| CIDs hardcodeados en JSON | Tool para proponer CIDs nuevos desde PubChem automáticamente |
| Sin MCP server | (Descartado por ahora — no aporta valor con un solo cliente) |
| Sin constraints operativos | Inyectar equipment/cadencia del restaurante en la skill |

## Referencias

- **PubChem REST API**: https://pubchem.ncbi.nlm.nih.gov/rest/pug/
- **FlavorDB (inspiración metodológica)**: https://cosylab.iiitd.edu.in/flavordb/
- **FooDB**: https://foodb.ca/
- **ChEBI**: https://www.ebi.ac.uk/chebi/
