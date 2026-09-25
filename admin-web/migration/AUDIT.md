# Auditoría técnica — punto de partida de la migración

**Fecha:** 2026-09-25
**Stack actual:** FastAPI (Python 3.11) + React 19/Vite + Supabase Postgres
**Stack objetivo:** Vite SPA + Supabase directo (PostgREST + RPC + Edge Functions)

---

## 1. Inventario de endpoints FastAPI (64 totales)

### 1.1 `routers/entities.py` — 20 endpoints

| Método | Path | Función | Migración a |
|---|---|---|---|
| GET | `/api/ideas` | list_ideas (paginado, filtros) | PostgREST `.from('ideas').select()` |
| GET | `/api/ideas/{id}` | detail_idea (con images + blocks + relations) | RPC `get_idea_full(p_id)` |
| POST | `/api/ideas` | create_idea | PostgREST `.insert()` |
| PATCH | `/api/ideas/{id}` | update_idea | PostgREST `.update().eq()` |
| DELETE | `/api/ideas/{id}` | delete_idea | PostgREST `.delete()` |
| POST | `/api/ideas/{id}/convertir` | convertir_idea → agenda | **RPC atómico** (3 queries coordinadas) |
| GET | `/api/agendas` | list_agendas | PostgREST |
| GET | `/api/agendas/{id}` | detail_agenda | RPC `get_agenda_full` |
| POST | `/api/agendas` | create_agenda | PostgREST |
| PATCH | `/api/agendas/{id}` | update_agenda | PostgREST |
| DELETE | `/api/agendas/{id}` | delete_agenda | PostgREST |
| GET | `/api/catalogos` | list_catalogos | PostgREST |
| GET | `/api/catalogos/grupos` | agrupados por categoria (orden custom) | **RPC** (ordenamiento especial) |
| GET | `/api/catalogos/{id}` | detail_catalogo | RPC `get_catalogo_full` |
| POST | `/api/catalogos` | create_catalogo | PostgREST |
| PATCH | `/api/catalogos/{id}` | update_catalogo | PostgREST |
| DELETE | `/api/catalogos/{id}` | delete_catalogo | PostgREST |
| POST | `/api/relations/{rel}` | add_relation (3 tablas N:M) | PostgREST `.insert()` |
| DELETE | `/api/relations/{rel}` | remove_relation | PostgREST `.delete()` |
| GET | `/api/filters/{entidad}` | distinct_categorias + distinct_estados | PostgREST `.select('categorias, estado')` |

### 1.2 `routers/desarrollo.py` — 12 endpoints

| Método | Path | Migración a |
|---|---|---|
| GET | `/api/desarrollo/pipeline` | **RPC** (agregaciones por estado) |
| GET | `/api/desarrollo/estados` | estático (frontend) |
| GET | `/api/pendientes` | **RPC** (multi-join) |
| PATCH | `/api/agendas/{id}/estado` | **RPC** (atomicidad: update + append event) |
| POST | `/api/agendas/{id}/evento` | PostgREST (insert en tabla timeline) |
| GET/POST/PATCH/DELETE | `/api/agendas/{id}/tests[...]` | PostgREST |
| GET/POST/PATCH/DELETE | `/api/tests/{id}/feedback[...]` | PostgREST |
| GET/POST/PATCH/DELETE | `/api/feedback[...]` | PostgREST |

### 1.3 `routers/ia.py` — 12 endpoints (TODOS con secretos)

| Método | Path | Migración a |
|---|---|---|
| GET | `/api/ia/status` | Edge Function |
| GET | `/api/ia/metodos` | estático (frontend) o tabla |
| POST | `/api/ia/ideas` | **Edge Function** (necesita `MINIMAX_API_KEY`) |
| POST | `/api/ia/aplicar-metodo` | Edge Function |
| POST | `/api/ia/idea-cientifica` | Edge Function |
| POST | `/api/ia/chat` | Edge Function |
| POST | `/api/ia/ayuda-semanal` | Edge Function |
| GET | `/api/catalogos/{id}/plating` | PostgREST |
| PATCH | `/api/plating/{id}` | PostgREST |
| DELETE | `/api/plating/{id}` | PostgREST |
| POST | `/api/catalogos/{id}/plating/generar` | **Edge Function** (IA) |
| GET | `/api/catalogos/{id}/ware/generar` | **Edge Function** (IA) |
| POST | `/api/tests/{id}/generar-ficha` | **Edge Function** (OpenRouter) |
| PATCH | `/api/tests/{id}/evaluacion` | PostgREST |

### 1.4 `routers/images.py` — 5 endpoints

| Método | Path | Migración a |
|---|---|---|
| GET | `/api/images/signed` | `supabase.storage.createSignedUrl()` directo (con RLS) |
| POST | `/{ent}/{id}/images` (upload) | Storage directo + RPC para dedup |
| PATCH | `/{ent}/{id}/images/{img_id}` | PostgREST |
| DELETE | `/{ent}/{id}/images/{img_id}` | PostgREST + RPC cleanup de ref_count |

### 1.5 `routers/settings.py` — 13 endpoints

| Método | Path | Migración a |
|---|---|---|
| GET/PATCH | `/api/ware` y `/api/ware/tipos`, `/api/ware/{id}` | PostgREST (es una tabla) |
| GET | `/api/settings` | **Edge Function** (filtra secretos antes de devolver) |
| GET | `/api/settings/key-status` | **Edge Function** (no expone keys, solo estado) |
| PATCH | `/api/settings` | **Edge Function** (escribe keys en BD) |
| GET | `/api/settings/test-providers` | **Edge Function** (hace requests reales con keys) |
| GET | `/api/cadencia/semana-actual` | PostgREST + RPC para upsert+recalc |
| GET | `/api/cadencia/historial` | PostgREST |
| PATCH | `/api/cadencia/{id}` | PostgREST |
| POST | `/api/cadencia/{id}/aplazar` | PostgREST |
| GET | `/api/healthz` | PostgREST directo desde frontend |

### 1.6 `main.py` — serving

| Función | Migración a |
|---|---|
| SPA fallback (`/` y `/{path:path}`) | **GitHub Pages** sirve `dist/index.html` |
| `/docs/{path}` | Mover `docs/` al bundle del frontend (ya está en `public/`) |
| `/assets/*` | GitHub Pages |

---

## 2. Inventario de tablas Supabase (16)

### Entidades (3)
- `ideas` (71 filas) — text[] categorias, idx GIN
- `agendas` (27 filas) — text[] etiquetas, fecha
- `catalogos` (72 filas) — text[] categorias, numeric precio, idx GIN

### Bloques (3)
- `idea_blocks` (231), `agenda_blocks` (423), `catalogo_blocks` (29)
- Estructura plana (`parent_block_id` siempre NULL)

### Imágenes (3)
- `idea_images` (49), `agenda_images` (82), `catalogo_images` (18)
- Ref-counting en `ref_count`, sha256 para dedup

### Relaciones (3)
- `idea_agenda` (10), `idea_catalogo` (13), `agenda_catalogo` (7)
- PK compuesta, FK CASCADE

### Desarrollo (4)
- `dev_tests`, `dev_test_feedback`, `dev_timeline_events` (existen en queries.py, verificar nombres reales)
- `cadencia_semanal` (verificar nombre)

### Settings (1)
- `app_settings` — clave-valor con `key`, `value`

### Auxiliares
- `migration_runs`, `migration_manifest`, `migration_map`, `migration_issues` (no se exponen en UI)

---

## 3. Lógica de negocio crítica a preservar

### 3.1 Conversión idea → agenda
3 operaciones: SELECT idea, INSERT agenda, UPDATE agenda (objetivo), INSERT relation idea_agenda, UPDATE agenda (estado CONCEPTO). **DEBE ser RPC** por atomicidad.

### 3.2 Cambio de estado de agenda (pipeline)
- Validar transición permitida (transiciones hardcoded en `queries.py`)
- UPDATE agenda
- INSERT en tabla de eventos (timeline)
- **DEBE ser RPC** por atomicidad

### 3.3 Upload de imagen con dedup
- Calcular SHA-256 (frontend)
- Buscar hash existente en las 3 tablas (idea/agenda/catalogo)
- Si existe: UPDATE ref_count
- Si no: INSERT fila + upload a Storage
- **Debe ser RPC** (la búsqueda cross-table es compleja)

### 3.4 Plating / Ware
- Generación con IA (Edge Function)
- Persistencia en `dev_plating_proposals` y `dev_ware_combinaciones` (verificar nombres)

### 3.5 IA Ideas/Semana
- Generación con IA (Edge Function)
- Contexto construido por queries SQL (`ia_ayuda_semanal` hace 3 queries para juntar contexto)

### 3.6 Pipeline agregado
- SELECT con COUNT/GROUP BY estado_desarrollo
- **RPC** (PostgREST no soporta agregaciones complejas con joins fácilmente)

### 3.7 Catalogos agrupados
- SELECT con orden custom de categorías (Pizzas, Pizzas blancas, Compartir, ...)
- **RPC** (lógica de agrupación no es nativa en PostgREST)

### 3.8 Cadencia semanal
- `recalculate_current_week()` y `upsert_current_week()` (lógica de semana actual)
- **RPC** (múltiples queries coordinadas)

---

## 4. RLS — estado actual y plan

### Estado actual (AUDIT_SUPABASE.md §3)
- RLS **desactivado** en todas las tablas
- Grants solo a `postgres`
- `anon`/`authenticated`/`service_role` **sin grants**

### Acción requerida
1. **GRANT** a `anon` y `authenticated` sobre las tablas que necesitan acceso
2. **ENABLE RLS** en cada tabla
3. **CREATE POLICY** restrictiva: solo autenticados, solo sus propios datos
4. **EXPOSAR RPC** a `authenticated` para operaciones complejas

### Decisión de seguridad
- `service_role` NUNCA se usa en frontend
- `anon` key se usa en frontend (solo ve tablas con RLS)
- RLS filtra por `auth.uid()` cuando aplica
- Para tablas globales (ideas, agendas, catalogos — datos del restaurante, no personales), RLS = `authenticated = TRUE` (cualquier usuario logueado puede ver/escribir)

---

## 5. Secretos — qué va dónde

| Secreto | Antes | Después |
|---|---|---|
| `MINIMAX_API_KEY` | `.env` backend + `app_settings` BD | Solo `app_settings` (Edge Function la lee) |
| `OPENROUTER_API_KEY` | `app_settings` BD | Solo `app_settings` (Edge Function la lee) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` backend | Solo Edge Functions (server-side) |
| `SUPABASE_ACCESS_TOKEN` | `.env` backend | ❌ **ELIMINADO** — ya no se necesita |
| `SUPABASE_ANON_KEY` | — | Frontend (Vite env) — **PÚBLICO por diseño** |

---

## 6. GitHub Pages — consideraciones

- `base: "/restauranteia-live/"` en vite.config.ts (subpath)
- React Router debe usar `BrowserRouter` con `basename="/restauranteia-live"` o usar `HashRouter`
- 404.html workaround: GitHub Pages no redirige a index.html en refresh, hay que usar HashRouter O crear 404.html que cargue el SPA
- Action de deploy: ya existe `.github/workflows/deploy-frontend.yml` (ajustar para SPA fallback)

---

## 7. Estimación de fases

| Fase | Complejidad | Tiempo estimado |
|---|---|---|
| 1. Infra (cliente, auth, RLS) | Media | 1-2 días |
| 2. Lecturas (GETs) | Alta | 3-4 días |
| 3. CRUD básico | Media | 2-3 días |
| 4. RPCs complejos | Alta | 4-5 días |
| 5. Imágenes | Media | 2 días |
| 6. IA Edge Functions | Alta | 3-4 días |
| 7. Cleanup FastAPI | Baja | 1 día |
| 8. GitHub Pages | Baja | 0.5 día |

**Total:** ~3-4 semanas de trabajo dedicado.

---

## 8. Riesgos identificados

1. **Deduplicación de imágenes**: la lógica actual hace 3 SELECTs cruzados. Si se implementa mal en RPC, podemos perder el ref_count.
2. **Encoding latin1→utf8**: hay un `encoding_fix.py` que aplica re-decoding en runtime. Migrar esto a cliente puede ser tricky.
3. **Timezone de fechas**: queries comparan `fecha_creacion` con `now()` directamente. RLS no debería romper esto, pero hay que verificar.
4. **SIGNED_URL_TTL=3600**: actual. En frontend con anon key + RLS, los signed URLs caducan. Cachear en TanStack Query (staleTime: 30min) ayuda.
5. **MiniMax API key user-provided**: en la UI de Settings, el usuario puede pegar su key. Eso va a `app_settings`, no se loguea en frontend.