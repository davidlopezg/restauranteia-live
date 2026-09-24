// Tipos de Feedback de mesa. Espejo de admin-web/backend/models.py + queries.py.

export interface TestFeedback {
    id: string;
    test_id: string;
    mesa: string;
    num_personas: number | null;
    valoracion: number | null;
    criterio: string | null;
    observacion: string | null;
    fecha: string | null;
    migrated_at: string;
}

export interface FeedbackCreate {
    mesa: string;
    num_personas?: number;
    valoracion?: number;
    criterio?: string;
    observacion?: string;
    fecha?: string;
}

export type FeedbackUpdate = Partial<FeedbackCreate>;
