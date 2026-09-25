/**
 * Servicios de desarrollo (pipeline + pendientes) leídos desde Supabase.
 *
 * - pipeline: RPC `pipeline_por_estado` (devuelve dict {estado: [agendas...]})
 * - pendientes: RPC `pendientes` (calcula prioridad según dias_sin_actividad)
 * - estados: hardcoded, no necesita backend (coincide con types/pipeline.ts)
 */

import { callRpc } from "@/lib/rpc";
import type { EstadoDesarrollo, AgendaPipeline } from "@/types/pipeline";
import type { PendienteItem, EstadosDesarrolloResponse } from "@/services/desarrollo";
import { httpClient } from "@/services/http-client";

async function pipelineSupabase(): Promise<Record<EstadoDesarrollo, AgendaPipeline[]>> {
    const data = await callRpc<Record<string, AgendaPipeline[]>>("pipeline_por_estado");
    const out = {} as Record<EstadoDesarrollo, AgendaPipeline[]>;
    for (const [k, v] of Object.entries(data ?? {})) {
        out[k as EstadoDesarrollo] = v ?? [];
    }
    return out;
}

async function pendientesSupabase(): Promise<PendienteItem[]> {
    return callRpc<PendienteItem[]>("pendientes");
}

export const desarrolloSupabase = {
    pipeline: pipelineSupabase,
    pendientes: pendientesSupabase,
    isAvailable: () => Boolean(callRpc),
};

// Estados hardcoded — no necesita backend (ya viene del types/pipeline.ts).
// Pero lo expongo por compatibilidad con el servicio anterior.
const ESTADOS: EstadoDesarrollo[] = [
    "CONCEPTO",
    "PRUEBA_1",
    "EVALUACION_1",
    "MODIFICACION",
    "PRUEBA_2",
    "VALIDACION",
    "PRODUCTO",
];

const TRANS: Record<EstadoDesarrollo, EstadoDesarrollo[]> = {
    CONCEPTO: ["PRUEBA_1"],
    PRUEBA_1: ["EVALUACION_1"],
    EVALUACION_1: ["MODIFICACION", "PRUEBA_2"],
    MODIFICACION: ["PRUEBA_2"],
    PRUEBA_2: ["VALIDACION"],
    VALIDACION: ["PRODUCTO"],
    PRODUCTO: [],
};

function estadosSupabase(): EstadosDesarrolloResponse {
    return { estados: ESTADOS, transiciones: TRANS };
}

export const estadosSupabaseService = {
    get: estadosSupabase,
};

// Legacy fallback (FastAPI)
export const desarrolloLegacy = {
    pipeline: () => httpClient.get<Record<EstadoDesarrollo, AgendaPipeline[]>>("/api/desarrollo/pipeline"),
    pendientes: () => httpClient.get<PendienteItem[]>("/api/pendientes"),
};