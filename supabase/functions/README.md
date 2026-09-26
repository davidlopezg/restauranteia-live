# Supabase Edge Functions

Edge Functions escritas en Deno/TypeScript que corren en el edge de Supabase.
Reemplazan TODOS los endpoints de FastAPI que dependen de la IA.

## Funciones

| Función | Reemplaza | Por qué |
|---|---|---|
| `ia-status` | `GET /api/ia/status` + `GET /api/settings/key-status` | Lee `app_settings` con service_role |
| `settings` | `PATCH /api/settings` | Escribe en `app_settings` con whitelist |
| `test-providers` | `GET /api/settings/test-providers` | Prueba MiniMax + OpenRouter con keys de BD |
| `ia-ideas` | `POST /api/ia/ideas`, `POST /api/ia/aplicar-metodo`, `GET /api/ia/metodos`, convierte idea a ficha | Porte completo del agente Python (ideas creativas) |
| `ia-chat` | `POST /api/ia/chat` | Chat libre con el chef (porte del agente Python) |
| `ia-idea-cientifica` | `POST /api/ia/idea-cientifica` | Ideas científicas con flavor engine (porte completo) |
| `ia-ayuda-semanal` | `POST /api/ia/ayuda-semanal` | Ayuda semanal con contexto de BD |
| `plating-generar` | `POST /api/catalogos/{id}/plating/generar` | Genera 3 propuestas de emplatado + guarda en BD |
| `ware-generar` | `GET /api/catalogos/{id}/ware/generar` | Genera combinaciones de vajilla del inventario |
| `generar-ficha` | `POST /api/tests/{id}/generar-ficha` | Genera ficha de prueba via OpenRouter |

## Módulos compartidos (`_shared/`)

| Módulo | Descripción |
|---|---|
| `cors.ts` | Headers CORS + helpers de respuesta |
| `ia-client.ts` | Cliente MiniMax (OpenAI-compatible) + OpenRouter + parseo de ideas |
| `context.ts` | Carga y formatea contexto del restaurante y catálogo |
| `prompts.ts` | System prompts embebidos (ideas_creativas, chat, idea_cientifica, ficha, plating, ware) |
| `flavor-engine.ts` | Motor de flavor embebido (78 ingredientes curados con CIDs PubChem) |

## Migración completada

**FastAPI eliminado como dependencia.** Todo el backend IA corre en Edge Functions.
El frontend llama via `supabase.functions.invoke()`.

### Lo que se portó del agente Python (`agents/creativo/agent.py`)

- `call_minimax` → `_shared/ia-client.ts` con reintentos, validación de idioma, backoff
- `_generar_ideas_llm` + `_parsear_ideas` → `ia-ideas` (action: generar)
- `_aplicar_metodo_a_idea` → `ia-ideas` (action: aplicar_metodo)
- `procesar_mensaje_ideas_creativas` → `ia-ideas` (dispatch de comandos)
- `procesar_mensaje_chat` → `ia-chat`
- `procesar_mensaje_idea_cientifica` → `ia-idea-cientifica`
- `formatear_restaurante_para_chef` → `_shared/context.ts` formatearRestaurante
- `formatear_catalogo_para_chef` → `_shared/context.ts` formatearCatalogo
- `check_estacionalidad` → se omite (el LLM juzga por contexto)

### Lo que se portó de `admin-web/backend/`

- `context_builder.py` → `plating-generar` y `ware-generar`
- `ia_client.py` → `_shared/ia-client.ts`
- `openrouter_client.py` → `generar-ficha`
- `ia_integration.py` → integrado en `ia-ideas` y `ia-chat`

### Estáticos / simples que ya no necesitan FastAPI

- `GET /api/ia/metodos` → array estático en frontend (`METODOS_CREATIVOS`)
- `PATCH /api/tests/{id}/evaluacion` → PostgREST directo (via `testsSupabase.update`)
- `GET /api/healthz` → ya migrado a `lib/healthcheck.ts`

## Deploy

```bash
# Login + link
supabase login
supabase link --project-ref iprvxvsqpvsbvqbnfvly

# Deploy (sin verificar JWT porque validamos manualmente)
supabase functions deploy ia-status --no-verify-jwt
supabase functions deploy settings --no-verify-jwt
supabase functions deploy test-providers --no-verify-jwt
supabase functions deploy ia-ideas --no-verify-jwt
supabase functions deploy ia-chat --no-verify-jwt
supabase functions deploy ia-idea-cientifica --no-verify-jwt
supabase functions deploy ia-ayuda-semanal --no-verify-jwt
supabase functions deploy plating-generar --no-verify-jwt
supabase functions deploy ware-generar --no-verify-jwt
supabase functions deploy generar-ficha --no-verify-jwt
```

## Secrets requeridos

Solo los auto-inyectados por Supabase:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Las API keys de IA viven en `app_settings` (configurables desde la UI).

## Invocar desde el frontend

```typescript
import { getSupabase } from "@/lib/supabase";
const supabase = getSupabase();
const { data, error } = await supabase.functions.invoke("ia-chat", {
    body: { peticion: "¿Qué me recomiendas para otoño?" },
});
```