/**
 * Servicio de settings — fachada unificada Supabase / Legacy.
 *
 * FASE 2: lectura via PostgREST + RLS filtra secretos.
 * FASE 6: escritura (PATCH /api/settings) sigue con httpClient hasta migrar a Edge Function.
 */

import { env } from "@/config/env";
import { settingsSupabaseService, settingsLegacy } from "@/services/settings.supabase";
import type { SettingsResponse, KeyStatusResponse, TestProvidersResponse } from "@/types/filters";
import { httpClient } from "@/services/http-client";

export const settingsKeys = {
    all: () => ["settings"] as const,
    keyStatus: () => ["settings", "key-status"] as const,
};

export const settingsService = {
    get: (): Promise<SettingsResponse> => {
        if (env.isSupabaseConfigured) return settingsSupabaseService.get();
        return settingsLegacy.get();
    },
    update: (body: Record<string, unknown> | object) =>
        httpClient.patch<SettingsResponse>("/api/settings", body),
    keyStatus: (): Promise<KeyStatusResponse> => {
        if (env.isSupabaseConfigured) return settingsSupabaseService.keyStatus();
        return settingsLegacy.keyStatus();
    },
    // testProviders hace requests HTTP reales con keys — queda en Edge Function (FASE 6)
    testProviders: () => httpClient.get<TestProvidersResponse>("/api/settings/test-providers"),
};