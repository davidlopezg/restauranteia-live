/**
 * Tipos del schema `notion_migration` y helpers de Supabase.
 *
 * Mantenemos tipos manuales (no generados con `supabase gen types`) porque
 * podemos ajustar el shape sin esperar un roundtrip al CLI.
 *
 * FASE 9: incluye tablas normalizadas para ingredientes, subrecetas y alérgenos.
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
    receta_tecnica: unknown;
    /** Receta unificada con 9 secciones. FASE 9. */
    receta: unknown;
    notion_last_edited: string | null;
    migrated_at: string;
    migration_run_id: string;
    created_at: string | null;
    updated_at: string | null;
}

// === FASE 9: Tablas normalizadas ===

export interface IngredienteRow {
    id: string;
    nombre: string;
    categoria: string | null;
    coste_medio: number | null;
    unidad_compra: "kg" | "g" | "L" | "ml" | "ud" | "docena";
    merma_default_pct: number;
    proveedor: string | null;
    alergenos: string[];
    dietas_validas: string[];
    notas: string | null;
    activo: boolean;
    created_at: string;
    updated_at: string;
}

export interface AlergenoRow {
    id: string;
    codigo: string;
    nombre: string;
    icono: string;
    descripcion: string | null;
    obligatorio_ue: boolean;
    activo: boolean;
    created_at: string;
}

export interface SubrecetaRow {
    id: string;
    nombre: string;
    descripcion: string | null;
    receta_origen_id: string | null;
    cantidad_producida: number | null;
    unidad_producida: "kg" | "g" | "L" | "ml" | "ud" | "raciones" | null;
    coste_total: number | null;
    activo: boolean;
    notas: string | null;
    created_at: string;
    updated_at: string;
}

export interface RecetaIngredienteRow {
    id: string;
    receta_id: string;
    ingrediente_id: string;
    cantidad_bruta: number;
    unidad: "kg" | "g" | "L" | "ml" | "ud";
    merma_pct_override: number | null;
    notas: string | null;
    orden: number;
    created_at: string;
}

export interface RecetaSubrecetaRow {
    id: string;
    receta_parent_id: string;
    subreceta_id: string;
    cantidad: number;
    unidad: "kg" | "g" | "L" | "ml" | "ud";
    notas: string | null;
    orden: number;
    created_at: string;
}

export interface RecetaAlergenoRow {
    id: string;
    receta_id: string;
    alergeno_id: string;
    origen: "heredado_ingrediente" | "heredado_subreceta" | "manual";
    created_at: string;
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

/**
 * Decodifica strings mal codificados (latin1 → utf8).
 * El módulo de migración introdujo este bug; mantenemos fallback de UI.
 */
export function deepFix<T>(rows: T | T[]): T | T[] {
    const fix = (s: unknown): unknown => {
        if (typeof s !== "string") return s;
        try {
            // Detectar patrón típico: "Caf�" → "Café"
            if (/�/.test(s)) {
                return Buffer.from(s, "latin1").toString("utf8");
            }
            return s;
        } catch {
            return s;
        }
    };

    if (Array.isArray(rows)) {
        return rows.map((r) => deepFixObject(r, fix) as T);
    }
    return deepFixObject(rows, fix) as T;
}

function deepFixObject<T>(row: T, fix: (s: unknown) => unknown): T {
    if (row === null || row === undefined) return row;
    if (typeof row === "string") return fix(row) as T;
    if (Array.isArray(row)) {
        return row.map((item) => deepFixObject(item, fix)) as unknown as T;
    }
    if (typeof row === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
            out[k] = deepFixObject(v, fix);
        }
        return out as T;
    }
    return row;
}

/** Tipo helper para el cliente Supabase. */
export type AnySupabase = SupabaseClient | null;