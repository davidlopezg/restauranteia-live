// Tipos del dominio Idea. Espejo de admin-web/backend/models.py (IdeaCreate/Update)
// + campos de lectura de admin-web/backend/queries.py (list_ideas, detail_idea).

export interface Idea {
    id: string;
    notion_id: string;
    titulo: string;
    descripcion: string | null;
    categorias: string[] | null;
    puntuacion: string | null;
    estado_idea: string | null;
    fecha_creacion: string | null;
    notion_last_edited: string | null;
    migrated_at: string;
    migration_run_id: string;
}

export interface IdeaCreate {
    titulo: string;
    descripcion?: string;
    categorias?: string[];
    puntuacion?: string;
    estado_idea?: string;
    fecha_creacion?: string;
}

export type IdeaUpdate = Partial<IdeaCreate>;

// Detalle extendido (incluye bloques + imágenes + relaciones).
// Coincide con el `detail_idea()` de queries.py.
export interface IdeaDetail {
    item: Idea;
    blocks: import("@/types/block").Block[];
    images: import("@/types/image").EntityImage[];
    relations: import("@/types/relation").Relations;
}
