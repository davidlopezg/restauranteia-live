import { httpClient } from "@/services/http-client";
import type { RelationKind, RelationRequest, RelationResponse } from "@/types/relation";

// Servicios de relaciones N:M. Coincide con admin-web/backend/routers/entities.py.

export const relationsService = {
    add: (rel: RelationKind, body: RelationRequest) =>
        httpClient.post<RelationResponse>(`/api/relations/${rel}`, body),
    remove: (rel: RelationKind, aId: string, bId: string) =>
        httpClient.delete<unknown>(
            `/api/relations/${rel}?a_id=${encodeURIComponent(aId)}&b_id=${encodeURIComponent(bId)}`,
        ),
};
