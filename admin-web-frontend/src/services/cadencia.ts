/**
 * Servicio de cadencia — fachada unificada Supabase / Legacy.
 *
 * FASE 2: lecturas via Supabase (RPC + PostgREST).
 * FASE 3+: escrituras (PATCH /api/cadencia/{id}) — quedan con httpClient.
 */

import { env } from "@/config/env";
import { cadenciaSupabaseService, cadenciaLegacy } from "@/services/cadencia.supabase";
import type {
    CadenciaAplazarRequest,
    CadenciaSemana,
    CadenciaSemanaActualResponse,
    CadenciaUpdate,
} from "@/types/cadencia";
import { httpClient } from "@/services/http-client";

export const cadenciaKeys = {
    semanaActual: () => ["cadencia", "semana-actual"] as const,
    historial: (limit: number) => ["cadencia", "historial", limit] as const,
};

export const cadenciaService = {
    semanaActual: (): Promise<CadenciaSemanaActualResponse> => {
        if (env.isSupabaseConfigured) return cadenciaSupabaseService.semanaActual();
        return cadenciaLegacy.semanaActual();
    },
    historial: (limit = 12): Promise<CadenciaSemana[]> => {
        if (env.isSupabaseConfigured) return cadenciaSupabaseService.historial(limit);
        return cadenciaLegacy.historial(limit);
    },
    update: (weekId: string, body: CadenciaUpdate) =>
        httpClient.patch<CadenciaSemana>(`/api/cadencia/${weekId}`, body),
    aplazar: (weekId: string, body: CadenciaAplazarRequest) =>
        httpClient.post<{ ok: true }>(`/api/cadencia/${weekId}/aplazar`, body),
};