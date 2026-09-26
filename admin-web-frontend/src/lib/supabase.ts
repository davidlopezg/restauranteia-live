/**
 * Cliente Supabase singleton.
 *
 * Las tablas se acceden via vistas públicas que envuelven `notion_migration`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

let _client: SupabaseClient<any, any, any> | null = null;

/**
 * Cliente Supabase con tipos any para evitar inferencia estricta de tablas.
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