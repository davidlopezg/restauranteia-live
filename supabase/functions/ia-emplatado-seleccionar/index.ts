// Edge Function: ia-emplatado-seleccionar
// FASE 8 — El usuario eligio una de las 3 imagenes. La persistimos en Storage
// y actualizamos catalogos.imagen_emplatado_id (FK a catalogo_images).
//
// Body: { catalogo_id: string, url: string }   (URL http(s) o data URL)
// Devuelve: { image_id, storage_path, sha256, signed_url }

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse, errorResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STORAGE_BUCKET = "notion-migration-staging";

Deno.serve(async (req: Request) => {
    const opt = handleOptions(req);
    if (opt) return opt;

    try {
        if (req.method !== "POST") {
            return errorResponse("Method not allowed", 405);
        }

        const body = await req.json().catch(() => ({}));
        const catalogoId = body.catalogo_id;
        const url = body.url ?? body.image_url;
        if (!catalogoId || !url) {
            return errorResponse("catalogo_id y url son obligatorios", 400);
        }

        // 1) Descargar (URL http) o decodificar (data URL)
        let bytes: Uint8Array;
        let mime = "image/png";
        if (url.startsWith("data:")) {
            const [meta, b64] = url.split(",", 2);
            const mimeMatch = meta.match(/data:([^;]+)/);
            if (mimeMatch) mime = mimeMatch[1];
            const bin = atob(b64);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        } else {
            const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
            if (!r.ok) return errorResponse(`Descarga fallo [${r.status}]`, 502);
            mime = (r.headers.get("content-type") ?? "image/png").split(";")[0];
            bytes = new Uint8Array(await r.arrayBuffer());
        }

        // 2) SHA-256
        const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
        const sha = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");

        // 3) Storage path
        const ext = mime.includes("jpeg") || mime.includes("jpg")
            ? "jpg"
            : mime.includes("webp") ? "webp" : "png";
        const path = `catalogos/${catalogoId}/emplatado-${sha.slice(0, 16)}.${ext}`;

        // 4) Subir a Storage
        const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}?upsert=true`;
        const upR = await fetch(uploadUrl, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
                "Content-Type": mime,
            },
            body: bytes,
        });
        if (!upR.ok) {
            const t = await upR.text();
            return errorResponse(`Storage upload failed [${upR.status}]: ${t.slice(0, 200)}`, 502);
        }

        // 5) Borrar fila vieja (1:1)
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema: "notion_migration" } });
        const { data: oldRows } = await admin
            .from("catalogo_images")
            .select("id")
            .eq("catalogo_id", catalogoId)
            .eq("source_type", "emplatado")
            .limit(1);
        if (oldRows && oldRows.length > 0) {
            await admin.from("catalogo_images").delete().eq("id", oldRows[0].id);
        }

        // 6) Insert nueva fila
        const { data: inserted, error: insErr } = await admin
            .from("catalogo_images")
            .insert({
                catalogo_id: catalogoId,
                source_type: "emplatado",
                storage_bucket: STORAGE_BUCKET,
                storage_path: path,
                original_filename: `emplatado.${ext}`,
                mime_type: mime,
                file_size_bytes: bytes.byteLength,
                sha256: sha,
                position: 0,
            })
            .select("id, storage_path, sha256, mime_type, file_size_bytes")
            .single();
        if (insErr) return errorResponse(`Insert imagen failed: ${insErr.message}`, 502);

        // 7) UPDATE catalogos.imagen_emplatado_id
        await admin.from("catalogos").update({ imagen_emplatado_id: inserted.id }).eq("id", catalogoId);

        // 8) Signed URL
        const signedR = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${STORAGE_BUCKET}/${path}`, {
            method: "POST",
            headers: { "apikey": SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ expiresIn: 3600 }),
        });
        const signedPath = (await signedR.json()).signedURL ?? "";
        const signedUrl = signedPath.startsWith("http") ? signedPath : `${SUPABASE_URL}/storage/v1${signedPath}`;

        return jsonResponse({
            image_id: inserted.id,
            storage_path: inserted.storage_path,
            sha256: inserted.sha256,
            mime_type: inserted.mime_type,
            size_bytes: inserted.file_size_bytes,
            signed_url: signedUrl,
        });
    } catch (e) {
        return errorResponse(e instanceof Error ? e.message : String(e), 500);
    }
});