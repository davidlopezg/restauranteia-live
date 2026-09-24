import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { EntityKind } from "@/types/entity";
import { getService } from "@/features/entities/get-service";

// Hook de lectura de listado. Devuelve items tipados como Record<string, unknown>
// porque cada entidad tiene sus campos; los componentes que renderizan aplican
// los casts necesarios por columna.
// keepPreviousData evita parpadeo entre páginas de cursor.

export interface ListResult {
    items: Array<Record<string, unknown> & { id: string; titulo?: string }>;
    next_cursor?: string | null;
    total_in_page?: number;
}

export const useEntityList = (
    entidad: EntityKind,
    params: Record<string, unknown> = {},
) => {
    const service = getService(entidad);
    return useQuery<ListResult>({
        queryKey: [service.keys.all[0], "list", params],
        queryFn: () => (service.list as unknown as (p: typeof params) => Promise<ListResult>)(params),
        placeholderData: keepPreviousData,
    });
};
