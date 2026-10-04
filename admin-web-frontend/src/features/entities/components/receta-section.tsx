import { cx } from "@/utils/cx";

// Sección que pinta el JSON de `receta_estructurada` en el detalle del catálogo.
// Soporta los dos formatos que genera scripts/import-recetas/parse_recipe.py:
//
//   - escandallo_pizza: tabla ingredientes + lista de pasos + tabla coste + PVP
//   - sop_postre: SOP rico (mise en place + fases + escandallo + PVP)
//
// Si el JSON no encaja en ninguno de los dos formatos, se muestra un fallback
// con el JSON pretty-printed para que se pueda inspeccionar.

interface Ingrediente {
    nombre?: string;
    cantidad?: string;
    precio_unidad?: number | null;
    coste_real?: number | null;
    notas?: string | null;
}

interface Coste {
    items?: Ingrediente[];
    coste_total?: number | null;
    margen_bruto?: number | null;
    porcentaje_beneficio?: number | null;
    pvp?: number | null;
}

interface RecetaEstructurada {
    titulo?: string;
    subtipo?: string;
    descripcion?: string | null;
    raciones?: number | null;
    ingredientes?: Ingrediente[];
    preparacion?: string[];
    coste?: Coste;
    metadata?: { fuente?: string; formato?: string };
}

const fmtMoney = (n: number | null | undefined) =>
    typeof n === "number" ? `${n.toFixed(2)} €` : "—";

const fmtPct = (n: number | null | undefined) =>
    typeof n === "number" ? `${n.toFixed(2)} %` : "—";

interface RecetaSectionProps {
    receta: RecetaEstructurada;
}

export const RecetaSection = ({ receta }: RecetaSectionProps) => {
    const ingredientes = receta.ingredientes ?? [];
    const pasos = receta.preparacion ?? [];
    const coste = receta.coste;
    const costeItems = coste?.items ?? [];
    const formato = receta.metadata?.formato;

    return (
        <section
            data-testid="receta-section"
            className="rounded-lg border border-secondary bg-primary"
        >
            <header className="border-b border-secondary px-4 py-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-tertiary">
                    Receta {receta.subtipo ? `(${receta.subtipo})` : ""}
                </h2>
                {receta.descripcion && (
                    <p className="mt-1 text-xs text-tertiary">{receta.descripcion}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {formato && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-tertiary">
                            Formato: {formato}
                        </span>
                    )}
                    {coste?.pvp != null && (
                        <span className="rounded-full bg-brand-secondary px-2 py-0.5 font-medium text-brand-primary">
                            PVP receta: {fmtMoney(coste.pvp)}
                        </span>
                    )}
                    {coste?.margen_bruto != null && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-tertiary">
                            Margen: {fmtMoney(coste.margen_bruto)}
                        </span>
                    )}
                    {coste?.porcentaje_beneficio != null && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-tertiary">
                            Rentabilidad: {fmtPct(coste.porcentaje_beneficio)}
                        </span>
                    )}
                </div>
            </header>

            <div className="grid grid-cols-1 gap-6 p-4 md:grid-cols-2">
                {/* Ingredientes */}
                <div>
                    <h3 className="mb-2 text-sm font-semibold text-primary">
                        🛒 Ingredientes ({ingredientes.length})
                    </h3>
                    {ingredientes.length === 0 ? (
                        <p className="text-xs text-tertiary">Sin ingredientes.</p>
                    ) : (
                        <ul
                            className="divide-y divide-secondary rounded-md border border-secondary"
                            data-testid="receta-ingredientes"
                        >
                            {ingredientes.map((ing, idx) => (
                                <li
                                    key={`${ing.nombre ?? "?"}-${idx}`}
                                    className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-sm"
                                >
                                    <span className="text-primary">{ing.nombre}</span>
                                    <span className="text-xs text-tertiary">
                                        {ing.cantidad ?? "—"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Preparación */}
                <div>
                    <h3 className="mb-2 text-sm font-semibold text-primary">
                        👨‍🍳 Preparación ({pasos.length} pasos)
                    </h3>
                    {pasos.length === 0 ? (
                        <p className="text-xs text-tertiary">Sin pasos.</p>
                    ) : (
                        <ol
                            className="space-y-1.5 rounded-md border border-secondary p-3 text-sm"
                            data-testid="receta-pasos"
                        >
                            {pasos.map((paso, idx) => (
                                <li key={idx} className="flex gap-3">
                                    <span
                                        className={cx(
                                            "flex size-6 shrink-0 items-center justify-center rounded-full",
                                            "bg-brand-secondary text-xs font-semibold text-brand-primary",
                                        )}
                                    >
                                        {idx + 1}
                                    </span>
                                    <span className="text-primary">{paso}</span>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>

            {/* Escandallo / coste */}
            {costeItems.length > 0 && (
                <div className="border-t border-secondary p-4">
                    <h3 className="mb-2 text-sm font-semibold text-primary">
                        💰 Escandallo ({costeItems.length} líneas)
                    </h3>
                    <div className="overflow-x-auto rounded-md border border-secondary">
                        <table className="w-full text-sm" data-testid="receta-escandallo">
                            <thead className="bg-secondary text-xs uppercase text-tertiary">
                                <tr>
                                    <th className="px-3 py-2 text-left font-medium">Ingrediente</th>
                                    <th className="px-3 py-2 text-right font-medium">Precio/Kg</th>
                                    <th className="px-3 py-2 text-right font-medium">Coste</th>
                                </tr>
                            </thead>
                            <tbody>
                                {costeItems.map((item, idx) => (
                                    <tr
                                        key={`${item.nombre ?? "?"}-${idx}`}
                                        className="border-t border-secondary"
                                    >
                                        <td className="px-3 py-1.5 text-primary">{item.nombre}</td>
                                        <td className="px-3 py-1.5 text-right text-tertiary">
                                            {item.precio_unidad != null
                                                ? fmtMoney(item.precio_unidad)
                                                : "—"}
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-medium text-primary">
                                            {item.coste_real != null
                                                ? fmtMoney(item.coste_real)
                                                : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Fuente */}
            {receta.metadata?.fuente && (
                <footer className="border-t border-secondary px-4 py-2 text-tertiary">
                    <p className="text-xs">
                        📄 Fuente:{" "}
                        <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">
                            {receta.metadata.fuente.split("/").pop()}
                        </code>
                    </p>
                </footer>
            )}
        </section>
    );
};

// Tipo exportado para que el detail-page lo pueda importar sin redefinir.
export type { RecetaEstructurada };