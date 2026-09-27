import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Sistema de botones unificado.
 *
 * Variantes:
 *   primary   → acción principal (brand sólido)
 *   secondary → acción de soporte (con borde)
 *   tertiary  → acción menor / "agregar" (borde sutil, fondo transparente)
 *   ghost     → acción mínima / "editar" inline (sin borde, sin fondo)
 *
 * Tamaños:
 *   xs        → badges / "+ Nueva" / chips de filtro
 *   sm        → botones estándar de modal / formulario
 *
 * Para acciones destructivas usar <DangerButton> / <DangerIconButton>
 * (no se mezclan con estas porque tienen semántica distinta).
 *
 * Si necesitás una variante nueva, agregala acá. No agregues botones
 * con className ad-hoc en los componentes.
 */

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "ghost";
export type ButtonSize = "xs" | "sm";

const VARIANT: Record<ButtonVariant, string> = {
    primary:
        "bg-brand-primary text-white hover:bg-brand-primary_hover shadow-sm hover:shadow disabled:bg-brand-primary disabled:opacity-50",
    secondary:
        "border border-secondary bg-primary text-primary hover:bg-secondary hover:border-primary disabled:opacity-50",
    tertiary:
        "border border-secondary bg-primary text-primary hover:bg-secondary hover:border-primary disabled:opacity-50",
    ghost:
        "bg-transparent text-primary hover:bg-secondary disabled:opacity-50",
};

const SIZE: Record<ButtonSize, string> = {
    xs: "px-3 py-1.5 text-xs",
    sm: "px-4 py-2 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    iconLeft?: ReactNode;
    iconRight?: ReactNode;
}

export const Button = ({
    variant = "secondary",
    size = "sm",
    iconLeft,
    iconRight,
    className = "",
    children,
    ...rest
}: ButtonProps) => (
    <button
        type="button"
        {...rest}
        className={`inline-flex items-center gap-1.5 rounded-md font-semibold transition-all ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
        {iconLeft}
        {children}
        {iconRight}
    </button>
);

/** Botón de cancelación — ghost + xs/sm. Usar dentro de modales. */
export const CancelButton = ({
    size = "sm",
    className = "",
    children = "Cancelar",
    ...rest
}: Omit<ButtonProps, "variant">) => (
    <Button variant="ghost" size={size} className={className} {...rest}>
        {children}
    </Button>
);
