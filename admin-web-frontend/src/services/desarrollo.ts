/**
 * Servicio de desarrollo — fachada unificada Supabase / Legacy.
 *
 * - pipeline (RPC) y pendientes (RPC): Supabase
 * - cambiarEstado, agregarEvento: Supabase via RPC (FASE 4)
 * - estados: hardcoded
 */

import { env } from "@/config/env";
import { desarrolloSupabase, estadosSupabaseService, desarrolloLegacy } from "@/services/desarrollo.supabase";
import type { EstadoDesarrollo, AgendaPipeline } from "@/types/pipeline";
import { httpClient } from "@/services/http-client";

export type { EstadoDesarrollo, AgendaPipeline };

export interface EstadosDesarrolloResponse {
    estados: EstadoDesarrollo[];
    transiciones: Record<EstadoDesarrollo, EstadoDesarrollo[]>;
}

export interface PendienteItem {
    id: string;
    titulo: string;
    estado_desarrollo: EstadoDesarrollo;
    migrated_at: string | null;
    receta_final: unknown;
    objetivo: string | null;
    fecha: string | null;
    prioridad?: "ROJO" | "NARANJA" | "AMARILLO" | "VERDE";
    dias_sin_actividad?: number | null;
}

export interface CambiarEstadoRequest {
    estado_desarrollo: EstadoDesarrollo;
    descripcion?: string;
}

export interface AgregarEventoRequest {
    tipo: string;
    descripcion?: string;
    extra?: unknown;
}

export const desarrolloKeys = {
    pipeline: () => ["desarrollo", "pipeline"] as const,
    estados: () => ["desarrollo", "estados"] as const,
    pendientes: () => ["desarrollo", "pendientes"] as const,
};

export const desarrolloService = {
    pipeline: (): Promise<Record<EstadoDesarrollo, AgendaPipeline[]>> => {
        if (env.isSupabaseConfigured) return desarrolloSupabase.pipeline();
        return desarrolloLegacy.pipeline();
    },

    estados: (): Promise<EstadosDesarrolloResponse> =>
        Promise.resolve(estadosSupabaseService.get()),

    pendientes: (): Promise<PendienteItem[]> => {
        if (env.isSupabaseConfigured) return desarrolloSupabase.pendientes();
        return desarrolloLegacy.pendientes();
    },

    cambiarEstado: (agendaId: string, body: CambiarEstadoRequest): Promise<AgendaPipeline> => {
        if (env.isSupabaseConfigured) {
            return desarrolloSupabase.cambiarEstado(agendaId, body.estado_desarrollo, body.descripcion) as Promise<AgendaPipeline>;
        }
        return httpClient.patch<AgendaPipeline>(`/api/agendas/${agendaId}/estado`, body);
    },

    agregarEvento: (agendaId: string, body: AgregarEventoRequest): Promise<AgendaPipeline> => {
        if (env.isSupabaseConfigured) {
            return desarrolloSupabase.agregarEvento(agendaId, body.tipo, body.descripcion ?? "", body.extra) as Promise<AgendaPipeline>;
        }
        return httpClient.post<AgendaPipeline>(`/api/agendas/${agendaId}/evento`, body);
    },
};