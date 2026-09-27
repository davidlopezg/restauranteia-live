# CURRENT_SYSTEM — Sistema Actual (auditoría 2026-09-22)

> Documento vivo. Refleja el estado actual de la app `admin-web` + Supabase.
> Cualquier cambio debe actualizar este archivo.

---

## 1. Arquitectura encontrada

```
admin-web/
├── backend/                       # FastAPI (Python 3.11+)
│   ├── main.py                    # API REST + serve SPA (531 líneas)
│   ├── queries.py                 # Queries SQL (509 líneas)
│   ├── supabase_client.py         # 2 canales: Management API SQL + Storage (117 líneas)
│   ├── sql_utils.py               # Escape + whitelists anti-injection (69 líneas)
│   ├── encoding_fix.py            # Latin-1 → UTF-8 (47 líneas)
│   ├── schemas.py                 # Validación Pydantic (104 líneas)
│   ├── auth.py                    # Auth skeleton (NO activo) (77 líneas)
│   ├── config.py                  # Lee .env (61 líneas)
│   ├── .env.example
│   └── requirements.txt
└── frontend/                      # SPA estática (sin build)
    ├── index.html
    ├── css/style.css              # 429 líneas
    └── js/  app.js (176), api.js (75), ui.js (120), blocks.js (119),
           list.js (275), detail.js (243), images.js (277), relations.js (209)
```

**Total:** ~3500 líneas. **Stack:** FastAPI + httpx (backend) · HTML + CSS + JS vanilla ESM (frontend).

### Backend — endpoints (24)

```
GET    /api/healthz
GET    /api/ideas                       ?search=&categoria=&estado=&cursor=
GET    /api/ideas/{id}
POST   /api/ideas
PATCH  /api/ideas/{id}
DELETE /api/ideas/{id}

GET    /api/agendas                     ?search=&etiqueta=&cursor=
GET    /api/agendas/{id}
POST   /api/agendas
PATCH  /api/agendas/{id}
DELETE /api/agendas/{id}

GET    /api/catalogos                   ?search=&categoria=&estado=&cursor=
GET    /api/catalogos/{id}
POST   /api/catalogos
PATCH  /api/catalogos/{id}
DELETE /api/catalogos/{id}

POST   /api/relations/{rel}             (rel ∈ idea_agenda|idea_catalogo|agenda_catalogo)
DELETE /api/relations/{rel}?a_id=&b_id=
GET    /api/filters/{entidad}

GET    /api/images/signed?bucket=&path=
POST   /api/{entidad}/{entity_id}/images       (multipart upload + dedup)
PATCH  /api/{entidad}/{entity_id}/images/{id}
DELETE /api/{entidad}/{entity_id}/images/{id}  (ref-counting → borra fisico si 0 refs)
```

### Frontend — vistas (8)

| Vista | Ruta | Función |
|---|---|---|
| Listado Ideas | `#/ideas` | Tabla + filtros + búsqueda |
| Detalle Idea | `#/ideas/{id}` | Propiedades + bloques + galería + relaciones |
| Listado Agendas | `#/agendas` | (idem) |
| Detalle Agenda | `#/agendas/{id}` | (idem) |
| Listado Catálogos | `#/catalogos` | (idem) |
| Detalle Catálogo | `#/catalogos/{id}` | (idem) |
| Modal imagen | (overlay) | Zoom + cerrar con ESC |
| Modal confirmación | (overlay) | Confirmar borrado |

---

## 2. Supabase — modelo real

**Proyecto:** `notion-migration-staging` (`iprvxvsqpvsbvqbnfvly`) · ACTIVE_HEALTHY
**Schema:** `notion_migration` (no `public`)
**Storage:** bucket `notion-migration-staging` (privado, signed URLs)
**RLS:** desactivado, sin grants para `anon`/`authenticated`
**Auth actual:** ninguno (interno)

### 2.1 Conteo real (2026-09-22)

| Tabla | Filas |
|---|---:|
| ideas | 71 |
| agendas | 27 |
| catalogos | 72 |
| idea_agenda | 10 |
| idea_catalogo | 13 |
| agenda_catalogo | 7 |
| idea_blocks | 231 |
| agenda_blocks | 423 |
| catalogo_blocks | 29 |
| idea_images | 53 |
| agenda_images | 82 |
| catalogo_images | 18 |
| migration_runs / map / manifest / issues | (metadata) |

### 2.2 Entidades y campos clave

#### `ideas`
- `id` (uuid PK) · `notion_id` (text unique) · `titulo` · `descripcion` · `categorias` (text[]) · `puntuacion` · `estado_idea` · `fecha_creacion` · `notion_last_edited` · `migrated_at` · `migration_run_id`
- **Estados:** `Sin empezar` (62), `En curso` (7), `Listo - Plato Catalogado` (2)
- **Categorías:** Pizza (6), Postres (7), Coctails (2), Ensaladas (2), Tapas (4), Otros (10), Masa (1), Café (1), Tostadas (1)

#### `agendas`
- `id` · `notion_id` · `titulo` · `fecha_creacion` (date) · `fecha` (date) · `etiquetas` (text[]) · `notion_last_edited` · `migrated_at` · `migration_run_id`
- **Fechas:** 12 de 27 agendas tienen fecha (rango 2024-09-03 a 2024-12-13)
- **etiquetas:** VACÍO en todas las filas — campo existente pero sin uso
- Sin campo de estado de desarrollo. Sin trazabilidad de pruebas.

#### `catalogos`
- `id` · `notion_id` · `titulo` · `orden` (int) · `precio` (numeric) · `anio` (text) · `estado` · `categorias` (text[]) · `seleccionada` (bool) · `ingredientes` (text libre) · `notion_last_edited` · `migrated_at` · `migration_run_id`
- **Estados:** Listo (41), Sin empezar (21), En curso (7), Descartado (por el momento) (3)
- **Categorías:** Pizzas (18), Postres (13), Sugerencias (13), Compartir (10), Ensaladas (7), Pizzas blancas (4), Tapas (3), Pizzas semanales (2), Bebidas (1)

### 2.3 Bloques (683)

- Block types: paragraph, image, bulleted/numbered_list_item, heading_1/2/3, divider, code, embed, video
- Estructura **plana** (parent_block_id siempre NULL) — reconstrucción lineal por `position ASC`
- `agenda_blocks`: 423 → contiene recetas tentativas (code blocks), conceptos, ideas
- `catalogo_blocks`: 29 → recetas finales, pero escasas (mayoría son párrafos cortos)

### 2.4 Imágenes (153)

- Storage path: `{ideas|agendas|catalogos}/{uuid}/{sha256}-{filename}`
- `storage_url_public` siempre NULL (bucket privado → signed URLs)
- `source_type`: `block_image` o `property`
- Constraints únicos idempotentes (`uq_idea_images_idempotent`, etc.) con GENERATED columns

### 2.5 Relaciones N:M

- `idea_agenda` (10) · `idea_catalogo` (13) · `agenda_catalogo` (7)
- PK compuesta, FK CASCADE en ambos lados

---

## 3. Funcionalidades implementadas (✅) y no implementadas (❌)

### 3.1 Ideas / Agendas / Catálogos

| Función | Estado |
|---|---|
| Listado con búsqueda + filtros + orden | ✅ |
| Vista tarjetas / tabla conmutable | ✅ |
| Paginación cursor-based | ✅ |
| Detalle con propiedades | ✅ |
| Detalle con bloques renderizados | ✅ |
| Detalle con galería de imágenes | ✅ |
| Detalle con panel de relaciones | ✅ |
| Modal zoom imagen (ESC) | ✅ |
| Modal confirmación borrado | ✅ |
| Editar metadatos (whitelist cols) | ✅ |
| Crear desde sidebar | ✅ |
| Borrar con CASCADE | ✅ |
| Encoding fix Latin-1 → UTF-8 | ✅ |
| Affogato NO se fusiona (2 ids distintos) | ✅ |
| Embed roto se marca, no se inventa URL | ✅ |
| Code blocks como monoespaciado | ✅ |

### 3.2 Imágenes

| Función | Estado |
|---|---|
| Ver imágenes | ✅ |
| Subir (multipart) | ✅ |
| Sustituir metadata (PATCH) | ✅ |
| Borrar (con ref-counting) | ✅ |
| Deduplicación por SHA-256 | ✅ |
| Distinguir block_image / property | ✅ |
| storage_path + SHA + metadatos | ✅ |
| Signed URLs vía backend | ✅ |

### 3.3 Relaciones

| Función | Estado |
|---|---|
| Visualizar relaciones | ✅ |
| Añadir (con validación de existencia) | ✅ |
| Eliminar (sin tocar entidades) | ✅ |
| Idempotente | ✅ |

### 3.4 Ciclo de desarrollo

| Función | Estado |
|---|---|
| Pipeline visual por estados | ❌ |
| Ficha de desarrollo centrada | ❌ |
| Historial de pruebas | ❌ |
| Evaluaciones de mesa | ❌ |
| Validación con checklist | ❌ |
| Conversión Agenda → Catálogo | ❌ (solo manual vía PATCH + POST) |
| Receta estructurada final | ❌ |
| Emplatado con IA | ❌ |
| Inventario de vajilla | ❌ |
| Análisis de vajilla con IA | ❌ |
| Pendientes derivados | ❌ |
| Timeline automática | ❌ |
| Documentación viva `/documentacion` | ❌ |

### 3.5 Seguridad

| Función | Estado |
|---|---|
| service_role solo en backend | ✅ |
| anon/authenticated sin acceso | ✅ (RLS off + sin grants) |
| Signed URLs temporales | ✅ |
| Whitelist columnas editables | ✅ |
| Whitelist columnas ORDER BY | ✅ |
| Escape SQL robusto | ✅ |
| Uploads vía backend (no directo) | ✅ |
| Auth skeleton (Supabase Auth preparado) | ✅ (no activo) |

---

## 4. Problemas actuales / Deuda técnica

### 4.1 Funcional
1. **Sin vista de ciclo de desarrollo**: la app es CRUD, no workflow operativo.
2. **Sin historial de pruebas**: si David añade "Prueba 2" sobre "Prueba 1", la información se pierde.
3. **Sin trazabilidad temporal**: no hay forma de ver cuándo una agenda pasó por cada estado.
4. **Sin feedback de mesa**: las evaluaciones reales con clientes no se registran.
5. **Sin IA integrada**: la API MiniMax existe en el proyecto raíz pero no se usa desde admin-web.
6. **Sin inventario de vajilla**: imposible hacer análisis de servicio con IA sin datos de vajilla.
7. **Sin documentación en la app**: solo existe README técnico, no hay página viva para el usuario.

### 4.2 Técnico
1. **MCP no disponible en sesión**: el `pi-mcp-extension` está en settings pero no instalado. La app usa Management API REST como equivalente (válido).
2. **Proyecto `soldenit-web-admin` INACTIVE**: el nombre suena al definitivo pero está pausado. La app apunta a `notion-migration-staging` (datos correctos, activo).
3. **Rate limits del Management API**: ~429 si se hacen muchas queries rápidas. Mitigado con sleeps; no ideal para producción.
4. **Encoding Latin-1**: heurística (`encoding_fix.py`) re-decodifica Latin-1 → UTF-8. Funciona pero puede fallar en strings puros latin-1.
5. **Constraints únicos en `*_images`**: las columnas `notion_block_id_key` / `notion_property_key` son GENERATED, lo que obliga a autogenerar `notion_block_id` para uploads manuales.
6. **`agendas.etiquetas` vacío**: campo existente pero inutilizado. Se puede aprovechar como tags de desarrollo sin schema nuevo.
7. **Recetas en bloques son texto libre**: `catalogo_blocks` solo tiene 29 filas, la mayoría párrafos cortos. NO hay receta estructurada.
8. **`cadencia_semana_actual` marcada `STABLE` con `INSERT/UPDATE`** ✅ **Resuelto 2026-09-27**: la RPC `notion_migration.cadencia_semana_actual()` (y su wrapper `public.cadencia_semana_actual()`) estaba declarada `STABLE` pero ejecutaba `INSERT … ON CONFLICT` y `UPDATE` contra `weekly_objectives`. PostgreSQL prohíbe escrituras en funciones no-volátiles → error `INSERT is not allowed in a non-volatile function`. **Fix**: cambiar a `VOLATILE` en `admin-web/migration/phase-2-rpcs.sql` (línea 220) y `admin-web/migration/phase-6-public-wrappers.sql` (línea 30). El resto de RPCs (`pipeline_por_estado`, `pendientes`, `catalogos_agrupados`) son SELECT puros y siguen correctamente en `STABLE`.

### 4.3 UX
1. **Sidebar agrupa por entidad, no por flujo**: Ideas / Agenda / Catálogo como secciones independientes en lugar de Desarrollo / Contenido / Análisis.
2. **Detalle demasiado denso**: muchas propiedades + bloques + galería + relaciones sin jerarquía visual clara.
3. **Sin acciones contextuales**: cada estado no sugiere "qué hacer ahora".
4. **Sin drag & drop** entre estados (no implementado, opcional).

---

## 5. Decisiones arquitectónicas cerradas

- **Proyecto:** `notion-migration-staging` (`iprvxvsqpvsbvqbnfvly`). NO usar `soldenit-web-admin` (INACTIVE).
- **Schema:** `notion_migration`. NO crear tablas en `public` ni vistas como sustitutos.
- **Auth:** sin login. `auth.py` preparado para Supabase Auth futuro (1 línea para activar).
- **CRUD:** lectura + edición + borrado con confirmación. FK CASCADE hace el borrado seguro.
- **Imágenes:** SHA-256 dedup, ref-counting para borrado físico seguro.
- **Storage:** signed URLs (TTL 1h configurable). Uploads vía backend.
- **Frontend:** vanilla ESM, sin framework, sin build. Mismo origen que backend.
- **No tocar Notion**: la app es 100% contra Supabase desde la sesión actual.

---

## 6. Próximo paso

→ `docs/PRODUCT_ARCHITECTURE_PROPOSAL.md` — propuesta funcional + técnica para transformar la app en una herramienta de desarrollo de productos.
