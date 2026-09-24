import type { EstadoDesarrollo } from "@/types/pipeline";
import { ESTADO_LABELS, ESTADOS_DESARROLLO, TRANSICIONES } from "@/types/pipeline";
import { cx } from "@/utils/cx";

interface EstadoSelectorProps {
    estadoActual: EstadoDesarrollo | null;
    /** Cambia el estado. Si no se puede (no hay transición válida), no se llama. */
    onChange: (destino: EstadoDesarrollo) => void;
    /** Si true, está deshabilitado (e.g. durante la mutation). */
    disabled?: boolean;
}

// Selector accesible como alternativa al DnD.
// Coincide con el requisito del spec: "cambio de estado mediante selector como alternativa".
// Solo muestra los destinos válidos según TRANSICIONES (validación cliente;
// el backend también valida como segunda línea).

export const EstadoSelector = ({ estadoActual, onChange, disabled }: EstadoSelectorProps) => {
    const destinosValidos = estadoActual ? TRANSICIONES[estadoActual] : [];
    const todosDestinos = ESTADOS_DESARROLLO;

    return (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="estado-selector">
            <span className="text-xs text-tertiary">Mover a:</span>
            {todosDestinos.map(destino => {
                const isActual = destino === estadoActual;
                const isValido = destinosValidos.includes(destino);
                return (
                    <button
                        key={destino}
                        type="button"
                        disabled={disabled || isActual || !isValido}
                        onClick={() => onChange(destino)}
                        data-estado-destino={destino}
                        data-valido={isValido}
                        title={
                            isActual
                                ? "Estado actual"
                                : isValido
                                    ? `Mover a ${ESTADO_LABELS[destino]}`
                                    : `Transición no permitida desde ${ESTADO_LABELS[estadoActual!]}`
                        }
                        className={cx(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                            isActual && "bg-brand-primary text-white cursor-default",
                            !isActual && isValido && "bg-secondary text-primary hover:bg-brand-secondary hover:text-brand-primary",
                            !isActual && !isValido && "bg-secondary text-disabled cursor-not-allowed",
                        )}
                    >
                        {ESTADO_LABELS[destino]}
                    </button>
                );
            })}
        </div>
    );
};
