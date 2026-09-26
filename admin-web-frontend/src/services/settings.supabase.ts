/**
 * Settings (lectura) desde Supabase.
 *
 * GET /api/settings devolvía un dict seguro (sin api_keys).
 * La policy RLS `auth_read_safe_settings` ya filtra las claves secretas.
 *
 * Decisión: leemos TODAS las settings desde PostgREST (la RLS filtra server-side)
 * y exponemos el mismo shape que tenía el backend.
 */

import { getSupabase } from "@/lib/supabase";
import type { SettingsResponse, KeyStatusResponse } from "@/types/filters";
import { httpClient } from "@/services/http-client";

async function getSupabaseSettings(): Promise<SettingsResponse> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    const { data, error } = await supabase.from("app_settings").select("key, value");
    if (error) throw new Error(error.message);

    const out: Record<string, unknown> = {};
    for (const row of (data ?? []) as Array<{ key: string; value: string }>) {
        out[row.key] = row.value;
    }

    // Flags derivados: si existe minimax_api_key, está configurado.
    out["ia_configured"] = Boolean(out["minimax_api_key"]);
    out["openrouter_configured"] = Boolean(out["openrouter_api_key"]);
    out["minimax_key_source"] = out["minimax_api_key"] ? "bd" : "ninguna";
    out["openrouter_key_source"] = out["openrouter_api_key"] ? "bd" : "ninguna";
    return out as SettingsResponse;
}

async function keyStatusSupabase(): Promise<KeyStatusResponse> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["minimax_api_key", "minimax_model", "openrouter_api_key"]);
    if (error) throw new Error(error.message);

    const map: Record<string, string> = {};
    for (const row of (data ?? []) as Array<{ key: string; value: string }>) {
        map[row.key] = row.value;
    }
    return {
        ia_configured: Boolean(map["minimax_api_key"]),
        model: map["minimax_model"] ?? null,
        openrouter_configured: Boolean(map["openrouter_api_key"]),
        key_source: map["minimax_api_key"] ? "bd" : "ninguna",
    };
}

export const settingsKeys = {
    all: () => ["settings"] as const,
    keyStatus: () => ["settings", "key-status"] as const,
};

export const settingsSupabaseService = {
    get: getSupabaseSettings,
    keyStatus: keyStatusSupabase,
    isAvailable: () => Boolean(getSupabase()),
};

export const settingsLegacy = {
    get: () => httpClient.get<SettingsResponse>("/api/settings"),
    keyStatus: () => httpClient.get<KeyStatusResponse>("/api/settings/key-status"),
};