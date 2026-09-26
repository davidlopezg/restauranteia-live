/**
 * Cliente Supabase singleton.
 *
 * - Lee VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY desde env.
 * - Configura auth con persistencia en localStorage (default).
 * - Detecta cambios de sesión automáticamente (onAuthStateChange).
 *
 * En GH Pages la anon key es pública — la seguridad viene de RLS, no de la key.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

let _client: SupabaseClient | null = null;

/**
 * Devuelve el cliente Supabase. Si no está configurado, devuelve null
 * y el caller debe decidir qué hacer (mostrar pantalla de config, etc).
 */
export function getSupabase(): SupabaseClient | null {
    if (!env.isSupabaseConfigured) return null;
    if (!_client) {
        _client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                storageKey: "restauranteia-auth",
            },
            db: { schema: "notion_migration" },
        });
    }
    return _client;
}

/**
 * Versión tipada del cliente con Database. Por ahora usamos `any` para Database;
 * cuando definamos los tipos exactos de cada tabla, lo casteamos.
 */
export type DbClient = ReturnType<typeof getSupabase>;