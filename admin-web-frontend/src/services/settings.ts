/**
 * Servicio de settings — fachada Supabase (Edge Functions + PostgREST) / Legacy.
 *
 * - get(): PostgREST + RLS filtra secretos (FASE 2)
 * - keyStatus(): Edge Function `ia-status`
 * - update(): Edge Function `settings` (PATCH con whitelist)
 * - testProviders(): Edge Function `test-providers` (probe HTTP real)
 */

import { env } from "@/config/env";
import { getSupabase } from "@/lib/supabase";
import { settingsSupabaseService, settingsLegacy } from "@/services/settings.supabase";
import { httpClient } from "@/services/http-client";
import type { SettingsResponse, KeyStatusResponse, TestProvidersResponse, SettingsUpdate } from "@/types/filters";

export const settingsKeys = {
    all: () => ["settings"] as const,
    keyStatus: () => ["settings", "key-status"] as const,
};

// Llamada a Edge Function via supabase.functions.invoke (con JWT del usuario)
async function invokeFunction<T>(name: string, body?: Record<string, unknown>): Promise<T> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    const { data, error } = await supabase.functions.invoke<T>(name, {
        body: body ?? {},
    });
    if (error) throw new Error(error.message);
    return data as T;
}

export const settingsService = {
    get: (): Promise<SettingsResponse> => {
        if (env.isSupabaseConfigured) return settingsSupabaseService.get();
        return settingsLegacy.get();
    },

    keyStatus: (): Promise<KeyStatusResponse> => {
        if (env.isSupabaseConfigured) return invokeFunction<KeyStatusResponse>("ia-status");
        return settingsLegacy.keyStatus();
    },

    update: async (body: SettingsUpdate | Record<string, unknown>): Promise<{ updated: Record<string, string> }> => {
        if (env.isSupabaseConfigured) {
            return invokeFunction("settings", { keys: body });
        }
        return httpClient.patch<{ updated: Record<string, string> }>("/api/settings", body);
    },

    testProviders: (): Promise<TestProvidersResponse> => {
        if (env.isSupabaseConfigured) return invokeFunction<TestProvidersResponse>("test-providers");
        return httpClient.get<TestProvidersResponse>("/api/settings/test-providers");
    },
};