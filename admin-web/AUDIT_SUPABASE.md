# Auditoría Supabase — Sol de Nit Creativity Admin

**Fecha:** 2026-09-22
**Auditor:** pi (minimax-M3) vía Management API + Database Query API
**No había MCP de Supabase disponible en la sesión** — se ha usado la API REST equivalente (`api.supabase.com/v1/...`) que expone el mismo modelo de datos.

## 1. Proyectos identificados

| Proyecto | Ref | Estado | Notas |
|---|---|---|---|
| `soldenit-web-admin` | `dcrnrwcbxaazggsmrsgv` | **INACTIVE** | Nombre "deseado" pero pausado (free-tier inactivity). API keys no disponibles, storage no accesible. |
| `notion-migration-staging` | `iprvxvsqpvsbvqbnfvly` | **ACTIVE_HEALTHY** | Contiene los datos reales. Storage accesible, DB consultable. |
| `menu-semanal` | `flpxuyrtdmkqzzdcjqbr` | ACTIVE_HEALTHY | Otro proyecto, no relacionado. |

**Decisión:** se construye contra `notion-migration-staging` porque es el único donde se pueden leer datos reales y storage. Si David reactiva `soldenit-web-admin`, basta cambiar `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` en `.env` del backend (la app no almacena credenciales en frontend).

## 2. Project URL + Storage

- **API URL:** `https://iprvxvsqpvsbvqbnfvly.supabase.co`
- **Storage bucket:** `notion-migration-staging` (PRIVADO — `public: false`)
- **Mime types:** `image/png, image/jpeg, image/gif, image/webp`
- **Storage path pattern:** `{folder}/{uuid}/{hash}-{filename}`
  - `ideas/<uuid>/<hash>-image_0.jpg`
  - `agendas/<uuid>/<hash>-Captura...png`
  - `catalogos/<uuid>/<hash>-<name>`

## 3. Esquema

**Schema:** `notion_migration` (no está en `public`)

**RLS:** desactivado en TODAS las tablas.
**Grants:** solo `postgres`. `anon`/`authenticated`/`service_role` sin grants explícitos.

**Implicación de seguridad:** el frontend NO puede usar anon key directamente. Hay que pasar por un backend que use `service_role`. **Nunca** exponer `service_role` en HTML/JS.

## 4. Tablas (16)

### 4.1 Entidades principales

#### `ideas` (71 filas)
| col | tipo | nullable | default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` (PK) |
| `notion_id` | text | NO | (unique idx `ideas_notion_id_key`) |
| `titulo` | text | NO | |
| `descripcion` | text | YES | |
| `categorias` | text[] | YES | (GIN idx `idx_ideas_categorias`) |
| `puntuacion` | text | YES | |
| `estado_idea` | text | YES | (idx `idx_ideas_estado`) |
| `fecha_creacion` | timestamptz | YES | |
| `notion_last_edited` | timestamptz | YES | |
| `migrated_at` | timestamptz | NO | `now()` |
| `migration_run_id` | text | NO | (idx `idx_ideas_run`) |

**Categorías observadas:** Otros (10), Postres (7), Pizza (6), Tapas / Entrantes / Para compartir (4), Coctails (2), Ensaladas (2), Café (1), Masa (1), Tostadas (1)

**Estados observados:** Sin empezar (62), En curso (7), Listo - Plato Catalogado (2)

#### `agendas` (27 filas)
| col | tipo | nullable |
|---|---|---|
| `id` | uuid | NO (PK) |
| `notion_id` | text | NO (unique idx) |
| `titulo` | text | NO |
| `fecha_creacion` | date | YES |
| `fecha` | date | YES (idx `idx_agendas_fecha`) |
| `etiquetas` | text[] | YES |
| `notion_last_edited` | timestamptz | YES |
| `migrated_at` | timestamptz | NO |
| `migration_run_id` | text | NO |

#### `catalogos` (72 filas — INCLUYE 2× Affogato con ids distintos)
| col | tipo | nullable |
|---|---|---|
| `id` | uuid | NO (PK) |
| `notion_id` | text | NO (unique idx) |
| `titulo` | text | NO |
| `orden` | integer | YES (idx `idx_catalogos_orden`) |
| `precio` | numeric | YES |
| `anio` | text | YES |
| `estado` | text | YES (idx `idx_catalogos_estado`) |
| `categorias` | text[] | YES (GIN idx) |
| `seleccionada` | boolean | YES |
| `ingredientes` | text | YES |
| `notion_last_edited` | timestamptz | YES |
| `migrated_at` | timestamptz | NO |
| `migration_run_id` | text | NO |

**Categorías:** Pizzas (18), Postres (13), Sugerencias (13), Compartir (10), Ensaladas (7), Pizzas blancas (4), Tapas (3), Pizzas semanales (2), Bebidas (1)
**Estados:** Listo (41), Sin empezar (21), En curso (7), Descartado (por el momento) (3)

**Importante:** los dos registros "Affogato" tienen `id` y `notion_id` distintos — la app los muestra como entradas independientes (NO agrupar por título).

### 4.2 Bloques (683 filas en total = 231 + 423 + 29)

#### `idea_blocks`, `agenda_blocks`, `catalogo_blocks`
Columnas comunes:
| col | tipo | nullable |
|---|---|---|
| `id` | uuid | NO (PK) |
| `{ent}_id` | uuid | NO (FK CASCADE) |
| `notion_block_id` | text | NO |
| `block_type` | text | NO |
| `position` | integer | NO |
| `parent_block_id` | uuid | **YES — pero siempre NULL** (estructura plana) |
| `content_text` | text | YES |
| `content_raw` | jsonb | YES |
| `has_children` | bool | YES (16 filas tienen true pero sin parent — residuo de migración) |
| `code_language` | text | YES (solo en `code`) |
| `embed_url` | text | YES (solo en `embed`) |
| `is_broken` | bool | YES (embed con URL vacía) |
| `video_url` | text | YES |
| `video_source_type` | text | YES |
| `image_source_type` | text | YES |
| `migrated_at` | timestamptz | NO |
| `migration_run_id` | text | NO |

**Block types observados:**
| type | idea | agenda | catalogo |
|---|---|---|---|
| paragraph | 157 | 162 | 24 |
| image | 33 | 82 | 4 |
| bulleted_list_item | 26 | 99 | – |
| numbered_list_item | 6 | 25 | – |
| heading_3 | 4 | 23 | 1 |
| heading_2 | – | 8 | – |
| heading_1 | 1 | 3 | – |
| divider | 1 | 18 | – |
| code | – | 2 | – |
| embed | 2 | 1 | – |
| video | 1 | – | – |

### 4.3 Imágenes (149 filas = 49 + 82 + 18)

#### `idea_images`, `agenda_images`, `catalogo_images`
| col | tipo | nullable |
|---|---|---|
| `id` | uuid | NO (PK) |
| `{ent}_id` | uuid | NO (FK CASCADE) |
| `source_type` | text | NO — `block_image` o `property` |
| `notion_block_id` | text | YES (block_image) |
| `notion_page_id` | text | NO |
| `notion_property` | text | YES (property, ej `cover`/`icon`) |
| `storage_bucket` | text | NO (siempre `notion-migration-staging`) |
| `storage_path` | text | NO |
| `storage_url_public` | text | **YES — siempre NULL** (bucket privado) |
| `original_filename` | text | YES |
| `mime_type` | text | YES |
| `file_size_bytes` | bigint | YES |
| `sha256` | text | YES |
| `position` | integer | YES |
| `has_caption` | bool | YES |
| `migrated_at` | timestamptz | NO |
| `migration_run_id` | text | NO |
| `notion_block_id_key` | text | YES (solo en `idea_images` y `catalogo_images`) |
| `notion_property_key` | text | YES (idem) |

**Conteo por source_type:**
- `idea_images`: 48 block_image + 1 property
- `agenda_images`: 82 block_image
- `catalogo_images`: 16 property + 2 block_image

### 4.4 Relaciones N:M

#### `idea_agenda` (10), `idea_catalogo` (13), `agenda_catalogo` (7)
PK compuesta (ambos FKs). FK `ON DELETE CASCADE`.

| col | tipo |
|---|---|
| `{ent1}_id` | uuid FK CASCADE |
| `{ent2}_id` | uuid FK CASCADE |
| `notion_{ent1}_id` | text |
| `notion_{ent2}_id` | text |
| `migration_run_id` | text |
| `migrated_at` | timestamptz |

### 4.5 Metadatos de migración (no se exponen en UI)
- `migration_runs`, `migration_manifest`, `migration_map`, `migration_issues`

## 5. Encoding

Los caracteres acentuados están **mal codificados** (ej "Caf�" en lugar de "Café"). La hipótesis: el dump original se guardó como Latin-1/Windows-1252 al migrar y al leer como UTF-8 da "?". Decisión UI: aplicar un fallback de re-decoding (`latin1 → utf8`) en el backend para mostrar texto legible. Si falla, mostrar tal cual.

## 6. Validación cruzada (lo que pidió David)

| Métrica | Esperado | Real | OK |
|---|---|---|---|
| Ideas | 71 | 71 | ✅ |
| Agendas | 27 | 27 | ✅ |
| Catálogos | 72 | 72 | ✅ |
| Idea ↔ Agenda | 10 | 10 | ✅ |
| Idea ↔ Catálogo | 13 | 13 | ✅ |
| Agenda ↔ Catálogo | 7 | 7 | ✅ |
| Imágenes | 149 | 149 | ✅ |
| Bloques | 683 | 683 | ✅ |

**8 / 8 coinciden.** La lectura del modelo es correcta.

## 7. Conclusión arquitectónica

- **Stack:** Backend Python (FastAPI) + Frontend HTML/JS/CSS vanilla.
- **Auth:** backend usa `SUPABASE_SERVICE_ROLE_KEY` (nunca expuesto al cliente).
- **Imágenes:** el backend genera signed URLs (TTL configurable, default 1h) y las devuelve al frontend.
- **CRUD:** lectura + update + delete (FK CASCADE confirmado, borrado seguro). Confirmación obligatoria en UI.
- **Filtros:** por categoría (GIN index), estado, fecha, búsqueda por título (ILIKE).
- **Paginación:** cursor-based con `id` (estable, no se altera al editar).
- **Bloques:** reconstrucción lineal por `position ASC`. Tipos soportados: paragraph, heading_1/2/3, bulleted/numbered_list_item, divider, code (monospace), embed (o "embed roto"), image (con bloque relacionado en `*_images`), video (URL externa).
