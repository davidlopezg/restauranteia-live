// Tipos de cadencia semanal. Espejo de admin-web/backend/queries.py + routers/settings.py.

export interface CadenciaSemana {
    id: string;
    semana_inicio: string;
    semana_fin: string | null;
    objetivo_minimo: number;
    productos_completados: number;
    deuda: number;
    estado: "ACTIVA" | "COMPLETADA" | "APLAZADA";
    aplazamiento_motivo: string | null;
    aplazamiento_notas: string | null;
}

export interface CadenciaActividad {
    tests_creados: number;
    tests_completados: number;
    conceptos: number;
    productos: number;
}

export interface CadenciaSemanaActualResponse {
    week: CadenciaSemana;
    actividad: CadenciaActividad;
}

export interface CadenciaUpdate {
    objetivo_minimo?: number;
    deuda?: number;
}

export interface CadenciaAplazarRequest {
    motivo: string;
}
