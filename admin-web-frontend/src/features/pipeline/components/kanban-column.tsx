import { useDroppable } from "@dnd-kit/react";
import { cx } from "@/utils/cx";
import { ESTADO_LABELS, type EstadoDesarrollo, type AgendaPipeline } from "@/types/pipeline";
import { KanbanCard } from "@/features/pipeline/components/kanban-card";

interface KanbanColumnProps {
    estado: EstadoDesarrollo;
    items: AgendaPipeline[];
    /** Si true, deshabilita el drop (no es destino válido para el drag en curso). */
    disabled?: boolean;
    onSelectEstado: (agendaId: string, destino: EstadoDesarrollo) => void;
    mutationPending?: boolean;
}

// Columna del Kanban. useDroppable indica que esta columna acepta drops.
// `isDropTarget` se activa cuando el cursor está sobre ella.

export const KanbanColumn = ({ estado, items, disabled, onSelectEstado, mutationPending }: KanbanColumnProps) => {
    const { ref, isDropTarget } = useDroppable({
        id: `col-${estado}`,
        type: "pipeline-column",
        data: { estado },
    });

    return (
        <div
            className={cx(
                "flex w-[80vw] shrink-0 snap-start flex-col rounded-lg border border-secondary bg-secondary/40 md:w-64",
                isDropTarget && !disabled && "ring-2 ring-brand-primary bg-brand-secondary",
                disabled && "opacity-50",
            )}
            data-estado={estado}
            data-testid={`column-${estado}`}
        >
            <header className="flex items-center justify-between px-3 py-2">
                <h2 className="text-sm font-semibold text-primary">{ESTADO_LABELS[estado]}</h2>
                <span
                    className="rounded-full bg-primary px-2 py-0.5 text-xs text-tertiary"
                    data-testid={`count-${estado}`}
                >
                    {items.length}
                </span>
            </header>

            <div
                ref={ref}
                className="min-h-[80px] flex-1 space-y-2 overflow-y-auto p-2"
                data-body-for={estado}
                data-droppable={!disabled}
            >
                {items.length === 0 ? (
                    <p className="py-4 text-center text-xs italic text-tertiary">Vacío</p>
                ) : (
                    items.map(card => (
                        <KanbanCard
                            key={card.id}
                            card={card}
                            disabled={mutationPending}
                            onSelectEstado={destino => onSelectEstado(card.id, destino)}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
