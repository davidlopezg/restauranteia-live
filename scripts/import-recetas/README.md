# Importador de recetas `sol-de-nit-CORE` → `notion_migration.catalogos`

Toma los archivos `.md` de `docs/Recetas/{Pizzas,Postres}/` en el repo
[davidlopezg/sol-de-nit-CORE](https://github.com/davidlopezg/sol-de-nit-CORE),
los parsea a JSON estructurado y genera un SQL idempotente que:

- **UPDATE** `notion_migration.catalogos.receta_estructurada` si ya existe
  un plato con título normalizado equivalente.
- **INSERT** un plato nuevo con `titulo`, `precio`, `categorias` y
  `receta_estructurada` poblados desde el `.md`.

## Estructura

```
scripts/import-recetas/
├── README.md                  ← este archivo
├── parse_recipe.py            ← parser Markdown → JSON estructurado
├── match_catalog.py           ← normalizador + matcher Python
├── generate_migration.py      ← orquestador: descarga, parsea, genera SQL
└── output/
    ├── migration.sql          ← el .sql listo para ejecutar
    └── parsed/                ← un .json por receta (debug)
```

## Uso

### 1) Modo offline (recomendado para revisión)

```bash
cd restauranteia-live
python3 scripts/import-recetas/generate_migration.py
```

Esto:
1. Lee los `.md` cacheados en `.scratch/recetas/` (si están vacíos, los descarga
   del repo `davidlopezg/sol-de-nit-CORE` vía `gh api`).
2. Parsea cada receta a JSON estructurado.
3. Genera `scripts/import-recetas/output/migration.sql` con un `DO $$` por
   receta que hace UPDATE-or-INSERT.

**Importante:** el matching se hace por `normalize_title(titulo)` (lowercase,
sin acentos, sin prefijos "Pizza/Postre/Tarta/Mousse", sin
"no-alfanuméricos"). Ejemplos:

| Título en catálogo              | Slug derivado              |
| ------------------------------- | -------------------------- |
| `"Pizza BCN"`                   | `bcn`                      |
| `"BCN"`                         | `bcn` (match)              |
| `"Pizza Diávola"`               | `diavola` (sin acento)     |
| `"Margarita"`                   | `margarita`                |
| `"Tarta de Santiago"`           | `desantiago`               |
| `"Tarta de Santiago Esponjosa"` | `desantiagoesponjosa` (no match con la anterior) |

### 2) Modo online (lee catálogo real de Supabase antes de generar)

```bash
export VITE_SUPABASE_URL=https://iprvxvsqpvsbvqbnfvly.supabase.co
export VITE_SUPABASE_ANON_KEY=<tu-anon-key>
python3 scripts/import-recetas/generate_migration.py --use-supabase
```

Este modo enriquece el `.sql` con la lista de UPDATEs/INSERTs ya resueltos
según el catálogo real (lee `id` y `titulo` directamente de Supabase).

## Aplicar el SQL

El SQL generado apunta a `notion_migration.catalogos` (la tabla real;
`public.catalogos` es solo una vista de lectura sin grants de INSERT/UPDATE).

**Opciones para aplicarlo:**

1. **SQL Editor de Supabase** (recomendado si tienes acceso de admin):
   - Abre https://app.supabase.com/project/iprvxvsqpvsbvqbnfvly/sql/new
   - Pega el contenido de `scripts/import-recetas/output/migration.sql`
   - Run.
   - El script crea `notion_migration.normalize_title()` y luego hace
     24 UPSERTs.

2. **psql con service_role key** (avanzado, requiere la clave de servicio):
   ```bash
   PGPASSWORD=<service_role_pwd> psql \
       -h aws-0-eu-west-1.pooler.supabase.com \
       -U postgres.iprvxvsqpvsbvqbnfvly \
       -d postgres \
       -f scripts/import-recetas/output/migration.sql
   ```

## Idempotencia

El script es idempotente: ejecutarlo 2 veces seguidas produce 0 filas nuevas
en la 2ª corrida (todos los `DO` caen en la rama UPDATE). Probado contra
PostgreSQL 18 local con 4 platos pre-existentes.

## Estructura del `receta_estructurada`

```json
{
  "titulo": "Pizza BCN",
  "subtipo": "Pizza",
  "descripcion": "Escandallo de Pizza BCN",
  "raciones": null,
  "ingredientes": [
    { "nombre": "Tomate", "cantidad": "150 g" },
    { "nombre": "Mozzarella", "cantidad": "200 g" }
  ],
  "preparacion": [
    "Preparar la masa de pizza y extenderla en una superficie plana.",
    "Hornear la pizza en un horno precalentado a 220°C..."
  ],
  "coste": {
    "items": [
      { "nombre": "Tomate", "precio_unidad": 1.0, "coste_real": 0.15, "notas": "1.00 €/kg" }
    ],
    "coste_total": null,
    "margen_bruto": 11.25,
    "porcentaje_beneficio": 77.59,
    "pvp": 14.5
  },
  "metadata": {
    "fuente": "/path/to/Escandallo_Pizza_BCN.md",
    "formato": "escandallo_pizza"
  }
}
```

Para **postres** el campo `subtipo` es `"Postre"` y el `metadata.formato`
es `"sop_postre"`. La estructura es la misma.

## Limitaciones conocidas**

- **Tarta de Santiago vs Tarta de Santiago Esponjosa**: si tu catálogo tiene
  `"Tarta de Santiago"` (slug `desantiago`) y la receta es
  `"Tarta de Santiago Esponjosa"` (slug `desantiagoesponjosa`), el matching
  NO los empareja. Renombra el plato en la UI a `"Tarta de Santiago Esponjosa"`
  (o acorta el título del `.md`) antes de correr la migración.
- **PVP de postres**: las recetas SOP listan PVP como rango
  (`"€5.50 - €7.00"`) o varias opciones según margen (4x, 5x, 6x).
  El parser extrae el primer número explícito o deja `null`. Revisa el
  campo `pvp` en `output/parsed/limon.json` y `desantiago.json` y ajusta
  manualmente si lo necesitas.
- **Ingredientes en SOPs**: el parser extrae los de la sección
  "Mise en place". Ingredientes mencionados solo en coste/escandallo
  pueden no aparecer en `ingredientes[]` (sí en `coste.items[]`).
- **Acentos**: el matching ignora acentos, pero los títulos en la DB se
  preservan con acento (ej "Pizza Diávola" se queda con acento).

## Re-descargar las recetas

Si quieres refrescar la cache local:

```bash
rm -rf .scratch/recetas
python3 scripts/import-recetas/generate_migration.py
```

El script descargará automáticamente los `.md` desde
`davidlopezg/sol-de-nit-CORE/docs/Recetas/{Pizzas,Postres}/` usando `gh api`.