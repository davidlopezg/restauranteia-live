// Estados de desarrollo de un producto y transiciones válidas.
// Coinciden con admin-web/backend/queries.py:524-545 (ESTADOS_DESARROLLO / TRANSICIONES).

export const ESTADOS_DESARROLLO = [
    "CONCEPTO",
    "PRUEBA_1",
    "EVALUACION_1",
    "MODIFICACION",
    "PRUEBA_2",
    "VALIDACION",
    "PRODUCTO",
] as const;

export type EstadoDesarrollo = (typeof ESTADOS_DESARROLLO)[number];

/** Mapa de transiciones válidas (origen → destinos permitidos). */
export const TRANSICIONES: Record<EstadoDesarrollo, EstadoDesarrollo[]> = {
    CONCEPTO: ["PRUEBA_1"],
    PRUEBA_1: ["EVALUACION_1"],
    EVALUACION_1: ["MODIFICACION", "PRUEBA_2"],
    MODIFICACION: ["PRUEBA_2"],
    PRUEBA_2: ["VALIDACION"],
    VALIDACION: ["PRODUCTO"],
    PRODUCTO: [],
};

/** Etiquetas legibles para cada estado (UI). */
export const ESTADO_LABELS: Record<EstadoDesarrollo, string> = {
    CONCEPTO: "Concepto",
    PRUEBA_1: "Prueba 1",
    EVALUACION_1: "Evaluación 1",
    MODIFICACION: "Modificación",
    PRUEBA_2: "Prueba 2",
    VALIDACION: "Validación",
    PRODUCTO: "Producto",
};

/** Pipeline agrupado por estado. Es lo que devuelve GET /api/desarrollo/pipeline. */
export type PipelinePorEstado = Record<EstadoDesarrollo, AgendaPipeline[]>;

export interface AgendaPipeline {
    id: string;
    titulo: string;
    estado_desarrollo: EstadoDesarrollo | null;
    objetivo: string | null;
    fecha: string | null;
    receta_final: unknown;
    migrated_at: string | null;
    timeline: unknown;
}
