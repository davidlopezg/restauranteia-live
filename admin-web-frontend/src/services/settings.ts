/**
 * Servicio de settings — fachada Supabase (Edge Functions + PostgREST) / Legacy.
 *
 * - get(): PostgREST (filtra secretos server-side)
 * - keyStatus(): Edge Function `ia-status` → fallback PostgREST
 * - update(): Edge Function `settings` → fallback PostgREST directo
 * - testProviders(): Edge Function `test-providers` (probe HTTP real)
 *
 * IMPORTANTE: la Edge Function `settings` puede NO existir en el proyecto
 * (si nunca se desplegó). En ese caso la llamada devuelve 404 y el guardado
 * se hace directo contra PostgREST, que es exactamente lo que hacía el
 * backend `/api/settings` antes de la migración a React.
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

/** Error de invocación de Edge Function, con status HTTP para poder decidir el fallback. */
export class FunctionInvokeError extends Error {
    constructor(
        public fn: string,
        public status?: number,
        public detail?: string,
    ) {
        super(
            `Edge Function "${fn}" falló${status ? ` [${status}]` : ""}: ${detail || "sin detalle"}`,
        );
        this.name = "FunctionInvokeError";
    }
}

/**
 * ¿La Edge Function no está disponible?
 *
 * - 404 → no está desplegada en el proyecto.
 * - sin status → el navegador NI SIQUIQUIERA pudo hacer la request. Esto pasa
 *   cuando la función NO existe: el gateway de Supabase responde 404 sin
 *   `content-type` en los headers CORS, así que el preflight del navegador falla
 *   y supabase-js lanza "Failed to send a request to the Edge Function"
 *   (FunctionsFetchError) en lugar de devolver el 404.
 */
function isUnavailableFunction(err: unknown): boolean {
    if (err instanceof FunctionInvokeError) {
        return err.status === 404 || err.status === undefined;
    }
    const msg = err instanceof Error ? err.message : String(err);
    return /not found|404|no such function|failed to send a request/i.test(msg);
}

// Llamada a Edge Function via supabase.functions.invoke (con JWT del usuario)
async function invokeFunction<T>(name: string, body?: Record<string, unknown>): Promise<T> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    const { data, error } = await supabase.functions.invoke<T>(name, {
        body: body ?? {},
    });
    if (error) {
        const ctx = (error as { context?: Response }).context;
        let detail = "";
        try {
            detail = ctx ? await ctx.clone().text() : "";
        } catch {
            detail = "";
        }
        throw new FunctionInvokeError(name, ctx?.status, detail || error.message);
    }
    return data as T;
}

export const settingsService = {
    get: (): Promise<SettingsResponse> => {
        if (env.isSupabaseConfigured) return settingsSupabaseService.get();
        return settingsLegacy.get();
    },

    keyStatus: async (): Promise<KeyStatusResponse> => {
        if (!env.isSupabaseConfigured) return settingsLegacy.keyStatus();
        try {
            return await invokeFunction<KeyStatusResponse>("ia-status");
        } catch (err) {
            // La Edge Function no está desplegada → consultamos la presencia directamente.
            if (!isUnavailableFunction(err)) throw err;
            return settingsSupabaseService.keyStatus();
        }
    },

    update: async (body: SettingsUpdate | Record<string, unknown>): Promise<{ updated: Record<string, string> }> => {
        if (!env.isSupabaseConfigured) {
            return httpClient.patch<{ updated: Record<string, string> }>("/api/settings", body);
        }
        try {
            return await invokeFunction<{ updated: Record<string, string> }>("settings", { keys: body });
        } catch (err) {
            // La Edge Function no está disponible (no desplegada, o el navegador no
            // puede invocarla por CORS) → escribimos directo en PostgREST, que es
            // exactamente lo que hacía el backend /api/settings.
            console.warn("[settings] Edge Function no disponible, se escribe en PostgREST:", err);
            return settingsSupabaseService.upsert(body as Record<string, string>);
        }
    },

    testProviders: async (): Promise<TestProvidersResponse> => {
        if (!env.isSupabaseConfigured) {
            return httpClient.get<TestProvidersResponse>("/api/settings/test-providers");
        }
        try {
            return await invokeFunction<TestProvidersResponse>("test-providers");
        } catch (err) {
            if (!isUnavailableFunction(err)) throw err;
            throw new Error(
                'La Edge Function "test-providers" no está desplegada en el proyecto: no se puede probar la conexión real con los proveedores.',
            );
        }
    },
};
