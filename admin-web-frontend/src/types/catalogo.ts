// Tipos del dominio Catálogo. Espejo de admin-web/backend/models.py + queries.py.

export interface Catalogo {
    id: string;
    notion_id: string;
    titulo: string;
    orden: number | null;
    precio: number | null;
    anio: string | null;
    estado: string | null;
    categorias: string[] | null;
    seleccionada: boolean | null;
    ingredientes: string | null;
    receta_estructurada: unknown;
    notion_last_edited: string | null;
    migrated_at: string;
    migration_run_id: string;
}

export interface CatalogoCreate {
    titulo: string;
    orden?: number;
    precio?: number;
    anio?: string;
    estado?: string;
    categorias?: string[];
    seleccionada?: boolean;
    ingredientes?: string;
}

export interface CatalogoUpdate extends Partial<CatalogoCreate> {
    receta_estructurada?: unknown;
}

export interface CatalogoDetail {
    item: Catalogo;
    blocks: import("@/types/block").Block[];
    images: import("@/types/image").EntityImage[];
    relations: import("@/types/relation").Relations;
}

/** Item de /api/catalogos/grupos (lista plana agrupada por categoría). */
export interface CatalogoGrupo {
    categoria: string;
    items: Catalogo[];
}
