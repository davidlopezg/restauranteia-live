import { httpClient } from "@/services/http-client";
import type { FiltersResponse } from "@/types/filters";
import type { EntityKind } from "@/types/entity";

export const filtersKeys = {
    forEntity: (entidad: EntityKind) => ["filters", entidad] as const,
};

export const filtersService = {
    get: (entidad: EntityKind) => httpClient.get<FiltersResponse>(`/api/filters/${entidad}`),
};
