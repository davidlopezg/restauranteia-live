import { httpClient } from "@/services/http-client";
import type { EstadoDesarrollo, PipelinePorEstado, AgendaPipeline } from "@/types/pipeline";

// Servicios de desarrollo: pipeline, pendientes, estados, eventos.
// Coincide con admin-web/backend/routers/desarrollo.py.

export const desarrolloKeys = {
    pipeline: () => ["desarrollo", "pipeline"] as const,
    estados: () => ["desarrollo", "estados"] as const,
    pendientes: () => ["desarrollo", "pendientes"] as const,
};

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

export const desarrolloService = {
    pipeline: () =>
        httpClient
            .get<PipelinePorEstado>("/api/desarrollo/pipeline")
            .then((data): Record<EstadoDesarrollo, AgendaPipeline[]> => {
                // Backend devuelve objeto plano; nos aseguramos de tiparlo correctamente.
                const out = {} as Record<EstadoDesarrollo, AgendaPipeline[]>;
                for (const [k, v] of Object.entries(data ?? {})) {
                    out[k as EstadoDesarrollo] = v as AgendaPipeline[];
                }
                return out;
            }),
    estados: () => httpClient.get<EstadosDesarrolloResponse>("/api/desarrollo/estados"),
    pendientes: () => httpClient.get<PendienteItem[]>("/api/pendientes"),
    cambiarEstado: (agendaId: string, body: CambiarEstadoRequest) =>
        httpClient.patch<AgendaPipeline>(`/api/agendas/${agendaId}/estado`, body),
    agregarEvento: (agendaId: string, body: AgregarEventoRequest) =>
        httpClient.post<AgendaPipeline>(`/api/agendas/${agendaId}/evento`, body),
};
