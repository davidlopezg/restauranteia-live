/**
 * Healthcheck via PostgREST — query minima a Supabase.
 *
 * Reemplaza GET /api/healthz del backend FastAPI.
 * Hace un SELECT id LIMIT 1 a la tabla `ideas` (que existe seguro si RLS está OK).
 * Si falla, asumimos "no conectado".
 */

import { getSupabase } from "@/lib/supabase";

export interface HealthResult {
    ok: boolean;
    schema?: string;
    error?: string;
}

export async function healthcheckSupabase(): Promise<HealthResult> {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, error: "Supabase no configurado" };

    try {
        const { error } = await supabase
            .from("ideas")
            .select("id", { count: "exact", head: true })
            .limit(1);

        if (error) {
            return { ok: false, error: error.message };
        }
        return { ok: true, schema: "notion_migration" };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}