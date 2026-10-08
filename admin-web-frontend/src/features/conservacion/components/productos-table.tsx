/**
 * productos-table.tsx — Tabla de ingredientes con sus reglas de conservación.
 *
 * Datos: `conservacionService.listProductos()`.
 * Reglas: `reglaParaProducto(categoria)` del motor de reglas.
 *
 * Columnas:
 *   1. Nombre
 *   2. Categoría
 *   3. ¿Perecedero? (badge, deriv. read-only)
 *   4. Duración estimada
 *   5. Métodos posibles (con recomendado destacado)
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    conservacionKeys,
    conservacionService,
    type ProductoParaConservacion,
} from "@/services/conservacion";
import {
    reglaParaProducto,
    type MetodoId,
} from "@/features/conservacion/lib/conservacion-reglas";
import { MethodBadgesList } from "@/features/conservacion/components/method-badges";
import { cx } from "@/utils/cx";

interface Row {
    id: string;
    nombre: string;
    categoria: string;
    perecedero: boolean | null;
    vidaUtil: string;
    metodos: MetodoId[];
    recomendado: MetodoId | null;
}

const deriveRow = (p: ProductoParaConservacion): Row => {
    const r = reglaParaProducto(p.categoria);
    return {
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria ?? "—",
        perecedero: r.perecedero,
        vidaUtil: r.vidaUtilTexto,
        metodos: r.metodosPosibles,
        recomendado: r.recomendado ?? null,
    };
};

export const ProductosTable = () => {
    const [search, setSearch] = useState("");
    const [filterPerecedero, setFilterPerecedero] = useState<"all" | "si" | "no">("all");

    const { data, isLoading, error } = useQuery({
        queryKey: conservacionKeys.productos(),
        queryFn: () => conservacionService.listProductos(),
    });

    const rows = useMemo<Row[]>(() => {
        if (!data) return [];
        return data.map(deriveRow);
    }, [data]);

    // Filtrado en cliente (es una tabla manejable: ~50 filas).
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (q && !r.nombre.toLowerCase().includes(q) && !r.categoria.toLowerCase().includes(q)) {
                return false;
            }
            if (filterPerecedero === "si" && r.perecedero !== true) return false;
            if (filterPerecedero === "no" && r.perecedero !== false) return false;
            return true;
        });
    }, [rows, search, filterPerecedero]);

    if (isLoading) return <p className="text-sm text-tertiary">Cargando productos…</p>;
    if (error) return <p className="text-sm text-error-primary">Error: {(error as Error).message}</p>;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <input
                    type="search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por nombre o categoría…"
                    className="w-full max-w-xs rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    aria-label="Buscar producto"
                />
                <div className="flex items-center gap-1 text-xs">
                    <span className="text-tertiary">Perecedero:</span>
                    {(["all", "si", "no"] as const).map(f => (
                        <button
                            key={f}
                            type="button"
                            onClick={() => setFilterPerecedero(f)}
                            className={cx(
                                "rounded-md px-2 py-1 ring-1 ring-secondary transition-colors",
                                filterPerecedero === f
                                    ? "bg-brand-solid text-white ring-brand-solid"
                                    : "bg-primary text-secondary hover:bg-secondary",
                            )}
                        >
                            {f === "all" ? "Todos" : f === "si" ? "Sí" : "No"}
                        </button>
                    ))}
                </div>
                <span className="ml-auto text-xs text-tertiary">
                    {filtered.length} de {rows.length} producto(s)
                </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-secondary">
                <table className="w-full text-sm" data-testid="conservacion-productos">
                    <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-tertiary">
                        <tr>
                            <th className="px-3 py-2 font-medium">Producto</th>
                            <th className="px-3 py-2 font-medium">Categoría</th>
                            <th className="px-3 py-2 font-medium">¿Perecedero?</th>
                            <th className="px-3 py-2 font-medium">Duración estimada</th>
                            <th className="px-3 py-2 font-medium">Métodos de conservación</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-3 py-6 text-center text-tertiary">
                                    Sin resultados.
                                </td>
                            </tr>
                        ) : (
                            filtered.map(r => (
                                <tr
                                    key={r.id}
                                    className="border-t border-secondary hover:bg-secondary/40"
                                >
                                    <td className="px-3 py-2 font-medium text-primary">{r.nombre}</td>
                                    <td className="px-3 py-2 text-secondary">
                                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                                            {r.categoria}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <PerecederoBadge value={r.perecedero} />
                                    </td>
                                    <td className="px-3 py-2 text-secondary">{r.vidaUtil}</td>
                                    <td className="px-3 py-2">
                                        <MethodBadgesList
                                            methods={r.metodos}
                                            recommended={r.recomendado}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const PerecederoBadge = ({ value }: { value: boolean | null }) => {
    if (value === true) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                ✓ Perecedero
            </span>
        );
    }
    if (value === false) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700 ring-1 ring-stone-200">
                ⏳ Duradero
            </span>
        );
    }
    return <span className="text-xs text-tertiary">—</span>;
};
