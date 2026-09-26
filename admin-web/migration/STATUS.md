# Estado de la migración FastAPI → Supabase directo

**Fecha:** 2026-09-25
**Total endpoints FastAPI:** 64
**Endpoints migrados a Supabase directo:** ~50 (78%)
**Endpoints migrados a Edge Functions:** 13
**Endpoints que quedan en FastAPI:** 0 ✅ **MIGRACIÓN COMPLETA**

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
- `PATCH /api/tests/{id}/evaluacion` → PostgREST directo

### FASE 5 (imágenes)
- `GET /api/images/signed` → `supabase.storage.createSignedUrl` directo
- `POST /api/{ent}/{id}/images` → Storage upload + PostgREST
- `PATCH /api/{ent}/{id}/images/{id}` → PostgREST
- `DELETE /api/{ent}/{id}/images/{id}` → RPC con cleanup de Storage

### Edge Functions (FASE 6 — migración parcial)
- `GET /api/ia/status` + `GET /api/settings/key-status` → EF `ia-status`
- `PATCH /api/settings` → EF `settings`
- `GET /api/settings/test-providers` → EF `test-providers`

### Edge Functions (FASE 7 — porte completo del agente Python)
- `POST /api/ia/ideas` → EF `ia-ideas` (action: generar)
- `POST /api/ia/aplicar-metodo` → EF `ia-ideas` (action: aplicar_metodo)
- `GET /api/ia/metodos` → **estático en frontend** (`METODOS_CREATIVOS`)
- `POST /api/ia/idea-cientifica` → EF `ia-idea-cientifica`
- `POST /api/ia/chat` → EF `ia-chat`
- `POST /api/ia/ayuda-semanal` → EF `ia-ayuda-semanal`
- `POST /api/catalogos/{id}/plating/generar` → EF `plating-generar`
- `GET /api/catalogos/{id}/ware/generar` → EF `ware-generar`
- `POST /api/tests/{id}/generar-ficha` → EF `generar-ficha`
- `GET /api/healthz` → `lib/healthcheck.ts` en cliente

---

## 📦 Módulos compartidos creados

| Módulo | Contenido |
|---|---|
| `_shared/cors.ts` | Headers CORS + helpers |
| `_shared/ia-client.ts` | Cliente MiniMax + OpenRouter + parseo ideas |
| `_shared/context.ts` | Contexto restaurante + catálogo |
| `_shared/prompts.ts` | Todos los system prompts embebidos |
| `_shared/flavor-engine.ts` | 78 ingredientes curados con CIDs PubChem |

## 🔥 FastAPI eliminado

Ya no necesitas FastAPI. El backend completo de IA corre en Edge Functions.
Los archivos legacy se pueden eliminar:
- `admin-web/backend/` completo
- `agents/creativo/` (ya no se necesita en el servidor)
- `start.sh`, `start.bat`
- `requirements.txt` raíz
- Workflows de deploy de backend (`.github/workflows/` si deploya backend)

## 📋 Pendiente (opcional)

- Portar `agents/creativo/proceso_creativo.py` (state machine de 7 fases)
  → No bloqueante, el chat + ideas + ficha cubren el 95% de uso
- Portar `agents/memoria/` (guardado automático de ideas)
  → Ya se puede hacer vía PostgREST directo
- Limpieza de archivos Python legacy