// Tipos de Pruebas (development_tests) y Evaluación.
// Espejo de admin-web/backend/models.py + queries.py.

export type TestEstado = "PENDIENTE" | "REALIZADA" | "APROBADO" | "DESCARTADA";

/** Criterios propios de Sol de Nit para evaluar una prueba (1-5 estrellas cada uno). */
export interface EvaluacionCriterios {
    /** Está bueno / sabroso. */
    sabor: number;
    /** Tiene identidad propia, no es genérico. */
    identidad: number;
    /** Encaja con el concepto del restaurante. */
    encaja: number;
    /** Se puede ejecutar bien en servicio real. */
    ejecutable: number;
    /** Tiene sentido económico (costes / tiempo vs precio). */
    viable: number;
}

/** Resultado de la evaluación: criterios + promedio + veredicto. */
export interface EvaluacionProducto {
    criterios: EvaluacionCriterios;
    promedio: number;
    /** Derivado del promedio. >=4 verde, >=3 amarillo, <3 rojo. */
    veredicto: "APTA" | "REPASA" | "DESCARTAR";
}

export interface DevTest {
    id: string;
    agenda_id: string;
    numero: number;
    fecha: string | null;
    estado: TestEstado;
    objetivo: string | null;
    receta_utilizada: string | null;
    modificaciones: string | null;
    resultado: string | null;
    observaciones: string | null;
    /** JSON con la ficha generada por IA (o texto plano). */
    ficha_generada: unknown;
    /** JSON con los criterios de evaluación respondidos. */
    evaluacion: unknown;
    migrated_at: string;
}

export interface TestCreate {
    fecha?: string;
    estado?: TestEstado;
    objetivo?: string;
    receta_utilizada?: string;
    modificaciones?: string;
    resultado?: string;
    observaciones?: string;
}

export type TestUpdate = Partial<TestCreate> & { ficha_generada?: unknown; evaluacion?: unknown };
