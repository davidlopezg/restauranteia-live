/**
 * Settings (lectura/escritura) desde Supabase.
 *
 * - Lectura: PostgREST sobre la vista `public.app_settings` EXCLUYENDO las claves
 *   secretas. La API key nunca viaja al navegador (la vista `public.app_settings`
 *   tiene `security_invoker = false`, o sea que la RLS de la tabla NO filtra:
 *   el filtro hay que ponerlo en la consulta).
 * - Estado de providers: consulta de presencia (`select=key` + `value=neq.`).
 *   Dice si hay key configurada sin devolver el valor.
 * - Escritura: upsert sobre `public.app_settings` (fallback cuando la Edge
 *   Function `settings` no está desplegada en el proyecto).
 *
 * GET /api/settings devolvía un dict seguro (sin api_keys).
 * La policy RLS `auth_read_safe_settings` ya filtra las claves secretas.
 */

import { getSupabase } from "@/lib/supabase";
import type { SettingsResponse, KeyStatusResponse } from "@/types/filters";
import { httpClient } from "@/services/http-client";

/** Claves NUNCA devueltas al frontend (secretos). */
export const SECRET_SETTING_KEYS = ["minimax_api_key", "openrouter_api_key", "prompt_ficha_test"];

/** Misma whitelist que la Edge Function `settings` (supabase/functions/settings). */
const UPDATABLE_KEYS = new Set([
    "minimax_api_key",
    "minimax_base_url",
    "minimax_model",
    "openrouter_api_key",
    "openrouter_base_url",
    "openrouter_model",
    "prompt_ficha_test",
    "prompt_emplatado",
    "plantilla_ficha_tecnica",
    "openrouter_image_model",
]);

async function getSupabaseSettings(): Promise<SettingsResponse> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .not("key", "in", `(${SECRET_SETTING_KEYS.join(",")})`);
    if (error) throw new Error(error.message);

    const out: Record<string, unknown> = {};
    for (const row of (data ?? []) as Array<{ key: string; value: string }>) {
        out[row.key] = row.value;
    }
    return out as SettingsResponse;
}

/**
 * Estado de providers sin leer los valores de las keys.
 * `select=key` + `value=neq.` devuelve SOLO las claves que tienen valor configurado
 * (una key guardada pero vacía cuenta como "no configurada").
 */
async function keyStatusSupabase(): Promise<KeyStatusResponse> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");

    const { data, error } = await supabase
        .from("app_settings")
        .select("key")
        .in("key", ["minimax_api_key", "openrouter_api_key"])
        .neq("value", "");
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{ key: string }>;
    const has = (k: string) => rows.some((r) => r.key === k);

    const { data: modelRow } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "minimax_model")
        .limit(1)
        .maybeSingle();
    const model = (modelRow as { value?: string } | null)?.value ?? null;

    return {
        ia_configured: has("minimax_api_key"),
        model,
        openrouter_configured: has("openrouter_api_key"),
        key_source: has("minimax_api_key") ? "bd" : "ninguna",
        openrouter_key_source: has("openrouter_api_key") ? "bd" : "ninguna",
    };
}

/**
 * Escritura directa en PostgREST.
 * Se usa cuando la Edge Function `settings` no está desplegada en el proyecto
 * (o el navegador no puede invocarla). Mismo resultado que el PATCH del backend.
 *
 * Patrón UPDATE + INSERT (como `queries.upsert_setting` del backend): NO usamos
 * `upsert()`/ON CONFLICT porque `public.app_settings` es una VISTA y las vistas
 * no tienen índice único → PostgREST devuelve 42P10.
 */
async function upsertSettingsDirect(
    keys: Record<string, string>,
): Promise<{ updated: Record<string, string> }> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");

    const updated: Record<string, string> = {};
    for (const [key, value] of Object.entries(keys)) {
        if (!UPDATABLE_KEYS.has(key)) continue;

        const { data, error: updErr } = await supabase
            .from("app_settings")
            .update({ value })
            .eq("key", key)
            .select("key");
        if (updErr) throw new Error(updErr.message);

        if (!data || data.length === 0) {
            // No existía la fila → insert. Si falla por conflicto (la fila existe
            // pero el UPDATE no la vio), reintentamos el UPDATE.
            const { error: insErr } = await supabase
                .from("app_settings")
                .insert({ key, value });
            if (insErr) {
                const { error: retryErr } = await supabase
                    .from("app_settings")
                    .update({ value })
                    .eq("key", key);
                if (retryErr) throw new Error(insErr.message);
            }
        }
        updated[key] = "updated";
    }
    return { updated };
}

export const settingsKeys = {
    all: () => ["settings"] as const,
    keyStatus: () => ["settings", "key-status"] as const,
};

export const settingsSupabaseService = {
    get: getSupabaseSettings,
    keyStatus: keyStatusSupabase,
    upsert: upsertSettingsDirect,
    isAvailable: () => Boolean(getSupabase()),
};

export const settingsLegacy = {
    get: () => httpClient.get<SettingsResponse>("/api/settings"),
    keyStatus: () => httpClient.get<KeyStatusResponse>("/api/settings/key-status"),
};
