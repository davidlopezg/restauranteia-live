/**
 * Servicio de settings — fachada Supabase (Edge Functions + PostgREST) / Legacy.
 *
 * - get():          PostgREST (filtra secretos server-side)
 * - keyStatus():    Edge Function `ia-status` → fallback PostgREST
 * - update():       Edge Function `settings` → fallback PostgREST directo
 * - clear():        borra una key (PostgREST directo)
 * - testProviders(): Edge Function `test-providers` (probe HTTP real)
 *
 * IMPORTANTE: las Edge Functions pueden NO existir en el proyecto (si el
 * deploy falló). En ese caso la escritura se hace directo contra PostgREST,
 * que es exactamente lo que hacía el backend `/api/settings` antes de la
 * migración a React. Ver `services/edge-functions.ts` para el porqué.
 */
import { env } from "@/config/env";
import { invokeEdgeFunction, isEdgeFunctionMissing, probeEdgeFunction } from "@/services/edge-functions";
import { httpClient } from "@/services/http-client";
import { settingsLegacy, settingsSupabaseService } from "@/services/settings.supabase";
import type { KeyStatusResponse, SettingsResponse, SettingsUpdate, TestProvidersResponse } from "@/types/filters";

export const settingsKeys = {
    all: () => ["settings"] as const,
    keyStatus: () => ["settings", "key-status"] as const,
    functions: () => ["settings", "functions"] as const,
};

/** Reexport por compatibilidad con código que importaba el error anterior. */
export { EdgeFunctionError as FunctionInvokeError } from "@/services/edge-functions";

export const settingsService = {
    get: (): Promise<SettingsResponse> => {
        if (env.isSupabaseConfigured) return settingsSupabaseService.get();
        return settingsLegacy.get();
    },

    keyStatus: async (): Promise<KeyStatusResponse> => {
        if (!env.isSupabaseConfigured) return settingsLegacy.keyStatus();
        try {
            return await invokeEdgeFunction<KeyStatusResponse>("ia-status");
        } catch (err) {
            // La Edge Function no está desplegada → consultamos la presencia directamente.
            if (!isEdgeFunctionMissing(err)) throw err;
            return settingsSupabaseService.keyStatus();
        }
    },

    update: async (body: SettingsUpdate | Record<string, unknown>): Promise<{ updated: Record<string, string> }> => {
        if (!env.isSupabaseConfigured) {
            return httpClient.patch<{ updated: Record<string, string> }>("/api/settings", body);
        }
        try {
            return await invokeEdgeFunction<{ updated: Record<string, string> }>("settings", { keys: body });
        } catch (err) {
            // La Edge Function no está disponible (no desplegada, o el navegador no
            // puede invocarla por CORS) → escribimos directo en PostgREST, que es
            // exactamente lo que hacía el backend /api/settings.
            console.warn("[settings] Edge Function no disponible, se escribe en PostgREST:", err);
            return settingsSupabaseService.upsert(body as Record<string, string>);
        }
    },

    /**
     * Borra una key (deja el valor vacío). Sirve para partir de cero cuando
     * hay una key vieja guardada que ya no sirve.
     */
    clear: async (key: string): Promise<{ updated: Record<string, string> }> => {
        if (!env.isSupabaseConfigured) {
            return httpClient.patch<{ updated: Record<string, string> }>("/api/settings", { [key]: "" });
        }
        return settingsSupabaseService.upsert({ [key]: "" });
    },

    /** ¿Están desplegadas las Edge Functions del proyecto? (para avisos en la UI) */
    functionsDeployed: async (): Promise<{ deployed: boolean; detail?: string }> => {
        if (!env.isSupabaseConfigured) return { deployed: false, detail: "Supabase no configurado" };
        return probeEdgeFunction("ia-status");
    },

    testProviders: async (): Promise<TestProvidersResponse> => {
        if (!env.isSupabaseConfigured) {
            return httpClient.get<TestProvidersResponse>("/api/settings/test-providers");
        }
        try {
            return await invokeEdgeFunction<TestProvidersResponse>("test-providers");
        } catch (err) {
            if (!isEdgeFunctionMissing(err)) throw err;
            throw new Error('La Edge Function "test-providers" no está desplegada en el proyecto: no se puede probar la conexión real con los proveedores.');
        }
    },
};
