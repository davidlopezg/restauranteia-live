# Supabase Edge Functions

Edge Functions escritas en Deno/TypeScript que corren en el edge de Supabase.
Reemplazan los endpoints de FastAPI que necesitan acceso a secretos (API keys)
o que ejecutan lógica que no queremos en el cliente.

## Funciones

| Función | Reemplaza | Por qué |
|---|---|---|
| `ia-status` | `GET /api/ia/status` + `GET /api/settings/key-status` | Lee `app_settings` con service_role. Sin secretos en la respuesta. |
| `settings` | `PATCH /api/settings` | Escribe en `app_settings` con whitelist de claves. Service_role. |
| `test-providers` | `GET /api/settings/test-providers` | Hace HTTP real a MiniMax + OpenRouter con keys guardadas en BD. NUNCA expone las keys. |

## Lo que NO está migrado (mantiene FastAPI)

Las siguientes dependen del **agente Python** (`agents/creativo/agent.py`)
y no se pueden traducir trivialmente a TypeScript/Deno:

- `POST /api/ia/ideas` → generar_ideas
- `POST /api/ia/aplicar-metodo` → aplicar_metodo_a_idea
- `POST /api/ia/idea-cientifica` → idea_cientifica
- `POST /api/ia/chat` → chat
- `POST /api/ia/ayuda-semanal` → construir contexto + chat
- `POST /api/catalogos/{id}/plating/generar` → build_plating_context + LLM + insert
- `GET /api/catalogos/{id}/ware/generar` → build_ware_context + LLM
- `POST /api/tests/{id}/generar-ficha` → OpenRouter ficha

Cuando se porte el agente Python a Deno (proyecto aparte), se podrán migrar
también.

## Deploy

```bash
# 1. Login
supabase login

# 2. Link al proyecto
supabase link --project-ref iprvxvsqpvsbvqbnfvly

# 3. Deploy cada función
supabase functions deploy ia-status --no-verify-jwt
supabase functions deploy settings --no-verify-jwt
supabase functions deploy test-providers --no-verify-jwt
```

(`--no-verify-jwt` porque las funciones validan el JWT del usuario
manualmente cuando lo necesitan; por ahora aceptamos anon + authenticated.)

## Secrets requeridos

Las funciones usan estas env vars (auto-inyectadas por Supabase):

- `SUPABASE_URL` — URL del proyecto (auto)
- `SUPABASE_SERVICE_ROLE_KEY` — para bypassear RLS en escrituras (auto)

NO requieren secrets adicionales (las API keys de IA viven en `app_settings`).

## Invocar desde el frontend

```typescript
import { getSupabase } from "@/lib/supabase";

const supabase = getSupabase();
const { data, error } = await supabase.functions.invoke("ia-status", {
    body: {},
});
```

La llamada envía el JWT del usuario logueado en el header `Authorization`.
Las funciones usan `service_role` internamente para escribir en `app_settings`,
pero el usuario debe estar autenticado (la RLS se aplica antes del invoke).