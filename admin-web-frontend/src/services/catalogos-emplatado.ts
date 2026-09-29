/**
 * Servicio FASE 8 — Emplatado IA (imagen) + Ficha tecnica para catalogos.
 *
 * Fachada unificada FastAPI legacy / Supabase Edge Functions.
 *
 * - status():          GET /api/catalogos/{id}/emplatado/status
 * - generar():         POST /api/catalogos/{id}/emplatado/generar
 *                      ó Edge Function ia-emplatado-imagen
 * - seleccionar():     POST /api/catalogos/{id}/emplatado/seleccionar
 *                      ó Edge Function ia-emplatado-seleccionar
 * - generarFichaTecnica(): POST /api/catalogos/{id}/ficha-tecnica/generar
 *                      (solo FastAPI legacy — WeasyPrint no funciona en Deno)
 */

import { env } from "@/config/env";
import { httpClient } from "@/services/http-client";
import { getSupabase } from "@/lib/supabase";

// === Tipos ===

export interface EmplatadoStatus {
    configured: boolean;
    model: string;
    key_source: string;
    tiene_imagen_emplatado: boolean;
    imagen_emplatado_id: string | null;
    tiene_ficha_tecnica: boolean;
    ficha_tecnica_id: string | null;
    tiene_receta_tecnica: boolean;
}

export interface ImagenPropuesta {
    url: string;
    source: "url" | "b64";
}

export interface EmplatadoGenerarResponse {
    catalogo_id: string;
    imagenes: ImagenPropuesta[];
    modelo: string;
    prompt_usado: string;
    endpoint: string;
}

export interface EmplatadoPersistResponse {
    image_id: string;
    storage_path: string;
    sha256: string;
    mime_type: string;
    size_bytes: number;
    signed_url: string;
}

export interface FichaTecnicaResponse {
    image_id: string;
    storage_path: string;
    sha256: string;
    size_bytes: number;
    signed_url: string;
    modelo: string;
}

// === Helper Edge Function ===

async function invoke<T>(name: string, body: Record<string, unknown> = {}): Promise<T> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    const { data, error } = await supabase.functions.invoke<T>(name, { body });
    if (error) throw new Error(error.message);
    return data as T;
}

// === API ===

export const catalogosEmplatadoKeys = {
    status: (catalogoId: string) => ["catalogos", catalogoId, "emplatado-status"] as const,
};

export const catalogosEmplatadoService = {
    /**
     * Estado de configuración + flags del catálogo.
     */
    status: async (catalogoId: string): Promise<EmplatadoStatus> => {
        if (env.isSupabaseConfigured) {
            // Por ahora la Edge Function de status no existe; usamos el legacy
            // (Es una query barata y devuelve cacheable, no hay coste de IA).
            return httpClient.get<EmplatadoStatus>(`/api/catalogos/${catalogoId}/emplatado/status`);
        }
        return httpClient.get<EmplatadoStatus>(`/api/catalogos/${catalogoId}/emplatado/status`);
    },

    /**
     * Genera 3 propuestas de IMAGEN de emplatado. NO persiste nada.
     */
    generar: async (catalogoId: string, n = 3): Promise<EmplatadoGenerarResponse> => {
        if (env.isSupabaseConfigured) {
            return invoke<EmplatadoGenerarResponse>("ia-emplatado-imagen", {
                catalogo_id: catalogoId,
                n,
            });
        }
        return httpClient.post<EmplatadoGenerarResponse>(`/api/catalogos/${catalogoId}/emplatado/generar`, {});
    },

    /**
     * Persiste la imagen que el usuario eligió.
     */
    seleccionar: async (catalogoId: string, url: string): Promise<EmplatadoPersistResponse> => {
        if (env.isSupabaseConfigured) {
            return invoke<EmplatadoPersistResponse>("ia-emplatado-seleccionar", {
                catalogo_id: catalogoId,
                url,
            });
        }
        return httpClient.post<EmplatadoPersistResponse>(
            `/api/catalogos/${catalogoId}/emplatado/seleccionar`,
            { url },
        );
    },

    /**
     * Genera la ficha tecnica PNG. Solo FastAPI legacy (WeasyPrint).
     */
    generarFichaTecnica: async (catalogoId: string): Promise<FichaTecnicaResponse> => {
        // WeasyPrint no funciona en Deno, asi que SIEMPRE va por FastAPI legacy.
        // El frontend debe poder hablar con el backend (mismo origen o proxy).
        return httpClient.post<FichaTecnicaResponse>(
            `/api/catalogos/${catalogoId}/ficha-tecnica/generar`,
            {},
        );
    },
};