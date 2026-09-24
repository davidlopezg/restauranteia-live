// Tipos de relaciones N:M. Espejo de admin-web/backend/queries.py.

export type RelationKind = "idea_agenda" | "idea_catalogo" | "agenda_catalogo";

/** Lo que devuelve detail_{idea,agenda,catalogo} en su campo `relations`. */
export interface Relations {
    ideas?: Array<{ id: string; titulo: string; fecha_creacion?: string | null; estado_idea?: string | null }>;
    agendas?: Array<{ id: string; titulo: string; fecha?: string | null; estado_desarrollo?: string | null }>;
    catalogos?: Array<{ id: string; titulo: string; precio?: number | null; orden?: number | null }>;
}

export interface RelationRequest {
    a_id: string;
    b_id: string;
}

export interface RelationResponse {
    created: boolean;
    row?: unknown;
}
