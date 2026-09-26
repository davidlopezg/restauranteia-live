/**
 * Cliente Supabase singleton.
 *
 * - Lee VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY desde env.
 * - Configura auth con persistencia en localStorage (default).
 * - Detecta cambios de sesión automáticamente (onAuthStateChange).
 *
 * En GH Pages la anon key es pública — la seguridad viene de RLS, no de la key.
 *
 * Las tablas de datos viven en schema `notion_migration`.
 * Auth, Storage y Edge Functions operan desde el schema default (`public`).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

// Cliente tipado como any para evitar que supabase-js infiera never[]
// cuando usamos schema != "public"
let _client: SupabaseClient<any, any, any> | null = null;
let _dbClient: SupabaseClient<any, any, any> | null = null;

/**
 * Cliente Supabase base (schema `public`).
 * Usar para: auth, Edge Functions, Storage, y todo lo que use schema default.
 */
export function getSupabase(): SupabaseClient<any, any, any> | null {
    if (!env.isSupabaseConfigured) return null;
    if (!_client) {
        _client = createClient<any, any, any>(
            env.supabaseUrl,
            env.supabaseAnonKey,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                    storageKey: "restauranteia-auth",
                },
            },
        );
    }
    return _client;
}

/**
 * Cliente Supabase scoped a schema `notion_migration`.
 * Usar para: CRUD de entidades (ideas, agendas, catalogos, tests, etc.).
 * Las tablas viven en schema `notion_migration`, no en `public`.
 */
export function getDbClient(): SupabaseClient<any, any, any> | null {
    const supabase = getSupabase();
    if (!supabase) return null;
    if (!_dbClient) {
        _dbClient = createClient<any, any, any>(
            env.supabaseUrl,
            env.supabaseAnonKey,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                    storageKey: "restauranteia-auth",
                },
                db: { schema: "notion_migration" },
            },
        );
    }
    return _dbClient;
}

/**
 * Helper para Edge Function invocations.
 */
export function invokeEdgeFunction<T>(
    functionName: string,
    body: Record<string, unknown> = {},
): Promise<{ data: T | null; error: unknown }> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no está configurado");
    return supabase.functions.invoke<T>(functionName, { body });
}