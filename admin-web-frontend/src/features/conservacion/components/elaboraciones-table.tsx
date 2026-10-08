/**
 * elaboraciones-table.tsx — Tabla de recetas con sus datos de conservación.
 *
 * Datos: `conservacionService.listElaboraciones()` (ya normalizados).
 * Reglas: `metodosPosiblesParaElaboracion(metodo)` + `esPerecederoElaboracion()`.
 *
 * Diferencia clave con la tabla de productos:
 *   - Aquí los datos vienen de la ficha del chef (`receta.conservacion`).
 *   - Si una receta no tiene `conservacion` definida, la fila se muestra
 *     con un placeholder accionable para abrir la ficha y rellenarlo.
 *
 * Columnas:
 *   1. Receta (link a la ficha)
 *   2. Categoría
 *   3. ¿Perecedero? (deriv.)
 *   4. Duración estimada
 *   5. Métodos posibles (con recomendado destacado)
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
    conservacionKeys,
    conservacionService,
    type ElaboracionParaConservacion,
} from "@/services/conservacion";
import {
    esPerecederoElaboracion,
    formatearVidaUtilHoras,
    metodosPosiblesParaElaboracion,
    type MetodoId,
} from "@/features/conservacion/lib/conservacion-reglas";
import { MethodBadgesList } from "@/features/conservacion/components/method-badges";
import { cx } from "@/utils/cx";

interface Row {
    id: string;
    titulo: string;
    categoria: string;
    perecedero: boolean | null;
    duracionTexto: string;
    metodos: MetodoId[];
    recomendado: MetodoId | null;
    /** Si true, los datos vienen vacíos (no hay ficha de conservación). */
    sinFicha: boolean;
}

const deriveRow = (e: ElaboracionParaConservacion): Row => {
    const sinFicha = !e.metodo && e.vida_util_h == null;
    const cons = { metodo: e.metodo, vida_util_h: e.vida_util_h };
    const perecedero = esPerecederoElaboracion(cons);
    const metodos = metodosPosiblesParaElaboracion(e.metodo);
    const recomendado = (e.metodo && metodos.includes(e.metodo as MetodoId))
        ? (e.metodo as MetodoId)
        : null;

    return {
        id: e.id,
        titulo: e.titulo,
        categoria: (e.categorias && e.categorias[0]) ?? "—",
        perecedero,
        duracionTexto: sinFicha ? "—" : formatearVidaUtilHoras(e.vida_util_h),
        metodos,
        recomendado,
        sinFicha,
    };
};

export const ElaboracionesTable = () => {
    const [search, setSearch] = useState("");
    const [filterPerecedero, setFilterPerecedero] = useState<"all" | "si" | "no" | "sinFicha">("all");

    const { data, isLoading, error } = useQuery({
        queryKey: conservacionKeys.elaboraciones(),
        queryFn: () => conservacionService.listElaboraciones(),
    });

    const rows = useMemo<Row[]>(() => {
        if (!data) return [];
        return data.map(deriveRow);
    }, [data]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (q && !r.titulo.toLowerCase().includes(q) && !r.categoria.toLowerCase().includes(q)) {
                return false;
            }
            if (filterPerecedero === "si" && r.perecedero !== true) return false;
            if (filterPerecedero === "no" && r.perecedero !== false) return false;
            if (filterPerecedero === "sinFicha" && !r.sinFicha) return false;
            return true;
        });
    }, [rows, search, filterPerecedero]);

    if (isLoading) return <p className="text-sm text-tertiary">Cargando elaboraciones…</p>;
    if (error) return <p className="text-sm text-error-primary">Error: {(error as Error).message}</p>;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <input
                    type="search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar receta o categoría…"
                    className="w-full max-w-xs rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    aria-label="Buscar receta"
                />
                <div className="flex items-center gap-1 text-xs">
                    <span className="text-tertiary">Perecedero:</span>
                    {(["all", "si", "no", "sinFicha"] as const).map(f => (
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
                            {f === "all" ? "Todos" : f === "si" ? "Sí" : f === "no" ? "No" : "Sin ficha"}
                        </button>
                    ))}
                </div>
                <span className="ml-auto text-xs text-tertiary">
                    {filtered.length} de {rows.length} elaboración(es)
                </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-secondary">
                <table className="w-full text-sm" data-testid="conservacion-elaboraciones">
                    <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-tertiary">
                        <tr>
                            <th className="px-3 py-2 font-medium">Receta</th>
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
                                    className={cx(
                                        "border-t border-secondary hover:bg-secondary/40",
                                        r.sinFicha && "bg-amber-50/30",
                                    )}
                                >
                                    <td className="px-3 py-2 font-medium text-primary">
                                        <Link
                                            to={`/catalogos/${r.id}`}
                                            className="text-brand-primary hover:underline"
                                        >
                                            {r.titulo}
                                        </Link>
                                        {r.sinFicha && (
                                            <span
                                                className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                                                title="Rellenar la sección 6 · Conservación en la ficha"
                                            >
                                                ⚠ Sin ficha de conservación
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-secondary">
                                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                                            {r.categoria}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <PerecederoBadge value={r.perecedero} />
                                    </td>
                                    <td className="px-3 py-2 text-secondary">{r.duracionTexto}</td>
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
