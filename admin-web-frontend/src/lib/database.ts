/**
 * Tipos del schema `notion_migration` y helpers de Supabase.
 *
 * Mantenemos tipos manuales (no generados con `supabase gen types`) porque
 * podemos ajustar el shape sin esperar un roundtrip al CLI.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// === Tablas ===

export interface IdeaRow {
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
    created_at: string | null;
    updated_at: string | null;
}

export interface AgendaRow {
    id: string;
    notion_id: string;
    titulo: string;
    fecha_creacion: string | null;
    fecha: string | null;
    etiquetas: string[] | null;
    estado_desarrollo: string | null;
    objetivo: string | null;
    receta_final: unknown;
    timeline: unknown;
    notion_last_edited: string | null;
    migrated_at: string;
    migration_run_id: string;
    created_at: string | null;
    updated_at: string | null;
}

export interface CatalogoRow {
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
    created_at: string | null;
    updated_at: string | null;
}

export interface EntityImageRow {
    id: string;
    idea_id?: string | null;
    agenda_id?: string | null;
    catalogo_id?: string | null;
    source_type: string;
    notion_block_id: string | null;
    notion_page_id: string;
    notion_property: string | null;
    storage_bucket: string;
    storage_path: string;
    storage_url_public: string | null;
    original_filename: string | null;
    mime_type: string | null;
    file_size_bytes: number | null;
    sha256: string | null;
    position: number | null;
    has_caption: boolean | null;
    migrated_at: string;
    migration_run_id: string;
    notion_block_id_key?: string | null;
    notion_property_key?: string | null;
}

export interface BlockRow {
    id: string;
    idea_id?: string | null;
    agenda_id?: string | null;
    catalogo_id?: string | null;
    notion_block_id: string;
    block_type: string;
    position: number;
    parent_block_id: string | null;
    content_text: string | null;
    content_raw: unknown;
    has_children: boolean | null;
    code_language: string | null;
    embed_url: string | null;
    is_broken: boolean | null;
    video_url: string | null;
    video_source_type: string | null;
    image_source_type: string | null;
    migrated_at: string;
    migration_run_id: string;
}

export interface AppSettingRow {
    key: string;
    value: string;
}

// === Helper: encoding fix (latin1 -> utf8) ===
//
// El backend Python aplicaba `deep_fix` para corregir strings mal codificados.
// Esto era un parche runtime. PostgREST devuelve UTF-8 nativo, pero algunos
// datos históricos pueden seguir latin1. Replicamos la lógica en cliente.

function tryDecode(s: string): string {
    if (!s) return s;
    // Heurística: si contiene "?" seguido de caracter Unicode raro, intenta re-decoding
    try {
        const buf = Buffer.from(s, "latin1");
        const decoded = buf.toString("utf8");
        // Si la versión decodificada tiene menos "?" que la original, es probablemente correcta
        const origQuestions = (s.match(/\?/g) || []).length;
        const decodedQuestions = (decoded.match(/\?/g) || []).length;
        if (decodedQuestions < origQuestions) return decoded;
    } catch {
        // ignore
    }
    return s;
}

export function deepFix<T>(input: T): T {
    if (input === null || input === undefined) return input;
    if (Array.isArray(input)) return input.map(deepFix) as unknown as T;
    if (typeof input === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
            out[k] = deepFix(v);
        }
        return out as T;
    }
    if (typeof input === "string") return tryDecode(input) as unknown as T;
    return input;
}

/** Convierte una key de orden a su forma PostgREST (e.g. "fecha_creacion" -> "fecha_creacion"). */
export function pgOrder(column: string, ascending: boolean): { column: string; ascending: boolean } {
    return { column, ascending };
}

/** Helper para selects con orden + paginación cursor (id > cursor). */
export function buildListQuery(
    q: { order: (col: string, opts?: { ascending: boolean }) => unknown },
    column: string,
    ascending: boolean,
    cursor: string | null | undefined,
    limit: number,
) {
    let query = q.order(column, { ascending });
    if (cursor) query = (query as { gt: (col: string, val: string) => unknown }).gt("id", cursor);
    query = (query as { limit: (n: number) => unknown }).limit(limit + 1);
    return query;
}

export type DbClient = SupabaseClient | null;