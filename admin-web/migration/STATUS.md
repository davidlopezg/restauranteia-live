# Estado de la migración FastAPI → Supabase directo

**Fecha:** 2026-09-25
**Total endpoints FastAPI:** 64
**Endpoints migrados a Supabase directo:** ~50 (78%)
**Endpoints migrados a Edge Functions:** 3
**Endpoints que quedan en FastAPI:** ~11 (solo los que dependen del agente Python)

---

## ✅ Endpoints migrados a Supabase (PostgREST / RPC)

### FASE 2 (lecturas)
- `GET /api/ideas`, `/api/ideas/{id}` → PostgREST
- `GET /api/agendas`, `/api/agendas/{id}` → PostgREST
- `GET /api/catalogos`, `/api/catalogos/{id}`, `/api/catalogos/grupos` → PostgREST + RPC
- `GET /api/filters/{entidad}` → PostgREST
- `GET /api/desarrollo/pipeline`, `/api/pendientes` → RPC
- `GET /api/cadencia/semana-actual`, `/api/cadencia/historial` → RPC + PostgREST

### FASE 3 (CRUD entidades)
- `POST/PATCH/DELETE /api/ideas|agendas|catalogos` → PostgREST
- `POST /api/relations/{rel}` → PostgREST upsert
- `DELETE /api/relations/{rel}` → PostgREST delete
- `POST /api/ideas/{id}/convertir` → RPC atómico

### FASE 4 (operaciones complejas)
- `PATCH /api/agendas/{id}/estado` → RPC (validación transición + append timeline)
- `POST /api/agendas/{id}/evento` → RPC (append)
- CRUD `/api/agendas/{id}/tests/*` → PostgREST + RPC create
- CRUD `/api/feedback/*` → PostgREST + RPC create
- CRUD `/api/catalogos/{id}/plating/*` → PostgREST + RPC create
- CRUD `/api/ware/*` → PostgREST

### FASE 5 (imágenes)
- `GET /api/images/signed` → `supabase.storage.createSignedUrl` directo
- `POST /api/{ent}/{id}/images` → Storage upload + PostgREST (dedup en cliente)
- `PATCH /api/{ent}/{id}/images/{id}` → PostgREST
- `DELETE /api/{ent}/{id}/images/{id}` → RPC con cleanup de Storage

### Edge Functions (FASE 6)
- `GET /api/ia/status` + `GET /api/settings/key-status` → EF `ia-status`
- `PATCH /api/settings` → EF `settings`
- `GET /api/settings/test-providers` → EF `test-providers`

---

## ⚠️ Endpoints que QUEDAN en FastAPI

Razón: dependen del **agente Python** (`agents/creativo/agent.py`, ~600 líneas)
que orquesta llamadas a MiniMax y OpenRouter con prompts específicos del
restaurante Sol de Nit. Portar a Deno/TypeScript es un proyecto aparte.

### IA (5 endpoints)
- `POST /api/ia/ideas` → `agent._generar_ideas_llm`
- `POST /api/ia/aplicar-metodo` → `agent._aplicar_metodo_a_idea`
- `POST /api/ia/idea-cientifica` → `agent.procesar_mensaje_idea_cientifica`
- `POST /api/ia/chat` → `agent.procesar_mensaje_chat`
- `POST /api/ia/ayuda-semanal` → construye contexto SQL + chat

### IA-Plating (2 endpoints)
- `POST /api/catalogos/{id}/plating/generar` → `context_builder.build_plating_context` + LLM + insert
- `GET /api/catalogos/{id}/ware/generar` → `context_builder.build_ware_context` + LLM

### IA-Ficha (1 endpoint)
- `POST /api/tests/{id}/generar-ficha` → OpenRouter ficha

### Otros (3 endpoints)
- `GET /api/ia/metodos` → ESTÁTICO (13 métodos hardcoded). Migrable a cliente.
- `PATCH /api/tests/{id}/evaluacion` → guarda `evaluacion` (jsonb) en development_tests. Migrable a PostgREST.
- `GET /api/healthz` → Migrado a `lib/healthcheck.ts` en cliente.

### Patrón de uso
El frontend sigue llamando a estos endpoints vía `httpClient` cuando no hay
alternativa Supabase. El proxy de Vite (`vite.config.ts`) sigue apuntando
opcionalmente a `VITE_LEGACY_BACKEND_URL` para dev local.

---

## 📋 Plan para eliminar FastAPI completamente

1. **Portar `agents/creativo/agent.py` a Deno/TypeScript** (~2-3 semanas)
   - Replicar `_generar_ideas_llm`, `procesar_mensaje_idea_cientifica`,
     `procesar_mensaje_chat`, `_aplicar_metodo_a_idea`
   - Migrar prompts desde `agents/creativo/prompts/*.md`
2. **Migrar `context_builder.py`** (build_plating_context, build_ware_context)
3. **Crear Edge Functions** `ia-ideas`, `ia-chat`, `ia-idea-cientifica`,
   `ia-aplicar-metodo`, `ia-ayuda-semanal`, `plating-generar`,
   `ware-generar`, `generar-ficha`
4. **Actualizar frontend** `services/ia.ts` para usar EF
5. **Borrar** `admin-web/backend/`, `start.sh`, `start.bat`,
   `start.*` files, `.github/workflows/` (si deploya backend)
6. **Eliminar dependencias** Python (`requirements.txt` raíz,
   `admin-web/backend/requirements.txt`)

---

## 🔒 Qué NO debe tocar el cliente

- API keys de IA (viven en `app_settings`, leídas por EF / FastAPI legacy)
- `SUPABASE_SERVICE_ROLE_KEY` (solo EF + futuras migraciones)
- `SUPABASE_ACCESS_TOKEN` (legacy, ya no se usa)
- `MINIMAX_API_KEY`, `OPENROUTER_API_KEY` (viven en `app_settings`)

El cliente solo necesita:
- `VITE_SUPABASE_URL` (público)
- `VITE_SUPABASE_ANON_KEY` (público, RLS filtra acceso)
- (opcional) `VITE_LEGACY_BACKEND_URL` para IA no migrada
- (opcional) `VITE_BASE_PATH` para GitHub Pages subpath