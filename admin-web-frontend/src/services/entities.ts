import { httpClient } from "@/services/http-client";
import type { Idea, IdeaCreate, IdeaDetail, IdeaUpdate } from "@/types/idea";
import type { Agenda, AgendaCreate, AgendaDetail, AgendaUpdate } from "@/types/agenda";
import type { Catalogo, CatalogoCreate, CatalogoDetail, CatalogoGrupo, CatalogoUpdate } from "@/types/catalogo";
import type { ListResponse } from "@/types/entity";
import type { ConvertirIdeaResponse } from "@/types/convertir";

// Servicios CRUD para las 3 entidades. Cada uno es solo funciones, sin clase.
// Las keys de query se centralizan aquí para que sea fácil invalidarlas.

// === IDEAS ===

export const ideasKeys = {
    all: ["ideas"] as const,
    list: (params: object) => ["ideas", "list", params] as const,
    detail: (id: string) => ["ideas", "detail", id] as const,
    filters: () => ["ideas", "filters"] as const,
};

export interface IdeasListParams {
    search?: string;
    categoria?: string;
    estado?: string;
    cursor?: string;
    limit?: number;
    order?: string;
    ascending?: boolean;
}

export const ideasService = {
    list: (params: IdeasListParams = {}) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
        }
        const suffix = qs.toString() ? `?${qs}` : "";
        return httpClient.get<ListResponse<Idea>>(`/api/ideas${suffix}`);
    },
    detail: (id: string) => httpClient.get<IdeaDetail>(`/api/ideas/${id}`),
    create: (body: IdeaCreate) => httpClient.post<Idea>("/api/ideas", body),
    update: (id: string, body: IdeaUpdate) => httpClient.patch<Idea>(`/api/ideas/${id}`, body),
    delete: (id: string) => httpClient.delete<{ deleted: boolean; id: string }>(`/api/ideas/${id}`),
    convertir: (id: string) => httpClient.post<ConvertirIdeaResponse>(`/api/ideas/${id}/convertir`),
};

// === AGENDAS ===

export const agendasKeys = {
    all: ["agendas"] as const,
    list: (params: object) => ["agendas", "list", params] as const,
    detail: (id: string) => ["agendas", "detail", id] as const,
    filters: () => ["agendas", "filters"] as const,
};

export interface AgendasListParams {
    search?: string;
    etiqueta?: string;
    cursor?: string;
    limit?: number;
    order?: string;
    ascending?: boolean;
}

export const agendasService = {
    list: (params: AgendasListParams = {}) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
        }
        const suffix = qs.toString() ? `?${qs}` : "";
        return httpClient.get<ListResponse<Agenda>>(`/api/agendas${suffix}`);
    },
    detail: (id: string) => httpClient.get<AgendaDetail>(`/api/agendas/${id}`),
    create: (body: AgendaCreate) => httpClient.post<Agenda>("/api/agendas", body),
    update: (id: string, body: AgendaUpdate) => httpClient.patch<Agenda>(`/api/agendas/${id}`, body),
    delete: (id: string) => httpClient.delete<{ deleted: boolean; id: string }>(`/api/agendas/${id}`),
};

// === CATALOGOS ===

export const catalogosKeys = {
    all: ["catalogos"] as const,
    list: (params: object) => ["catalogos", "list", params] as const,
    detail: (id: string) => ["catalogos", "detail", id] as const,
    filters: () => ["catalogos", "filters"] as const,
    grupos: () => ["catalogos", "grupos"] as const,
};

export interface CatalogosListParams {
    search?: string;
    categoria?: string;
    estado?: string;
    cursor?: string;
    limit?: number;
    order?: string;
    ascending?: boolean;
}

export const catalogosService = {
    list: (params: CatalogosListParams = {}) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
        }
        const suffix = qs.toString() ? `?${qs}` : "";
        return httpClient.get<ListResponse<Catalogo>>(`/api/catalogos${suffix}`);
    },
    detail: (id: string) => httpClient.get<CatalogoDetail>(`/api/catalogos/${id}`),
    create: (body: CatalogoCreate) => httpClient.post<Catalogo>("/api/catalogos", body),
    update: (id: string, body: CatalogoUpdate) => httpClient.patch<Catalogo>(`/api/catalogos/${id}`, body),
    delete: (id: string) => httpClient.delete<{ deleted: boolean; id: string }>(`/api/catalogos/${id}`),
    grupos: () => httpClient.get<CatalogoGrupo[]>("/api/catalogos/grupos"),
};
