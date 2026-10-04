/**
 * Servicio FASE 9 — Receta unificada + Ingredientes + Subrecetas + Alérgenos.
 *
 * Fachada unificada Supabase (PostgREST) / FastAPI legacy.
 *
 * Las tablas nuevas se acceden directamente vía PostgREST porque son CRUD puro:
 *   - ingredientes        (lectura/escritura via whitelist)
 *   - alergenos           (idem)
 *   - subrecetas          (idem)
 *   - receta_ingredientes (N:M)
 *   - receta_subrecetas    (N:M)
 *   - receta_alergenos    (N:M, refresh via RPC)
 *
 * Endpoints legacy /api/* del backend FastAPI:
 *   - GET    /api/ingredientes
 *   - POST   /api/ingredientes
 *   - PATCH  /api/ingredientes/{id}
 *   - DELETE /api/ingredientes/{id}
 *   - GET    /api/subrecetas
 *   - POST   /api/subrecetas
 *   - PATCH  /api/subrecetas/{id}
 *   - DELETE /api/subrecetas/{id}
 *   - GET    /api/alergenos
 *   - GET    /api/catalogos/{id}/ficha-completa  (consolidado)
 *   - POST   /api/catalogos/{id}/receta         (PATCH la columna receta)
 *   - POST   /api/catalogos/{id}/receta/refresh-alergenos (RPC)
 */

import { env } from "@/config/env";
import { getSupabase } from "@/lib/supabase";
import { callRpc } from "@/lib/rpc";
import { whitelist } from "@/lib/whitelist";
import { httpClient } from "@/services/http-client";
import type {
    Ingrediente, Alergeno, Subreceta, Receta,
    RecetaIngrediente, RecetaAlergeno,
} from "@/types/catalogo";

// === Tipos auxiliares ===

export interface FichaCompleta {
    catalogo_id: string;
    titulo: string;
    precio: number | null;
    receta: Receta | null;
    ingredientes_normalizados: Array<RecetaIngrediente & {
        nombre: string;
        coste_unitario: number | null;
        coste_linea: number | null;
    }>;
    alergenos: Array<{
        alergeno_id: string;
        codigo: string;
        nombre: string;
        icono: string;
        origen: RecetaAlergeno["origen"];
    }>;
}

export interface MigrateResult {
    catalogos_procesados: number;
    catalogos_actualizados: number;
    ingredientes_en_recetas: number;
    errores: Array<{ catalogo_id: string; titulo: string; error: string }>;
}

export interface SeedIngredientesResult {
    total_unicos_encontrados: number;
    ingredientes_insertados: number;
    ingredientes_omitidos_ya_existentes: number;
}

// === Helpers ===

async function supabaseOrThrow() {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    return supabase;
}

// === INGREDIENTES ===

export const ingredientesKeys = {
    all: ["ingredientes"] as const,
    list: (params: object) => ["ingredientes", "list", params] as const,
    detail: (id: string) => ["ingredientes", "detail", id] as const,
    byName: (nombre: string) => ["ingredientes", "by-name", nombre] as const,
};

export const ingredientesService = {
    async list(params: { search?: string; categoria?: string; limit?: number } = {}): Promise<Ingrediente[]> {
        const supabase = await supabaseOrThrow();
        let q = supabase.from("ingredientes").select("*").eq("activo", true);
        if (params.search) q = (q as unknown as { ilike: (c: string, v: string) => typeof q }).ilike("nombre", `%${params.search}%`);
        if (params.categoria) q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq("categoria", params.categoria);
        q = (q as unknown as { limit: (n: number) => typeof q }).limit(params.limit ?? 100);
        const { data, error } = await q.order("nombre", { ascending: true });
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as Ingrediente[];
    },

    async get(id: string): Promise<Ingrediente | null> {
        const supabase = await supabaseOrThrow();
        const { data, error } = await supabase.from("ingredientes").select("*").eq("id", id).maybeSingle();
        if (error) throw new Error(error.message);
        return data as Ingrediente | null;
    },

    async findByName(nombre: string): Promise<Ingrediente | null> {
        const supabase = await supabaseOrThrow();
        const { data, error } = await supabase
            .from("ingredientes")
            .select("*")
            .ilike("nombre", nombre)
            .maybeSingle();
        if (error) throw new Error(error.message);
        return data as Ingrediente | null;
    },

    async create(body: Partial<Ingrediente>): Promise<Ingrediente> {
        if (env.isSupabaseConfigured) {
            const supabase = await supabaseOrThrow();
            const safe = whitelist("ingredientes", body as Record<string, unknown>);
            const { data, error } = await supabase.from("ingredientes").insert(safe).select("*").maybeSingle();
            if (error) throw new Error(error.message);
            return data as Ingrediente;
        }
        return httpClient.post<Ingrediente>("/api/ingredientes", body);
    },

    async update(id: string, body: Partial<Ingrediente>): Promise<Ingrediente> {
        if (env.isSupabaseConfigured) {
            const supabase = await supabaseOrThrow();
            const safe = whitelist("ingredientes", body as Record<string, unknown>);
            const { data, error } = await supabase
                .from("ingredientes")
                .update(safe)
                .eq("id", id)
                .select("*")
                .maybeSingle();
            if (error) throw new Error(error.message);
            return data as Ingrediente;
        }
        return httpClient.patch<Ingrediente>(`/api/ingredientes/${id}`, body);
    },

    async delete(id: string): Promise<{ deleted: boolean; id: string }> {
        if (env.isSupabaseConfigured) {
            const supabase = await supabaseOrThrow();
            const { error } = await supabase.from("ingredientes").delete().eq("id", id);
            if (error) throw new Error(error.message);
            return { deleted: true, id };
        }
        return httpClient.delete<{ deleted: boolean; id: string }>(`/api/ingredientes/${id}`);
    },
};

// === ALERGENOS ===

export const alergenosKeys = {
    all: ["alergenos"] as const,
    list: () => ["alergenos", "list"] as const,
};

export const alergenosService = {
    async list(): Promise<Alergeno[]> {
        if (env.isSupabaseConfigured) {
            const supabase = await supabaseOrThrow();
            const { data, error } = await supabase
                .from("alergenos")
                .select("*")
                .eq("activo", true)
                .order("obligatorio_ue", { ascending: false })
                .order("nombre", { ascending: true });
            if (error) throw new Error(error.message);
            return (data ?? []) as unknown as Alergeno[];
        }
        return httpClient.get<Alergeno[]>("/api/alergenos");
    },

    async byCodigo(codigo: string): Promise<Alergeno | null> {
        if (env.isSupabaseConfigured) {
            const supabase = await supabaseOrThrow();
            const { data, error } = await supabase
                .from("alergenos")
                .select("*")
                .eq("codigo", codigo)
                .maybeSingle();
            if (error) throw new Error(error.message);
            return data as Alergeno | null;
        }
        const all = await alergenosService.list();
        return all.find((a) => a.codigo === codigo) ?? null;
    },
};

// === SUBRECETAS ===

export const subrecetasKeys = {
    all: ["subrecetas"] as const,
    list: (params: object) => ["subrecetas", "list", params] as const,
    detail: (id: string) => ["subrecetas", "detail", id] as const,
};

export const subrecetasService = {
    async list(params: { search?: string; limit?: number } = {}): Promise<Subreceta[]> {
        const supabase = await supabaseOrThrow();
        let q = supabase.from("subrecetas").select("*").eq("activo", true);
        if (params.search) q = (q as unknown as { ilike: (c: string, v: string) => typeof q }).ilike("nombre", `%${params.search}%`);
        q = (q as unknown as { limit: (n: number) => typeof q }).limit(params.limit ?? 100);
        const { data, error } = await q.order("nombre", { ascending: true });
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as Subreceta[];
    },

    async get(id: string): Promise<Subreceta | null> {
        const supabase = await supabaseOrThrow();
        const { data, error } = await supabase.from("subrecetas").select("*").eq("id", id).maybeSingle();
        if (error) throw new Error(error.message);
        return data as Subreceta | null;
    },

    async create(body: Partial<Subreceta>): Promise<Subreceta> {
        if (env.isSupabaseConfigured) {
            const supabase = await supabaseOrThrow();
            const safe = whitelist("subrecetas", body as Record<string, unknown>);
            const { data, error } = await supabase.from("subrecetas").insert(safe).select("*").maybeSingle();
            if (error) throw new Error(error.message);
            return data as Subreceta;
        }
        return httpClient.post<Subreceta>("/api/subrecetas", body);
    },

    async update(id: string, body: Partial<Subreceta>): Promise<Subreceta> {
        if (env.isSupabaseConfigured) {
            const supabase = await supabaseOrThrow();
            const safe = whitelist("subrecetas", body as Record<string, unknown>);
            const { data, error } = await supabase
                .from("subrecetas")
                .update(safe)
                .eq("id", id)
                .select("*")
                .maybeSingle();
            if (error) throw new Error(error.message);
            return data as Subreceta;
        }
        return httpClient.patch<Subreceta>(`/api/subrecetas/${id}`, body);
    },

    async delete(id: string): Promise<{ deleted: boolean; id: string }> {
        if (env.isSupabaseConfigured) {
            const supabase = await supabaseOrThrow();
            const { error } = await supabase.from("subrecetas").delete().eq("id", id);
            if (error) throw new Error(error.message);
            return { deleted: true, id };
        }
        return httpClient.delete<{ deleted: boolean; id: string }>(`/api/subrecetas/${id}`);
    },
};

// === RECETA unificada ===

export const recetaKeys = {
    fichaCompleta: (catalogoId: string) => ["catalogos", catalogoId, "ficha-completa"] as const,
};

export const recetaService = {
    /**
     * Devuelve la ficha completa consolidada (receta + ingredientes normalizados + alérgenos).
     * Usa la vista `public.fichas_completas` si Supabase está configurado,
     * o el endpoint legacy /api/catalogos/{id}/ficha-completa si no.
     */
    async getFichaCompleta(catalogoId: string): Promise< FichaCompleta | null> {
        if (env.isSupabaseConfigured) {
            const supabase = await supabaseOrThrow();
            const { data, error } = await supabase
                .from("fichas_completas")
                .select("*")
                .eq("catalogo_id", catalogoId)
                .maybeSingle();
            if (error) throw new Error(error.message);
            return data as FichaCompleta | null;
        }
        return httpClient.get<FichaCompleta>(`/api/catalogos/${catalogoId}/ficha-completa`);
    },

    /**
     * Actualiza la columna `receta` (jsonb unificado) de un catálogo.
     */
    async updateReceta(catalogoId: string, receta: Receta): Promise<{ ok: boolean }> {
        if (env.isSupabaseConfigured) {
            const supabase = await supabaseOrThrow();
            const { data, error } = await supabase
                .from("catalogos")
                .update({ receta })
                .eq("id", catalogoId)
                .select("id")
                .maybeSingle();
            if (error) throw new Error(error.message);
            return { ok: Boolean(data) };
        }
        return httpClient.post<{ ok: boolean }>(`/api/catalogos/${catalogoId}/receta`, { receta });
    },

    /**
     * Refresca los alérgenos heredados para una receta concreta.
     * Usa el RPC `refresh_alergenos_receta(uuid)`.
     */
    async refreshAlergenos(catalogoId: string): Promise<{ alergenos_asignados: number }> {
        return callRpc("refresh_alergenos_receta", { p_receta_id: catalogoId });
    },

    /**
     * Refresca TODAS las recetas (útil después de poblar ingredientes).
     */
    async refreshAllAlergenos(): Promise<{ catalogos_procesados: number; alergenos_asignados: number }> {
        return callRpc("refresh_alergenos_all_recetas");
    },
};

// === Helpers de migración (para correr UNA vez) ===

export const recetaMigrationService = {
    /**
     * Ejecuta la migración de receta_estructurada + receta_tecnica → receta (jsonb).
     * Devuelve estadísticas. SOLO ejecutar una vez.
     */
    async migrateRecetas(): Promise<MigrateResult> {
        return callRpc<MigrateResult>("migrate_recetas_to_v2");
    },

    /**
     * Puebla la tabla ingredientes con los nombres únicos de las recetas.
     * SOLO ejecutar una vez.
     */
    async seedIngredientes(): Promise<SeedIngredientesResult> {
        return callRpc<SeedIngredientesResult>("seed_ingredientes_from_recetas");
    },

    /**
     * Puebla receta_ingredientes desde catalogos.receta.ingredientes[].
     * SOLO ejecutar una vez.
     */
    async populateRecetaIngredientes(): Promise<{
        catalogos_procesados: number;
        relaciones_insertadas: number;
        catalogos_con_error: number;
        errores: unknown[];
    }> {
        return callRpc("populate_receta_ingredientes");
    },
};