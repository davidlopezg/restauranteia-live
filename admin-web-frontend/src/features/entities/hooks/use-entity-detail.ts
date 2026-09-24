import { useQuery } from "@tanstack/react-query";
import type { EntityKind } from "@/types/entity";
import { getService } from "@/features/entities/get-service";

export const useEntityDetail = <T,>(entidad: EntityKind, id: string | undefined) => {
    const service = getService(entidad);
    return useQuery<T>({
        queryKey: [service.keys.all[0], "detail", id],
        queryFn: () =>
            (service.detail as (id: string) => Promise<T>)(id!),
        enabled: !!id,
    });
};
