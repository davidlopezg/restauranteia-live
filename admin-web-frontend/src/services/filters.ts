/**
 * Servicio de filtros — fachada unificada Supabase / Legacy.
 */

import { env } from "@/config/env";
import { filtersSupabaseService, filtersLegacy } from "@/services/filters.supabase";
import type { FiltersResponse } from "@/types/filters";
import type { EntityKind } from "@/types/entity";

export const filtersKeys = {
    forEntity: (entidad: EntityKind) => ["filters", entidad] as const,
};

export const filtersService = {
    get: (entidad: EntityKind): Promise<FiltersResponse> => {
        if (env.isSupabaseConfigured) return filtersSupabaseService.get(entidad);
        return filtersLegacy.get(entidad);
    },
};