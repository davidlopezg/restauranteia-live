/**
 * conservacion.service.ts — Servicio de la página de Conservación.
 *
 * Une dos lecturas:
 *   - Ingredientes (tabla `ingredientes`) → reglas de conservación por categoría
 *   - Catálogos con receta (tabla `catalogos` con `receta` jsonb)
 *     → ya traen `receta.conservacion { metodo, vida_util_h, ... }`
 *
 * El resto de la lógica (perecedero, métodos posibles, recomendado)
 * vive en `features/conservacion/lib/conservacion-reglas.ts`.
 */

import { env } from "@/config/env";
import { getSupabase } from "@/lib/supabase";

export interface ProductoParaConservacion {
    id: string;
    nombre: string;
    categoria: string | null;
}

export interface ElaboracionParaConservacion {
    id: string;
    titulo: string;
    categorias: string[] | null;
    /** Bloque receta.conservacion normalizado. */
    metodo: string | null;
    vida_util_h: number | null;
    temperatura_min_c: number | null;
    temperatura_max_c: number | null;
    envase: string | null;
    regeneracion: string | null;
}

export const conservacionKeys = {
    all: ["conservacion"] as const,
    productos: () => ["conservacion", "productos"] as const,
    elaboraciones: () => ["conservacion", "elaboraciones"] as const,
};

async function supabaseOrThrow() {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    return supabase;
}

export const conservacionService = {
    /** Lista ingredientes activos. Si no hay Supabase, devuelve demo. */
    async listProductos(): Promise<ProductoParaConservacion[]> {
        if (env.isSupabaseConfigured) {
            const supabase = await supabaseOrThrow();
            const { data, error } = await supabase
                .from("ingredientes")
                .select("id,nombre,categoria")
                .eq("activo", true)
                .order("nombre", { ascending: true });
            if (error) throw new Error(error.message);
            return (data ?? []) as unknown as ProductoParaConservacion[];
        }
        // Demo / fallback sin Supabase
        return DEMO_PRODUCTOS;
    },

    /**
     * Lista catálogos que tengan `receta` con datos de conservación.
     * Incluye el jsonb receta para extraer `receta.conservacion`.
     */
    async listElaboraciones(): Promise<ElaboracionParaConservacion[]> {
        if (env.isSupabaseConfigured) {
            const supabase = await supabaseOrThrow();
            const { data, error } = await supabase
                .from("catalogos")
                .select("id,titulo,categorias,receta")
                .not("receta", "is", null)
                .order("titulo", { ascending: true });
            if (error) throw new Error(error.message);

            // Normalizamos receta -> conservacion
            return ((data ?? []) as unknown as Array<{
                id: string;
                titulo: string;
                categorias: string[] | null;
                receta: { conservacion?: {
                    metodo?: string | null;
                    vida_util_h?: number | null;
                    temperatura_c?: { min?: number; max?: number } | null;
                    envase?: string | null;
                    regeneracion?: string | null;
                } | null } | null;
            }>).map(row => {
                const cons = row.receta?.conservacion ?? null;
                return {
                    id: row.id,
                    titulo: row.titulo,
                    categorias: row.categorias,
                    metodo: cons?.metodo ?? null,
                    vida_util_h: cons?.vida_util_h ?? null,
                    temperatura_min_c: cons?.temperatura_c?.min ?? null,
                    temperatura_max_c: cons?.temperatura_c?.max ?? null,
                    envase: cons?.envase ?? null,
                    regeneracion: cons?.regeneracion ?? null,
                };
            });
        }
        // Demo / fallback sin Supabase
        return DEMO_ELABORACIONES;
    },

    /**
     * Invalida todas las keys de conservación. Llamar desde los formularios
     * de ingredientes y de recetas tras create/update/delete.
     */
    keysParaInvalidar() {
        return [conservacionKeys.all];
    },
};

/* ============================================================
 *  Datos demo (para que la página funcione sin Supabase configurado)
 *  Cubren los casos típicos para validar la UI en local.
 * ============================================================ */

const DEMO_PRODUCTOS: ProductoParaConservacion[] = [
    { id: "p1", nombre: "Tomate", categoria: "verdura" },
    { id: "p2", nombre: "Cebolla", categoria: "verdura" },
    { id: "p3", nombre: "Albahaca", categoria: "hierba" },
    { id: "p4", nombre: "Pimentón", categoria: "especia" },
    { id: "p5", nombre: "Pollo", categoria: "proteina" },
    { id: "p6", nombre: "Salmón", categoria: "proteina" },
    { id: "p7", nombre: "Queso curado", categoria: "lacteo" },
    { id: "p8", nombre: "Aceite oliva", categoria: "grasa" },
    { id: "p9", nombre: "Vinagre balsámico", categoria: "conserva" },
    { id: "p10", nombre: "Vino tinto", categoria: "vino" },
    { id: "p11", nombre: "Sal", categoria: "condimento" },
    { id: "p12", nombre: "Harina", categoria: "cereal" },
    { id: "p13", nombre: "Azúcar", categoria: "endulzante" },
    { id: "p14", nombre: "Leche", categoria: "lacteo" },
    { id: "p15", nombre: "Huevo", categoria: "proteina" },
];

const DEMO_ELABORACIONES: ElaboracionParaConservacion[] = [
    {
        id: "e1",
        titulo: "Salsa de tomate",
        categorias: ["Salsas"],
        metodo: "refrigeracion",
        vida_util_h: 72,
        temperatura_min_c: 0,
        temperatura_max_c: 4,
        envase: "Bote de cristal cerrado",
        regeneracion: "Calentar al baño María suave hasta 70°C",
    },
    {
        id: "e2",
        titulo: "Pesto genovés",
        categorias: ["Salsas"],
        metodo: "refrigeracion",
        vida_util_h: 96,
        temperatura_min_c: 2,
        temperatura_max_c: 4,
        envase: "Tarrina con film y tapa",
        regeneracion: "Atemperar 15 min antes de servir",
    },
    {
        id: "e3",
        titulo: "Mermelada de tomate",
        categorias: ["Postres"],
        metodo: "conserva_autoclave",
        vida_util_h: 8760, // 1 año
        temperatura_min_c: 12,
        temperatura_max_c: 18,
        envase: "Bote de cristal pasteurizado",
        regeneracion: "Consumir directamente",
    },
    {
        id: "e4",
        titulo: "Masa de pizza",
        categorias: ["Masas"],
        metodo: "refrigeracion",
        vida_util_h: 72,
        temperatura_min_c: 2,
        temperatura_max_c: 4,
        envase: "Bol con film",
        regeneracion: "Sacar 30 min antes, bolear y hornear",
    },
    {
        id: "e5",
        titulo: "Fondo blanco",
        categorias: ["Fondos"],
        metodo: "refrigeracion",
        vida_util_h: 96,
        temperatura_min_c: 0,
        temperatura_max_c: 4,
        envase: "Bouteille sellada",
        regeneracion: "Hervir y reducir",
    },
    {
        id: "e6",
        titulo: "Sofrito base",
        categorias: ["Bases"],
        metodo: "congelacion",
        vida_util_h: 2160, // 90 días
        temperatura_min_c: -18,
        temperatura_max_c: -22,
        envase: "Bolsas al vacío, porciones 500g",
        regeneracion: "Descongelar en cámara 0-4°C, saltear",
    },
    {
        id: "e7",
        titulo: "Paté de campaña",
        categorias: ["Embutidos"],
        metodo: "salazon_curado",
        vida_util_h: 720,
        temperatura_min_c: 4,
        temperatura_max_c: 8,
        envase: "Tarrina sellada",
        regeneracion: "Listo para consumir",
    },
];
