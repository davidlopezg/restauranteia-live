/**
 * Filtros (categorías / estados distintos) leídos desde Supabase directo.
 *
 * Coincide con `GET /api/filters/{entidad}` que devolvía:
 *   { categorias: string[], estados: string[] }
 *
 * Para ideas y catalogos: array column `categorias` (text[]).
 * Para agendas: array column `etiquetas` (text[]).
 * Estados: columna escalar `estado_idea` (ideas) / `estado` (catalogos).
 *
 * PostgREST soporta DISTINCT pero no UNNEST directo. Por eso para los arrays
 * usamos rpc o select con filtro; el resultado es el mismo set deduplicado.
 */

import { getSupabase } from "@/lib/supabase";
import type { FiltersResponse } from "@/types/filters";
import type { EntityKind } from "@/types/entity";
import { httpClient } from "@/services/http-client";

async function distinctArray(table: string, column: string): Promise<string[]> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    // DISTINCT sobre un array column. PostgREST no soporta DISTINCT en arrays,
    // así que seleccionamos valores únicos del lado cliente (es lo que hacía
    // el backend Python en `distinct_categorias`).
    const { data, error } = await supabase.from(table).select(column).not(column, "is", null);
    if (error) throw new Error(error.message);
    const set = new Set<string>();
    for (const row of ((data ?? []) as unknown as Array<Record<string, string[] | null>>)) {
        const v = row[column];
        if (Array.isArray(v)) {
            for (const item of v) if (item) set.add(item);
        }
    }
    return Array.from(set).sort();
}

async function distinctScalar(table: string, column: string): Promise<string[]> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    const { data, error } = await supabase.from(table).select(column).not(column, "is", null);
    if (error) throw new Error(error.message);
    const set = new Set<string>();
    for (const row of ((data ?? []) as unknown as Array<Record<string, string | null>>)) {
        const v = row[column];
        if (typeof v === "string") set.add(v);
    }
    return Array.from(set).sort();
}

async function filtersSupabase(entidad: EntityKind): Promise<FiltersResponse> {
    if (entidad === "ideas") {
        const [categorias, estados] = await Promise.all([
            distinctArray("ideas", "categorias"),
            distinctScalar("ideas", "estado_idea"),
        ]);
        return { categorias, estados };
    }
    if (entidad === "catalogos") {
        const [categorias, estados] = await Promise.all([
            distinctArray("catalogos", "categorias"),
            distinctScalar("catalogos", "estado"),
        ]);
        return { categorias, estados };
    }
    if (entidad === "agendas") {
        const etiquetas = await distinctArray("agendas", "etiquetas");
        return { categorias: etiquetas, estados: [] };
    }
    return { categorias: [], estados: [] };
}

export const filtersKeys = {
    forEntity: (entidad: EntityKind) => ["filters", entidad] as const,
};

export const filtersSupabaseService = {
    get: filtersSupabase,
    isAvailable: () => Boolean(getSupabase()),
};

export const filtersLegacy = {
    get: (entidad: EntityKind) => httpClient.get<FiltersResponse>(`/api/filters/${entidad}`),
};