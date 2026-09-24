// Estructura de navegación del sidebar. Coincide 1:1 con el frontend actual
// (admin-web/frontend/index.html) y con las rutas del backend.
// Cada item apunta a una ruta SPA. Los grupos son collapsables.
//
// Los iconos se asignan en app-sidebar.tsx para no acoplar este módulo a la
// librería de iconos (mantiene `nav-config` puro y testeable).

export type CountKey = "ideas" | "agendas" | "catalogos" | "pendientes";

export interface NavLeaf {
    /** Identificador estable, único dentro del sidebar. */
    id: string;
    /** Etiqueta visible. */
    label: string;
    /** Ruta SPA (`/ideas`, `/agendas/{id}`…). */
    href: string;
    /** Si true, este item aporta un contador al sidebar. */
    countable?: CountKey;
    /** Si true, marca como ruta hija (indentación bajo un grupo). */
    nested?: boolean;
}

export interface NavGroup {
    id: string;
    label: string;
    children: NavLeaf[];
}

export type NavItem = NavLeaf | NavGroup;

export function isGroup(item: NavItem): item is NavGroup {
    return "children" in item;
}

/** Items raíz, en el orden en que aparecen en el sidebar. */
export const NAV_ITEMS: NavItem[] = [
    { id: "dashboard", label: "Dashboard", href: "/cadencia" },
    { id: "ideas", label: "Ideas", href: "/ideas", countable: "ideas" },
    {
        id: "pruebas",
        label: "Pruebas",
        children: [
            { id: "agendas", label: "Pruebas", href: "/agendas", countable: "agendas", nested: true },
            { id: "pipeline", label: "Pipeline", href: "/desarrollo", nested: true },
            { id: "pendientes", label: "Pendientes", href: "/pendientes", countable: "pendientes", nested: true },
        ],
    },
    { id: "catalogo", label: "Catálogo", href: "/catalogos", countable: "catalogos" },
    {
        id: "analisis",
        label: "Análisis",
        children: [
            { id: "evaluaciones", label: "Evaluaciones", href: "/evaluaciones", nested: true },
            { id: "emplatado", label: "Emplatado", href: "/emplatado", nested: true },
            { id: "vajilla", label: "Vajilla", href: "/vajilla", nested: true },
        ],
    },
    {
        id: "ia",
        label: "IA Creativa",
        children: [
            { id: "ideas-creativas", label: "Ideas creativas", href: "/ideas-creativas", nested: true },
            { id: "ideas-cientificas", label: "Ideas científicas", href: "/ideas-cientificas", nested: true },
        ],
    },
    {
        id: "docs",
        label: "Documentación",
        children: [
            { id: "documentacion", label: "Cómo funciona", href: "/documentacion", nested: true },
            { id: "settings", label: "Configuración", href: "/settings", nested: true },
        ],
    },
];

/** Aplana la navegación para iterar sobre todas las hojas (usado por use-active-nav). */
export function flattenLeaves(items: NavItem[] = NAV_ITEMS): NavLeaf[] {
    const out: NavLeaf[] = [];
    for (const item of items) {
        if (isGroup(item)) out.push(...flattenLeaves(item.children));
        else out.push(item);
    }
    return out;
}

/** Etiqueta de topbar para una sección (sin el id concreto). */
export const SECTION_TITLES: Record<string, string> = {
    "/cadencia": "Dashboard",
    "/desarrollo": "Pipeline",
    "/pendientes": "Pendientes",
    "/ideas": "Ideas",
    "/ideas-creativas": "Ideas creativas",
    "/ideas-cientificas": "Ideas científicas",
    "/agendas": "Pruebas",
    "/catalogos": "Catálogo",
    "/evaluaciones": "Evaluaciones",
    "/emplatado": "Emplatado IA",
    "/vajilla": "Vajilla",
    "/documentacion": "Documentación",
    "/settings": "Configuración",
};
