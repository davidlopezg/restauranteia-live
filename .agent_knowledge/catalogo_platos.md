# Catálogo de Platos

Lista curada de platos que sirve el restaurante. Sirve como referencia para que
los agentes (chef, marketing, costos) tengan un vocabulario común.

## Cómo se genera

La fase init (`agents/init_phase.py`) pregunta cuántos platos querés catalogar
y luego recolecta las respuestas de `PREGUNTAS_POR_PLATO` por cada uno.

## Ubicación física

`/data/data/com.termux/files/home/repos/restauranteia-live/.agent_knowledge/catalogo_platos.json`

## Cómo lo consumen los agentes

```python
from agents.knowledge_context import cargar_catalogo

platos = cargar_catalogo()
for plato in platos:
    print(plato["nombre"])
```
