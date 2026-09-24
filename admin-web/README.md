# Sol de Nit — Creativity Admin

Aplicación web interna para gestionar el sistema de creatividad de Sol de Nit
(Ideas, Agenda Creativa, Catálogo) leyendo datos reales de Supabase.

## Arquitectura

```
admin-web/
├── backend/          # FastAPI (Python 3.11+)
│   ├── main.py
│   ├── queries.py
│   ├── supabase_client.py
│   ├── sql_utils.py
│   ├── encoding_fix.py
│   ├── schemas.py
│   ├── config.py
│   ├── .env.example
│   └── requirements.txt
└── frontend/         # SPA estática (HTML + JS + CSS)
    ├── index.html
    ├── css/style.css
    └── js/
        ├── app.js          # router SPA
        ├── api.js          # cliente HTTP al backend
        ├── ui.js           # helpers DOM, toasts, modales
        ├── blocks.js       # render de bloques Notion
        ├── list.js         # vista listado
        └── detail.js       # vista detalle + edición
```

**Stack:** FastAPI + httpx (backend), HTML + CSS + JS vanilla ESM (frontend).

## Cómo correr

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Editá .env con tus credenciales reales (ver sección Credenciales).
python main.py
# Servirá en http://127.0.0.1:8765
```

### 2. Frontend

El frontend se sirve automáticamente por el backend en `http://127.0.0.1:8765/`
cuando entrás al raíz. No requiere servidor aparte.

Si querés servir el frontend en otro puerto/origen (ej. para dev con Vite),
modificá `ALLOWED_ORIGINS` en `.env`.

## Credenciales

Dos credenciales viven en `backend/.env` (NUNCA en el frontend):

```ini
SUPABASE_URL=https://iprvxvsqpvsbvqbnfvly.supabase.co
SUPABASE_PROJECT_REF=iprvxvsqpvsbvqbnfvly
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>          # Storage signed URLs
SUPABASE_ACCESS_TOKEN=<management_api_personal_token>  # SQL queries
```

Cómo obtenerlas:

- **Service role key**: Supabase Dashboard → Project → Settings → API → `service_role` (secret).
- **Management API token**: <https://supabase.com/dashboard/account/tokens> → `Generate new token`.

El frontend **nunca** recibe estas credenciales. Habla exclusivamente con el
backend, que es el único que las usa.

## Endpoints principales

| Método | Path | Descripción |
|---|---|---|
| GET | `/api/healthz` | Healthcheck |
| GET | `/api/ideas?search=&categoria=&estado=&cursor=&limit=` | Listado de ideas |
| GET | `/api/ideas/{id}` | Detalle (item + imágenes + bloques + relaciones) |
| POST | `/api/ideas` | Crear idea |
| PATCH | `/api/ideas/{id}` | Editar idea |
| DELETE | `/api/ideas/{id}` | Eliminar idea (CASCADE en bloques/imágenes/relaciones) |
| GET/POST/PATCH/DELETE | `/api/agendas[/{id}]` | CRUD de agendas |
| GET/POST/PATCH/DELETE | `/api/catalogos[/{id}]` | CRUD de catálogos |
| POST | `/api/relations/idea_agenda` | Añadir relación idea↔agenda |
| POST | `/api/relations/idea_catalogo` | Añadir relación idea↔catálogo |
| POST | `/api/relations/agenda_catalogo` | Añadir relación agenda↔catálogo |
| DELETE | `/api/relations/{tabla}?a_id=&b_id=` | Quitar relación |
| GET | `/api/filters/{entidad}` | Categorías/estados distintos para filtros |
| GET | `/api/images/signed?bucket=&path=` | Devuelve signed URL para una imagen |

## Decisiones técnicas

### ¿Por qué SQL directo via Management API y no PostgREST?

PostgREST expone solo los schemas `public` y `graphql_public` por defecto.
El schema `notion_migration` (donde viven las tablas) **no** está expuesto via REST.

Para no pedir a David que cambie la config del proyecto, el backend usa el
endpoint `POST /v1/projects/{ref}/database/query` del Management API, que acepta
SQL arbitrario con permisos `postgres`.

**Implicaciones:**
- Los valores se interpolan con escape (ver `sql_utils.py`) para evitar SQL injection.
- Las columnas de `ORDER BY` pasan por whitelist (`sql_utils.ORDER_WHITELIST`).
- Las columnas editables en `UPDATE` pasan por whitelist (`queries.EDITABLE_COLUMNS`).
- `notion_id` y `migration_run_id` (ambos NOT NULL) se autogeneran en creación manual.

### ¿Por qué backend proxy y no RLS directo?

RLS está **desactivado** en todas las tablas del schema `notion_migration`, y los
roles `anon`/`authenticated` no tienen grants. Activar RLS + escribir policies
para cada tabla es un trabajo de seguridad significativo; para una herramienta
interna es más simple y seguro mantener un backend que haga de proxy con la
service_role key.

### ¿Por qué FastAPI y no el SDK `supabase-py`?

El SDK `supabase-py` depende de PostgREST, que como vimos no expone el schema
correcto. Hacer SQL directo via Management API es lo más limpio para este caso.

### Encoding Latin-1 → UTF-8

Algunos strings llegaron mal codificados desde Notion (ej. "Café" → "Caf�").
El backend aplica un re-decoding latin1 → utf8 heurístico (`encoding_fix.py`).
Si el resultado es más limpio (menos caracteres `�`), se aplica.

## Modelo de datos (resumen)

Ver [AUDIT_SUPABASE.md](AUDIT_SUPABASE.md) para el detalle completo.

- **Schema**: `notion_migration`
- **3 entidades**: `ideas` (71), `agendas` (27), `catalogos` (72)
- **Bloques**: 3 tablas paralelas (`idea_blocks`, `agenda_blocks`, `catalogo_blocks`) con `position` ASC y `parent_block_id` siempre NULL.
- **Imágenes**: 3 tablas paralelas (`*_images`) con `storage_bucket` + `storage_path` apuntando al bucket privado `notion-migration-staging`.
- **Relaciones N:M**: `idea_agenda` (10), `idea_catalogo` (13), `agenda_catalogo` (7). PK compuesta, FK CASCADE.

## Tipos de bloque soportados

- `paragraph`, `heading_1`, `heading_2`, `heading_3`
- `bulleted_list_item`, `numbered_list_item` (agrupados en ul/ol)
- `divider`
- `code` (renderizado como bloque monoespaciado — recetas, NO código ejecutable)
- `embed` (URL visible; si `is_broken=true` o `embed_url=''`, se marca como roto)
- `image` (resuelto contra `*_images` por `notion_block_id`, render con signed URL)
- `video` (URL externa en `<a target="_blank">`)

## Funcionalidades implementadas

- [x] Sidebar con 3 secciones (Ideas, Agenda, Catálogo)
- [x] Listado de cada entidad con búsqueda, filtros (categoría/estado), ordenación
- [x] Vista tarjetas y tabla conmutable
- [x] Paginación cursor-based
- [x] Detalle con propiedades, bloques renderizados, galería de imágenes, panel de relaciones
- [x] Click en miniatura → modal de zoom
- [x] Edición inline con formulario (PUT/PATCH)
- [x] Eliminación con confirmación (FK CASCADE)
- [x] Creación rápida desde sidebar (`+ Nuevo`)
- [x] Modal de embed roto (no inventa URL)
- [x] Responsive (sidebar colapsa en móvil)
- [x] Encoding fix (Latin-1 → UTF-8)
- [x] Toast de éxito/error
- [x] Healthcheck
- [x] Conteos en sidebar

## Limitaciones conocidas

- **Sin auth**: la app no tiene login. Es una herramienta interna; poner detrás de un reverse proxy con auth si se expone.
- **Sin búsqueda full-text**: solo ILIKE sobre título.
- **Sin paginación UI para catálogos > 30**: hay botón "Siguiente →".
- **Sin upload de imágenes**: la app no sube a Storage, solo lee lo existente.
- **Embeds se renderizan como links**: no iframe (muchos embeds Notion están rotos o son privados).

## Pendiente / siguiente

- Migrar el modelo a PostgREST directo si se activa el schema en el dashboard.
- Agregar auth (Supabase Auth o un simple API key).
- UI para crear/eliminar relaciones desde el detalle (hoy solo lectura).
