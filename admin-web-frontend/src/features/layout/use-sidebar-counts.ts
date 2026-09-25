import { useQuery } from "@tanstack/react-query";
import { ideasService, agendasService, catalogosService } from "@/services/entities";
import { desarrolloService } from "@/services/desarrollo";
import type { ListResponse } from "@/types/entity";
import type { CountKey } from "@/features/layout/nav-config";

// Conteos del sidebar — usa services Supabase-first.

interface CountItem {
    id: string;
}

const countQuery = (entidad: "ideas" | "agendas" | "catalogos") => ({
    queryKey: ["counts", entidad],
    queryFn: () => ideasService.list({ limit: 200 }) as Promise<ListResponse<CountItem>>,
    staleTime: 60_000,
});

const pendientesQuery = {
    queryKey: ["counts", "pendientes"],
    queryFn: () => desarrolloService.pendientes(),
    staleTime: 60_000,
};

export type SidebarCounts = Record<CountKey, number | null>;

/** Devuelve los conteos del sidebar. `null` mientras carga, número cuando llega. */
export const useSidebarCounts = (): SidebarCounts => {
    const ideas = useQuery(countQuery("ideas"));
    const agendas = useQuery({
        ...countQuery("agendas"),
        queryFn: () => agendasService.list({ limit: 200 }) as Promise<ListResponse<CountItem>>,
    });
    const catalogos = useQuery({
        ...countQuery("catalogos"),
        queryFn: () => catalogosService.list({ limit: 200 }) as Promise<ListResponse<CountItem>>,
    });
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