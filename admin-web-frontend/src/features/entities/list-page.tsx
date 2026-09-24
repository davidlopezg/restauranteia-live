import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { EntityKind } from "@/types/entity";
import { useEntityList } from "@/features/entities/hooks/use-entity-list";
import { ENTITY_PLURAL, ENTITY_SINGULAR, getService } from "@/features/entities/get-service";
import { catalogosService } from "@/services/entities";
import type { CatalogoGrupo } from "@/types/catalogo";
import { fmtDate } from "@/utils/date";
import { fmtPrice } from "@/utils/currency";
import { cx } from "@/utils/cx";

// ListPage genérica parametrizada por `entidad`.
// Tabla simple con search + paginación cursor. La fase 6.1 no incluye
// vista de cards ni bulk-delete; se añaden si el usuario lo pide.

interface Column<T> {
    key: string;
    label: string;
    render: (item: T) => React.ReactNode;
}

const COLUMNS: Record<EntityKind, Column<Record<string, unknown>>[]> = {
    ideas: [
        { key: "titulo", label: "Título", render: i => <strong>{String(i.titulo ?? "(sin título)")}</strong> },
        {
            key: "estado",
            label: "Estado",
            render: i =>
                i.estado_idea ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                        {String(i.estado_idea)}
                    </span>
                ) : (
                    <span className="text-tertiary">—</span>
                ),
        },
        {
            key: "categorias",
            label: "Categorías",
            render: i => (Array.isArray(i.categorias) && i.categorias.length > 0 ? (i.categorias as string[]).join(", ") : "—"),
        },
        { key: "fecha_creacion", label: "Fecha", render: i => fmtDate(i.fecha_creacion as string | null) },
    ],
    agendas: [
        { key: "titulo", label: "Título", render: i => <strong>{String(i.titulo ?? "(sin título)")}</strong> },
        {
            key: "etiquetas",
            label: "Etiquetas",
            render: i => (Array.isArray(i.etiquetas) && i.etiquetas.length > 0 ? (i.etiquetas as string[]).join(", ") : "—"),
        },
        {
            key: "estado_desarrollo",
            label: "Estado",
            render: i =>
                i.estado_desarrollo ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                        {String(i.estado_desarrollo)}
                    </span>
                ) : (
                    <span className="text-tertiary">—</span>
                ),
        },
        { key: "fecha", label: "Fecha", render: i => fmtDate(i.fecha as string | null) },
    ],
    catalogos: [
        { key: "titulo", label: "Título", render: i => <strong>{String(i.titulo ?? "(sin título)")}</strong> },
        {
            key: "estado",
            label: "Estado",
            render: i => (i.estado ? String(i.estado) : "—"),
        },
        {
            key: "categorias",
            label: "Categorías",
            render: i => (Array.isArray(i.categorias) && i.categorias.length > 0 ? (i.categorias as string[]).join(", ") : "—"),
        },
        { key: "precio", label: "Precio", render: i => fmtPrice(i.precio as number | null) },
        { key: "orden", label: "Orden", render: i => (i.orden != null ? String(i.orden) : "—") },
    ],
};

interface ListPageProps {
    entidad: EntityKind;
}

export const ListPage = ({ entidad }: ListPageProps) => {
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [cursor, setCursor] = useState<string | null>(null);
    const [view, setView] = useState<"table" | "groups">("table");

    // Para catalogos hay vista "groups" (categorías desplegables).
    const showGroups = entidad === "catalogos";

    // Debounce del search: 280ms tras el último cambio.
    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
        return () => window.clearTimeout(t);
    }, [search]);

    // Reset del cursor cuando el search cambia.
    useEffect(() => {
        setCursor(null);
    }, [debouncedSearch]);

    const params: Record<string, unknown> = {
        search: debouncedSearch || undefined,
        cursor: cursor || undefined,
        limit: 30,
    };

    const { data, isLoading, isFetching, error } = useEntityList(entidad, params);
    const cols = COLUMNS[entidad];

    return (
        <div className="flex flex-col gap-4">
            <header className="flex items-center justify-between gap-3">
                <h1 className="text-lg font-semibold text-primary">{ENTITY_PLURAL[entidad]}</h1>
                <button
                    type="button"
                    onClick={() => navigate(`/${entidad}/new`)}
                    className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary_hover"
                >
                    + Nuevo {ENTITY_SINGULAR[entidad].toLowerCase()}
                </button>
            </header>

            <div className="flex items-center gap-2">
                <input
                    type="search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por título…"
                    className="w-full max-w-xs rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    aria-label="Buscar"
                />
                {isFetching && <span className="text-xs text-tertiary">cargando…</span>}
            </div>

            {error && (
                <p className="text-sm text-error-primary">Error: {(error as Error).message}</p>
            )}

            {showGroups && (
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setView("table")}
                        className={`rounded-md px-3 py-1 text-xs ${view === "table" ? "bg-brand-primary text-white" : "border border-secondary text-secondary"}`}
                    >
                        Tabla
                    </button>
                    <button
                        type="button"
                        onClick={() => setView("groups")}
                        className={`rounded-md px-3 py-1 text-xs ${view === "groups" ? "bg-brand-primary text-white" : "border border-secondary text-secondary"}`}
                    >
                        Categorías
                    </button>
                </div>
            )}

            {view === "groups" && showGroups ? (
                <GroupsView onSelect={id => navigate(`/catalogos/${id}`)} />
            ) : (
                <div className="overflow-x-auto rounded-lg border border-secondary">
                    <table className="w-full text-sm" data-testid={`table-${entidad}`}>
                        <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-tertiary">
                            <tr>
                                {cols.map(c => (
                                    <th key={c.key} className="px-3 py-2 font-medium">
                                        {c.label}
                                    </th>
                                ))}
                                <th className="w-24 px-3 py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={cols.length + 1} className="px-3 py-6 text-center text-tertiary">
                                        Cargando…
                                    </td>
                                </tr>
                            ) : data?.items.length === 0 ? (
                                <tr>
                                    <td colSpan={cols.length + 1} className="px-3 py-6 text-center text-tertiary">
                                        Sin resultados.
                                    </td>
                                </tr>
                            ) : (
                                data?.items.map((item, idx) => (
                                    <tr
                                        key={(item as { id: string }).id ?? idx}
                                        className={cx(
                                            "cursor-pointer border-t border-secondary hover:bg-secondary",
                                        )}
                                        onClick={() => navigate(`/${entidad}/${(item as { id: string }).id}`)}
                                        data-testid={`row-${entidad}-${(item as { id: string }).id}`}
                                    >
                                        {cols.map(c => (
                                            <td key={c.key} className="px-3 py-2 text-primary">
                                                {c.render(item)}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-right text-tertiary">
                                            <span className="text-xs">→</span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="flex items-center justify-between text-xs text-tertiary">
                <span>{data?.items.length ?? 0} resultado(s)</span>
                <div className="flex gap-2">
                    <button
                        type="button"
                        disabled={!cursor}
                        onClick={() => setCursor(null)}
                        className="rounded-md border border-secondary px-2 py-1 disabled:opacity-50"
                    >
                        ← Inicio
                    </button>
                    <button
                        type="button"
                        disabled={!data?.next_cursor}
                        onClick={() => setCursor(data?.next_cursor ?? null)}
                        className="rounded-md border border-secondary px-2 py-1 disabled:opacity-50"
                    >
                        Siguiente →
                    </button>
                </div>
            </div>
        </div>
    );
};

// Re-export para evitar tree-shake de service cuando se importa desde shell
export { getService };

const GroupsView = ({ onSelect }: { onSelect: (id: string) => void }) => {
    const { data, isLoading, error } = useQuery({
        queryKey: ["catalogos", "grupos"],
        queryFn: () => catalogosService.grupos(),
    });

    if (isLoading) return <p className="text-sm text-tertiary">Cargando grupos…</p>;
    if (error) return <p className="text-sm text-error-primary">Error: {(error as Error).message}</p>;
    if (!data || data.length === 0) return <p className="text-sm text-tertiary">Sin categorías.</p>;

    return (
        <div className="space-y-2" data-testid="catalogos-grupos">
            {data.map((grupo: CatalogoGrupo) => (
                <details key={grupo.categoria} open className="rounded-md border border-secondary bg-primary">
                    <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-semibold text-primary">
                        <span>
                            <span className="mr-2 text-tertiary">▼</span>
                            {grupo.categoria}
                        </span>
                        <span className="text-xs text-tertiary">{grupo.items.length}</span>
                    </summary>
                    <ul>
                        {grupo.items.map((it, idx) => (
                            <li
                                key={it.id}
                                className="flex cursor-pointer items-center justify-between border-t border-secondary px-3 py-2 text-sm hover:bg-secondary"
                                onClick={() => onSelect(it.id)}
                            >
                                <span className="flex items-center gap-2">
                                    <span className="w-6 text-xs text-tertiary">{it.orden ?? idx + 1}.</span>
                                    <span>{it.titulo}</span>
                                </span>
                                <span className="text-xs text-tertiary">{it.precio != null ? fmtPrice(it.precio) : ""}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            ))}
        </div>
    );
};

// Re-export de useQuery para no añadir import en este archivo
import { useQuery } from "@tanstack/react-query";
