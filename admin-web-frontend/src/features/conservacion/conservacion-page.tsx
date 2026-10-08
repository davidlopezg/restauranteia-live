/**
 * conservacion-page.tsx — Página "Conservación" en /conservacion.
 *
 * Dos tablas auto-actualizadas:
 *   1. Productos (ingredientes): reglas por categoría.
 *   2. Elaboraciones (recetas): datos del campo receta.conservacion.
 *
 * Las queries se invalidan automáticamente al editar ingredientes o
 * recetas gracias a `qc.invalidateQueries(conservacionKeys.all)` en los
 * formularios que escriben en `ingredientes` y `catalogos.receta`.
 * Ver `features/entities/components/entity-edit-form.tsx` y
 * `features/entities/hooks/use-entity-mutations.ts`.
 */

import { useState } from "react";
import { Snowflake01, BookOpen01 } from "@untitledui/icons";
import { ProductosTable } from "@/features/conservacion/components/productos-table";
import { ElaboracionesTable } from "@/features/conservacion/components/elaboraciones-table";

type Tab = "productos" | "elaboraciones";

export const ConservacionPage = () => {
    const [tab, setTab] = useState<Tab>("productos");

    return (
        <div className="flex flex-col gap-4">
            <header className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2 text-lg font-semibold text-primary">
                        <Snowflake01 className="size-5 text-brand-primary" />
                        Conservación
                    </h1>
                    <p className="mt-1 text-sm text-tertiary">
                        Vida útil, métodos aplicables y método recomendado para cada producto y receta.
                        Los datos se actualizan solos al editar fichas.
                    </p>
                </div>
            </header>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-secondary" role="tablist">
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "productos"}
                    onClick={() => setTab("productos")}
                    className={
                        "border-b-2 px-4 py-2 text-sm transition-colors " +
                        (tab === "productos"
                            ? "border-brand-primary font-medium text-brand-primary"
                            : "border-transparent text-secondary hover:text-primary")
                    }
                >
                    Productos
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "elaboraciones"}
                    onClick={() => setTab("elaboraciones")}
                    className={
                        "border-b-2 px-4 py-2 text-sm transition-colors " +
                        (tab === "elaboraciones"
                            ? "border-brand-primary font-medium text-brand-primary"
                            : "border-transparent text-secondary hover:text-primary")
                    }
                >
                    Elaboraciones
                </button>
            </div>

            {/* Contenido */}
            <section role="tabpanel">
                {tab === "productos" ? <ProductosTable /> : <ElaboracionesTable />}
            </section>

            {/* Footer info */}
            <footer className="mt-2 flex items-start gap-2 rounded-md bg-secondary/50 p-3 text-xs text-tertiary">
                <BookOpen01 className="mt-0.5 size-4 shrink-0" />
                <p>
                    Las recomendaciones se derivan del motor de reglas en
                    <code className="mx-1 rounded bg-secondary px-1 py-0.5">features/conservacion/lib/conservacion-reglas.ts</code>
                    y se cruzan con los datos introducidos en la sección 6 · Conservación de cada receta.
                    Fuente normativa:&nbsp;
                    <a
                        href="https://eur-lex.europa.eu/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-primary hover:underline"
                    >
                        RG 1169/2011, RD 1376/2003, RD 1086/2020
                    </a>
                    .
                </p>
            </footer>
        </div>
    );
};
