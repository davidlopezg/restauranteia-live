# DATA_MODEL — Modelo de datos del sistema creativo

> Modelo real en Supabase (proyecto `notion-migration-staging`).
> Cualquier cambio debe actualizar este archivo y `docs/diagrams/data-model.mmd`.

---

## 1. Schema

**Schema:** `notion_migration` (NO `public`).
**Origen:** migración desde Notion (estado histórico preservado en
`migration_runs`, `migration_map`, `migration_manifest`, `migration_issues`).
**Operación:** la app admin-web lee y escribe 100% en este schema.

---

## 2. Tablas

### 2.1 Entidades base (existentes)

#### `ideas` (71 filas)
Columnas principales:
- `id` (uuid PK)
- `notion_id` (text, unique)
- `titulo` (text, NOT NULL)
- `descripcion` (text)
- `categorias` (text[]) — GIN index
- `puntuacion` (text)
- `estado_idea` (text) — `Sin empezar` | `En curso` | `Listo - Plato Catalogado`
- `fecha_creacion` (timestamptz)
- `notion_last_edited` (timestamptz)
- `migrated_at`, `migration_run_id`

#### `agendas` (27 filas)
Columnas principales:
- `id` (uuid PK)
- `notion_id` (text, unique)
- `titulo` (text, NOT NULL)
- `fecha_creacion` (date)
- `fecha` (date) — BTree index
- `etiquetas` (text[])
- `estado_desarrollo` (text, **NEW**) — `CONCEPTO` | `PRUEBA_1` | `EVALUACION_1` | `MODIFICACION` | `PRUEBA_2` | `VALIDACION` | `PRODUCTO`
- `objetivo` (text, **NEW**) — texto libre del objetivo
- `receta_final` (jsonb, **NEW**) — `{ingredientes, cantidades, proceso, rendimiento, tiempos, temperaturas, montaje, observaciones}`
- `timeline` (jsonb, **NEW**) — append-only de eventos del desarrollo
- `notion_last_edited`, `migrated_at`, `migration_run_id`

#### `catalogos` (72 filas)
Columnas principales:
- `id` (uuid PK)
- `notion_id` (text, unique)
- `titulo` (text, NOT NULL)
- `orden` (int)
- `precio` (numeric)
- `anio` (text)
- `estado` (text) — `Listo` | `Sin empezar` | `En curso` | `Descartado (por el momento)`
- `categorias` (text[]) — GIN index
- `seleccionada` (bool)
- `ingredientes` (text libre)
- `receta_estructurada` (jsonb, **NEW**) — copia de `agenda.receta_final` al validar
- `notion_last_edited`, `migrated_at`, `migration_run_id`

### 2.2 Bloques (existentes, 683 filas en total)

Estructura plana (parent_block_id siempre NULL), reconstrucción por `position ASC`.

#### `idea_blocks` (231)
#### `agenda_blocks` (423)
#### `catalogo_blocks` (29)

Tipos: paragraph, heading_1/2/3, bulleted/numbered_list_item, divider, code, embed, image, video.

### 2.3 Imágenes (existentes, 153 filas)

#### `idea_images` / `agenda_images` / `catalogo_images`
Columnas clave:
- `id` (uuid PK)
- `{idea|agenda|catalogo}_id` (uuid FK CASCADE)
- `source_type` — `block_image` | `property`
- `storage_bucket` — siempre `notion-migration-staging`
- `storage_path` — `{entidad}/{uuid}/{sha}-{filename}`
- `original_filename`, `mime_type`, `file_size_bytes`
- `sha256` — dedup
- `position`, `has_caption`
- Constraints únicos idempotentes con GENERATED columns

### 2.4 Relaciones N:M (existentes, 30 filas en total)

#### `idea_agenda` (10) — PK compuesta (idea_id, agenda_id)
#### `idea_catalogo` (13) — PK compuesta
#### `agenda_catalogo` (7) — PK compuesta

Todas FK CASCADE.

### 2.5 Tablas NUEVAS (IMPLEMENTADAS en fases 6-9)

#### `development_tests` (FASE 6)
```sql
id uuid PK · agenda_id (FK CASCADE) · numero (smallint) ·
fecha (date) · estado ('PENDIENTE'|'REALIZADA'|'DESCARTADA') ·
objetivo · receta_utilizada · modificaciones · resultado · observaciones ·
created_at · updated_at (trigger) · UNIQUE(agenda_id, numero)
```

#### `test_feedback` (FASE 7)
```sql
id uuid PK · test_id (FK CASCADE) · mesa · num_personas ·
valoracion (1-5 CHECK) · criterio · observacion · fecha · created_at
```

#### `test_images` (FASE 7b — adjuntos directos de la prueba)
```sql
id uuid PK · test_id (FK CASCADE) · source_type ·
storage_bucket (default 'notion-migration-staging') · storage_path ·
original_filename · mime_type · file_size_bytes · sha256 ·
position · has_caption · caption · migrated_at · migration_run_id ·
UNIQUE (test_id, storage_path)
```
Path en Storage: `tests/{test_id}/{sha[:16]}.{ext}`.

#### `test_comments` (FASE 7b — log cronológico por prueba)
```sql
id uuid PK · test_id (FK CASCADE) · autor (text, nullable) ·
texto (text NOT NULL) · created_at (timestamptz, default now())
```
Diferencia con `test_feedback`: `test_comments` es nota libre del equipo;
`test_feedback` es dato estructurado de mesa servida (valoración 1-5).
Diferencia con `development_tests.observaciones`: observaciones es resumen
(1 por prueba); comentarios son N entradas cronológicas.

```

#### `plating_proposals` (FASE 8)
```sql
id uuid PK · catalogo_id (FK CASCADE) · orden (1-5 CHECK) ·
nombre · descripcion · vajilla_sugerida · razonamiento ·
contexto_usado (jsonb) · modelo_usado · estado
('GENERADA'|'EN_REVISION'|'DESCARTADA'|'ELEGIDA') · created_at ·
UNIQUE(catalogo_id, orden)
```

#### `ware` (FASE 9 — inventario vajilla)
```sql
id uuid PK · nombre · tipo · marca · modelo · material · color ·
forma · tamano · descripcion · disponibilidad (bool) ·
imagen_bucket · imagen_path · created_at · updated_at
```

#### `catalogo_ware` — NO CREADA
Motivo (auditoría fases 6-10): las propuestas de vajilla de la IA se
devuelven como JSON revisable por David. Si en el futuro se necesita la
relación N:M persistente (query "que productos usan el plato X"), se
creará entonces.

### 2.6 Metadata de migración (existente, no se modifica)

`migration_runs`, `migration_map`, `migration_manifest`, `migration_issues` — referencia histórica. No expuesta en la UI.

---

## 3. Diagrama ER (Mermaid)

Ver `docs/diagrams/data-model.mmd`.

---

## 4. Índices relevantes

- `ideas.categorias` — GIN (filtros por categoría)
- `catalogos.categorias` — GIN
- `agendas.fecha` — BTree (orden)
- `agendas.estado_desarrollo` — BTree (**NEW**, para Pipeline)
- `catalogos.estado` — BTree
- `ideas.estado_idea` — BTree
- `*_images` — UNIQUE por (entidad_id, source_type, notion_block_id_key, notion_property_key)
- UNIQUE en `notion_id` por tabla (idempotencia de migración)

---

## 5. Storage

**Bucket:** `notion-migration-staging` (privado).
**Path pattern:** `{entidad}/{entidad_id}/{sha256}-{filename}`.
**Signed URL TTL:** 1 hora (configurable en `backend/.env`).

---

## 6. RLS / Seguridad

- RLS **activado** en TODAS las tablas (incluye `test_images`, `test_comments`
  desde FASE 7b). Policies: `auth_full_access` para `authenticated`.
- Vistas `public.*` con `security_invoker=false` para que `anon`/`authenticated`
  puedan SELECT sin pasar por RLS.
- Storage bucket `notion-migration-staging`: privado, RLS para
  `authenticated`. Acceso vía signed URLs (1h TTL).
- Frontend usa `VITE_SUPABASE_ANON_KEY` (clave pública, RLS filtra).
- Backend legacy (FastAPI) usa `SUPABASE_SERVICE_ROLE_KEY` (bypasea RLS).

---

## 7. Encoding

- Datos originales con encoding Latin-1 mal interpretado como UTF-8
  (ej: "Caf�" en lugar de "Café").
- Backend aplica heurística de re-decoding en `encoding_fix.py`.
- Si la heurística falla, devuelve el texto tal cual (no destructive).
