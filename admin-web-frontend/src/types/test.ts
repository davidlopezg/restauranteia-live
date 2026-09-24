// Tipos de Pruebas (development_tests) y Evaluación.
// Espejo de admin-web/backend/models.py + queries.py.

export type TestEstado = "PENDIENTE" | "REALIZADA" | "DESCARTADA";

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
    /** JSON con el cuestionario de mínimos respondido. */
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
