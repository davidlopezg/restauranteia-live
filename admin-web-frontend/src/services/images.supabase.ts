/**
 * Servicios de imágenes desde Supabase.
 *
 * Replica el comportamiento de admin-web/backend/routers/images.py + queries.py.
 *
 * Notas del comportamiento actual que se preserva (incluso bugs documentados):
 * - Path = {entidad}/{entity_id}/{sha[:16]}.{ext} (sin filename)
 * - SIEMPRE sube el archivo a Storage (dedup es a nivel DB, no Storage)
 * - lookup_image_by_hash busca SOLO en la tabla de la entidad actual
 * - En update, NO se puede cambiar ref_count / sha256 / storage_path
 * - En delete, el archivo fisico se borra solo cuando ref_count llega a 0
 *
 * Diferencia con el backend original: el cliente ahora SI borra el archivo
 * de Storage al detectar ref_count=0 (bug original: solo devolvia el flag).
 */

import { getSupabase } from "@/lib/supabase";
import { callRpc } from "@/lib/rpc";
import { httpClient } from "@/services/http-client";
import type { EntityImage } from "@/types/image";

// Tabla por entidad (espejo de queries.py:IMAGE_TABLES)
const IMAGE_TABLES = {
    ideas: "idea_images",
    agendas: "agenda_images",
    catalogos: "catalogo_images",
} as const;

const ENTITY_FK_COL = {
    ideas: "idea_id",
    agendas: "agenda_id",
    catalogos: "catalogo_id",
} as const;

type Entidad = keyof typeof IMAGE_TABLES;

const ALLOWED_EXTS = ["png", "jpg", "jpeg", "gif", "webp"] as const;

// === Hash ===

export async function sha256OfBlob(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

// === Signed URL ===

export async function signedUrl(bucket: string, path: string, ttl = 3600): Promise<string> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttl);
    if (error) throw new Error(error.message);
    return data.signedUrl;
}

// === List (no estaba en backend como endpoint pero el frontend lo necesita) ===

export async function listImages(entidad: Entidad, entityId: string): Promise<EntityImage[]> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    const table = IMAGE_TABLES[entidad];
    const fk = ENTITY_FK_COL[entidad];
    const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq(fk, entityId)
        .order("position", { ascending: true, nullsFirst: false })
        .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as EntityImage[];
}

// === Upload (replica el flujo del backend) ===

export interface UploadMeta {
    source_type?: string;
    notion_block_id?: string;
    notion_property?: string;
    position?: number | string;
}

export interface UploadResult extends EntityImage {
    deduplicated: boolean;
}

export async function uploadImage(
    entidad: Entidad,
    entityId: string,
    file: File,
    meta: UploadMeta = {},
    bucket = "notion-migration-staging",
): Promise<UploadResult> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");

    // 1. SHA-256
    const sha = await sha256OfBlob(file);

    // 2. Extension whitelist
    let ext = "png";
    if (file.name && file.name.includes(".")) {
        ext = file.name.split(".").pop()!.toLowerCase();
    }
    if (!(ALLOWED_EXTS as readonly string[]).includes(ext)) {
        ext = "png";
    }

    // 3. Path (mismo formato que el backend)
    const path = `${entidad}/${entityId}/${sha.slice(0, 16)}.${ext}`;

    // 4. SIEMPRE sube el archivo (igual que backend)
    const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true, contentType: file.type || `image/${ext}` });
    if (upErr) throw new Error(`upload failed: ${upErr.message}`);

    // 5. Lookup dedup por hash en la tabla de la entidad
    const table = IMAGE_TABLES[entidad];
    const fk = ENTITY_FK_COL[entidad];

    const { data: existing } = await supabase
        .from(table)
        .select("*")
        .eq("sha256", sha)
        .limit(1)
        .maybeSingle();

    if (existing) {
        // Deduplicated: update ref_count
        const newRef = (existing.ref_count ?? 1) + 1;
        const { data: updated, error: upErr2 } = await supabase
            .from(table)
            .update({ ref_count: newRef })
            .eq("id", existing.id)
            .select("*")
            .maybeSingle();
        if (upErr2) throw new Error(upErr2.message);
        return { ...(updated as EntityImage), deduplicated: true };
    }

    // 6. INSERT nueva fila
    const insertPayload = {
        [fk]: entityId,
        source_type: meta.source_type ?? "",
        notion_block_id: meta.notion_block_id ?? "",
        notion_page_id: entityId,
        notion_property: meta.notion_property ?? "",
        storage_bucket: bucket,
        storage_path: path,
        original_filename: file.name || null,
        mime_type: file.type || `image/${ext}`,
        file_size_bytes: file.size,
        sha256: sha,
        position: meta.position === undefined ? "" : String(meta.position),
        has_caption: false,
        migrated_at: new Date().toISOString(),
        migration_run_id: "manual_upload",
    };
    const { data: inserted, error: insErr } = await supabase
        .from(table)
        .insert(insertPayload)
        .select("*")
        .maybeSingle();
    if (insErr) throw new Error(insErr.message);
    return { ...(inserted as EntityImage), deduplicated: false };
}

// === Update ===

const UPDATE_WHITELIST = new Set([
    "source_type",
    "notion_block_id",
    "notion_property",
    "original_filename",
    "position",
    "has_caption",
]);

export async function updateImage(
    entidad: Entidad,
    imageId: string,
    body: Record<string, unknown>,
): Promise<EntityImage> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
        if (UPDATE_WHITELIST.has(k)) safe[k] = v;
    }
    if (Object.keys(safe).length === 0) throw new Error("Sin cambios permitidos");
    const table = IMAGE_TABLES[entidad];
    const { data, error } = await supabase
        .from(table)
        .update(safe)
        .eq("id", imageId)
        .select("*")
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Imagen no encontrada");
    return data as EntityImage;
}

// === Delete (con cleanup de Storage via RPC) ===

export async function deleteImage(
    entidad: Entidad,
    imageId: string,
    bucket = "notion-migration-staging",
): Promise<{ deleted: boolean; id: string; cleanup: boolean }> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");

    // 1. SELECT fila para obtener storage_path antes de borrar
    const table = IMAGE_TABLES[entidad];
    const { data: row, error: selErr } = await supabase
        .from(table)
        .select("storage_path")
        .eq("id", imageId)
        .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!row) throw new Error("Imagen no encontrada");

    const storagePath = (row as { storage_path: string }).storage_path;

    // 2. DELETE fila via RPC (que valida ref_count cross-table)
    const result = await callRpc<{ deleted: boolean; cleanup: boolean; storage_path: string | null }>(
        "delete_image_with_cleanup",
        { p_entidad: entidad, p_image_id: imageId },
    );

    // 3. Si cleanup=true, borrar el archivo fisico de Storage
    if (result.cleanup && storagePath) {
        await supabase.storage.from(bucket).remove([storagePath]);
    }

    return { deleted: true, id: imageId, cleanup: result.cleanup };
}

// === Legacy fallback ===

export const imagesLegacy = {
    signedUrl: (bucket: string, path: string, ttl?: number) => {
        const qs = new URLSearchParams({ bucket, path });
        if (ttl) qs.set("ttl", String(ttl));
        return httpClient.get<{ url: string }>(`/api/images/signed?${qs}`);
    },
    update: (entidad: string, entityId: string, imageId: string, body: Record<string, unknown>) =>
        httpClient.patch(`/api/${entidad}/${entityId}/images/${imageId}`, body),
    delete: (entidad: string, entityId: string, imageId: string) =>
        httpClient.delete<{ deleted: boolean; id: string; cleanup: boolean }>(
            `/api/${entidad}/${entityId}/images/${imageId}`,
        ),
};