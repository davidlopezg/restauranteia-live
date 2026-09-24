import { ArrowLeft } from "@untitledui/icons";
import { useLocation, useNavigate } from "react-router";
import { SECTION_TITLES } from "@/features/layout/nav-config";
import { useActiveNav } from "@/features/layout/use-active-nav";
import { GlobalSearch } from "@/features/search/global-search";

interface AppTopbarProps {
    /** Callback para abrir un overlay de búsqueda personalizado (si se quiere). */
    onOpenSearch?: () => void;
}

// Topbar: título dinámico + back + search trigger (que ahora abre el overlay real).

export const AppTopbar = ({ onOpenSearch }: AppTopbarProps) => {
    const location = useLocation();
    const navigate = useNavigate();
    const activeLeaf = useActiveNav();

    const title = activeLeaf?.label ?? SECTION_TITLES[location.pathname] ?? "Sol de Nit";
    const sectionBase = activeLeaf?.href ?? location.pathname;
    const hasDetail = location.pathname !== sectionBase && location.pathname !== "/";

    const goBack = () => {
        if (activeLeaf) navigate(activeLeaf.href);
        else navigate(-1);
    };

    return (
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-secondary bg-primary px-4">
            <h1 className="text-base font-semibold text-primary truncate">{title}</h1>

            {hasDetail && (
                <button
                    type="button"
                    onClick={goBack}
                    className="ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-tertiary hover:bg-secondary"
                    aria-label="Volver"
                >
                    <ArrowLeft className="size-4" />
                    <span className="hidden sm:inline">Volver</span>
                </button>
            )}

            <div className="ml-auto flex items-center gap-1">
                {onOpenSearch ? (
                    <button
                        type="button"
                        onClick={onOpenSearch}
                        className="inline-flex items-center gap-2 rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm text-tertiary hover:bg-secondary"
                        aria-label="Buscar (Cmd+K)"
                    >
                        Buscar ⌘K
                    </button>
                ) : (
                    <GlobalSearch />
                )}
            </div>
        </header>
    );
};
