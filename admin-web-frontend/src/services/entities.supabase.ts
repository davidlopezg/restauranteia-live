/**
 * Servicios de entidades (ideas/agendas/catalogos) leídos desde Supabase directo.
 *
 * Cuando Supabase está configurado (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY),
 * usamos PostgREST. Si no, fallback al backend FastAPI legacy.
 *
 * Esta capa reemplaza el consumo de /api/ideas, /api/agendas, /api/catalogos
 * del backend Python.
 */

import { getSupabase } from "@/lib/supabase";
import { deepFix, type IdeaRow, type AgendaRow, type CatalogoRow, type BlockRow, type EntityImageRow } from "@/lib/database";
import { callRpc } from "@/lib/rpc";
import { whitelist, newUuid } from "@/lib/whitelist";
import { httpClient } from "@/services/http-client";
import type { ListResponse } from "@/types/entity";
import type { Idea, IdeaDetail } from "@/types/idea";
import type { Agenda, AgendaDetail } from "@/types/agenda";
import type { Catalogo, CatalogoDetail, CatalogoGrupo } from "@/types/catalogo";

// === Shared list params ===

export interface ListParams {
    search?: string;
    cursor?: string;
    limit?: number;
    order?: string;
    ascending?: boolean;
}

export interface IdeasListParams extends ListParams {
    categoria?: string;
    estado?: string;
}

export interface AgendasListParams extends ListParams {
    etiqueta?: string;
}

export interface CatalogosListParams extends ListParams {
    categoria?: string;
    estado?: string;
}

// === Helpers ===

function listResponse<T>(rows: T[], limit: number): ListResponse<T> {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
        items,
        next_cursor: hasMore && items.length > 0 ? (items[items.length - 1] as unknown as { id: string }).id : null,
        total_in_page: items.length,
    };
}

type QueryBuilder = {
    ilike: (col: string, val: string) => QueryBuilder;
    gt: (col: string, val: string) => QueryBuilder;
    contains: (col: string, val: string[]) => QueryBuilder;
    eq: (col: string, val: string) => QueryBuilder;
    order: (col: string, opts: { ascending: boolean }) => QueryBuilder;
    limit: (n: number) => QueryBuilder;
    then: <T1, T2>(resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => T1 | T2) => Promise<T1 | T2>;
};

async function postgrestList<T>(
    table: string,
    params: ListParams,
    extraFilters?: (q: QueryBuilder) => QueryBuilder,
): Promise<ListResponse<T>> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");

    const limit = Math.min(Math.max(params.limit ?? 30, 1), 200);
    const order = params.order ?? "fecha_creacion";
    const ascending = params.ascending ?? false;

    let q = supabase.from(table).select("*") as unknown as QueryBuilder;
    if (params.search) q = q.ilike("titulo", `%${params.search}%`);
    if (params.cursor) q = q.gt("id", params.cursor);
    if (extraFilters) q = extraFilters(q);
    q = q.order(order, { ascending });
    q = q.limit(limit + 1);

    const result = await q;
    const data = (result as { data: unknown[] | null; error: { message: string } | null }).data;
    const error = (result as { data: unknown[] | null; error: { message: string } | null }).error;
    if (error) throw new Error(error.message);
    return listResponse((data ?? []) as T[], limit);
}

// === IDEAS ===

export const ideasKeys = {
    all: ["ideas"] as const,
    list: (params: object) => ["ideas", "list", params] as const,
    detail: (id: string) => ["ideas", "detail", id] as const,
};

async function listIdeasSupabase(params: IdeasListParams): Promise<ListResponse<Idea>> {
    const filters = (q: QueryBuilder) => {
        let r = q;
        if (params.categoria) r = r.contains("categorias", [params.categoria]);
        if (params.estado) r = r.eq("estado_idea", params.estado);
        return r;
    };
    const res = await postgrestList<IdeaRow>("ideas", params, filters);
    return {
        items: deepFix(res.items as IdeaRow[]) as unknown as Idea[],
        next_cursor: res.next_cursor,
        total_in_page: res.total_in_page,
    };
}

async function detailIdeaSupabase(id: string): Promise<IdeaDetail> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");

    // 5 queries en paralelo: item + images + blocks + 2 relations
    const [itemRes, imagesRes, blocksRes, agRelRes, catRelRes] = await Promise.all([
        supabase.from("ideas").select("*").eq("id", id).maybeSingle(),
        supabase.from("idea_images").select("*").eq("idea_id", id).order("position", { ascending: true }).limit(200),
        supabase.from("idea_blocks").select(
            "id, idea_id, notion_block_id, block_type, position, parent_block_id, content_text, has_children, code_language, embed_url, is_broken, video_url, video_source_type, image_source_type"
        ).eq("idea_id", id).order("position", { ascending: true }).limit(500),
        supabase.from("idea_agenda").select("agenda_id").eq("idea_id", id),
        supabase.from("idea_catalogo").select("catalogo_id").eq("idea_id", id),
    ]);

    if (itemRes.error) throw new Error(itemRes.error.message);
    if (!itemRes.data) throw new Error("Idea no encontrada");
    const item = deepFix(itemRes.data) as Idea;

    const agIds = (agRelRes.data ?? []).map((r: { agenda_id: string }) => r.agenda_id);
    const catIds = (catRelRes.data ?? []).map((r: { catalogo_id: string }) => r.catalogo_id);

    const [agendasRes, catalogosRes] = await Promise.all([
        agIds.length > 0
            ? supabase.from("agendas").select("*").in("id", agIds)
            : Promise.resolve({ data: [], error: null }),
        catIds.length > 0
            ? supabase.from("catalogos").select("*").in("id", catIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    return {
        item,
        blocks: deepFix((blocksRes.data ?? []) as BlockRow[]) as unknown as IdeaDetail["blocks"],
        images: deepFix((imagesRes.data ?? []) as EntityImageRow[]) as unknown as IdeaDetail["images"],
        relations: {
            agendas: deepFix((agendasRes.data ?? []) as AgendaRow[]) as unknown as IdeaDetail["relations"]["agendas"],
            catalogos: deepFix((catalogosRes.data ?? []) as CatalogoRow[]) as unknown as IdeaDetail["relations"]["catalogos"],
        },
    };
}

export const ideasSupabase = {
    list: listIdeasSupabase,
    detail: detailIdeaSupabase,
    isAvailable: () => Boolean(getSupabase()),

    // === CRUD ===
    async create(body: Record<string, unknown>): Promise<Idea> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const safe = whitelist("ideas", body);
        const payload = {
            ...safe,
            notion_id: newUuid(),
            migration_run_id: "manual_create",
        };
        const { data, error } = await supabase.from("ideas").insert(payload).select("*").maybeSingle();
        if (error) throw new Error(error.message);
        return data as Idea;
    },

    async update(id: string, body: Record<string, unknown>): Promise<Idea> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const safe = whitelist("ideas", body);
        if (Object.keys(safe).length === 0) throw new Error("Sin cambios permitidos");
        const { data, error } = await supabase
            .from("ideas")
            .update(safe)
            .eq("id", id)
            .select("*")
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Idea no encontrada");
        return data as Idea;
    },

    async delete(id: string): Promise<{ deleted: boolean; id: string }> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const { error } = await supabase.from("ideas").delete().eq("id", id);
        if (error) throw new Error(error.message);
        return { deleted: true, id };
    },

    async convertir(id: string): Promise<{
        already_exists: boolean;
        agenda_id: string;
        agenda_titulo: string;
    }> {
        return callRpc("convertir_idea_a_agenda", { p_idea_id: id });
    },
};

// === AGENDAS ===

async function listAgendasSupabase(params: AgendasListParams): Promise<ListResponse<Agenda>> {
    const filters = (q: QueryBuilder) => {
        let r = q;
        if (params.etiqueta) r = r.contains("etiquetas", [params.etiqueta]);
        return r;
    };
    const res = await postgrestList<AgendaRow>("agendas", { ...params, order: params.order ?? "fecha" }, filters);
    return {
        items: deepFix(res.items as AgendaRow[]) as unknown as Agenda[],
        next_cursor: res.next_cursor,
        total_in_page: res.total_in_page,
    };
}

async function detailAgendaSupabase(id: string): Promise<AgendaDetail> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");

    const [itemRes, imagesRes, blocksRes, ideaRelRes, catRelRes] = await Promise.all([
        supabase.from("agendas").select("*").eq("id", id).maybeSingle(),
        supabase.from("agenda_images").select("*").eq("agenda_id", id).order("position", { ascending: true }).limit(200),
        supabase.from("agenda_blocks").select(
            "id, agenda_id, notion_block_id, block_type, position, parent_block_id, content_text, has_children, code_language, embed_url, is_broken, video_url, video_source_type, image_source_type"
        ).eq("agenda_id", id).order("position", { ascending: true }).limit(500),
        supabase.from("idea_agenda").select("idea_id").eq("agenda_id", id),
        supabase.from("agenda_catalogo").select("catalogo_id").eq("agenda_id", id),
    ]);

    if (itemRes.error) throw new Error(itemRes.error.message);
    if (!itemRes.data) throw new Error("Agenda no encontrada");
    const item = deepFix(itemRes.data) as Agenda;

    const ideaIds = (ideaRelRes.data ?? []).map((r: { idea_id: string }) => r.idea_id);
    const catIds = (catRelRes.data ?? []).map((r: { catalogo_id: string }) => r.catalogo_id);

    const [ideasRes, catalogosRes] = await Promise.all([
        ideaIds.length > 0
            ? supabase.from("ideas").select("*").in("id", ideaIds)
            : Promise.resolve({ data: [], error: null }),
        catIds.length > 0
            ? supabase.from("catalogos").select("*").in("id", catIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    return {
        item,
        blocks: deepFix((blocksRes.data ?? []) as BlockRow[]) as unknown as AgendaDetail["blocks"],
        images: deepFix((imagesRes.data ?? []) as EntityImageRow[]) as unknown as AgendaDetail["images"],
        relations: {
            ideas: deepFix((ideasRes.data ?? []) as IdeaRow[]) as unknown as AgendaDetail["relations"]["ideas"],
            catalogos: deepFix((catalogosRes.data ?? []) as CatalogoRow[]) as unknown as AgendaDetail["relations"]["catalogos"],
        },
    };
}

export const agendasSupabase = {
    list: listAgendasSupabase,
    detail: detailAgendaSupabase,
    isAvailable: () => Boolean(getSupabase()),

    // === CRUD ===
    async create(body: Record<string, unknown>): Promise<Agenda> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const safe = whitelist("agendas", body);
        const payload = {
            ...safe,
            notion_id: newUuid(),
            migration_run_id: "manual_create",
        };
        const { data, error } = await supabase.from("agendas").insert(payload).select("*").maybeSingle();
        if (error) throw new Error(error.message);
        return data as Agenda;
    },

    async update(id: string, body: Record<string, unknown>): Promise<Agenda> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const safe = whitelist("agendas", body);
        if (Object.keys(safe).length === 0) throw new Error("Sin cambios permitidos");
        const { data, error } = await supabase
            .from("agendas")
            .update(safe)
            .eq("id", id)
            .select("*")
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Agenda no encontrada");
        return data as Agenda;
    },

    async delete(id: string): Promise<{ deleted: boolean; id: string }> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const { error } = await supabase.from("agendas").delete().eq("id", id);
        if (error) throw new Error(error.message);
        return { deleted: true, id };
    },
};

// === CATALOGOS ===

async function listCatalogosSupabase(params: CatalogosListParams): Promise<ListResponse<Catalogo>> {
    const filters = (q: QueryBuilder) => {
        let r = q;
        if (params.categoria) r = r.contains("categorias", [params.categoria]);
        if (params.estado) r = r.eq("estado", params.estado);
        return r;
    };
    const res = await postgrestList<CatalogoRow>("catalogos", { ...params, order: params.order ?? "orden", ascending: params.ascending ?? true }, filters);
    return {
        items: deepFix(res.items as CatalogoRow[]) as unknown as Catalogo[],
        next_cursor: res.next_cursor,
        total_in_page: res.total_in_page,
    };
}

async function detailCatalogoSupabase(id: string): Promise<CatalogoDetail> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");

    const [itemRes, imagesRes, blocksRes, ideaRelRes, agRelRes] = await Promise.all([
        supabase.from("catalogos").select("*").eq("id", id).maybeSingle(),
        supabase.from("catalogo_images").select("*").eq("catalogo_id", id).order("position", { ascending: true }).limit(200),
        supabase.from("catalogo_blocks").select(
            "id, catalogo_id, notion_block_id, block_type, position, parent_block_id, content_text, has_children, code_language, embed_url, is_broken, video_url, video_source_type, image_source_type"
        ).eq("catalogo_id", id).order("position", { ascending: true }).limit(500),
        supabase.from("idea_catalogo").select("idea_id").eq("catalogo_id", id),
        supabase.from("agenda_catalogo").select("agenda_id").eq("catalogo_id", id),
    ]);

    if (itemRes.error) throw new Error(itemRes.error.message);
    if (!itemRes.data) throw new Error("Catalogo no encontrado");
    const item = deepFix(itemRes.data) as Catalogo;

    const ideaIds = (ideaRelRes.data ?? []).map((r: { idea_id: string }) => r.idea_id);
    const agIds = (agRelRes.data ?? []).map((r: { agenda_id: string }) => r.agenda_id);

    const [ideasRes, agendasRes] = await Promise.all([
        ideaIds.length > 0
            ? supabase.from("ideas").select("*").in("id", ideaIds)
            : Promise.resolve({ data: [], error: null }),
        agIds.length > 0
            ? supabase.from("agendas").select("*").in("id", agIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    return {
        item,
        blocks: deepFix((blocksRes.data ?? []) as BlockRow[]) as unknown as CatalogoDetail["blocks"],
        images: deepFix((imagesRes.data ?? []) as EntityImageRow[]) as unknown as CatalogoDetail["images"],
        relations: {
            ideas: deepFix((ideasRes.data ?? []) as IdeaRow[]) as unknown as CatalogoDetail["relations"]["ideas"],
            agendas: deepFix((agendasRes.data ?? []) as AgendaRow[]) as unknown as CatalogoDetail["relations"]["agendas"],
        },
    };
}

async function catalogosGruposSupabase(): Promise<CatalogoGrupo[]> {
    const data = await callRpc<Array<{ categoria: string; items: Catalogo[] }>>("catalogos_agrupados");
    return data ?? [];
}

export const catalogosSupabase = {
    list: listCatalogosSupabase,
    detail: detailCatalogoSupabase,
    grupos: catalogosGruposSupabase,
    isAvailable: () => Boolean(getSupabase()),

    // === CRUD ===
    async create(body: Record<string, unknown>): Promise<Catalogo> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const safe = whitelist("catalogos", body);
        const payload = {
            ...safe,
            notion_id: newUuid(),
            migration_run_id: "manual_create",
        };
        const { data, error } = await supabase.from("catalogos").insert(payload).select("*").maybeSingle();
        if (error) throw new Error(error.message);
        return data as Catalogo;
    },

    async update(id: string, body: Record<string, unknown>): Promise<Catalogo> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const safe = whitelist("catalogos", body);
        if (Object.keys(safe).length === 0) throw new Error("Sin cambios permitidos");
        const { data, error } = await supabase
            .from("catalogos")
            .update(safe)
            .eq("id", id)
            .select("*")
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Catalogo no encontrado");
        return data as Catalogo;
    },

    async delete(id: string): Promise<{ deleted: boolean; id: string }> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const { error } = await supabase.from("catalogos").delete().eq("id", id);
        if (error) throw new Error(error.message);
        return { deleted: true, id };
    },
};

// === RELACIONES N:M ===
// Tabla + columnas FK segun el tipo de relacion.
// Equivalente a routers/entities.py:_REL

const RELATION_TABLE = {
    "idea_agenda": { table: "idea_agenda", aCol: "idea_id", bCol: "agenda_id" },
    "idea_catalogo": { table: "idea_catalogo", aCol: "idea_id", bCol: "catalogo_id" },
    "agenda_catalogo": { table: "agenda_catalogo", aCol: "agenda_id", bCol: "catalogo_id" },
} as const;

export type RelationKind = keyof typeof RELATION_TABLE;

export const relationsSupabase = {
    async add(rel: RelationKind, aId: string, bId: string): Promise<{ created: boolean }> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const r = RELATION_TABLE[rel];
        // upsert con ignoreDuplicates replica ON CONFLICT DO NOTHING
        const { error } = await supabase
            .from(r.table)
            .upsert(
                { [r.aCol]: aId, [r.bCol]: bId, migration_run_id: "manual_link" },
                { onConflict: `${r.aCol},${r.bCol}`, ignoreDuplicates: true },
            );
        if (error) throw new Error(error.message);
        return { created: true };
    },

    async remove(rel: RelationKind, aId: string, bId: string): Promise<{ deleted: boolean }> {
        const supabase = getSupabase();
        if (!supabase) throw new Error("Supabase no configurado");
        const r = RELATION_TABLE[rel];
        const { error } = await supabase
            .from(r.table)
            .delete()
            .match({ [r.aCol]: aId, [r.bCol]: bId });
        if (error) throw new Error(error.message);
        return { deleted: true };
    },
};

// === Fallback wrappers (para tests, debug o cuando Supabase no está) ===
// Reusa httpClient cuando Supabase no está disponible.

export const ideasLegacy = {
    list: (params: IdeasListParams = {}) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
        }
        return httpClient.get<ListResponse<Idea>>(`/api/ideas${qs.toString() ? `?${qs}` : ""}`);
    },
    detail: (id: string) => httpClient.get<IdeaDetail>(`/api/ideas/${id}`),
};

export const agendasLegacy = {
    list: (params: AgendasListParams = {}) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
        }
        return httpClient.get<ListResponse<Agenda>>(`/api/agendas${qs.toString() ? `?${qs}` : ""}`);
    },
    detail: (id: string) => httpClient.get<AgendaDetail>(`/api/agendas/${id}`),
};

export const catalogosLegacy = {
    list: (params: CatalogosListParams = {}) => {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
        }
        return httpClient.get<ListResponse<Catalogo>>(`/api/catalogos${qs.toString() ? `?${qs}` : ""}`);
    },
    detail: (id: string) => httpClient.get<CatalogoDetail>(`/api/catalogos/${id}`),
    grupos: () => httpClient.get<CatalogoGrupo[]>("/api/catalogos/grupos"),
    create: (body: unknown) => httpClient.post<Catalogo>("/api/catalogos", body),
    update: (id: string, body: unknown) => httpClient.patch<Catalogo>(`/api/catalogos/${id}`, body),
    delete: (id: string) =>
        httpClient.delete<{ deleted: boolean; id: string }>(`/api/catalogos/${id}`),
};

export const ideasLegacyFull = {
    create: (body: unknown) => httpClient.post<Idea>("/api/ideas", body),
    update: (id: string, body: unknown) => httpClient.patch<Idea>(`/api/ideas/${id}`, body),
    delete: (id: string) =>
        httpClient.delete<{ deleted: boolean; id: string }>(`/api/ideas/${id}`),
    convertir: (id: string) =>
        httpClient.post<{ already_exists: boolean; agenda_id: string; agenda_titulo: string }>(
            `/api/ideas/${id}/convertir`,
        ),
};

export const agendasLegacyFull = {
    create: (body: unknown) => httpClient.post<Agenda>("/api/agendas", body),
    update: (id: string, body: unknown) => httpClient.patch<Agenda>(`/api/agendas/${id}`, body),
    delete: (id: string) =>
        httpClient.delete<{ deleted: boolean; id: string }>(`/api/agendas/${id}`),
};

export const relationsLegacy = {
    add: (rel: string, aId: string, bId: string) =>
        httpClient.post<{ created: boolean }>(`/api/relations/${rel}`, { a_id: aId, b_id: bId }),
    remove: (rel: string, aId: string, bId: string) =>
        httpClient.delete<{ deleted: boolean }>(
            `/api/relations/${rel}?a_id=${aId}&b_id=${bId}`,
        ),
};