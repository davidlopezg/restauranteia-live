/**
 * Fachada unificada imagenes — Supabase / Legacy.
 */

import { env } from "@/config/env";
import {
    signedUrl as signedUrlSupabase,
    uploadImage as uploadImageSupabase,
    updateImage as updateImageSupabase,
    deleteImage as deleteImageSupabase,
    imagesLegacy,
    type UploadMeta, type UploadResult,
} from "@/services/images.supabase";

export type { UploadMeta, UploadResult };

export const imagesKeys = {
    signedUrl: (bucket: string, path: string) => ["images", "signed", bucket, path] as const,
};

export const imagesService = {
    signedUrl: (bucket: string, path: string, ttl?: number): Promise<string> => {
        if (env.isSupabaseConfigured) return signedUrlSupabase(bucket, path, ttl);
        return imagesLegacy.signedUrl(bucket, path, ttl).then((r) => r.url);
    },

    upload: (
        entidad: "ideas" | "agendas" | "catalogos",
        entityId: string,
        file: File,
        meta: UploadMeta = {},
    ): Promise<UploadResult> => {
        if (env.isSupabaseConfigured) return uploadImageSupabase(entidad, entityId, file, meta);
        // Legacy: usa fetch directo a /api/... con FormData
        const fd = new FormData();
        fd.append("file", file);
        if (meta.source_type) fd.append("source_type", meta.source_type);
        if (meta.notion_block_id) fd.append("notion_block_id", meta.notion_block_id);
        if (meta.notion_property) fd.append("notion_property", meta.notion_property);
        if (meta.position !== undefined) fd.append("position", String(meta.position));
        return fetch(`/api/${entidad}/${entityId}/images`, { method: "POST", body: fd })
            .then(async (r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
                return r.json() as Promise<UploadResult>;
            });
    },

    update: (
        entidad: "ideas" | "agendas" | "catalogos",
        entityId: string,
        imageId: string,
        body: Record<string, unknown>,
    ): Promise<unknown> => {
        if (env.isSupabaseConfigured) return updateImageSupabase(entidad, imageId, body);
        return imagesLegacy.update(entidad, entityId, imageId, body);
    },

    delete: (
        entidad: "ideas" | "agendas" | "catalogos",
        entityId: string,
        imageId: string,
    ): Promise<{ deleted: boolean; id: string; cleanup: boolean }> => {
        if (env.isSupabaseConfigured) return deleteImageSupabase(entidad, imageId);
        return imagesLegacy.delete(entidad, entityId, imageId);
    },
};