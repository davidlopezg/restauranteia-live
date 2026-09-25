/**
 * Servicios de entidades — fachada unificada Supabase / Legacy.
 *
 * Supabase si está configurado, fallback a FastAPI legacy si no.
 */

import { env } from "@/config/env";
import {
    ideasSupabase, agendasSupabase, catalogosSupabase, relationsSupabase,
    ideasLegacy, agendasLegacy, catalogosLegacy,
    ideasLegacyFull, agendasLegacyFull,
    relationsLegacy,
    type IdeasListParams, type AgendasListParams, type CatalogosListParams,
    type RelationKind,
} from "@/services/entities.supabase";
import type { ListResponse } from "@/types/entity";
import type { Idea, IdeaDetail } from "@/types/idea";
import type { Agenda, AgendaDetail } from "@/types/agenda";
import type { Catalogo, CatalogoDetail, CatalogoGrupo } from "@/types/catalogo";

// === IDEAS ===

export const ideasKeys = {
    all: ["ideas"] as const,
    list: (params: object) => ["ideas", "list", params] as const,
    detail: (id: string) => ["ideas", "detail", id] as const,
    filters: () => ["ideas", "filters"] as const,
};

export const ideasService = {
    list: (params: IdeasListParams = {}): Promise<ListResponse<Idea>> =>
        env.isSupabaseConfigured ? ideasSupabase.list(params) : ideasLegacy.list(params),

    detail: (id: string): Promise<IdeaDetail> =>
        env.isSupabaseConfigured ? ideasSupabase.detail(id) : ideasLegacy.detail(id),

    create: (body: Record<string, unknown>): Promise<Idea> =>
        env.isSupabaseConfigured ? ideasSupabase.create(body) : ideasLegacyFull.create(body),

    update: (id: string, body: Record<string, unknown>): Promise<Idea> =>
        env.isSupabaseConfigured ? ideasSupabase.update(id, body) : ideasLegacyFull.update(id, body),

    delete: (id: string): Promise<{ deleted: boolean; id: string }> =>
        env.isSupabaseConfigured ? ideasSupabase.delete(id) : ideasLegacyFull.delete(id),

    convertir: (id: string): Promise<{ already_exists: boolean; agenda_id: string; agenda_titulo: string }> =>
        env.isSupabaseConfigured ? ideasSupabase.convertir(id) : ideasLegacyFull.convertir(id),
};

// === AGENDAS ===

export const agendasKeys = {
    all: ["agendas"] as const,
    list: (params: object) => ["agendas", "list", params] as const,
    detail: (id: string) => ["agendas", "detail", id] as const,
    filters: () => ["agendas", "filters"] as const,
};

export const agendasService = {
    list: (params: AgendasListParams = {}): Promise<ListResponse<Agenda>> =>
        env.isSupabaseConfigured ? agendasSupabase.list(params) : agendasLegacy.list(params),

    detail: (id: string): Promise<AgendaDetail> =>
        env.isSupabaseConfigured ? agendasSupabase.detail(id) : agendasLegacy.detail(id),

    create: (body: Record<string, unknown>): Promise<Agenda> =>
        env.isSupabaseConfigured ? agendasSupabase.create(body) : agendasLegacyFull.create(body),

    update: (id: string, body: Record<string, unknown>): Promise<Agenda> =>
        env.isSupabaseConfigured ? agendasSupabase.update(id, body) : agendasLegacyFull.update(id, body),

    delete: (id: string): Promise<{ deleted: boolean; id: string }> =>
        env.isSupabaseConfigured ? agendasSupabase.delete(id) : agendasLegacyFull.delete(id),
};

// === CATALOGOS ===

export const catalogosKeys = {
    all: ["catalogos"] as const,
    list: (params: object) => ["catalogos", "list", params] as const,
    detail: (id: string) => ["catalogos", "detail", id] as const,
    filters: () => ["catalogos", "filters"] as const,
    grupos: () => ["catalogos", "grupos"] as const,
};

export const catalogosService = {
    list: (params: CatalogosListParams = {}): Promise<ListResponse<Catalogo>> =>
        env.isSupabaseConfigured ? catalogosSupabase.list(params) : catalogosLegacy.list(params),

    detail: (id: string): Promise<CatalogoDetail> =>
        env.isSupabaseConfigured ? catalogosSupabase.detail(id) : catalogosLegacy.detail(id),

    grupos: (): Promise<CatalogoGrupo[]> =>
        env.isSupabaseConfigured ? catalogosSupabase.grupos() : catalogosLegacy.grupos(),

    create: (body: Record<string, unknown>): Promise<Catalogo> =>
        env.isSupabaseConfigured ? catalogosSupabase.create(body) : catalogosLegacy.create(body),

    update: (id: string, body: Record<string, unknown>): Promise<Catalogo> =>
        env.isSupabaseConfigured ? catalogosSupabase.update(id, body) : catalogosLegacy.update(id, body),

    delete: (id: string): Promise<{ deleted: boolean; id: string }> =>
        env.isSupabaseConfigured ? catalogosSupabase.delete(id) : catalogosLegacy.delete(id),
};

// === RELACIONES N:M ===

export const relationsService = {
    add: (rel: RelationKind, aId: string, bId: string) =>
        env.isSupabaseConfigured
            ? relationsSupabase.add(rel, aId, bId)
            : relationsLegacy.add(rel, aId, bId),

    remove: (rel: RelationKind, aId: string, bId: string) =>
        env.isSupabaseConfigured
            ? relationsSupabase.remove(rel, aId, bId)
            : relationsLegacy.remove(rel, aId, bId),
};

// Re-exports
export type { IdeasListParams, AgendasListParams, CatalogosListParams, RelationKind };