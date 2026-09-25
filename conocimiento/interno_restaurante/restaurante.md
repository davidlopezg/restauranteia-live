# Contexto del Restaurante

Schema multidimensional del restaurante, recolectado en la fase init.

## Estructura JSON

El archivo `restaurante.json` contiene 15 dimensiones (ver `PREGUNTAS_RESTAURANTE`
en `agents/init_phase.py` para la lista cerrada). Tipos de valor:

- **number**: número (ticket min/max/moda)
- **choice**: string (un valor de la lista de opciones)
- **multichoice**: array de strings (subset de la lista de opciones)
- **text**: string libre

## Las 15 dimensiones

| Key | Tipo | Descripción |
|---|---|---|
| `precio_target_min` | number | Ticket mínimo en € por persona |
| `precio_target_max` | number | Ticket máximo en € por persona |
| `precio_target_moda` | number | Ticket típico/moda en € por persona |
| `sofisticacion` | choice | muy_alta / alta / media / baja / muy_baja |
| `productos_dominantes` | multichoice | vegetales, carne, pescado, mariscos, integrales, ... |
| `tecnicas_dominantes` | multichoice | brasas, arroces, ahumado, fermentacion, ... |
| `tipo_servicio` | multichoice | servicio_tradicional, barra, autoservicio, ... |
| `grupos` | choice | sin_grupos / con_grupos_pequenos / con_grupos_grandes / banquetes_eventos |
| `clases_comedores` | multichoice | privados_vip, sociales_familia, mixto, business, turistas |
| `origen_inspiracion` | choice | local_pueblo / regional / mediterraneo / ... |
| `orientacion_nutricional` | multichoice | vegetariana, vegana, sin_gluten, origen_producto, ... |
| `localizacion` | choice | urbana / rural / litoral_mar / montaña / singular |
| `religion` | multichoice | ninguna / musulmana_halal / judia_kosher / hindu_vegetariana / budista |
| `tiempo_preparacion` | choice | comida_rapida / medio / slow_food |
| `epoca_estilo` | multichoice | mediterranea_moderna, autor_contemporanea, tradicional_popular, ... |

## Cómo extender las opciones

Las opciones de cada pregunta `choice` / `multichoice` viven en
`agents/init_options.json`. Si una pregunta tiene su key en ese archivo,
sus opciones GANA sobre las hardcoded en `init_phase.py`. Si no, el código
sigue funcionando como fallback.

Para agregar una opción nueva (ej: `horno_piedra` en técnicas dominantes):

1. Editá `agents/init_options.json`
2. Agregá el string en snake_case al array `values` de la key correspondiente
3. Commit + push

Adicionalmente, en tiempo de init el sistema ofrece automáticamente la opción
**"otra (escribir)"** al final de cada choice/multichoice. Si el usuario la elige,
se le pide input libre y se guarda como string custom.

## Ubicación física

`/data/data/com.termux/files/home/repos/restauranteia-live/conocimiento/interno_restaurante/restaurante.json`

## Cómo lo consumen los agentes

```python
from agents.knowledge_context import cargar_restaurante

data = cargar_restaurante()
if data["sofisticacion"] == "alta":
    ...
if "vegetales" in data["productos_dominantes"]:
    ...
```
