import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Botones destructivos consistentes en toda la app.
 *
 * Todos usan el mismo color (rojo sólido) para que el usuario
 * identifique de un vistazo qué acciones son destructivas.
 * El contraste es alto (texto blanco sobre fondo error-primary)
 * y el hover lo oscurece.
 *
 * - <DangerButton>      → botón con texto (ej: "Eliminar", "Descartar")
 * - <DangerIconButton>  → solo ícono, tamaño fijo
 *
 * Para acciones no destructivas usar <button> normal con brand-primary
 * o border-secondary. Para acciones destructivas, SIEMPRE estos.
 */

const BASE = "bg-error-primary text-white hover:bg-error-primary_hover shadow-sm hover:shadow-md focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";

export const DangerButton = ({
    children,
    className = "",
    ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) => (
    <button
        type="button"
        {...rest}
        className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold ${BASE} ${className}`}
    >
        {children}
    </button>
);

export const DangerIconButton = ({
    children,
    className = "",
    ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) => (
    <button
        type="button"
        {...rest}
        className={`inline-flex items-center justify-center rounded-md p-2 ${BASE} ${className}`}
    >
        {children}
    </button>
);
