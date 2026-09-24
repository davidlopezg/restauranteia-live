import type { EstadoDesarrollo } from "@/types/pipeline";

// Tipos del dominio Agenda. Espejo de admin-web/backend/models.py + queries.py.

export interface TimelineEvent {
    ts: string;
    tipo: string;
    from?: EstadoDesarrollo | null;
    to?: EstadoDesarrollo | null;
    desc?: string;
    [extra: string]: unknown;
}

export interface Agenda {
    id: string;
    notion_id: string;
    titulo: string;
    fecha_creacion: string | null;
    fecha: string | null;
    etiquetas: string[] | null;
    estado_desarrollo: EstadoDesarrollo | null;
    objetivo: string | null;
    receta_final: unknown;
    timeline: TimelineEvent[] | null;
    notion_last_edited: string | null;
    migrated_at: string;
    migration_run_id: string;
}

export interface AgendaCreate {
    titulo: string;
    fecha_creacion?: string;
    fecha?: string;
    etiquetas?: string[];
}

export interface AgendaUpdate extends Partial<AgendaCreate> {
    estado_desarrollo?: EstadoDesarrollo;
    objetivo?: string;
    receta_final?: unknown;
    timeline?: TimelineEvent[];
}

export interface AgendaDetail {
    item: Agenda;
    blocks: import("@/types/block").Block[];
    images: import("@/types/image").EntityImage[];
    relations: import("@/types/relation").Relations;
}
