# Auditoría Integral — Sol de Nit Creativity Admin

> Versión: 0.3.0 | Fecha: 2026-09-23 | Backend: 55 rutas API | Frontend: 16 módulos ES

---

## 🔴 CRÍTICO — Bugs que rompen funcionalidad en runtime

### Bug 1: `_REL` no definido — Relaciones N:M rotas
- **Archivo:** `main.py`
- **Impacto:** POST/DELETE `/api/relations/{rel}` lanzan `NameError: name '_REL' is not defined`
- **Causa:** Durante la reconstrucción de main.py, la variable `_REL` (que mapea nombres de relación a nombres de tabla) quedó en `sections_to_add.py` pero NUNCA se copió a main.py.
- **Solución:** Añadir antes de la línea 271:
  ```python
  _REL = {
      "idea_agenda": config.TABLE_IDEA_AGENDA,
      "idea_catalogo": config.TABLE_IDEA_CATALOGO,
      "agenda_catalogo": config.TABLE_AGENDA_CATALOGO,
  }
  ```

### Bug 2: `config.BUCKET_DEFAULT` no existe — Subida de imágenes rota
- **Archivo:** `main.py` líneas 343, 351
- **Impacto:** POST `/api/{entidad}/{entity_id}/images` lanza `AttributeError`
- **Causa:** `config.py` define el bucket como `STORAGE_BUCKET`, no como `BUCKET_DEFAULT`
- **Solución:** Cambiar `config.BUCKET_DEFAULT` por `config.STORAGE_BUCKET` en main.py

### Bug 3: `config.TABLE_DEV_TESTS` no existe — Crear feedback roto
- **Archivo:** `main.py` línea 572
- **Impacto:** POST `/api/tests/{test_id}/feedback` lanza `AttributeError`
- **Causa:** `TABLE_DEV_TESTS` solo existe en `queries.py`, no en `config.py`
- **Solución:** Usar `Q.TABLE_DEV_TESTS` o `f"{config.DB_SCHEMA}.development_tests"` directamente

### Bug 4: `_json` no definido — Generar plating roto
- **Archivo:** `main.py` línea 446
- **Impacto:** POST `/api/catalogos/{catalogo_id}/plating/generar` lanza `NameError: name '_json' is not defined`
- **Causa:** La función `gplg` usa `_json.dumps()` pero `import json as _json` está declarado dentro de otra función (línea 748, en `post_ia_ayuda_semanal`)
- **Solución:** Mover `import json as _json` al inicio del archivo principal

### Bug 5: `os` no importado — Key-status roto
- **Archivo:** `main.py` línea 550
- **Impacto:** GET `/api/settings/key-status` lanza `NameError: name 'os' is not defined`
- **Solución:** Añadir `import os` al bloque de imports

### Bug 6: Faltan endpoints CRUD — Editar y eliminar IDEAS y CATÁLOGOS rotos
- **Archivo:** `main.py`
- **Impacto:** El frontend (detail.js) llama a `PATCH /api/ideas/{id}`, `DELETE /api/ideas/{id}`, `PATCH /api/catalogos/{id}`, `DELETE /api/catalogos/{id}`, `DELETE /api/agendas/{id}` — NINGUNO existe
- **Causa:** Las rutas POST/PATCH/DELETE para ideas/agendas/catalogos se perdieron en la reconstrucción
- **Rutas que faltan:**
  - `PATCH /api/ideas/{idea_id}`
  - `DELETE /api/ideas/{idea_id}`
  - `POST /api/ideas`
  - `PATCH /api/catalogos/{catalogo_id}`
  - `DELETE /api/catalogos/{catalogo_id}`
  - `POST /api/catalogos`
  - `DELETE /api/agendas/{agenda_id}`

---

## 🟠 ALTO — Problemas de usabilidad

### Bug 7: 3 vistas placeholder sin implementación
- **Rutas:** `#/evaluaciones`, `#/emplatado`, `#/vajilla`
- **Estado actual:** Muestran texto "Pendiente de las fases 6, 8 y 9..."
- **Impacto:** El usuario hace clic y ve contenido vacío, experiencia rota
- **Solución:**
  - Evaluaciones: construir vista con `test_feedback` (tabla ya existe, endpoints ya funcionan)
  - Emplatado: construir vista con `plating_proposals` (tabla existe, endpoint generar funciona)
  - Vajilla: construir CRUD de `ware` (tabla existe, endpoints funcionan)

### Bug 8: Botón "Convertir en concepto" no visible en Ideas
- **Endpoint:** `POST /api/ideas/{id}/convertir` funciona ✅
- **Frontend:** El botón no aparece en la vista detalle de idea ni en el listado
- **Impacto:** El usuario no puede usar el flujo Idea → Concepto sin tocar la API manualmente
- **Solución:** Añadir botón en detail.js, visible solo cuando `entidad === 'ideas'` y la idea no tiene ya agenda vinculada

### Bug 9: "Cargando..." infinito sin indicador de error
- **Ubicación:** Varios archivos (list.js, detail.js, cadencia.js)
- **Problema:** Si una API falla (timeout, 502, 503), el frontend se queda en "Cargando…" forever
- **Solución:** Envolver todas las llamadas fetch con timeout de 15s + mostrar error claro
- **Prioridad:** Alta — es la principal queja del usuario hoy

### Bug 10: Catálogo agrupado — feedback visual insuficiente
- **Archivo:** `list.js` — función `renderGrupos`
- **Problema:** Funciona, pero al expandir/colapsar grupos no hay animación ni indicador de carga
- **Solución:** Añadir transición CSS + truncar listas largas (>15 items) con "Ver más"

### Bug 11: Pipeline no muestra tests ni feedback en las cards
- **Archivo:** `pipeline.js`
- **Problema:** Las cards del pipeline solo muestran título y estado, sin indicar cuántas pruebas se han hecho
- **Solución:** Añadir badge con conteo de tests por agenda (el endpoint `/api/agendas/{agenda_id}/tests/count` ya existe)

### Bug 12: Sidebar no colapsa ni se adapta a móvil
- **Problema:** En pantallas < 768px, el sidebar ocupa el 100% y tapa el contenido
- **Solución:** Añadir botón hamburguesa + media queries en CSS

---

## 🟡 MEDIO — Deuda técnica

### DT 1: `main.py` de 924 líneas — monolito inmantenible
- **Problema:** Todas las rutas, modelos y middleware en un solo archivo
- **Solución:** Extraer a estructura modular:
  ```
  backend/
  ├── routers/
  │   ├── ideas.py
  │   ├── agendas.py
  │   ├── catalogos.py
  │   ├── desarrollo.py
  │   ├── images.py
  │   ├── ia.py
  │   ├── settings.py
  │   └── cadencia.py
  ├── models.py       (todos los Pydantic models)
  ├── middleware.py
  └── main.py         (~30 líneas: solo app factory)
  ```

### DT 2: `detail.js` demasiado grande (367 líneas)
- **Problema:** Mezcla renderizado de detalle, formulario de edición, desarrollo section, tests section y edición inline
- **Solución:** Partir en `detail-main.js`, `detail-edit.js`, `detail-desarrollo.js`

### DT 3: CSS monolítico (697 líneas, sin variables)
- **Problema:** Colores repetidos (#6b7280 aparece 47 veces), sin sistema de diseño
- **Solución:** Migrar a CSS custom properties + utility classes mínimas

### DT 4: Sin tests automatizados
- **Problema:** 0 tests. Cada cambio rompe cosas sin detección
- **Solución:** Tests con pytest para:
  - Rutas críticas (CRUD + pipeline)
  - Validación de transiciones de estado
  - Dedup de imágenes
  - Ref-counting en delete de imágenes

### DT 5: SQL interpolado sin parámetros preparados
- **Archivo:** `queries.py`, `supabase_client.py`
- **Problema:** El Management API de Supabase no acepta `$1, $2` así que se interpola manualmente. Esto funciona pero es frágil ante inyección si alguna validación falla
- **Mitigación actual:** Pydantic valida antes, SQL escaping manual
- **Solución a largo plazo:** Migrar a PostgREST con schema expuesto (requiere cambiar política RLS en Supabase)

### DT 6: `encoding_fix.py` — solución frágil para encoding
- **Problema:** Usa codificación Latin-1 como fallback para datos corruptos de la migración de Notion
- **Solución:** Arreglar los datos fuente en Supabase (posiblemente problema de collation) en lugar de parchear en cada lectura

---

## 🟢 BAJO — Mejoras de experiencia

### UX 1: Vista Kanban arrastrable
- **Estado actual:** El pipeline (`pipeline.js`) es una vista estática de columnas
- **Mejora:** Añadir drag & drop entre columnas para cambiar estado (usando el endpoint PATCH `/api/agendas/{id}/estado`)

### UX 2: Búsqueda unificada global
- **Estado actual:** Búsqueda solo dentro de cada sección
- **Mejora:** Barra de búsqueda global (Cmd+K) que busque en ideas, agendas, catálogos simultáneamente

### UX 3: Notificaciones toast mejoradas
- **Estado actual:** Solo texto, desaparecen rápido
- **Mejora:** Toast con iconos, persistencia opcional, acciones ("Deshacer" para deletes)

### UX 4: Modo oscuro
- **Estado actual:** Solo tema claro
- **Mejora:** Toggle dark/light con CSS custom properties (ya existe `prefers-color-scheme` en algunos elementos pero no se usa)

### UX 5: Exportar catálogo a PDF
- **Mejora:** Botón "Exportar" que genere PDF del catálogo agrupado por categorías con precios

### UX 6: Auditoría de actividad por producto
- **Estado actual:** El timeline de una agenda existe (`timeline` jsonb) pero no se muestra completo en el frontend
- **Mejora:** Vista de timeline completo expandible con todos los eventos

---

## 📋 PLAN DE EJECUCIÓN (ordenado por impacto)

### Fase 0 — Estabilización (HOY, 4-6h)

| # | Tarea | Impacto | Tiempo |
|---|---|---|---|
| 0.1 | **Arreglar Bug 1-6** (`_REL`, `BUCKET_DEFAULT`, `TABLE_DEV_TESTS`, `_json`, `os`, CRUD faltante) | 🔴 Bloquea funcionalidad básica | 2h |
| 0.2 | **Añadir `import os` y `import json`** al tope de main.py | 🔴 Varios endpoints rotos | 5min |
| 0.3 | **Crear rutas CRUD faltantes**: POST/PATCH/DELETE ideas, agendas, catalogos | 🔴 Editar/eliminar no funciona | 1h |
| 0.4 | **Añadir `_REL` a main.py** desde sections_to_add.py | 🔴 Relaciones rotas | 5min |
| 0.5 | **Añadir `STORAGE_BUCKET` fix** en main.py (línea 343, 351) | 🔴 Subida de imágenes rota | 5min |
| 0.6 | **Añadir timeout + error handling a fetch()** en list.js, detail.js, cadencia.js | 🟠 "Cargando..." infinito | 1h |

### Fase 1 — Completar lo empezado (próximos 2 días)

| # | Tarea | Impacto |
|---|---|---|
| 1.1 | **Construir vista de Evaluaciones** (tabla `test_feedback`) | 🟠 3er placeholder resuelto |
| 1.2 | **Construir vista de Emplatado** (tabla `plating_proposals`) | 🟠 |
| 1.3 | **Construir vista de Vajilla** (tabla `ware`) | 🟠 |
| 1.4 | **Botón "Convertir en concepto"** en vista detalle de Idea | 🟠 Flujo roto |
| 1.5 | **Badge de tests en Pipeline** (conteo en cada card) | 🟡 |
| 1.6 | **Arreglar `ideas_creativas.js`** — los métodos mostrados (20) no coinciden con los del backend (`ia_integration.py`, 17) | 🟡 Desincronización |
| 1.7 | **Sidebar responsive** + hamburguesa para móvil | 🟡 |

### Fase 2 — Refactor estructural (semana 2)

| # | Tarea |
|---|---|
| 2.1 | **Partir main.py** en routers/ (6 archivos) + models.py + middleware.py |
| 2.2 | **Partir detail.js** en 3 archivos |
| 2.3 | **Refactor CSS** con custom properties |
| 2.4 | **Tests con pytest** para CRUD + pipeline + imágenes |
| 2.5 | **Arreglar encoding_fix.py** desde los datos fuente |

### Fase 3 — UX premium (semanas 3-4)

| # | Tarea |
|---|---|
| 3.1 | Drag & drop en Pipeline Kanban |
| 3.2 | Búsqueda unificada global (Cmd+K) |
| 3.3 | Modo oscuro completo |
| 3.4 | Notificaciones toast mejoradas con acciones |
| 3.5 | Exportar catálogo a PDF |
| 3.6 | Timeline de producto completo con todos los eventos |

---

## 📊 Resumen ejecutivo de la auditoría

| Indicador | Valor |
|---|---|
| **Bugs críticos** (funcionalidad rota) | 10 |
| **Endpoints funcionando** | 55 |
| **Endpoints con bugs** | ~12 |
| **Rutas CRUD faltantes** | 6 |
| **Placeholders sin implementar** | 3 vistas |
| **Módulos JS** | 16 |
| **Archivos con >300 líneas** (umbral refactor) | 3 (main.py, queries.py, tests.js) |
| **Tests automatizados** | 0 |
| **Líneas totales de código** | ~7,000 |

---

## 🎯 Acciones inmediatas recomendadas

1. **Fase 0 completa** antes de cualquier otra feature — sin CRUD ni imágenes ni relaciones, el producto está cojo
2. **Test manual end-to-end** después de Fase 0: crear idea → convertir a concepto → cambiar estado → crear prueba → generar ficha IA → evaluar → feedback
3. **Activar MiniMax API key real** (la key en BD es `sk-test-dummy-12345` — no funciona)
4. **Activar OpenRouter API key real** (la key en BD está vacía)