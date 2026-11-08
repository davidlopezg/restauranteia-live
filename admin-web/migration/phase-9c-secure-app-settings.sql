-- =============================================================
-- FASE 9c — Cerrar la fuga de app_settings (API keys exposed)
-- =============================================================
--
-- PROBLEMA:
--   La vista public.app_settings se creó con `security_invoker = false`
--   (equivale a SECURITY DEFINER) + `GRANT SELECT ... TO anon, authenticated`.
--   Consecuencias:
--     1) La RLS de notion_migration.app_settings NO se aplica (la policy
--        `auth_read_safe_settings` que filtra minimax_api_key / openrouter_api_key
--        queda anulada).
--     2) Cualquier persona con la ANON key (pública, va dentro del bundle del
--        frontend) puede LEER tus API keys.
--     3) Con los default privileges de Supabase, anon también puede
--        INSERT/UPDATE/DELETE sobre la vista → puede SOBREESCRIBIR tus keys.
--
-- FIX (aplicar en el SQL Editor de Supabase):
--   - anon pierde TODOS los permisos sobre public.app_settings.
--   - authenticated conserva lo justo: SELECT (la UI lee los settings) y
--     INSERT/UPDATE (la UI guarda la API key). El frontend además filtra las
--     claves secretas en la consulta (`key=not.in.(...)`), así que el valor de
--     la key nunca viaja al navegador.
--   - service_role conserva acceso total (lo usan las Edge Functions).
--
-- Verificado antes de aplicar: GET /rest/v1/app_settings con la anon key
-- devolvía `minimax_api_key` en claro, y un PATCH con la anon key modificaba
-- filas de la tabla real.
--
-- Aplicar en el SQL Editor de Supabase (o `supabase db push`).
-- =============================================================

BEGIN;

-- 1) anon fuera de la vista con secretos (SELECT, INSERT, UPDATE, DELETE)
REVOKE ALL ON public.app_settings FROM anon;

-- 2) authenticated: puede leer y guardar settings, pero no borrar la tabla
REVOKE DELETE ON public.app_settings FROM authenticated;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;

-- 3) service_role (Edge Functions) sin cambios: acceso total
GRANT ALL ON public.app_settings TO service_role;

COMMIT;

-- =============================================================
-- VERIFICACIÓN (debe devolver 0 filas para anon)
-- =============================================================
-- curl "$SUPABASE_URL/rest/v1/app_settings?select=key,value" \
--   -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--   -H "Accept-Profile: public"
-- → 200 con []  (o 401/403). Antes devolvía la API key en claro.
