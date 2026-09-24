import { useLocation } from "react-router";
import { flattenLeaves, type NavLeaf } from "@/features/layout/nav-config";

// Determina qué item del sidebar está activo según la URL actual.
// Regla: la hoja más específica cuyo `href` es prefijo de la ruta actual.
// Ej: en `/agendas/abc-123` → `/agendas` marca activo.

export const useActiveNav = (): NavLeaf | null => {
    const location = useLocation();
    const path = location.pathname;

    const leaves = flattenLeaves();
    let best: NavLeaf | null = null;
    for (const leaf of leaves) {
        if (path === leaf.href || path.startsWith(leaf.href + "/")) {
            if (!best || leaf.href.length > best.href.length) best = leaf;
        }
    }
    return best;
};
