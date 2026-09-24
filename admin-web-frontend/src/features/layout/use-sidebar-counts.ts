import { useQuery } from "@tanstack/react-query";
import { httpClient } from "@/services/http-client";
import type { ListResponse } from "@/types/entity";
import type { CountKey } from "@/features/layout/nav-config";

// Conteos del sidebar.
//
// Coincide con admin-web/frontend/js/app.js:loadCounts() — pero con TanStack Query
// para tener caché, retry y deduplicación gratis. No añadimos useCountIdeas() y
// useCountAgendas() por separado: el shape es idéntico y solo cambia el path.

interface CountItem {
    id: string;
}

const countQuery = (entidad: "ideas" | "agendas" | "catalogos") => ({
    queryKey: ["counts", entidad],
    queryFn: () => httpClient.get<ListResponse<CountItem>>(`/api/${entidad}?limit=200`),
    staleTime: 60_000,
});

const pendientesQuery = {
    queryKey: ["counts", "pendientes"],
    queryFn: () => httpClient.get<unknown[]>("/api/pendientes"),
    staleTime: 60_000,
};

export type SidebarCounts = Record<CountKey, number | null>;

/** Devuelve los conteos del sidebar. `null` mientras carga, número cuando llega. */
export const useSidebarCounts = (): SidebarCounts => {
    const ideas = useQuery(countQuery("ideas"));
    const agendas = useQuery(countQuery("agendas"));
    const catalogos = useQuery(countQuery("catalogos"));
    const pendientes = useQuery(pendientesQuery);

    const len = (r: { data?: ListResponse<CountItem> | unknown[] }): number | null => {
        if (!r.data) return null;
        if (Array.isArray(r.data)) return r.data.length;
        return r.data.items?.length ?? null;
    };

    return {
        ideas: len(ideas),
        agendas: len(agendas),
        catalogos: len(catalogos),
        pendientes: len(pendientes),
    };
};
