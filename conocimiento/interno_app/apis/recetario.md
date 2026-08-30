# Recetario — capa 2 operativa del agente

> 📌 **Estado**: MVP-0 — funcional con 47 productos + 26 técnicas + 22 máquinas + 31 elaboraciones.

## ¿Qué es?

El **recetario** es una base de datos SQLite con las **operaciones de cocina** que el agente puede razonar. Mientras el **flavor engine** (capa 1) responde "¿qué ingredientes comparten compuestos?", el recetario responde "¿qué se puede hacer con esos ingredientes, cómo y con qué?".

```
LLM (chef-científico)
  ↓ usa
┌─────────────────────────┐    ┌──────────────────────────┐
│ Capa 1: flavor engine   │    │ Capa 2: recetario        │
│ "¿qué combinación       │    │ "¿qué elaboración        │
│  molecular es posible?" │    │  técnica requiere X?"     │
└─────────────────────────┘    └──────────────────────────┘
```

## Esquema relacional

```
products             ←→  elaboration_products  ←→  elaborations
techniques           ←→  elaboration_techniques ←→  ┘
machinery            ←→  elaboration_machinery  ←→  ┘
```

### Tablas principales

| Tabla | Columnas | Descripción |
|---|---|---|
| `products` | id, name, category, subcategory, season, notes | Ingredientes (verduras, hierbas, proteínas, lácteos, grasas, especias, etc.) |
| `techniques` | id, name, family, description, difficulty | Técnicas culinarias (cocción, corte, emulsión, conservación) |
| `machinery` | id, name, type, capacity, power, notes | Equipamiento (hornos, freidoras, utensilios, eléctricos) |
| `elaborations` | id, name, type, description, yield, prep_time_min, difficulty, notes | Preparaciones (fondos, salsas, masas, marinados) |

### Tablas de relación (muchos-a-muchos)

| Tabla | Columnas |
|---|---|
| `elaboration_products` | elaboration_id, product_id, quantity, unit, role |
| `elaboration_techniques` | elaboration_id, technique_id, step_order, duration_min, notes |
| `elaboration_machinery` | elaboration_id, machinery_id, step_order, usage_notes |

## Ubicación

- **DB**: `conocimiento/interno_app/recursos/recetario.db` (commiteado al repo)
- **Seed**: `scripts/seed_recetario.py` (commiteado, regenera el DB)
- **API**: `agents/herramientas/recetario.py`

## API pública (`agents.herramientas.recetario`)

```python
from agents.herramientas.recetario import (
    # Lookup por producto
    get_elaborations_with,         # elaboraciones que usan X
    find_elaborations_with_all,    # elaboraciones que usan X, Y, Z (todos)

    # Lookup por elaboración
    get_products_for,              # ingredientes de una receta
    get_techniques_for,            # técnicas con orden
    get_machinery_for,             # maquinaria con orden

    # Receta completa
    get_full_recipe,               # todo sobre una elaboración

    # Búsqueda libre
    search_elaborations,           # por nombre o tipo ("salsa", "fondo")

    # Resumen legible para LLM
    elaboration_summary,           # string formateado listo para prompt
)
```

### Ejemplos

```python
# ¿Qué puedo hacer con albahaca?
>>> get_elaborations_with("albahaca")
[Elaboration(pesto), Elaboration(salsa de tomate), ...]

# ¿Qué necesito para el pesto?
>>> get_full_recipe("pesto")
FullRecipe(
    elaboration=Elaboration(name="pesto", type="salsa", ...),
    products=(
        ProductWithRole(product=Product("albahaca"), quantity="60 g", role="principal"),
        ProductWithRole(product=Product("aceite oliva"), quantity="100 ml", role="base"),
        ...
    ),
    techniques=(TechniqueWithStep(technique=Technique("emulsionado"), step_order=1),),
    machinery=(
        MachineryWithStep(machinery=Machinery("batidora de vaso"), step_order=1),
        MachineryWithStep(machinery=Machinery("thermomix"), step_order=2),
    )
)

# Quiero hacer algo con X, Y y Z
>>> find_elaborations_with_all("ajo", "aceite oliva")
[Elaboration(pesto), Elaboration(sofrito), Elaboration(salsa de tomate), ...]

# Resumen legible para inyectar en prompt
>>> elaboration_summary("fondo blanco")
**fondo blanco**  (fondo)
  Caldo claro hecho con huesos blanchedos...
  • Rinde: 1L | Tiempo: 120 min | Dificultad: fácil
  Ingredientes (9):
    - cebolla: 200 g (base)
    - zanahoria: 100 g (base)
    ...
  Técnicas (2 pasos):
    1. blancheado (10 min)
    2. hervido a fuego lento (90 min)
  Maquinaria (2):
    - olla (paso 1)
    - colador chino (paso 2)
```

## Cómo extender el recetario

### Agregar un producto

1. Editar `scripts/seed_recetario.py`
2. Agregar tupla en `PRODUCTS = [...]`:
   ```python
   ("nombre", "categoría", "subcategoría", "estacionalidad", "notas"),
   ```
3. Agregarlo a las elaboraciones que lo usan con `link_products(elab, [(nombre, qty, unit, role), ...])`
4. Correr: `python scripts/seed_recetario.py`
5. Commit el DB actualizado + el script

### Agregar una elaboración

1. Agregar tupla en `ELABORATIONS` (7 campos: name, type, description, yield, prep_time_min, difficulty, notes)
2. Llamar `link_products`, `link_techniques`, `link_machinery` con los detalles
3. Correr el seed
4. Commit

### Agregar una técnica o maquinaria

Idem, en `TECHNIQUES` o `MACHINERY`, y referenciar en las elaboraciones correspondientes.

## Limitaciones actuales y roadmap

| Hoy | Roadmap |
|---|---|
| 47 productos, 31 elaboraciones | Crecer a 100+ elaboraciones con curaduría progresiva |
| Sin sub-elaboraciones (elaboración→elaboración) | Tabla `elaboration_elaborations` para salsas que usan fondos |
| Sin alérgenos | Columna `allergens` en `products` |
| Sin información nutricional | Tabla separada `nutrition` |
| Sin precios | Tabla `costs` con precio medio por mercado |
| Sin cantidades exactas por plato | Tabla `recipe_yields` (raciones por elaboración) |

## Tests

```bash
python -m pytest tests/test_recetario.py -v
```

29 tests cubren schema, búsquedas, recetas completas, summaries.

## Referencias

- **Sauces madre francesas**: https://en.wikipedia.org/wiki/Mother_sauce
- **Técnicas de corte**: brunoise, juliana, mirepoix (cocina clásica francesa)
- **Maillard y caramelización**: ciencia de las reacciones de cocción
