# Migración admin-web → React + TypeScript + Vite — Decisiones y auditoría

**Fecha**: 2026-09-23 17:05
**Estado**: Pendiente de ejecutar Fase 0
**No se ha migrado ninguna funcionalidad todavía**.

---

## 1. Objetivo

Migrar el frontend actual de `admin-web/` (Vanilla JS/ESM + HTML estático) a **React + TypeScript + Vite + Untitled UI**, manteniendo:

- Backend FastAPI intacto
- Supabase y modelo de datos sin tocar
- APIs y endpoints existentes
- Los 71 ideas + 27 agendas + 72 catálogos + datos validados

El objetivo NO es "usar React", sino **eliminar la fragilidad actual del frontend** (DOM imperativo repetido, estado distribuido sin fuente de verdad, drag & drop inconsistente, sin tipado, sin tests) y conseguir una base mantenible para las áreas críticas:

- Pipeline / Kanban
- Estado y transiciones
- Formularios / modales
- Filtros
- Imágenes
- IA
- Settings

---

## 2. Reglas inquebrantables de la migración

1. **No tocar backend, Supabase ni modelo de datos** salvo necesidad real.
2. **No reescribir el backend**; reutilizar las APIs actuales.
3. **No hacer conversión mecánica archivo → componente**; rediseñar para React.
4. Arquitectura clara: `pages / components / features / services / hooks / types / lib`.
5. **El backend es autoridad**. Frontend cachea pero nunca decide.
6. **Drag & drop solo cambia visualmente** una tarjeta después de validar la transición con el backend; si falla, revertir.
7. Mantener todas las funcionalidades existentes.
8. No eliminar datos ni hacer migraciones destructivas.
9. No dar por "verificado" algo que no se haya probado realmente.
10. Reportar cada bloque con: `IMPLEMENTADO / VERIFICADO / NO VERIFICADO / PENDIENTE`.

---

## 3. Stack final aprobado

| Capa | Paquete | Versión |
|---|---|---|
| Framework | `react` | `19.2.x` (David pidió exactamente esa; última es 19.3.0) |
| Lenguaje | `typescript` | `5.9` (última estable es 7.0.2, David pidió 5.9) |
| Build | `vite` | `8.x` (última 8.3.0) |
| Router | `react-router-dom` | `7.x` |
| Server state | `@tanstack/react-query` | `5.x` |
| DnD | `@dnd-kit/react` + `@dnd-kit/react/sortable` | `0.5.x` (API nueva, NO legacy) |
| UI library | `untitledui` | `0.1.65` (CLI oficial; sus componentes se instalan en proyecto) |
| Icons | `@untitledui/icons` | última |
| Tests | `vitest` + `@testing-library/react` + `msw` | últimas |

**Prohibido añadir**: Zustand, React Hook Form, date-fns, otras librerías salvo necesidad demostrada durante implementación.

**Sin `tailwind.config.ts` tradicional** — Tailwind v4 se configura vía CSS (`@import "tailwindcss"` + `@source` en `globals.css`). Solo archivos realmente necesarios.

---

## 4. Inventario del frontend actual (a reemplazar)

18 archivos JS · ~4.369 líneas · 1 HTML · 1 CSS (886 líneas).

| Archivo | LOC | Rol |
|---|---:|---|
| `app.js` | 282 | Router hash + entry point + dark mode |
| `api.js` | 108 | Cliente HTTP + namespaces |
| `ui.js` | 120 | Helpers DOM (el, esc, toast, confirmDialog, openImage, setupImageModal) |
| `list.js` | 561 | Vista genérica lista (tabla + cards + selección + bulk) |
| `detail.js` | 406 | Detalle entidad + edición inline + relaciones + imágenes |
| `pipeline.js` | 268 | Kanban 7 estados + drag&drop HTML5 + flechas ← **problema crítico** |
| `pendientes.js` | 92 | Listado agrupado |
| `cadencia.js` | 183 | Dashboard semanal + objetivo + aplazamiento |
| `settings.js` | 270 | Configuración + diagnóstico + test-providers |
| `ideas_creativas.js` | 255 | Skill IA + guardar en BD |
| `ideas_cientificas.js` | 231 | Skill IA + historial + guardar en BD |
| `tests.js` | 496 | Pruebas de agenda + feedback por mesa |
| `images.js` | 275 | Upload + gallery + signed URLs |
| `relations.js` | 209 | Gestión relaciones N:M |
| `blocks.js` | 119 | Render bloques Notion |
| `search.js` | 178 | Búsqueda global Cmd+K |
| `documentacion.js` | 184 | Vista estática "Cómo funciona" |

**Backend FastAPI intacto** (5 routers: `desarrollo.py`, `entities.py`, `ia.py`, `images.py`, `settings.py` + ~60 endpoints).

---

## 5. Problemas actuales que motivan la migración

1. **DOM imperativo repetido** — sin reconciliación, re-renders totales.
2. **Estado distribuido sin fuente de verdad** — selección se pierde al re-render, cache de transiciones en variable de módulo.
3. **Drag & drop inconsistente** — HTML5 drag + variables de módulo desincronizadas + flechas como parche.
4. **Recreación de UI en cada cambio pequeño** — eliminar item = location.hash + restore.
5. **Sin tipado** — strings mágicos repetidos, errores solo visibles en runtime.
6. **Código duplicado** — patrones de tabla/modal/filtros repetidos en cada vista.
7. **0 tests en frontend** — refactorizar = riesgo ciego.
8. **Build acoplado al backend** — sin HMR, sin code splitting.
9. **Búsqueda global con caché manual** — sin invalidación controlada.
10. **Sin separación datos / UI / efectos** — imposible testear unitariamente.

---

## 6. Arquitectura objetivo

```
admin-web-frontend/              # Paralelo a admin-web/, no se toca hasta validar
├── public/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes.tsx
│   │
│   ├── pages/                   # 1 página por ruta
│   │   ├── DashboardPage.tsx
│   │   ├── IdeasListPage.tsx
│   │   ├── IdeaDetailPage.tsx
│   │   ├── AgendasListPage.tsx
│   │   ├── AgendaDetailPage.tsx
│   │   ├── CatalogosListPage.tsx
│   │   ├── CatalogoDetailPage.tsx
│   │   ├── PipelinePage.tsx
│   │   ├── PendientesPage.tsx
│   │   ├── IdeasCreativasPage.tsx
│   │   ├── IdeasCientificasPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── DocumentacionPage.tsx
│   │
│   ├── features/                # Lógica + UI por dominio
│   │   ├── ideas/
│   │   ├── catalogos/
│   │   ├── agendas/
│   │   ├── pipeline/            # CRÍTICO — aislado para futuro cambio de API
│   │   │   ├── components/
│   │   │   │   ├── PipelineBoard.tsx
│   │   │   │   ├── PipelineColumn.tsx
│   │   │   │   ├── PipelineCard.tsx
│   │   │   │   └── CambiarEstadoMenu.tsx   # alternativa al drag
│   │   │   ├── hooks/
│   │   │   │   ├── usePipeline.ts
│   │   │   │   └── useMoverTarjeta.ts       # mutation con optimistic + rollback
│   │   │   ├── pipeline.test.tsx
│   │   │   └── types.ts
│   │   ├── desarrollo/          # pruebas + feedback
│   │   ├── ia/
│   │   ├── settings/
│   │   └── images/
│   │
│   ├── components/
│   │   ├── layout/              # AppShell, Sidebar, Topbar
│   │   └── ui/                  # wrappers de Untitled UI
│   │
│   ├── services/                # Capa de red (sin React)
│   │   ├── http.ts              # base con error tipado
│   │   ├── ideas.ts
│   │   ├── agendas.ts           # cambiarEstado, list, get
│   │   ├── desarrollo.ts        # pipeline(), estados()
│   │   ├── images.ts
│   │   ├── ia.ts
│   │   ├── settings.ts
│   │   └── relations.ts
│   │
│   ├── types/
│   │   ├── api.ts
│   │   ├── entities.ts          # Idea, Agenda, Catalogo
│   │   └── pipeline.ts          # ESTADOS, TRANSICIONES const tuples
│   │
│   ├── lib/
│   │   ├── query-keys.ts        # constantes para invalidación
│   │   ├── format.ts
│   │   └── escape.ts
│   │
│   └── styles/
│       └── globals.css          # tokens + reset
│
├── vite.config.ts               # proxy /api → :8765 en dev
├── tsconfig.json                # strict + noUncheckedIndexedAccess
├── package.json
└── README.md
```

---

## 7. Arquitectura del Pipeline (crítica, primero)

```
UI (PipelineBoard / Column / Card)
  ↓ evento drag end
Mutation hook (useMoverTarjeta)
  ↓ optimistic update via setQueryData
TanStack Query
  ↓ PATCH /api/agendas/{id}/estado
FastAPI (routers/desarrollo.py:cambiar_estado_desarrollo)
  ↓ valida contra TRANSICIONES en queries.py
Supabase (Management API)
  ↑ respuesta
FastAPI (200 + nuevo estado)
  ↑
TanStack Query
  ↑ onSuccess → invalidateQuery(['pipeline'])
  ↑ onError → revertir cache + toast.error
UI (estado reconciliado con backend)
```

**Garantías**:
- Frontend NUNCA decide si transición es válida.
- Si backend rechaza → `invalidateQueries` → React Query refetch → UI muestra estado real.
- Optimistic update solo cambia visualmente. NO se persiste en BD hasta PATCH devuelva 200.
- **Sin flechas `◀ ▶` como mecanismo principal**. dnd-kit es principal. `<CambiarEstadoMenu>` es alternativa explícita por tarjeta.

---

## 8. dnd-kit: usar API nueva, aislar

Paquetes a instalar (exactamente):
```
@dnd-kit/react@^0.5.0
@dnd-kit/dom@^0.5.0
@dnd-kit/state@^0.5.0
@dnd-kit/abstract@^0.5.0
tslib@^2.6.2
```

**Prohibido** mezclar con `@dnd-kit/core@6.x` ni `@dnd-kit/sortable@10.x` (legacy).

Toda implementación DnD va dentro de `features/pipeline/` para facilitar cambio futuro de librería si hace falta.

Importaciones esperadas:
```ts
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/react';
import { SortableContext, useSortable } from '@dnd-kit/react/sortable';
```

(Verificar API exacta en docs de `@dnd-kit/react@0.5.0` al implementar.)

---

## 9. Plan de ejecución (orden estricto)

### Fase 0 — Verificación previa (lo que falta por hacer)

Comprobaciones requeridas antes de Fase 1:

1. ✅ **Inicialización Vite + Untitled UI funciona** — pendiente ejecutar `npx untitledui@latest init admin-web-frontend --vite`
2. ✅ **React arranca** — pendiente
3. ✅ **Tailwind funciona** — pendiente
4. ✅ **Un componente real de Untitled UI funciona** — pendiente
5. ✅ **`@dnd-kit/react` funciona con React 19** — pendiente
6. ✅ **`npm run build` funciona** — pendiente
7. ✅ **Tests funcionan** — pendiente

**Estado actual**:
- Versiones verificadas en npm registry ✅
- `untitledui@0.1.65` (CLI oficial) existe en npm ✅
- `@dnd-kit/react@0.5.0` existe en npm ✅
- `react@19.2.x`, `typescript@5.9`, `vite@8.x`, `tailwindcss@4.3.3` disponibles ✅
- **`npx untitledui@latest init` se intentó pero pidió confirmar instalación interactiva** → David pidió guardar antes de continuar.

### Fase 1 — Shell + navegación
- AppShell (sidebar + topbar)
- React Router 7 (rutas placeholder)
- Tema claro/oscuro (data-theme + localStorage, compatible con toggle actual)
- Sidebar con grupos colapsables (`<details>`)

### Fase 2 — API + tipos + TanStack Query
- `http.ts` cliente base con error tipado
- `services/agendas.ts`, `services/desarrollo.ts`
- `types/api.ts`, `types/pipeline.ts`
- `query-keys.ts`
- Vitest + RTL + MSW configurados
- Tests del servicio `agendas.cambiarEstado` con MSW verde

### Fase 3 — UI base mínima (Untitled UI)
- Button, Modal, Toast, DataTable, EmptyState

### Fase 4 — Pipeline (FASE CRÍTICA, primera real)
- `PipelinePage.tsx` con 7 columnas
- `usePipeline.ts` (query del board)
- `useMoverTarjeta.ts` (mutation con optimistic + rollback)
- `PipelineBoard`, `PipelineColumn`, `PipelineCard` con `@dnd-kit/react`
- `CambiarEstadoMenu` como alternativa explícita al drag
- Impedir visualmente destinos inválidos (columnas no permitidas deshabilitadas)
- Reordenamiento dentro de columna si tiene sentido
- Tests:
  - `PipelineBoard.test.tsx` (render 7 columnas)
  - `useMoverTarjeta.test.ts` (PATCH 200, optimistic, PATCH 4xx rollback + toast)
  - `agendas.cambiarEstado.test.ts` (servicio)
  - `DnD integration.test.tsx` (drag end simulado, valida mutación llamada)
  - Cobertura ≥80% en `useMoverTarjeta`, `agendas.cambiarEstado`, `PipelineCard`

### Fase 5 — Validar estabilidad Pipeline

**Criterio GO** (todos必須):
- Drag entre columnas con respuesta <100ms sensación
- PATCH 200 → estado actualizado sin recarga
- PATCH 4xx → revierte a posición original + toast claro
- Selector de estado muestra solo destinos válidos (cargados de `/api/desarrollo/estados`)
- Tests pasan
- Funciona con tema claro y oscuro
- Funciona en viewport ≥1024px y ≥768px

**Criterio NO-GO**: cualquier inconsistencia entre UI optimista y respuesta backend → no avanzar, arreglar primero.

### Fase 6 — Decisión GO/NO-GO

### Fase 7+ — Solo si GO
- Ideas → Catálogo → Agendas → Pruebas → Imágenes → IA → Settings → resto

---

## 10. Configuración clave

### `vite.config.ts` (proxy dev)
```ts
server: { proxy: { '/api': { target: 'http://127.0.0.1:8765', changeOrigin: false } } }
```

### `tsconfig.json` (estricto)
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true
  }
}
```

### `query-keys.ts`
```ts
export const queryKeys = {
  pipeline: ['pipeline'] as const,
  pipelineEstados: ['pipeline', 'estados'] as const,
  // …
};
```

---

## 11. Decisiones operativas

| Tema | Decisión |
|---|---|
| Directorio | `admin-web-frontend/` paralelo al actual. NO tocar `admin-web/`. |
| Switch final | Una línea en `admin-web/backend/main.py` para servir `admin-web-frontend/dist/`. |
| Backend intacto | Cero cambios. |
| Commit | 1 commit por fase, mensaje claro (`fase-1-shell`, `fase-4-pipeline`). |
| Cuando esté validado | Switch del backend para servir `dist/`. |
| Tests | Desde el principio para mutaciones críticas (cambio estado, drag, rollback, convertir idea). |

---

## 12. LO QUE NO SE HARÁ

- ❌ Reescribir backend.
- ❌ Migrar Supabase / modelo de datos.
- ❌ Sustituir `api.js` actual (se mantiene hasta switch final).
- ❌ Añadir librerías no listadas en el stack mínimo.
- ❌ Migrar features no aprobadas explícitamente.
- ❌ Commits a `admin-web/` actual hasta validar Pipeline.

---

## 13. Continuación mañana

Al continuar, retomar desde **Fase 0 — paso 1**: ejecutar `npx untitledui@latest init admin-web-frontend --vite` desde `C:/Users/David/Projects/restauranteia-live/`.

Recordatorio de pasos de Fase 0:
1. `cd C:/Users/David/Projects/restauranteia-live`
2. `npx untitledui@latest init admin-web-frontend --vite` (responder a prompts si los hay)
3. `cd admin-web-frontend`
4. `npm install` (verificar que instala sin warnings críticos)
5. `npm run dev` (verificar que arranca y muestra la app Untitled UI)
6. `npm run build` (verificar producción)
7. Añadir un componente Untitled UI real (botón o modal) en un screen de prueba para verificar
8. Instalar `@dnd-kit/react@^0.5.0` y probar un ejemplo mínimo
9. Configurar Vitest + RTL + MSW

Reportar cada paso como `IMPLEMENTADO / VERIFICADO / NO VERIFICADO / PENDIENTE`.

Si la inicialización falla o pide opciones interactivas, **parar y consultar a David** antes de inventar configuración.

---

## 14. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| Tailwind v4 cambia APIs vs v3 | `@import "tailwindcss"` en CSS, sin `tailwind.config.ts` salvo que sea necesario. |
| React 19 + Suspense | Empezar simple, evitar async components. |
| dnd-kit + React 19 compatibilidad | dnd-kit 0.5.x declara soporte; confirmar al instalar. |
| Untitled UI puede cambiar APIs | Pin versiones exactas. |
| Bundle size | Tree-shaking + lazy routes + solo importar lo usado. |
| Tests con MSW + Vite | MSW v2 ya no usa service worker en node; usar `setupServer`. |
| Migración larga abandonada a medias | Fases pequeñas + criterio GO/NO-GO binario en Fase 5. |

---

## 15. Contexto técnico crítico (del proyecto actual)

### Backend FastAPI (NO TOCAR)
- Puerto: **8765** (matar con `Get-NetTCPConnection -LocalPort 8765 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`)
- `admin-web/backend/.env`: `MINIMAX_API_KEY` está **comentado** (`# MINIMAX_API_KEY=`); key se guarda en BD vía UI
- `notion_migration.app_settings`: tabla de settings en Supabase (TEXT key-value)
- `ia_client.py`: lee key de BD con fallback ENV + cache (`_DB_API_KEY_CACHE`)
- `queries.py` línea 535: `TRANSICIONES` dict de CONCEPTO → PRUEBA_1 → EVALUACION_1 → {MODIFICACION, PRUEBA_2} → PRUEBA_2 → VALIDACION → PRODUCTO
- Endpoint crítico: `PATCH /api/agendas/{id}/estado` (cambio de estado del pipeline)

### Endpoints clave que el frontend React consumirá
- `GET /api/desarrollo/pipeline` — board completo
- `GET /api/desarrollo/estados` — lista de estados + transiciones permitidas
- `PATCH /api/agendas/{id}/estado` — cambio de estado
- `GET /api/agendas`, `/api/agendas/{id}`, `/api/agendas/{id}/tests`
- `POST /api/agendas`, `DELETE /api/agendas/{id}`
- `GET /api/ideas`, `GET /api/ideas/{id}`, `POST /api/ideas`, `PATCH /api/ideas/{id}`, `DELETE /api/ideas/{id}`
- `POST /api/ideas/{id}/convertir` — idea → concepto
- `GET /api/catalogos`, `GET /api/catalogos/grupos`, `POST /api/catalogos`, `PATCH /api/catalogos/{id}`
- `POST /api/ia/ideas`, `POST /api/ia/idea-cientifica`, `POST /api/ia/aplicar-metodo`, `POST /api/ia/chat`
- `GET /api/settings`, `PATCH /api/settings`, `GET /api/settings/test-providers`, `GET /api/settings/key-status`
- `POST /api/{entidad}/{entity_id}/images`, `GET /api/images/signed`

### Sidebar actual (referencia visual)
```
Dashboard           → /#/cadencia
Ideas               → /#/ideas
Pruebas (group)     → Pruebas /#/agendas, Pipeline /#/desarrollo, Pendientes /#/pendientes
Catálogo            → /#/catalogos
Análisis (group)    → Evaluaciones /#/evaluaciones, Emplatado /#/emplatado, Vajilla /#/vajilla
IA Creativa (group) → Ideas creativas /#/ideas-creativas, Ideas científicas /#/ideas-cientificas
Documentación       → Cómo funciona /#/documentacion, Configuración /#/settings
```

### CSS actual
- Archivo: `admin-web/frontend/css/style.css` (886 líneas)
- Sistema: tokens HSL shadcn-style + Inter font + spaciado generoso
- Tema: `[data-theme="dark"]` toggleable vía `localStorage.getItem('sdn-theme')` desde JS
- **Bug arreglado**: `.modal[hidden] { display: none !important; }` para evitar que el modal de confirmación se muestre por defecto

### Precedentes del frontend actual corregidos recientemente
- API key persistence (4-session bug): `saveSettingsFromForm` con `prefix = 's-'` para MiniMax
- Security fix en `routers/settings.py:get_settings()` excluyendo claves
- ia_integration.py monkey-patch de `agent.API_KEY` desde BD
- Sidebar reorganizado con `<details open>` collapsibles
- Pipeline SIN drag&drop (removido), botón "Pasar a [SIGUIENTE]" + dropdown
- List.js con vista tabla por defecto + selección + bulk delete
- Ideas científicas/creativas operative: input → LLM → "💾 Guardar como idea"
