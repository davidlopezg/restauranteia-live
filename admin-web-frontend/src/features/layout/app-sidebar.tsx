import {
    ArrowLeft,
    BookOpen01,
    Beaker01,
    Bookmark,
    Calendar,
    ChartBreakoutSquare,
    Home01,
    Lightbulb01,
    Menu01,
    PieChart01,
    Settings01,
    Snowflake01,
    Star01,
    Table,
    X,
} from "@untitledui/icons";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { cx } from "@/utils/cx";
import { isGroup, NAV_ITEMS, type NavLeaf } from "@/features/layout/nav-config";
import { useSidebarCounts } from "@/features/layout/use-sidebar-counts";
import { StatusPill } from "@/features/layout/status-pill";

// Mapa id → icono. Asignado aquí para mantener nav-config libre de imports.
const ICONS: Record<string, typeof Home01> = {
    dashboard: Home01,
    ideas: Lightbulb01,
    agendas: Calendar,
    pipeline: ChartBreakoutSquare,
    pendientes: PieChart01,
    catalogo: Star01,
    conservacion: Snowflake01,
    evaluaciones: PieChart01,
    emplatado: Table,
    vajilla: Table,
    "ideas-creativas": Bookmark,
    "ideas-cientificas": Beaker01,
    documentacion: BookOpen01,
    settings: Settings01,
};

const Icon = ({ id, className }: { id: string; className?: string }) => {
    const Cmp = ICONS[id] ?? Star01;
    return <Cmp className={className} />;
};

interface AppSidebarProps {
    /** Si false, oculta el sidebar (modo móvil cuando el drawer está cerrado). */
    open: boolean;
    /** Cierra el drawer móvil al hacer click en backdrop. */
    onClose: () => void;
    /** Slot para el FAB "+ Nuevo" del footer (lo define el shell porque sabe el contexto). */
    footerSlot?: ReactNode;
}

export const AppSidebar = ({ open, onClose, footerSlot }: AppSidebarProps) => {
    const counts = useSidebarCounts();

    return (
        <>
            {/* Backdrop móvil */}
            <div
                className={cx(
                    "fixed inset-0 z-40 bg-overlay transition-opacity md:hidden",
                    open ? "opacity-100" : "pointer-events-none opacity-0",
                )}
                onClick={onClose}
                aria-hidden={!open}
            />

            <aside
                aria-label="Navegación principal"
                className={cx(
                    "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-secondary bg-primary transition-transform md:static md:translate-x-0",
                    open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
                )}
            >
                {/* Brand */}
                <div className="flex h-14 items-center justify-between px-4">
                    <div className="flex flex-col leading-tight">
                        <span className="text-sm font-semibold text-primary">Sol de Nit</span>
                        <span className="text-xs text-tertiary">Administración</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md p-1 text-tertiary hover:bg-secondary md:hidden"
                        aria-label="Cerrar menú"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto px-2 py-2">
                    <ul className="flex flex-col gap-0.5">
                        {NAV_ITEMS.map(item => (
                            <NavRow key={item.id} item={item} counts={counts} />
                        ))}
                    </ul>
                </nav>

                {/* Footer */}
                <div className="border-t border-secondary px-2 py-3">
                    {footerSlot}
                    <StatusPill />
                </div>
            </aside>
        </>
    );
};

interface NavRowProps {
    item: (typeof NAV_ITEMS)[number];
    counts: ReturnType<typeof useSidebarCounts>;
}

const NavRow = ({ item, counts }: NavRowProps) => {
    if (isGroup(item)) {
        return (
            <li>
                <details open className="group">
                    <summary
                        className="flex cursor-pointer list-none items-center rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide text-tertiary hover:bg-secondary"
                    >
                        <span className="flex-1">{item.label}</span>
                        <span className="transition-transform group-open:rotate-90" aria-hidden>▸</span>
                    </summary>
                    <ul className="mt-0.5 flex flex-col gap-0.5">
                        {item.children.map(child => (
                            <NavRow key={child.id} item={child} counts={counts} />
                        ))}
                    </ul>
                </details>
            </li>
        );
    }

    return <NavLeafRow leaf={item} counts={counts} />;
};

const NavLeafRow = ({ leaf, counts }: { leaf: NavLeaf; counts: ReturnType<typeof useSidebarCounts> }) => {
    const count = leaf.countable ? counts[leaf.countable] : null;
    const showCount = typeof count === "number";

    return (
        <li>
            <NavLink
                to={leaf.href}
                end={leaf.href === "/cadencia"}
                className={({ isActive }) =>
                    cx(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                        leaf.nested && "pl-9",
                        isActive
                            ? "bg-brand-secondary text-brand-primary font-medium"
                            : "text-secondary hover:bg-secondary hover:text-primary",
                    )
                }
            >
                <Icon id={leaf.id} className="size-4 shrink-0" />
                <span className="flex-1 truncate">{leaf.label}</span>
                {showCount && (
                    <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs text-tertiary">
                        {count}
                    </span>
                )}
            </NavLink>
        </li>
    );
};

/** Hamburger button para el shell móvil. Se muestra solo < md. */
export const SidebarToggle = ({ onClick }: { onClick: () => void }) => (
    <button
        type="button"
        onClick={onClick}
        className="rounded-md p-2 text-tertiary hover:bg-secondary md:hidden"
        aria-label="Abrir menú"
    >
        <Menu01 className="size-5" />
    </button>
);

// Re-export para el shell.
export { ArrowLeft };
