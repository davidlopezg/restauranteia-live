/**
 * Servicios de entidades — fachada unificada.
 *
 * Usa Supabase directo si está configurado (PostgREST + RPCs).
 * Si no, fallback al backend FastAPI legacy (httpClient a /api/...).
 *
 * Esto permite migración gradual: cada componente ya consume este módulo
 * sin saber qué backend está detrás.
 */

import { env } from "@/config/env";
import {
    ideasSupabase, agendasSupabase, catalogosSupabase,
    ideasLegacy, agendasLegacy, catalogosLegacy,
    type IdeasListParams, type AgendasListParams, type CatalogosListParams,
} from "@/services/entities.supabase";
import { httpClient } from "@/services/http-client";
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
    list: (params: IdeasListParams = {}): Promise<ListResponse<Idea>> => {
        if (env.isSupabaseConfigured) return ideasSupabase.list(params);
        return ideasLegacy.list(params);
    },
    detail: (id: string): Promise<IdeaDetail> => {
        if (env.isSupabaseConfigured) return ideasSupabase.detail(id);
        return ideasLegacy.detail(id);
    },
    // CRUD se mantiene en httpClient por ahora (FASE 3)
    create: (body: unknown) => httpClient.post<Idea>("/api/ideas", body),
    update: (id: string, body: unknown) => httpClient.patch<Idea>(`/api/ideas/${id}`, body),
    delete: (id: string) =>
        httpClient.delete<{ deleted: boolean; id: string }>(`/api/ideas/${id}`),
    convertir: (id: string) =>
        httpClient.post<{ already_exists: boolean; agenda_id: string; agenda_titulo: string }>(`/api/ideas/${id}/convertir`),
};

// === AGENDAS ===

export const agendasKeys = {
    all: ["agendas"] as const,
    list: (params: object) => ["agendas", "list", params] as const,
    detail: (id: string) => ["agendas", "detail", id] as const,
    filters: () => ["agendas", "filters"] as const,
};

export const agendasService = {
    list: (params: AgendasListParams = {}): Promise<ListResponse<Agenda>> => {
        if (env.isSupabaseConfigured) return agendasSupabase.list(params);
        return agendasLegacy.list(params);
    },
    detail: (id: string): Promise<AgendaDetail> => {
        if (env.isSupabaseConfigured) return agendasSupabase.detail(id);
        return agendasLegacy.detail(id);
    },
    create: (body: unknown) => httpClient.post<Agenda>("/api/agendas", body),
    update: (id: string, body: unknown) => httpClient.patch<Agenda>(`/api/agendas/${id}`, body),
    delete: (id: string) =>
        httpClient.delete<{ deleted: boolean; id: string }>(`/api/agendas/${id}`),
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
    list: (params: CatalogosListParams = {}): Promise<ListResponse<Catalogo>> => {
        if (env.isSupabaseConfigured) return catalogosSupabase.list(params);
        return catalogosLegacy.list(params);
    },
    detail: (id: string): Promise<CatalogoDetail> => {
        if (env.isSupabaseConfigured) return catalogosSupabase.detail(id);
        return catalogosLegacy.detail(id);
    },
    grupos: (): Promise<CatalogoGrupo[]> => {
        if (env.isSupabaseConfigured) return catalogosSupabase.grupos();
        return catalogosLegacy.grupos();
    },
    create: (body: unknown) => httpClient.post<Catalogo>("/api/catalogos", body),
    update: (id: string, body: unknown) => httpClient.patch<Catalogo>(`/api/catalogos/${id}`, body),
    delete: (id: string) =>
        httpClient.delete<{ deleted: boolean; id: string }>(`/api/catalogos/${id}`),
};

// Re-exports de tipos para imports existentes
export type { IdeasListParams, AgendasListParams, CatalogosListParams };