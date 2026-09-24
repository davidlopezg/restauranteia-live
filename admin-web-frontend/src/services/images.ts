import { httpClient } from "@/services/http-client";
import type { SignedUrlResponse } from "@/types/image";

// Servicios de imágenes. Coincide con admin-web/backend/routers/images.py.

export const imagesKeys = {
    signedUrl: (bucket: string, path: string) => ["images", "signed", bucket, path] as const,
};

export const imagesService = {
    signedUrl: (bucket: string, path: string) => {
        const qs = new URLSearchParams({ bucket, path }).toString();
        return httpClient.get<SignedUrlResponse>(`/api/images/signed?${qs}`);
    },
    // upload usa FormData: se hace con fetch directo (no JSON), no a través de httpClient.
    upload: async (entidad: string, entityId: string, form: FormData) => {
        const r = await fetch(`/api/${entidad}/${entityId}/images`, { method: "POST", body: form });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
        return r.json() as Promise<unknown>;
    },
    update: (entidad: string, entityId: string, imageId: string, body: unknown) =>
        httpClient.patch(`/api/${entidad}/${entityId}/images/${imageId}`, body),
    delete: (entidad: string, entityId: string, imageId: string) =>
        httpClient.delete(`/api/${entidad}/${entityId}/images/${imageId}`),
};
