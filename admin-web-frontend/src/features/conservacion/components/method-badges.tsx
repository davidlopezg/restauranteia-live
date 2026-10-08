/**
 * method-badges.tsx — Badges visuales para los métodos de conservación.
 *
 * Muestra una lista de métodos donde el recomendado va destacado.
 * Color y tooltip varian según categoria (temperatura, pH, aw, etc.).
 */

import {
    Snowflake01,
    Clock,
    Shield01,
    ThermometerWarm,
    Droplets01,
    Sun,
    Beaker01,
    Package,
    ArrowUp,
    CheckVerified01,
} from "@untitledui/icons";
import type { ReactNode } from "react";
import type { MetodoId, MetodoInfo } from "@/features/conservacion/lib/conservacion-reglas";
import { METODOS } from "@/features/conservacion/lib/conservacion-reglas";
import { cx } from "@/utils/cx";

/** Mapea método → icono (mejor esfuerzo: si no hay match, Snowflake01). */
const METODO_ICON: Record<MetodoId, typeof Snowflake01> = {
    refrigeracion: Snowflake01,
    refrigeracion_hielo: Snowflake01,
    congelacion: Snowflake01,
    salazon_curado: Shield01,
    ahumado: ThermometerWarm,
    aceite_confit: Droplets01,
    vinagre_escabeche: Beaker01,
    azucar_almibar: Beaker01,
    fermentacion_lactica: Beaker01,
    secado_deshidratacion: Sun,
    al_vacio_pasteurizacion: Package,
    conserva_autoclave: Shield01,
    atmosfera_modificada: ArrowUp,
    almacenamiento_seco: Clock,
};

/** Color del badge por método (de momento todos usan estilo "frío/info"). */
const METODO_COLOR: Record<MetodoId, string> = {
    refrigeracion: "bg-blue-50 text-blue-700 ring-blue-200",
    refrigeracion_hielo: "bg-blue-50 text-blue-700 ring-blue-200",
    congelacion: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    salazon_curado: "bg-amber-50 text-amber-700 ring-amber-200",
    ahumado: "bg-orange-50 text-orange-700 ring-orange-200",
    aceite_confit: "bg-yellow-50 text-yellow-700 ring-yellow-200",
    vinagre_escabeche: "bg-rose-50 text-rose-700 ring-rose-200",
    azucar_almibar: "bg-pink-50 text-pink-700 ring-pink-200",
    fermentacion_lactica: "bg-lime-50 text-lime-700 ring-lime-200",
    secado_deshidratacion: "bg-stone-50 text-stone-700 ring-stone-200",
    al_vacio_pasteurizacion: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    conserva_autoclave: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    atmosfera_modificada: "bg-violet-50 text-violet-700 ring-violet-200",
    almacenamiento_seco: "bg-gray-50 text-gray-700 ring-gray-200",
};

interface MethodBadgeProps {
    methodId: MetodoId | string;
    /** Si true, lo pinta como recomendado (estrella + estilo bold). */
    recommended?: boolean;
    /** Si true, muestra icono. Default true. */
    showIcon?: boolean;
    className?: string;
}

/** Badge individual. Acepta strings que no sean MetodoId (fallback a "otro método"). */
export const MethodBadge = ({
    methodId,
    recommended = false,
    showIcon = true,
    className,
}: MethodBadgeProps) => {
    const info: MetodoInfo | undefined = (METODOS as Record<string, MetodoInfo>)[methodId];
    const label = info?.nombre ?? methodId ?? "—";
    const Icon = (METODO_ICON as Record<string, typeof Snowflake01>)[methodId] ?? Snowflake01;
    const colorClass = (METODO_COLOR as Record<string, string>)[methodId] ?? "bg-secondary text-secondary ring-secondary";

    return (
        <span
            className={cx(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1",
                colorClass,
                recommended && "font-semibold ring-2 shadow-sm",
                className,
            )}
            title={info ? `${info.nombre} · Vida útil ${info.vidaUtil}` : label}
        >
            {showIcon && <Icon className="size-3 shrink-0" />}
            <span>{label}</span>
            {recommended && <CheckVerified01 className="size-3 shrink-0" />}
        </span>
    );
};

interface MethodBadgesListProps {
    /** Lista de IDs de métodos a mostrar. */
    methods: Array<MetodoId | string>;
    /** ID del método recomendado (lo pinta destacado). */
    recommended?: MetodoId | string | null;
    /** Límite inicial de métodos a mostrar; el resto se colapsan tras un "+ N más". */
    collapseAt?: number;
}

/** Lista de badges con expansión. */
export const MethodBadgesList = ({ methods, recommended, collapseAt = 4 }: MethodBadgesListProps) => {
    if (methods.length === 0) {
        return <span className="text-xs text-tertiary">Sin métodos definidos</span>;
    }

    const visible = methods.slice(0, collapseAt);
    const hidden = methods.length - visible.length;

    const renderBadges = (list: Array<MetodoId | string>): ReactNode =>
        list.map(m => (
            <MethodBadge
                key={m}
                methodId={m}
                recommended={m === recommended}
            />
        ));

    if (hidden <= 0) {
        return <div className="flex flex-wrap gap-1">{renderBadges(visible)}</div>;
    }

    return (
        <details className="group">
            <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center gap-1">
                    {renderBadges(visible)}
                    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs text-tertiary ring-1 ring-secondary group-open:hidden">
                        + {hidden} más
                    </span>
                    <span className="hidden items-center rounded-full bg-secondary px-2 py-0.5 text-xs text-tertiary ring-1 ring-secondary group-open:inline-flex">
                        Ocultar
                    </span>
                </div>
            </summary>
            <div className="mt-1 flex flex-wrap gap-1">{renderBadges(methods.slice(collapseAt))}</div>
        </details>
    );
};
