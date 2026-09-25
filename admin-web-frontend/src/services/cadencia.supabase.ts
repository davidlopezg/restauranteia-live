/**
 * Cadencia semanal (lectura) desde Supabase.
 *
 * - semana-actual: RPC `cadencia_semana_actual` (recalculate + upsert coordinados)
 * - historial: PostgREST directo a `weekly_objectives`
 */

import { callRpc } from "@/lib/rpc";
import { getSupabase } from "@/lib/supabase";
import type {
    CadenciaSemana,
    CadenciaSemanaActualResponse,
    CadenciaActividad,
} from "@/types/cadencia";
import { httpClient } from "@/services/http-client";

async function semanaActualSupabase(): Promise<CadenciaSemanaActualResponse> {
    return callRpc<CadenciaSemanaActualResponse>("cadencia_semana_actual");
}

async function historialSupabase(limit = 12): Promise<CadenciaSemana[]> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    const { data, error } = await supabase
        .from("weekly_objectives")
        .select("*")
        .order("semana_inicio", { ascending: false })
        .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as CadenciaSemana[];
}

// Re-exportamos el tipo actividad por si lo necesitan otros componentes
export type { CadenciaActividad };

export const cadenciaKeys = {
    semanaActual: () => ["cadencia", "semana-actual"] as const,
    historial: (limit: number) => ["cadencia", "historial", limit] as const,
};

export const cadenciaSupabaseService = {
    semanaActual: semanaActualSupabase,
    historial: historialSupabase,
    isAvailable: () => Boolean(getSupabase()),
};

export const cadenciaLegacy = {
    semanaActual: () => httpClient.get<CadenciaSemanaActualResponse>("/api/cadencia/semana-actual"),
    historial: (limit = 12) => httpClient.get<CadenciaSemana[]>(`/api/cadencia/historial?limit=${limit}`),
};