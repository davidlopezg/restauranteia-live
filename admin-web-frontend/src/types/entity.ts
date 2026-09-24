// Tipos mínimos compartidos por las 3 entidades (Idea / Agenda / Catálogo).
// Se completan en Fase 3 cuando se generan los servicios y queries específicas.

export type EntityKind = "ideas" | "agendas" | "catalogos";

/** Item mínimo que cualquier listado devuelve. Lo demás se afina por entidad. */
export interface BaseItem {
    id: string;
    titulo: string;
}

/** Forma de paginación cursor-based que devuelven los listados. */
export interface ListResponse<T> {
    items: T[];
    next_cursor?: string | null;
    total_in_page?: number;
}

/** Forma de error de FastAPI. */
export interface ApiErrorBody {
    detail?: string;
}
